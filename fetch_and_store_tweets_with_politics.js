import fetch from 'node-fetch';
import pLimit from 'p-limit';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

// ===== LAURA MEMORY CLIENT INTEGRATION =====
/**
 * Cliente Laura Memory adaptado para ES modules
 */
class LauraMemoryClient {
  constructor() {
    this.baseUrl = process.env.LAURA_MEMORY_URL || 'http://localhost:5001';
    this.enabled = process.env.LAURA_MEMORY_ENABLED === 'true';
    console.log(`🔧 [LauraMemory] Cliente configurado - URL: ${this.baseUrl}, Habilitado: ${this.enabled}`);
  }

  async isAvailable() {
    if (!this.enabled) return false;
    try {
      const response = await fetch(`${this.baseUrl}/health`, { method: 'GET', timeout: 2000 });
      return response.ok;
    } catch (error) {
      console.warn('⚠️ [LauraMemory] Servicio no disponible:', error.message);
      return false;
    }
  }



  async processToolResult(toolName, toolResult, userQuery = '') {
    if (!await this.isAvailable()) return { saved: false, reason: 'Servicio no disponible' };
    try {
      const response = await fetch(`${this.baseUrl}/api/laura-memory/process-tool-result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_name: toolName, tool_result: toolResult, user_query: userQuery })
      });
      const result = await response.json();
      if (result.saved) console.log('📚 [LauraMemory] Información política guardada:', result.content);
      return result;
    } catch (error) {
      console.error('❌ [LauraMemory] Error procesando resultado:', error);
      return { saved: false, error: error.message };
    }
  }

  async savePoliticalContext(tweet, politicalAnalysis, trend, geminiAnalysis) {
    if (!await this.isAvailable()) {
      throw new Error('Laura Memory Service no disponible para guardar contexto político');
    }
    
    // Crear contexto político estructurado para PulsePolitics con datos de Gemini
    const politicalContext = {
      tweet_id: tweet.tweet_id,
      usuario: tweet.usuario,
      texto: tweet.texto,
      trend: trend,
      political_analysis: {
        relevance_score: politicalAnalysis.relevanceScore,
        categories: politicalAnalysis.categories,
        entities: politicalAnalysis.entities,
        is_political: politicalAnalysis.isPolitical
      },
             gemini_analysis: {
         extracted_entities: geminiAnalysis.entities || [],
         local_figures: geminiAnalysis.figures || [],
         social_usernames: geminiAnalysis.social_usernames || [],
         laws_decrees: geminiAnalysis.laws_decrees || [],
         news_events: geminiAnalysis.news_events || [],
         nicknames_detected: geminiAnalysis.nicknames_detected || []
       },
      engagement: {
        likes: tweet.likes || 0,
        retweets: tweet.retweets || 0,
        replies: tweet.replies || 0
      },
      verified: tweet.verified,
      timestamp: new Date().toISOString()
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/laura-memory/process-tool-result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tool_name: 'politics_context_guatemala',
          tool_result: politicalContext,
          user_query: `Contexto político para tendencia: ${trend} - Score: ${politicalAnalysis.relevanceScore}/10`
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.hasOwnProperty('saved')) {
        throw new Error('Invalid response format from memory service');
      }
      
      if (result.saved) {
        console.log(`🏛️ [PulsePolitics] Contexto guardado: @${tweet.usuario} (Score: ${politicalAnalysis.relevanceScore}/10)`);
      } else {
        console.warn(`⚠️ [PulsePolitics] Contexto no fue guardado: ${result.reason || 'Razón desconocida'}`);
      }
      
      return result;
    } catch (error) {
      throw new Error(`Error guardando contexto político: ${error.message}`);
    }
  }
}

// Instancia global del cliente
const lauraMemoryClient = new LauraMemoryClient();

// ===== PROCESAMIENTO CON GEMINI API =====
/**
 * Procesa tweet político con Gemini para extraer entidades específicas
 */
async function processWithGemini(tweet, trend) {
  try {
         const prompt = `
Analiza este tweet de Guatemala para extraer información política específica:

Tweet: "${tweet.texto}"
Usuario: @${tweet.usuario}
Tendencia: ${trend}

Extrae SOLO información verificable y específica en este JSON:
{
  "entities": ["entidades_politicas_guatemaltecas"],
  "figures": [{"name": "nombre_completo_o_apodo", "real_name": "nombre_real_si_es_apodo", "role": "cargo_o_funcion", "context": "contexto_relevante_de_mencion"}],
  "social_usernames": ["@usuarios_mencionados"],
  "laws_decrees": [{"title": "nombre_ley_decreto", "type": "ley|decreto|acuerdo", "status": "propuesta|aprobada|en_debate"}],
  "news_events": [{"event": "evento_noticia", "type": "politico|judicial|electoral", "impact": "alto|medio|bajo"}],
  "nicknames_detected": [{"nickname": "apodo_usado", "real_name": "nombre_real", "context": "por_que_mencionado"}]
}

DETECTAR FIGURAS POLÍTICAS GUATEMALTECAS POR:
- Nombres completos: "Alejandro Giammattei", "Bernardo Arévalo"
- Apodos comunes: "Jimmy", "Neto", "El Presidente"
- Referencias indirectas: "el mandatario", "el diputado de tal partido"
- Cargos específicos: "Ministro de Gobernación", "Fiscal General"

CONTEXTO RELEVANTE debe incluir:
- Por qué se menciona (escándalo, logro, propuesta, etc.)
- Relación con el tema del tweet
- Sentimiento implícito (apoyo, crítica, neutral)

APODOS GUATEMALTECOS CONOCIDOS:
- Jimmy Morales (expresidente)
- Thelma Aldana (exfiscal)
- Manuel Baldizón (político)
- Sandra Torres (política)
- Detectar otros apodos en contexto

IMPORTANTE:
- Solo incluir información política de Guatemala
- Conectar apodos con nombres reales cuando sea posible
- Explicar contexto de por qué se menciona cada figura
- Si no hay información de una categoría, usar array vacío []
- NO inventar información, solo lo que está en el tweet
`;

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + process.env.GEMINI_API_KEY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.1, // Baja para consistencia
          maxOutputTokens: 1000,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      throw new Error('Invalid response format from Gemini API');
    }

    const geminiText = data.candidates[0].content.parts[0].text;
    
    // Extraer JSON de la respuesta
    const jsonMatch = geminiText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Gemini response');
    }

    const geminiAnalysis = JSON.parse(jsonMatch[0]);
    
         // Validar estructura
     const requiredFields = ['entities', 'figures', 'social_usernames', 'laws_decrees', 'news_events', 'nicknames_detected'];
     for (const field of requiredFields) {
       if (!Array.isArray(geminiAnalysis[field])) {
         geminiAnalysis[field] = [];
       }
     }

     const totalInfo = geminiAnalysis.entities.length + geminiAnalysis.figures.length + geminiAnalysis.nicknames_detected.length;
     console.log(`🧠 [GEMINI] Análisis completado para @${tweet.usuario}: ${geminiAnalysis.entities.length} entidades, ${geminiAnalysis.figures.length} figuras, ${geminiAnalysis.nicknames_detected.length} apodos`);
     
     return geminiAnalysis;

  } catch (error) {
    console.error(`❌ [GEMINI] Error procesando tweet de @${tweet.usuario}: ${error.message}`);
         // Retornar estructura vacía en lugar de fallar
     return {
       entities: [],
       figures: [],
       social_usernames: [],
       laws_decrees: [],
       news_events: [],
       nicknames_detected: []
     };
  }
}

// ===== DETECTOR DE CONTENIDO POLÍTICO GUATEMALTECO =====
/**
 * Detecta y categoriza contenido político guatemalteco
 */
function detectPoliticalContent(tweet) {
  const texto = tweet.texto.toLowerCase();
  const usuario = tweet.usuario.toLowerCase();
  
  // Palabras clave políticas guatemaltecas
  const politicalKeywords = {
    gobierno: ['gobierno', 'presidente', 'giammattei', 'arevalo', 'ministerio', 'ministro', 'gabinete'],
    congreso: ['congreso', 'diputado', 'diputada', 'legislativo', 'ley', 'decreto', 'reforma'],
    judicial: ['corte', 'suprema', 'justicia', 'mp', 'fiscal', 'cicig', 'feci'],
    electoral: ['tse', 'tribunal supremo electoral', 'elecciones', 'candidato', 'partido', 'votacion'],
    instituciones: ['mingob', 'minfin', 'mineduc', 'mspas', 'sat', 'banguat', 'igss'],
    partidos: ['une', 'vamos', 'semilla', 'valor', 'todos', 'fuerza', 'victoria'],
    figuras: ['torres', 'ponce', 'porras', 'sandoval', 'espada', 'morales', 'colom'],
    temas: ['corrupcion', 'transparencia', 'derechos humanos', 'migracion', 'seguridad']
  };
  
  const analysis = {
    isPolitical: false,
    relevanceScore: 0,
    categories: [],
    entities: [],
    memoryContext: ''
  };
  
  // Detectar categorías políticas
  for (const [category, keywords] of Object.entries(politicalKeywords)) {
    const matches = keywords.filter(keyword => texto.includes(keyword));
    if (matches.length > 0) {
      analysis.isPolitical = true;
      analysis.categories.push(category);
      analysis.entities.push(...matches);
      analysis.relevanceScore += matches.length * 2; // Peso por categoría
    }
  }
  
  // Aumentar relevancia si es usuario verificado
  if (tweet.verified) {
    analysis.relevanceScore += 3;
  }
  
  // Aumentar relevancia por engagement
  const engagement = (tweet.likes || 0) + (tweet.retweets || 0) + (tweet.replies || 0);
  if (engagement > 100) analysis.relevanceScore += 2;
  if (engagement > 500) analysis.relevanceScore += 3;
  
  // Normalizar score (máximo 10)
  analysis.relevanceScore = Math.min(analysis.relevanceScore, 10);
  
  // Solo considerar político si tiene relevancia mínima
  if (analysis.relevanceScore < 2) {
    analysis.isPolitical = false;
  }
  
  return analysis;
}

// CLI arguments
const argv = yargs(hideBin(process.argv))
  .option('location', {
    alias: 'l',
    type: 'string',
    default: 'guatemala',
    description: 'País o región para buscar tendencias'
  })
  .option('limit', {
    alias: 'n',
    type: 'number',
    default: 15,
    description: 'Máximo de tweets a devolver por tendencia'
  })
  .option('concurrency', {
    alias: 'c',
    type: 'number',
    default: 4,
    description: 'Número de requests concurrentes'
  })
  .help()
  .argv;

// Configuración Supabase (usando variables de entorno)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Configuración de la API
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000'; // Default local; override con env

// Control de concurrencia
const limit = pLimit(argv.concurrency);

// Set para evitar duplicados en la misma ejecución
const seenTweetIds = new Set();

// Función para obtener tendencias (usando ExtractorT)
async function getTrends(location) {
  const response = await fetch(`${API_BASE_URL}/trending?location=${location}`);
  
  if (!response.ok) {
    throw new Error(`Error obteniendo tendencias: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  if (data.status !== 'success' || !data.trends) {
    throw new Error('No se encontraron tendencias');
  }
  
  return data.trends.map(trend => typeof trend === 'string' ? trend : trend.name);
}

// Función para limpiar texto de tendencia (del archivo original)
function cleanTrendText(trendText) {
  let cleanText = trendText.replace(/^\d+\.\s*/, '').trim();
  
  if (cleanText.startsWith('#')) {
    cleanText = cleanText.substring(1);
  }
  
  cleanText = cleanText
    .replace(/\s*\([^)]*\)$/, '')
    .replace(/\d+[KMB]?$/i, '')
    .replace(/\s*\d+$/, '')
    .trim();
  
  return cleanText.length >= 2 ? cleanText : null;
}

// Función para hacer retry con back-off (usando ExtractorT local con queries inteligentes)
async function fetchTweetsWithRetry(query, location, limit) {
  const delays = [500, 1000, 2000]; // 0.5s, 1s, 2s
  
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // ExtractorT ya maneja la lógica inteligente, solo pasamos el query original
      const encodedQuery = encodeURIComponent(query);
      const url = `${API_BASE_URL}/nitter_context?q=${encodedQuery}&location=${location}&limit=${limit}`;
      
      console.log(`[TREND] Procesando: "${query}"`);
      console.log(`[FILTER] Ubicación: ${location}, Límite: ${limit}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Verificar si tiene tweets válidos
      if (data.status === 'success' && data.tweets && data.tweets.length > 0) {
        console.log(`[RESULT] Tweets encontrados: ${data.tweets.length}/${limit}`);
        console.log(`✅ ${query} · Búsqueda exitosa: ${data.tweets.length} tweets`);
        return data.tweets;
      }
      
      // Si no hay tweets, seguir con el siguiente intento
      if (attempt < 2) {
        console.log(`⏳ ${query} · Sin resultados en intento ${attempt + 1}, reintentando...`);
        await new Promise(resolve => setTimeout(resolve, delays[attempt]));
      }
      
    } catch (error) {
      if (attempt === 2) {
        console.log(`❌ ${query} · Todos los intentos fallaron: ${error.message}`);
        throw error;
      }
      console.log(`⚠️  ${query} · Error en intento ${attempt + 1}: ${error.message}, reintentando...`);
      await new Promise(resolve => setTimeout(resolve, delays[attempt]));
    }
  }
  
  return []; // Retornar array vacío si no se encontraron tweets después de todos los intentos
}

// Función para convertir fecha de Nitter (maneja múltiples formatos, SIN fallbacks inventados)
function parseNitterDate(dateString) {
  if (!dateString) {
    throw new Error('Date string is required for tweet parsing');
  }
  
  try {
    // Formato relativo: "2h", "1d", etc.
    if (/^\d+[mhsdwy]$/.test(dateString)) {
      const now = new Date();
      const value = parseInt(dateString);
      const unit = dateString.slice(-1);
      
      switch (unit) {
        case 'm': now.setMinutes(now.getMinutes() - value); break;
        case 'h': now.setHours(now.getHours() - value); break;
        case 'd': now.setDate(now.getDate() - value); break;
        case 'w': now.setDate(now.getDate() - (value * 7)); break;
        case 'y': now.setFullYear(now.getFullYear() - value); break;
        case 's': now.setSeconds(now.getSeconds() - value); break;
        default: 
          throw new Error(`Unknown time unit in date string: ${dateString}`);
      }
      
      return now.toISOString();
    }
    
    // Limpiar formato básico
    let cleanDate = dateString.replace(' · ', ' ').replace(' UTC', '').trim();
    
    // Manejar microsegundos: 2025-07-23T06:17:41.248063 → 2025-07-23T06:17:41.248Z
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/.test(cleanDate)) {
      // Truncar microsegundos a milisegundos y agregar Z
      cleanDate = cleanDate.substring(0, 23) + 'Z';
    }
    
    // Agregar Z si falta zona horaria: 2025-07-22T00:00:00 → 2025-07-22T00:00:00Z
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(cleanDate)) {
      cleanDate += 'Z';
    }
    
    // Agregar UTC si no tiene zona horaria
    if (!cleanDate.includes('Z') && !cleanDate.includes('+') && !cleanDate.includes('UTC')) {
      cleanDate += ' UTC';
    }
    
    const date = new Date(cleanDate);
    
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date format after processing: "${cleanDate}" (original: "${dateString}")`);
    }
    
    // Validar que la fecha sea razonable (no en el futuro más de 1 día)
    const now = new Date();
    const maxFutureDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +1 día
    
    if (date > maxFutureDate) {
      throw new Error(`Date is too far in future: ${date.toISOString()} (original: "${dateString}")`);
    }
    
    return date.toISOString();
  } catch (error) {
    throw new Error(`Failed to parse tweet date "${dateString}": ${error.message}`);
  }
}

