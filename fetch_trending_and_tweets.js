import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import { SystemLogger } from './system_logger.js';
import dotenv from 'dotenv';
dotenv.config();

// Configura tus credenciales de Supabase
const SUPABASE_URL = 'https://qqshdccpmypelhmyqnut.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxc2hkY2NwbXlwZWxobXlxbnV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjAzNjcxMSwiZXhwIjoyMDYxNjEyNzExfQ.BaJ_z3Gp2pUnmYEDpfNTCIxpHloSjmxi43aKwm-93ZI';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Configuración de la API
const API_BASE_URL = 'https://api.standatpd.com'; // Cambiado a puerto 8001 para evitar conflictos
// const API_BASE_URL = 'https://api.standatpd.com'; // Producción - comentado temporalmente
const LOCATION = 'guatemala';

// Configuración para análisis de sentimiento - OpenAI (legacy)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Configuración para análisis de sentimiento - Gemini (nuevo)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// Selección de API (priorizar Gemini si está disponible)
const USE_GEMINI = !!GEMINI_API_KEY;
const ENABLE_SENTIMENT_ANALYSIS = process.env.ENABLE_SENTIMENT_ANALYSIS !== 'false';

// API Cost Limits para Gemini
const API_LIMITS = {
  maxCostPerCall: 0.50,              // USD max por llamada
  maxCallsPerMinute: 10,             // Rate limit
  maxDailyCost: 5.00,                // USD max diario
  estimatedCostPer1kTokens: 0.0001   // Gemini Flash pricing (~10x más barato que GPT-3.5)
};

// Inicializar logger global
let systemLogger = new SystemLogger();

// ==== CostTracker Class para límites de API ====
class CostTracker {
  constructor() {
    this.callsThisMinute = 0;
    this.dailyCost = 0;
    this.lastMinuteReset = Date.now();
    this.lastDailyReset = Date.now();
    this.totalCallsToday = 0;
  }

  resetIfNeeded() {
    const now = Date.now();
    // Reset cada minuto
    if (now - this.lastMinuteReset > 60000) {
      this.callsThisMinute = 0;
      this.lastMinuteReset = now;
    }
    // Reset cada 24 horas
    if (now - this.lastDailyReset > 86400000) {
      this.dailyCost = 0;
      this.totalCallsToday = 0;
      this.lastDailyReset = now;
      console.log('📊 CostTracker: Reset diario de costos');
    }
  }

  canMakeCall(estimatedTokens = 500) {
    this.resetIfNeeded();
    const estimatedCost = (estimatedTokens / 1000) * API_LIMITS.estimatedCostPer1kTokens;

    if (estimatedCost > API_LIMITS.maxCostPerCall) {
      return { allowed: false, reason: 'cost_per_call', message: `Costo estimado $${estimatedCost.toFixed(4)} excede límite $${API_LIMITS.maxCostPerCall}` };
    }
    if (this.callsThisMinute >= API_LIMITS.maxCallsPerMinute) {
      return { allowed: false, reason: 'rate_limit', message: `Límite de ${API_LIMITS.maxCallsPerMinute} llamadas/minuto alcanzado` };
    }
    if (this.dailyCost + estimatedCost > API_LIMITS.maxDailyCost) {
      return { allowed: false, reason: 'daily_limit', message: `Límite diario $${API_LIMITS.maxDailyCost} alcanzado (usado: $${this.dailyCost.toFixed(4)})` };
    }

    return { allowed: true, estimatedCost };
  }

  recordCall(tokensUsed) {
    const cost = (tokensUsed / 1000) * API_LIMITS.estimatedCostPer1kTokens;
    this.callsThisMinute++;
    this.totalCallsToday++;
    this.dailyCost += cost;
    return { cost, dailyTotal: this.dailyCost, callsToday: this.totalCallsToday };
  }

  getStatus() {
    return {
      callsThisMinute: this.callsThisMinute,
      totalCallsToday: this.totalCallsToday,
      dailyCost: this.dailyCost,
      remainingBudget: API_LIMITS.maxDailyCost - this.dailyCost
    };
  }
}

const costTracker = new CostTracker();

