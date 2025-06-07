const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const { SystemLogger } = require('./system_logger');
require('dotenv').config();

// Configura tus credenciales de Supabase
const SUPABASE_URL = 'https://qqshdccpmypelhmyqnut.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxc2hkY2NwbXlwZWxobXlxbnV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjAzNjcxMSwiZXhwIjoyMDYxNjEyNzExfQ.BaJ_z3Gp2pUnmYEDpfNTCIxpHloSjmxi43aKwm-93ZI';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Configuración de la API
const API_BASE_URL = 'https://api.standatpd.com'; // Cambiado a puerto 8001 para evitar conflictos
// const API_BASE_URL = 'https://api.standatpd.com'; // Producción - comentado temporalmente
const LOCATION = 'guatemala';

// Configuración para análisis de sentimiento
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ENABLE_SENTIMENT_ANALYSIS = process.env.ENABLE_SENTIMENT_ANALYSIS !== 'false'; // true por defecto

// Inicializar logger global
let systemLogger = new SystemLogger();

// Función para análisis de sentimiento individual con GPT-3.5 Turbo
async function analyzeTweetSentiment(tweet, categoria) {
  if (!OPENAI_API_KEY || !ENABLE_SENTIMENT_ANALYSIS) {
    systemLogger.addWarning('Análisis de sentimiento deshabilitado', `Tweet ${tweet.tweet_id}`);
    return getDefaultSentimentData('API deshabilitada');
  }

  try {
    systemLogger.logProgress(`Analizando sentimiento: @${tweet.usuario} - ${tweet.texto.substring(0, 50)}...`);
    
    const prompt = `Analiza COMPLETAMENTE este tweet guatemalteco de la categoría "${categoria}":

Tweet: "${tweet.texto}"

Contexto:
- Usuario: @${tweet.usuario}
- Categoría: ${categoria}
- Ubicación: Guatemala
- Fecha: ${tweet.fecha}
- Likes: ${tweet.likes || 0}, Retweets: ${tweet.retweets || 0}, Replies: ${tweet.replies || 0}

Instrucciones de Análisis:
1. SENTIMIENTO: Considera contexto guatemalteco, lenguaje chapín, sarcasmo, ironía
2. INTENCIÓN: Identifica el propósito comunicativo del tweet
3. ENTIDADES: Extrae personas, organizaciones, lugares, eventos mencionados

Responde ÚNICAMENTE con un JSON válido:
{
  "sentimiento": "positivo|negativo|neutral",
  "score": 0.75,
  "confianza": 0.85,
  "emociones": ["alegría", "esperanza"],
  "intencion_comunicativa": "informativo|opinativo|humoristico|alarmista|critico|promocional|conversacional|protesta",
  "entidades_mencionadas": [
    {
      "nombre": "Bernardo Arévalo",
      "tipo": "persona",
      "contexto": "presidente de Guatemala"
    },
    {
      "nombre": "Congreso",
      "tipo": "organizacion",
      "contexto": "institución política"
    }
  ],
  "contexto_local": "breve explicación del contexto guatemalteco detectado",
  "intensidad": "alta|media|baja"
}

TIPOS DE INTENCIÓN:
- informativo: Comparte datos/hechos objetivos
- opinativo: Expresa opinión personal o juicio
- humoristico: Busca entretener o hacer reír
- alarmista: Busca alertar o generar preocupación
- critico: Critica personas/instituciones/situaciones
- promocional: Promociona algo (evento, producto, idea)
- conversacional: Busca interacción/diálogo
- protesta: Expresión de descontento o resistencia

TIPOS DE ENTIDADES:
- persona: Individuos específicos (políticos, celebridades, etc.)
- organizacion: Instituciones, empresas, partidos, etc.
- lugar: Ubicaciones geográficas específicas
- evento: Acontecimientos, celebraciones, crisis, etc.`;

    const startTime = Date.now();
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Eres un experto en análisis de sentimientos especializado en el contexto guatemalteco. Entiendes el lenguaje coloquial, sarcasmo, y las referencias culturales y políticas de Guatemala. Responde siempre con JSON válido.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 300,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      })
    });

    const apiResponseTime = Date.now() - startTime;

    if (!response.ok) {
      const errorMsg = `OpenAI API error: ${response.status} ${response.statusText}`;
      systemLogger.addError(new Error(errorMsg), `Tweet ${tweet.tweet_id}`);
      systemLogger.addAIRequestCost(0, false);
      throw new Error(errorMsg);
    }

    const data = await response.json();
    const tokensUsed = data.usage?.total_tokens || 0;
    
    // Registrar costo y éxito de la AI request
    systemLogger.addAIRequestCost(tokensUsed, true);
    
    const aiResponse = data.choices?.[0]?.message?.content;
    
    if (!aiResponse) {
      const errorMsg = 'No response from OpenAI';
      systemLogger.addError(new Error(errorMsg), `Tweet ${tweet.tweet_id}`);
      throw new Error(errorMsg);
    }

    // Limpiar respuesta y parsear JSON
    const cleanResponse = aiResponse.replace(/```json|```/g, '').trim();
    const analysis = JSON.parse(cleanResponse);
    
    // Validar y normalizar datos
    const sentimiento = ['positivo', 'negativo', 'neutral'].includes(analysis.sentimiento) 
      ? analysis.sentimiento 
      : 'neutral';
    
    const score = typeof analysis.score === 'number' && analysis.score >= -1 && analysis.score <= 1 
      ? analysis.score 
      : 0.0;
    
    const confianza = typeof analysis.confianza === 'number' && analysis.confianza >= 0 && analysis.confianza <= 1 
      ? analysis.confianza 
      : 0.5;

    // Validar intención comunicativa
    const intencionesValidas = ['informativo', 'opinativo', 'humoristico', 'alarmista', 'critico', 'promocional', 'conversacional', 'protesta'];
    const intencion = intencionesValidas.includes(analysis.intencion_comunicativa) 
      ? analysis.intencion_comunicativa 
      : 'informativo';

    // Validar y normalizar entidades
    const entidades = Array.isArray(analysis.entidades_mencionadas) 
      ? analysis.entidades_mencionadas.filter(ent => 
          ent && typeof ent === 'object' && ent.nombre && ent.tipo
        )
      : [];

    // Registrar estadísticas en logger
    systemLogger.updateSentimientoStats(sentimiento);
    systemLogger.updateIntencionStats(intencion);
    
    systemLogger.logSuccess(`Análisis completo: ${sentimiento} (${score}) | ${intencion} | ${entidades.length} entidades - ${tweet.tweet_id}`);
    
    return {
      sentimiento: sentimiento,
      score_sentimiento: score,
      confianza_sentimiento: confianza,
      emociones_detectadas: Array.isArray(analysis.emociones) ? analysis.emociones : [],
      intencion_comunicativa: intencion,
      entidades_mencionadas: entidades,
      analisis_ai_metadata: {
        modelo: 'gpt-3.5-turbo',
        timestamp: new Date().toISOString(),
        contexto_local: analysis.contexto_local || '',
        intensidad: analysis.intensidad || 'media',
        categoria: categoria,
        tokens_usados: tokensUsed,
        costo_estimado: tokensUsed * 0.0015 / 1000, // $0.0015 per 1K tokens
        api_response_time_ms: apiResponseTime
      }
    };

  } catch (error) {
    systemLogger.addError(error, `Análisis sentimiento tweet ${tweet.tweet_id}`);
    systemLogger.addAIRequestCost(0, false);
    return getDefaultSentimentData(error.message);
  }
}