// Función para guardar tweets en Supabase (estructura original sin cambios)
async function upsertTweet(tweetData) {
  try {
    const { error } = await supabase
      .from('trending_tweets')
      .upsert(tweetData, { onConflict: 'tweet_id' });
    
    if (error) {
      throw error;
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error };
  }
}

// Función principal para procesar una tendencia CON ANÁLISIS POLÍTICO
async function processTrend(trend, location, limit) {
  const cleanTrend = cleanTrendText(trend);
  
  if (!cleanTrend) {
    console.log(`❌ ${trend} · Término no válido después de limpiar`);
    return;
  }
  
  try {
    // 🏛️ PREPARAR ANÁLISIS: Sin búsqueda previa, procesaremos con Gemini
    console.log(`🏛️ [POLÍTICA] Preparando análisis con Gemini para: "${cleanTrend}"`);
    
    const tweets = await fetchTweetsWithRetry(cleanTrend, location, limit);
    
    if (tweets.length === 0) {
      console.log(`❌ ${trend} · No se encontraron tweets`);
      return;
    }
    
    let savedCount = 0;
    let politicalTweets = 0;
    
    for (const tweet of tweets) {
      // Verificar duplicados
      if (seenTweetIds.has(tweet.tweet_id)) {
        continue;
      }
      
      seenTweetIds.add(tweet.tweet_id);
      
      // 🏛️ ANÁLISIS POLÍTICO INDIVIDUAL
      const politicalAnalysis = detectPoliticalContent(tweet);
      
      // Preparar datos del tweet ORIGINALES (sin campos políticos en Supabase)
      let parsedDate;
      try {
        parsedDate = parseNitterDate(tweet.fecha);
      } catch (dateError) {
        console.error(`❌ [ERROR] Fecha inválida en tweet ${tweet.tweet_id}: ${dateError.message}`);
        console.warn(`⚠️ [SKIP] Saltando tweet con fecha inválida: @${tweet.usuario}`);
        continue; // Saltar este tweet en lugar de inventar datos
      }

      const tweetData = {
        trend_original: trend,
        trend_clean: cleanTrend,
        tweet_id: tweet.tweet_id,
        usuario: tweet.usuario,
        fecha_tweet: parsedDate,
        texto: tweet.texto,
        enlace: tweet.enlace,
        likes: tweet.likes || 0,
        retweets: tweet.retweets || 0,
        replies: tweet.replies || 0,
        verified: tweet.verified || false,
        location: location,
        fecha_captura: new Date().toISOString(),
        raw_data: tweet
      };
      
      // Contar tweets políticos
      if (politicalAnalysis.isPolitical) {
        politicalTweets++;
        console.log(`🏛️ [TWEET POLÍTICO] @${tweet.usuario}: Score ${politicalAnalysis.relevanceScore}/10`);
      }
      
      // Guardar en Supabase
      const result = await upsertTweet(tweetData);
      
      if (result.success) {
        savedCount++;
        
        // 🧠 POST-ANÁLISIS: Procesar con Gemini y guardar en PulsePolitics si es relevante
        if (politicalAnalysis.isPolitical && politicalAnalysis.relevanceScore >= 5) {
          try {
            console.log(`🧠 [GEMINI] Procesando tweet político de @${tweet.usuario} (Score: ${politicalAnalysis.relevanceScore}/10)`);
            
            // Procesar con Gemini para extraer entidades específicas
            const geminiAnalysis = await processWithGemini(tweet, cleanTrend);
            
            const saveResult = await lauraMemoryClient.savePoliticalContext(
              tweet,
              politicalAnalysis,
              cleanTrend,
              geminiAnalysis
            );
            
            if (!saveResult.saved) {
              console.error(`❌ [PulsePolitics] No se pudo guardar contexto para @${tweet.usuario}: ${saveResult.reason || 'Error desconocido'}`);
            } else {
              const totalExtracted = geminiAnalysis.entities.length + geminiAnalysis.figures.length + geminiAnalysis.nicknames_detected.length + geminiAnalysis.laws_decrees.length + geminiAnalysis.news_events.length;
              console.log(`✅ [PulsePolitics] Contexto guardado: @${tweet.usuario} - ${totalExtracted} elementos extraídos (${geminiAnalysis.nicknames_detected.length} apodos detectados)`);
            }
          } catch (memoryError) {
            console.error(`❌ [PulsePolitics] Error guardando contexto político: ${memoryError.message}`);
            console.warn(`⚠️ [CONTINUE] Continuando sin guardar contexto para tweet ${tweet.tweet_id}`);
          }
        }
      }
    }
    
    console.log(`✅ ${trend} · ${savedCount} tweets (${politicalTweets} políticos)`);
    
  } catch (error) {
    console.log(`❌ ${trend} · ${error.message}`);
  }
}

