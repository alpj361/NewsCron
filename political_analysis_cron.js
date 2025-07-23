/**
 * POLITICAL ANALYSIS CRON
 * Analiza tweets existentes en Supabase para extraer contexto político con Gemini
 * y guardar en PulsePolitics para memoria inteligente
 */

import fetch from 'node-fetch';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

// CLI arguments
const argv = yargs(hideBin(process.argv))
  .option('days', {
    alias: 'd',
    type: 'number',
    default: 7,
    description: 'Días hacia atrás para analizar tweets'
  })
  .option('limit', {
    alias: 'l',
    type: 'number',
    default: 100,
    description: 'Máximo de tweets a procesar por ejecución'
  })
  .option('batch-size', {
    alias: 'b',
    type: 'number',
    default: 10,
    description: 'Tamaño de lote para procesamiento'
  })
  .option('min-score', {
    alias: 's',
    type: 'number',
    default: 3,
    description: 'Score mínimo para considerar tweet político'
  })
  .help()
  .argv;

// Configuración Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ===== LAURA MEMORY CLIENT (Copiado del archivo principal) =====
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
      // USAR ENDPOINT ESPECÍFICO DE PULSEPOLITICS
      const response = await fetch(`${this.baseUrl}/api/politics/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(politicalContext)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.hasOwnProperty('success')) {
        throw new Error('Invalid response format from politics service');
      }
      
      if (result.success) {
        console.log(`🏛️ [PulsePolitics] Contexto guardado: @${tweet.usuario} (Score: ${politicalAnalysis.relevanceScore}/10)`);
        const totalExtracted = geminiAnalysis.entities.length + geminiAnalysis.figures.length + geminiAnalysis.nicknames_detected.length + geminiAnalysis.laws_decrees.length + geminiAnalysis.news_events.length;
        console.log(`📊 [PulsePolitics] Elementos extraídos: ${totalExtracted} (${geminiAnalysis.nicknames_detected.length} apodos detectados)`);
        return { saved: true };
      } else {
        console.warn(`⚠️ [PulsePolitics] Error: ${result.error || 'Error desconocido'}`);
        return { saved: false, reason: result.error };
      }
      
    } catch (error) {
      throw new Error(`Error guardando contexto político: ${error.message}`);
    }
  }
}

// Instancia global
const lauraMemoryClient = new LauraMemoryClient();

// ===== FUNCIONES DE ANÁLISIS (Copiadas del archivo principal) =====

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

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=' + process.env.GEMINI_API_KEY, {
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
          temperature: 0.1,
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
    const jsonMatch = geminiText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Gemini response');
    }

    const geminiAnalysis = JSON.parse(jsonMatch[0]);
    
    const requiredFields = ['entities', 'figures', 'social_usernames', 'laws_decrees', 'news_events', 'nicknames_detected'];
    for (const field of requiredFields) {
      if (!Array.isArray(geminiAnalysis[field])) {
        geminiAnalysis[field] = [];
      }
    }

    console.log(`🧠 [GEMINI] Análisis completado para @${tweet.usuario}: ${geminiAnalysis.entities.length} entidades, ${geminiAnalysis.figures.length} figuras, ${geminiAnalysis.nicknames_detected.length} apodos`);
    
    return geminiAnalysis;

  } catch (error) {
    console.error(`❌ [GEMINI] Error procesando tweet de @${tweet.usuario}: ${error.message}`);
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

/**
 * Detecta y categoriza contenido político guatemalteco
 */
function detectPoliticalContent(tweet) {
  const texto = tweet.texto.toLowerCase();
  
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
    entities: []
  };
  
  for (const [category, keywords] of Object.entries(politicalKeywords)) {
    const matches = keywords.filter(keyword => texto.includes(keyword));
    if (matches.length > 0) {
      analysis.isPolitical = true;
      analysis.categories.push(category);
      analysis.entities.push(...matches);
      analysis.relevanceScore += matches.length * 2;
    }
  }
  
  if (tweet.verified) {
    analysis.relevanceScore += 3;
  }
  
  const engagement = (tweet.likes || 0) + (tweet.retweets || 0) + (tweet.replies || 0);
  if (engagement > 100) analysis.relevanceScore += 2;
  if (engagement > 500) analysis.relevanceScore += 3;
  
  analysis.relevanceScore = Math.min(analysis.relevanceScore, 10);
  
  if (analysis.relevanceScore < 2) {
    analysis.isPolitical = false;
  }
  
  return analysis;
}

// ===== FUNCIONES PRINCIPALES DEL CRON =====

/**
 * Obtiene tweets de Supabase para análisis político
 */
async function getTweetsFromSupabase(days, limit) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    console.log(`📡 [SUPABASE] Obteniendo tweets de los últimos ${days} días...`);
    
    const { data, error } = await supabase
      .from('trending_tweets')
      .select('*')
      .gte('fecha_captura', startDate.toISOString())
      .order('fecha_captura', { ascending: false })
      .limit(limit);
    
    if (error) {
      throw new Error(`Error obteniendo tweets: ${error.message}`);
    }
    
    console.log(`📊 [SUPABASE] Obtenidos ${data.length} tweets para análisis`);
    return data || [];
    
  } catch (error) {
    console.error(`❌ [ERROR] Error obteniendo tweets de Supabase: ${error.message}`);
    throw error;
  }
}

/**
 * Procesa un lote de tweets con análisis político
 */
async function processBatch(tweets, minScore) {
  let processedCount = 0;
  let politicalCount = 0;
  let geminiCount = 0;
  
  for (const tweet of tweets) {
    try {
      // Análisis político básico
      const politicalAnalysis = detectPoliticalContent(tweet);
      
      if (politicalAnalysis.isPolitical) {
        politicalCount++;
        console.log(`🏛️ [POLÍTICO] @${tweet.usuario}: Score ${politicalAnalysis.relevanceScore}/10`);
        
        // Si supera el threshold, procesar con Gemini
        if (politicalAnalysis.relevanceScore >= minScore) {
          try {
            console.log(`🧠 [GEMINI] Procesando @${tweet.usuario}...`);
            
            const geminiAnalysis = await processWithGemini(tweet, tweet.trend_clean || tweet.trend_original || 'análisis retrospectivo');
            
            const saveResult = await lauraMemoryClient.savePoliticalContext(
              tweet,
              politicalAnalysis,
              tweet.trend_clean || 'retrospective',
              geminiAnalysis
            );
            
            if (saveResult.saved) {
              geminiCount++;
            }
            
          } catch (geminiError) {
            console.error(`❌ [GEMINI] Error procesando @${tweet.usuario}: ${geminiError.message}`);
          }
        }
      }
      
      processedCount++;
      
      // Pequeña pausa para no saturar APIs
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`❌ [ERROR] Error procesando tweet ${tweet.tweet_id}: ${error.message}`);
    }
  }
  
  return { processedCount, politicalCount, geminiCount };
}

/**
 * Función principal del cron
 */
async function main() {
  const startTime = Date.now();
  console.log(`🚀 [CRON POLÍTICO] Iniciando análisis retrospectivo`);
  console.log(`⚙️ [CONFIG] Días: ${argv.days}, Límite: ${argv.limit}, Lote: ${argv['batch-size']}, Score mínimo: ${argv['min-score']}`);
  
  const stats = {
    totalTweets: 0,
    politicalTweets: 0,
    geminiProcessed: 0,
    errors: 0
  };
  
  try {
    // Verificar Laura Memory Service
    const memoryAvailable = await lauraMemoryClient.isAvailable();
    console.log(`🧠 [MEMORIA] Laura Memory Service: ${memoryAvailable ? '✅ Disponible' : '❌ No disponible'}`);
    
    if (!memoryAvailable) {
      throw new Error('Laura Memory Service no disponible');
    }
    
    // Obtener tweets de Supabase
    const tweets = await getTweetsFromSupabase(argv.days, argv.limit);
    stats.totalTweets = tweets.length;
    
    if (tweets.length === 0) {
      console.warn('⚠️ [ALERTA] No se encontraron tweets para procesar');
      return;
    }
    
    // Procesar en lotes
    const batchSize = argv['batch-size'];
    const totalBatches = Math.ceil(tweets.length / batchSize);
    
    console.log(`🔄 [PROCESAMIENTO] Iniciando ${totalBatches} lotes de ${batchSize} tweets...`);
    
    for (let i = 0; i < totalBatches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, tweets.length);
      const batch = tweets.slice(start, end);
      
      console.log(`\n📦 [LOTE ${i + 1}/${totalBatches}] Procesando tweets ${start + 1}-${end}...`);
      
      const batchResults = await processBatch(batch, argv['min-score']);
      
      stats.politicalTweets += batchResults.politicalCount;
      stats.geminiProcessed += batchResults.geminiCount;
      
      console.log(`✅ [LOTE ${i + 1}] Completado: ${batchResults.politicalCount} políticos, ${batchResults.geminiCount} procesados con Gemini`);
    }
    
    // Estadísticas finales
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`\n🎉 [RESUMEN] Análisis retrospectivo completado en ${duration}s`);
    console.log(`📊 [ESTADÍSTICAS]:`);
    console.log(`   • Tweets analizados: ${stats.totalTweets}`);
    console.log(`   • Tweets políticos: ${stats.politicalTweets}`);
    console.log(`   • Procesados con Gemini: ${stats.geminiProcessed}`);
    console.log(`   • Errores: ${stats.errors}`);
    console.log(`   • Eficiencia: ${((stats.politicalTweets / stats.totalTweets) * 100).toFixed(1)}% políticos`);
    
  } catch (error) {
    console.error(`💥 [ERROR FATAL] ${error.message}`);
    console.error(`📍 [DEBUG] Stack trace:`, error.stack);
    process.exit(1);
  }
}

// Ejecutar
main().catch(console.error); 