// Función de fallback para datos por defecto
function getDefaultSentimentData(error) {
  return {
    sentimiento: 'neutral',
    score_sentimiento: 0.0,
    confianza_sentimiento: 0.3,
    emociones_detectadas: [],
    intencion_comunicativa: 'informativo',
    entidades_mencionadas: [],
    analisis_ai_metadata: {
      error: error,
      timestamp: new Date().toISOString(),
      modelo: 'fallback'
    }
  };
}

// Mapeo de categorías basado en contenido - MEJORADO
const categorizeTrend = (trendText) => {
  const text = trendText.toLowerCase();
  
  // Política - Expandido con términos guatemaltecos
  if (text.includes('política') || text.includes('político') || text.includes('congreso') || 
      text.includes('gobierno') || text.includes('presidente') || text.includes('ley') ||
      text.includes('elecciones') || text.includes('partido') || text.includes('diputado') ||
      text.includes('ministerio') || text.includes('ministra') || text.includes('ministro') ||
      text.includes('corrupción') || text.includes('tse') || text.includes('mp') ||
      text.includes('cicig') || text.includes('senado') || text.includes('alcalde') ||
      text.includes('giammattei') || text.includes('arévalo') || text.includes('semilla') ||
      text.includes('vamos') || text.includes('une') || text.includes('valor') ||
      text.includes('todos') || text.includes('winaq') || text.includes('líder') ||
      text.includes('guatemala') || text.includes('nombramiento') || text.includes('renuncia')) {
    return 'Política';
  }
  
  // Económica - Expandido
  if (text.includes('finanzas') || text.includes('economía') || text.includes('banco') ||
      text.includes('impuesto') || text.includes('precio') || text.includes('dólar') ||
      text.includes('inflación') || text.includes('comercio') || text.includes('empleo') ||
      text.includes('trabajo') || text.includes('salario') || text.includes('banguat') ||
      text.includes('superintendencia') || text.includes('inversión') || text.includes('exportación') ||
      text.includes('pib') || text.includes('bolsa') || text.includes('empresa') ||
      text.includes('quetzal') || text.includes('mercado') || text.includes('negocios')) {
    return 'Económica';
  }
  
  // Sociales - Expandido con temas guatemaltecos
  if (text.includes('educación') || text.includes('salud') || text.includes('familia') ||
      text.includes('sociedad') || text.includes('comunidad') || text.includes('cultura') ||
      text.includes('derechos') || text.includes('violencia') || text.includes('mujer') ||
      text.includes('niños') || text.includes('juventud') || text.includes('universidad') ||
      text.includes('hospital') || text.includes('medicina') || text.includes('covid') ||
      text.includes('vacuna') || text.includes('usac') || text.includes('url') ||
      text.includes('mariano') || text.includes('landívar') || text.includes('rafael') ||
      text.includes('social') || text.includes('maya') || text.includes('indígena') ||
      text.includes('xinca') || text.includes('garífuna') || text.includes('discriminación')) {
    return 'Sociales';
  }
  
  return 'General';
};