// Función principal CON ANÁLISIS POLÍTICO INTEGRADO
async function main() {
  const startTime = Date.now();
  console.log(`🚀 [POLÍTICA] Iniciando análisis político de tweets`);
  console.log(`⚙️ [CONFIG] Location: ${argv.location}, Limit: ${argv.limit}, Concurrency: ${argv.concurrency}`);
  
  // Estadísticas globales
  const stats = {
    totalTweets: 0,
    politicalTweets: 0,
    memoryUploads: 0,
    errors: 0,
    trendsProcessed: 0
  };
  
  try {
    // Verificar disponibilidad de Laura Memory
    const memoryAvailable = await lauraMemoryClient.isAvailable();
    console.log(`🧠 [MEMORIA] Laura Memory Service: ${memoryAvailable ? '✅ Disponible' : '❌ No disponible'}`);
    
    // Obtener tendencias
    console.log(`📡 [EXTRACTOR] Obteniendo tendencias de ${argv.location}...`);
    const trends = await getTrends(argv.location);
    console.log(`📈 [TENDENCIAS] Obtenidas ${trends.length} tendencias para análisis político`);
    
    if (trends.length === 0) {
      console.warn(`⚠️ [ALERTA] No se encontraron tendencias para procesar`);
      return;
    }
    
    // Procesar tendencias con concurrencia limitada
    const tasks = trends.map(trend => 
      limit(async () => {
        try {
          await processTrend(trend, argv.location, argv.limit);
          stats.trendsProcessed++;
        } catch (trendError) {
          console.error(`❌ [ERROR] Procesando tendencia "${trend}": ${trendError.message}`);
          stats.errors++;
        }
      })
    );
    
    console.log(`🔄 [PROCESAMIENTO] Iniciando análisis de ${trends.length} tendencias...`);
    await Promise.all(tasks);
    
    // Estadísticas finales
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`\n🎉 [RESUMEN POLÍTICO] Proceso completado en ${duration}s`);
    console.log(`📊 [ESTADÍSTICAS]:`);
    console.log(`   • Tweets únicos procesados: ${seenTweetIds.size}`);
    console.log(`   • Tendencias procesadas: ${stats.trendsProcessed}/${trends.length}`);
    console.log(`   • Errores encontrados: ${stats.errors}`);
    console.log(`   • Laura Memory Service: ${memoryAvailable ? 'Activo' : 'Inactivo'}`);
    
    if (stats.errors > 0) {
      console.warn(`⚠️ [ALERTA] Se encontraron ${stats.errors} errores durante el procesamiento`);
    }
    
    // Mostrar estadísticas de memoria si está disponible
    if (memoryAvailable) {
      try {
        console.log(`🧠 [MEMORIA] Consultando estadísticas finales...`);
        // Nota: Este endpoint podría no existir aún, es un placeholder para futuras mejoras
      } catch (memoryStatsError) {
        console.warn(`⚠️ [MEMORIA] No se pudieron obtener estadísticas: ${memoryStatsError.message}`);
      }
    }
    
  } catch (error) {
    console.error(`💥 [ERROR FATAL] ${error.message}`);
    console.error(`📍 [DEBUG] Stack trace:`, error.stack);
    process.exit(1);
  }
}

// Ejecutar
main().catch(console.error); 