// Función para análisis de sentimiento con Gemini Flash (o OpenAI fallback)
async function analyzeTweetSentiment(tweet, categoria) {
  // Verificar si tenemos alguna API habilitada
  if ((!USE_GEMINI && !OPENAI_API_KEY) || !ENABLE_SENTIMENT_ANALYSIS) {
    systemLogger.addWarning('Análisis de sentimiento deshabilitado', `Tweet ${tweet.tweet_id}`);
    return getDefaultSentimentData('API deshabilitada');
  }

  // Verificar límites de costos antes de hacer la llamada
  const canProceed = costTracker.canMakeCall(500); // Estimamos ~500 tokens por tweet
  if (!canProceed.allowed) {
    systemLogger.addWarning(`CostTracker: ${canProceed.message}`, `Tweet ${tweet.tweet_id}`);
    return getDefaultSentimentData(`Límite alcanzado: ${canProceed.reason}`);
  }

  try {
    systemLogger.logProgress(`🤖 Analizando sentimiento${USE_GEMINI ? ' (Gemini)' : ' (OpenAI)'}: @${tweet.usuario} - ${tweet.texto.substring(0, 50)}...`);

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
    let response, data, aiResponse, tokensUsed;

    if (USE_GEMINI) {
      // ===== GEMINI API =====
      response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Eres un experto en análisis de sentimientos especializado en el contexto guatemalteco. Entiendes el lenguaje coloquial, sarcasmo, y las referencias culturales y políticas de Guatemala. Responde siempre con JSON válido.\n\n${prompt}`
            }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 400,
            topP: 0.95
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMsg = `Gemini API error: ${response.status} ${response.statusText} - ${errorText}`;
        systemLogger.addError(new Error(errorMsg), `Tweet ${tweet.tweet_id}`);
        systemLogger.addAIRequestCost(0, false);
        throw new Error(errorMsg);
      }

      data = await response.json();
      aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      tokensUsed = data.usageMetadata?.totalTokenCount || 300; // Estimación si no hay metadata

    } else {
      // ===== OPENAI API (fallback) =====
      response = await fetch('https://api.openai.com/v1/chat/completions', {
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
          max_tokens: 300
        })
      });

      if (!response.ok) {
        const errorMsg = `OpenAI API error: ${response.status} ${response.statusText}`;
        systemLogger.addError(new Error(errorMsg), `Tweet ${tweet.tweet_id}`);
        systemLogger.addAIRequestCost(0, false);
        throw new Error(errorMsg);
      }

      data = await response.json();
      aiResponse = data.choices?.[0]?.message?.content;
      tokensUsed = data.usage?.total_tokens || 0;
    }

    const apiResponseTime = Date.now() - startTime;

    // Registrar costo en CostTracker y logger
    const costInfo = costTracker.recordCall(tokensUsed);
    systemLogger.addAIRequestCost(tokensUsed, true);

    if (!aiResponse) {
      const errorMsg = `No response from ${USE_GEMINI ? 'Gemini' : 'OpenAI'}`;
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

    const modelo = USE_GEMINI ? 'gemini-1.5-flash' : 'gpt-3.5-turbo';
    const costoEstimado = USE_GEMINI
      ? tokensUsed * API_LIMITS.estimatedCostPer1kTokens / 1000
      : tokensUsed * 0.0015 / 1000;

    systemLogger.logSuccess(`✅ Análisis (${modelo}): ${sentimiento} (${score}) | ${intencion} | ${entidades.length} entidades | $${costoEstimado.toFixed(6)} - ${tweet.tweet_id}`);
    console.log(`   💰 Costo: $${costInfo.cost.toFixed(6)} | Total hoy: $${costInfo.dailyTotal.toFixed(4)} | Llamadas: ${costInfo.callsToday}`);

    return {
      sentimiento: sentimiento,
      score_sentimiento: score,
      confianza_sentimiento: confianza,
      emociones_detectadas: Array.isArray(analysis.emociones) ? analysis.emociones : [],
      intencion_comunicativa: intencion,
      entidades_mencionadas: entidades,
      analisis_ai_metadata: {
        modelo: modelo,
        timestamp: new Date().toISOString(),
        contexto_local: analysis.contexto_local || '',
        intensidad: analysis.intensidad || 'media',
        categoria: categoria,
        tokens_usados: tokensUsed,
        costo_estimado: costoEstimado,
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

// Función para extraer fecha de un Twitter snowflake ID
// Twitter IDs contienen un timestamp embebido: (tweet_id >> 22) + 1288834974657 = Unix ms
const tweetIdToDate = (tweetId) => {
  if (!tweetId) return null;

  try {
    // Twitter epoch: 1288834974657 ms (Thu Nov 04 2010 01:42:54 GMT+0000)
    const TWITTER_EPOCH = 1288834974657n;

    // Convertir a BigInt para manejar IDs grandes
    const tweetIdBigInt = BigInt(tweetId);

    // Extraer timestamp: bit shift 22 posiciones a la derecha
    const timestampMs = Number((tweetIdBigInt >> 22n) + TWITTER_EPOCH);

    const date = new Date(timestampMs);

    // Verificar que la fecha es válida y razonable (después de 2010)
    if (isNaN(date.getTime()) || date.getFullYear() < 2010) {
      return null;
    }

    console.log(`🆔 Fecha extraída de snowflake ID ${tweetId}: ${date.toISOString()}`);
    return date;

  } catch (error) {
    console.log(`⚠️  Error extrayendo fecha de snowflake ID: ${error.message}`);
    return null;
  }
};

// Función para convertir fecha de Nitter a formato ISO
const parseNitterDate = (dateString, tweetId = null) => {
  if (!dateString) {
    // Intentar con snowflake ID
    if (tweetId) {
      const snowflakeDate = tweetIdToDate(tweetId);
      if (snowflakeDate) return snowflakeDate.toISOString();
    }
    return null;
  }

  // Detectar fechas inválidas comunes
  const invalidDates = ['reciente', 'recent', 'ahora', 'now', 'just now', 'hace un momento'];
  if (invalidDates.includes(dateString.toLowerCase().trim())) {
    // Intentar con snowflake ID
    if (tweetId) {
      const snowflakeDate = tweetIdToDate(tweetId);
      if (snowflakeDate) {
        console.log(`🕒 Fecha "${dateString}" resuelta via snowflake ID: ${snowflakeDate.toISOString()}`);
        return snowflakeDate.toISOString();
      }
    }
    console.log(`⚠️  Fecha inválida: "${dateString}" - usando fecha actual`);
    return new Date().toISOString();
  }

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
      // Intentar con snowflake ID como fallback
      if (tweetId) {
        const snowflakeDate = tweetIdToDate(tweetId);
        if (snowflakeDate) {
          console.log(`🕒 Fecha inválida "${dateString}" resuelta via snowflake ID`);
          return snowflakeDate.toISOString();
        }
      }
      console.log(`⚠️  Fecha inválida: "${dateString}" - usando fecha actual`);
      return new Date().toISOString(); // Usar fecha actual como fallback
    }

    return date.toISOString();
  } catch (error) {
    console.log(`❌ Error parseando fecha "${dateString}":`, error.message);
    // Último intento: snowflake ID
    if (tweetId) {
      const snowflakeDate = tweetIdToDate(tweetId);
      if (snowflakeDate) return snowflakeDate.toISOString();
    }
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

    if (trendingData.status !== 'success' || !trendingData.trends) {
      const errorMsg = trendingData.message || 'No trends found';
      systemLogger.addError(new Error(errorMsg), 'Obteniendo trending topics');
      await systemLogger.finishExecution('failed');
      return;
    }

    // Limitar a las primeras 15 tendencias
    const allTrends = trendingData.trends.slice(0, 15);
    const trendsFound = allTrends.length;
    systemLogger.setMetric('trends_found', trendsFound);
    systemLogger.logSuccess(`Obtenidos ${trendsFound} trending topics (limitado a 15)`);

    // 2. Para cada trend, obtener tweets de Nitter
    for (const trendObj of allTrends) {
      try {
        // El objeto tiene formato { name: "...", tweet_count: "...", keywords: [] }
        const trend = trendObj.name || trendObj;
        const searchTerm = extractSearchTerm(trend);

        // Si el término es null o muy corto, saltar
        if (!searchTerm) {
          systemLogger.addWarning(`Saltando trend "${trend}" - término no válido después de limpiar`, 'extractSearchTerm');
          continue;
        }

        const categoria = categorizeTrend(trend);
        systemLogger.updateCategoriaStats(categoria);

        systemLogger.logProgress(`Buscando tweets para: "${searchTerm}" (${categoria})`);

        // Llamar al endpoint de nitter_context con filtro de idioma español
        const nitterRes = await fetch(
          `${API_BASE_URL}/nitter_context?q=${encodeURIComponent(searchTerm)}&location=${LOCATION}&limit=10&lang=es`
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
                fecha_tweet: parseNitterDate(tweet.fecha, tweet.tweet_id),
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

// Ejecutar si es llamado directamente (ES modules)
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  fetchTrendingAndTweets();
}

export { fetchTrendingAndTweets };