// Función para limpiar el texto del trend (quitar números de posición, etc.)
const cleanTrendText = (trendText) => {
  // Remover números de posición al inicio (ej: "1. #Hashtag" -> "#Hashtag")
  return trendText.replace(/^\d+\.\s*/, '').trim();
};

// Función para extraer término de búsqueda del trend
const extractSearchTerm = (trendText) => {
  let cleanText = cleanTrendText(trendText);
  
  // Si es un hashtag, remover el #
  if (cleanText.startsWith('#')) {
    cleanText = cleanText.substring(1);
  }
  
  // Remover conteos con paréntesis (ej: "término (123)")
  cleanText = cleanText.replace(/\s*\([^)]*\)$/, '');
  
  // Remover sufijos de números con K, M, etc. al final
  // Ejemplos: Taylor839K -> Taylor, USAC14K -> USAC, Rep TV138K -> Rep TV
  cleanText = cleanText.replace(/\d+[KMB]?$/i, '');
  
  // Remover números sueltos al final
  cleanText = cleanText.replace(/\s*\d+$/, '');
  
  // Remover espacios extra y limpiar
  cleanText = cleanText.trim();
  
  // Si el término queda muy corto (menos de 2 caracteres), podría no ser útil
  if (cleanText.length < 2) {
    console.log(`⚠️  Término muy corto después de limpiar: "${cleanText}" (original: "${trendText}")`);
    return null;
  }
  
  console.log(`🧹 Limpieza: "${trendText}" -> "${cleanText}"`);
  return cleanText;
};

// Función para convertir fecha de Nitter a formato ISO
const parseNitterDate = (dateString) => {
  if (!dateString) return null;
  
  try {
    // Manejar fechas relativas: "3m", "16m", "2h", "58m", etc.
    if (/^\d+[mhsdwy]$/.test(dateString)) {
      const now = new Date();
      const value = parseInt(dateString);
      const unit = dateString.slice(-1);
      
      switch (unit) {
        case 'm': // minutos
          now.setMinutes(now.getMinutes() - value);
          break;
        case 'h': // horas  
          now.setHours(now.getHours() - value);
          break;
        case 'd': // días
          now.setDate(now.getDate() - value);
          break;
        case 'w': // semanas
          now.setDate(now.getDate() - (value * 7));
          break;
        case 'y': // años
          now.setFullYear(now.getFullYear() - value);
          break;
        case 's': // segundos
          now.setSeconds(now.getSeconds() - value);
          break;
        default:
          console.log(`⚠️  Unidad de tiempo no reconocida: "${unit}" en "${dateString}"`);
          return new Date().toISOString(); // Usar fecha actual como fallback
      }
      
      console.log(`🕒 Fecha relativa convertida: "${dateString}" -> ${now.toISOString()}`);
      return now.toISOString();
    }
    
    // Formato típico de Nitter: "May 30, 2025 · 11:10 PM UTC"
    // Remover el separador " · " y limpiar
    const cleanDate = dateString.replace(' · ', ' ').replace(' UTC', '');
    
    // Crear objeto Date y convertir a ISO
    const date = new Date(cleanDate + ' UTC');
    
    // Verificar si la fecha es válida
    if (isNaN(date.getTime())) {
      console.log(`⚠️  Fecha inválida: "${dateString}" - usando fecha actual`);
      return new Date().toISOString(); // Usar fecha actual como fallback
    }
    
    return date.toISOString();
  } catch (error) {
    console.log(`❌ Error parseando fecha "${dateString}":`, error.message);
    return new Date().toISOString(); // Usar fecha actual como fallback
  }
};

// Verificar si ya existe un tweet con el mismo tweet_id
async function tweetExiste(tweetId) {
  if (!tweetId) return false;
  const { data, error } = await supabase
    .from('trending_tweets')
    .select('id')
    .eq('tweet_id', tweetId)
    .maybeSingle();
  return !!data;
}

// Función principal para obtener trending y tweets
async function fetchTrendingAndTweets() {
  // Inicializar logging de ejecución
  const executionId = await systemLogger.startExecution('fetch_trending_and_tweets', {
    location: LOCATION,
    api_base_url: API_BASE_URL,
    sentiment_analysis_enabled: ENABLE_SENTIMENT_ANALYSIS
  });

  try {
    systemLogger.logProgress('Obteniendo trending topics...');
    systemLogger.logProgress(`URL: ${API_BASE_URL}/trending?location=${LOCATION}`);
    
    // 1. Obtener trending topics
    const trendingRes = await fetch(`${API_BASE_URL}/trending?location=${LOCATION}`);
    systemLogger.logProgress(`Response status: ${trendingRes.status}`);
    
    if (!trendingRes.ok) {
      throw new Error(`HTTP ${trendingRes.status}: ${trendingRes.statusText}`);
    }
    
    const trendingData = await trendingRes.json();
    systemLogger.logProgress(`Response data: ${JSON.stringify(trendingData, null, 2)}`);
    
    if (trendingData.status !== 'success' || !trendingData.twitter_trends) {
      const errorMsg = trendingData.message || 'No trends found';
      systemLogger.addError(new Error(errorMsg), 'Obteniendo trending topics');
      await systemLogger.finishExecution('failed');
      return;
    }
    
    const trendsFound = trendingData.twitter_trends.length;
    systemLogger.setMetric('trends_found', trendsFound);
    systemLogger.logSuccess(`Obtenidos ${trendsFound} trending topics`);
    
    // 2. Para cada trend, obtener tweets de Nitter
    for (const trend of trendingData.twitter_trends) {
      try {
        const searchTerm = extractSearchTerm(trend);
        
        // Si el término es null o muy corto, saltar
        if (!searchTerm) {
          systemLogger.addWarning(`Saltando trend "${trend}" - término no válido después de limpiar`, 'extractSearchTerm');
          continue;
        }
        
        const categoria = categorizeTrend(trend);
        systemLogger.updateCategoriaStats(categoria);
        
        systemLogger.logProgress(`Buscando tweets para: "${searchTerm}" (${categoria})`);
        
        // Llamar al endpoint de nitter_context
        const nitterRes = await fetch(
          `${API_BASE_URL}/nitter_context?q=${encodeURIComponent(searchTerm)}&location=${LOCATION}&limit=10`
        );
        const nitterData = await nitterRes.json();
        
        if (nitterData.status === 'success' && nitterData.tweets) {
          const tweetsFound = nitterData.tweets.length;
          systemLogger.incrementMetric('tweets_found', tweetsFound);
          systemLogger.logSuccess(`Encontrados ${tweetsFound} tweets para "${searchTerm}"`);
          
          // 3. Procesar cada tweet con análisis de sentimiento
          for (const tweet of nitterData.tweets) {
            try {
              systemLogger.incrementMetric('tweets_processed');
              
              // Evitar duplicados
              if (await tweetExiste(tweet.tweet_id)) {
                systemLogger.incrementMetric('duplicates_skipped');
                systemLogger.logProgress(`Tweet ${tweet.tweet_id} ya existe, saltando...`);
                continue;
              }
              
              // Análizar sentimiento individual
              const sentimentData = await analyzeTweetSentiment(tweet, categoria);
              
              // Insertar tweet con análisis completo
              const { error } = await supabase.from('trending_tweets').insert({
                trend_original: trend,
                trend_clean: searchTerm,
                categoria: categoria,
                tweet_id: tweet.tweet_id,
                usuario: tweet.usuario,
                fecha_tweet: parseNitterDate(tweet.fecha),
                texto: tweet.texto,
                enlace: tweet.enlace,
                likes: tweet.likes || 0,
                retweets: tweet.retweets || 0,
                replies: tweet.replies || 0,
                verified: tweet.verified || false,
                location: LOCATION,
                fecha_captura: new Date().toISOString(),
                raw_data: tweet,
                // Campos de análisis de sentimiento
                sentimiento: sentimentData.sentimiento,
                score_sentimiento: sentimentData.score_sentimiento,
                confianza_sentimiento: sentimentData.confianza_sentimiento,
                emociones_detectadas: sentimentData.emociones_detectadas,
                // Campos de análisis avanzado
                intencion_comunicativa: sentimentData.intencion_comunicativa,
                entidades_mencionadas: sentimentData.entidades_mencionadas,
                analisis_ai_metadata: sentimentData.analisis_ai_metadata
                // Nota: score_propagacion y propagacion_viral se calculan automáticamente por el trigger
              });
              
              if (error) {
                systemLogger.addError(error, `Insertando tweet ${tweet.tweet_id}`);
                systemLogger.incrementMetric('tweets_failed');
              } else {
                systemLogger.incrementMetric('tweets_saved');
                
                // Calcular propagación viral para el log
                const engagement = (tweet.likes || 0) + (tweet.retweets || 0) + (tweet.replies || 0);
                let propagacion_viral = 'minima';
                if (engagement >= 1000) propagacion_viral = 'masiva';
                else if (engagement >= 500) propagacion_viral = 'alta';
                else if (engagement >= 100) propagacion_viral = 'media';
                else if (engagement >= 10) propagacion_viral = 'baja';
                
                systemLogger.updatePropagacionStats(propagacion_viral);
                
                systemLogger.logSuccess(`Tweet completo guardado: @${tweet.usuario} - ${sentimentData.sentimiento} (${sentimentData.score_sentimiento}) | ${sentimentData.intencion_comunicativa} | ${sentimentData.entidades_mencionadas.length} entidades - ${tweet.texto.substring(0, 50)}...`);
              }
              
              // Actualizar progreso en logs cada 5 tweets
              if (systemLogger.metrics.tweets_processed % 5 === 0) {
                await systemLogger.updateExecution('running');
              }
              
              // Pausa breve entre tweets para ser responsable con las APIs
              await new Promise(resolve => setTimeout(resolve, 500));
              
            } catch (error) {
              systemLogger.addError(error, `Procesando tweet individual en ${searchTerm}`);
              systemLogger.incrementMetric('tweets_failed');
              continue;
            }
          }
        } else {
          systemLogger.addWarning(`No se encontraron tweets para "${searchTerm}": ${nitterData.message}`, 'nitter_context');
        }
        
        // Pausa entre trends para no sobrecargar la API
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        systemLogger.addError(error, `Procesando trend "${trend}"`);
        continue;
      }
    }
    
    // Finalizar ejecución exitosa
    await systemLogger.finishExecution('completed', {
      trends_processed: trendsFound,
      final_summary: 'Proceso completado exitosamente'
    });
    
  } catch (error) {
    systemLogger.addError(error, 'Proceso principal');
    await systemLogger.finishExecution('failed', {
      error_summary: error.message
    });
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  fetchTrendingAndTweets();
}

module.exports = { fetchTrendingAndTweets };