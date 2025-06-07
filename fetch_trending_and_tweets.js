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
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000'; // Default local; override con env
const LOCATION = 'guatemala';

// Configuración para análisis de sentimiento
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ENABLE_SENTIMENT_ANALYSIS = process.env.ENABLE_SENTIMENT_ANALYSIS !== 'false'; // true por defecto

// Inicializar logger global
let systemLogger = new SystemLogger();

// Función para análisis de sentimiento individual con OpenAI GPT-5-mini
async function analyzeTweetSentiment(tweet, categoria) {
  if (!OPENAI_API_KEY || !ENABLE_SENTIMENT_ANALYSIS) {
    systemLogger.addWarning('Análisis de sentimiento deshabilitado', `Tweet ${tweet.tweet_id}`);
    return getDefaultSentimentData('API deshabilitada');
  }

  try {
    systemLogger.logProgress(`Analizando sentimiento: @${tweet.usuario} - ${tweet.texto.substring(0, 50)}...`);
    
    const prompt = `Analiza este tweet guatemalteco de la categoría "${categoria}" considerando el contexto sociocultural guatemalteco:

Tweet: "${tweet.texto}"

Contexto:
- Usuario: @${tweet.usuario}
- Categoría: ${categoria}
- Ubicación: Guatemala
- Fecha: ${tweet.fecha}
- Engagement: ${tweet.likes || 0} likes, ${tweet.retweets || 0} RTs, ${tweet.replies || 0} replies

Instrucciones Específicas:
1. SENTIMIENTO: Analiza considerando modismos chapines, sarcasmo local, referencias culturales guatemaltecas
2. INTENCIÓN: Determina el propósito comunicativo específico del autor
3. ENTIDADES: Identifica figuras públicas, instituciones guatemaltecas, lugares específicos, eventos relevantes
4. CONTEXTO LOCAL: Explica referencias culturales o políticas guatemaltecas detectadas

Responde ÚNICAMENTE con un JSON válido (sin markdown):
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
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: 'Eres un experto en análisis de sentimientos especializado en el contexto guatemalteco. Responde exclusivamente con JSON válido.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        top_p: 1,
        max_tokens: 400
      })
    });

    const apiResponseTime = Date.now() - startTime;

    if (!response.ok) {
      const errorMsg = `OpenAI API error: ${response.status} ${response.statusText}`;
      systemLogger.addError(new Error(errorMsg), `Tweet ${tweet.tweet_id}`);
      systemLogger.addAIUsage({ tokens: 0, success: false, model: 'gpt-4-turbo-preview', provider: 'openai', costPer1M: process.env.OPENAI_GPT4_TURBO_COST_PER_1M ? parseFloat(process.env.OPENAI_GPT4_TURBO_COST_PER_1M) : undefined, apiResponseTimeMs: apiResponseTime });
      throw new Error(errorMsg);
    }

    const data = await response.json();
    const tokensUsed = (data.usage?.total_tokens) || ((data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0));
    
    // Registrar costo, tokens y modelo de la AI request
    systemLogger.addAIUsage({ tokens: tokensUsed, success: true, model: 'gpt-4-turbo-preview', provider: 'openai', costPer1M: process.env.OPENAI_GPT4_TURBO_COST_PER_1M ? parseFloat(process.env.OPENAI_GPT4_TURBO_COST_PER_1M) : undefined, apiResponseTimeMs: apiResponseTime });
    
    const aiResponse = data.choices?.[0]?.message?.content;
    
    if (!aiResponse) {
      const errorMsg = 'No response from OpenAI';
      systemLogger.addError(new Error(errorMsg), `Tweet ${tweet.tweet_id}`);
      throw new Error(errorMsg);
    }

    // Limpiar respuesta y parsear JSON de forma más robusta
    let cleanResponse = aiResponse
      .replace(/```json|```/g, '')  // Remover markdown
      .replace(/^\s*[\r\n]+|[\r\n]+\s*$/g, '') // Remover saltos de línea al inicio/final
      .trim();
    
    let analysis;
    try {
      // Intentar parsear directamente
      analysis = JSON.parse(cleanResponse);
    } catch (firstError) {
      try {
        // Si falla, intentar arreglar JSON común
        cleanResponse = cleanResponse
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remover caracteres de control
          .replace(/\n/g, '\\n') // Escapar saltos de línea
          .replace(/\r/g, '\\r') // Escapar retornos de carro
          .replace(/\t/g, '\\t') // Escapar tabs
          .replace(/'/g, "\\'"); // Escapar comillas simples
        
        analysis = JSON.parse(cleanResponse);
      } catch (secondError) {
        // Si aún falla, crear un JSON básico extraendo información manualmente
        systemLogger.addWarning(`JSON malformado del LLM, extrayendo manualmente: ${secondError.message}`, `Tweet ${tweet.tweet_id}`);
        
        // Extraer información básica usando regex
        const sentimientoMatch = cleanResponse.match(/"?sentimiento"?\s*:\s*"?(\w+)"?/i);
        const scoreMatch = cleanResponse.match(/"?score"?\s*:\s*(\d*\.?\d+)/i);
        const confianzaMatch = cleanResponse.match(/"?confianza"?\s*:\s*(\d*\.?\d+)/i);
        const intencionMatch = cleanResponse.match(/"?intencion_comunicativa"?\s*:\s*"?(\w+)"?/i);
        
        analysis = {
          sentimiento: sentimientoMatch ? sentimientoMatch[1] : 'neutral',
          score: scoreMatch ? parseFloat(scoreMatch[1]) : 0.0,
          confianza: confianzaMatch ? parseFloat(confianzaMatch[1]) : 0.5,
          emociones: [],
          intencion_comunicativa: intencionMatch ? intencionMatch[1] : 'informativo',
          entidades_mencionadas: [],
          contexto_local: 'Análisis básico por error de parsing',
          intensidad: 'media'
        };
        
        systemLogger.addWarning(`Análisis manual exitoso: ${analysis.sentimiento}`, `Tweet ${tweet.tweet_id}`);
      }
    }
    
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
        modelo: 'gpt-4-turbo-preview',
        timestamp: new Date().toISOString(),
        contexto_local: analysis.contexto_local || '',
        intensidad: analysis.intensidad || 'media',
        categoria: categoria,
        tokens_usados: tokensUsed,
        costo_estimado: process.env.OPENAI_GPT4_TURBO_COST_PER_1M ? (tokensUsed * (parseFloat(process.env.OPENAI_GPT4_TURBO_COST_PER_1M) / 1000000)) : null,
        api_response_time_ms: apiResponseTime
      }
    };

  } catch (error) {
    systemLogger.addError(error, `Análisis sentimiento tweet ${tweet.tweet_id}`);
    systemLogger.addAIUsage({ tokens: 0, success: false, model: 'gpt-4-turbo-preview', provider: 'openai', costPer1M: process.env.OPENAI_GPT4_TURBO_COST_PER_1M ? parseFloat(process.env.OPENAI_GPT4_TURBO_COST_PER_1M) : undefined });
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

// Mapeo de categorías basado en contenido - MEJORADO para Guatemala
const categorizeTrend = (trendText) => {
  const text = trendText.toLowerCase();
  
  // Política - Términos específicos guatemaltecos
  if (text.includes('política') || text.includes('político') || text.includes('congreso') || 
      text.includes('gobierno') || text.includes('presidente') || text.includes('ley') ||
      text.includes('elecciones') || text.includes('partido') || text.includes('diputado') ||
      text.includes('ministerio') || text.includes('ministra') || text.includes('ministro') ||
      text.includes('corrupción') || text.includes('tse') || text.includes('mp') ||
      text.includes('cicig') || text.includes('senado') || text.includes('alcalde') ||
      text.includes('giammattei') || text.includes('arévalo') || text.includes('arevalo') ||
      text.includes('semilla') || text.includes('vamos') || text.includes('une') || 
      text.includes('valor') || text.includes('todos') || text.includes('winaq') ||
      text.includes('líder') || text.includes('nombramiento') || text.includes('renuncia') ||
      text.includes('guatemala') && (text.includes('gobierno') || text.includes('estado')) ||
      text.includes('cc') || text.includes('constitucional') || text.includes('diputados') ||
      text.includes('municipalidad') || text.includes('alcaldía') || text.includes('concejo')) {
    return 'Política';
  }
  
  // Económica - Enfoque en Guatemala
  if (text.includes('finanzas') || text.includes('economía') || text.includes('banco') ||
      text.includes('impuesto') || text.includes('precio') || text.includes('dólar') ||
      text.includes('inflación') || text.includes('comercio') || text.includes('empleo') ||
      text.includes('trabajo') || text.includes('salario') || text.includes('banguat') ||
      text.includes('superintendencia') || text.includes('inversión') || text.includes('exportación') ||
      text.includes('pib') || text.includes('bolsa') || text.includes('empresa') ||
      text.includes('quetzal') || text.includes('mercado') || text.includes('negocios') ||
      text.includes('bi') || text.includes('banca') || text.includes('comercial') ||
      text.includes('industrial') || text.includes('agropecuario') || text.includes('turismo')) {
    return 'Económica';
  }
  
  // Seguridad - Nueva categoría específica para Guatemala
  if (text.includes('seguridad') || text.includes('violencia') || text.includes('crimen') ||
      text.includes('policía') || text.includes('pnc') || text.includes('mingob') ||
      text.includes('extorsión') || text.includes('secuestro') || text.includes('narcotráfico') ||
      text.includes('pandillas') || text.includes('homicidio') || text.includes('robo') ||
      text.includes('delincuencia') || text.includes('estado de sitio') || text.includes('emergencia')) {
    return 'Seguridad';
  }
  
  // Sociales - Expandido con temas guatemaltecos
  if (text.includes('educación') || text.includes('salud') || text.includes('familia') ||
      text.includes('sociedad') || text.includes('comunidad') || text.includes('cultura') ||
      text.includes('derechos') || text.includes('mujer') || text.includes('mujeres') ||
      text.includes('niños') || text.includes('niñez') || text.includes('juventud') ||
      text.includes('universidad') || text.includes('hospital') || text.includes('medicina') ||
      text.includes('covid') || text.includes('vacuna') || text.includes('usac') ||
      text.includes('url') || text.includes('mariano') || text.includes('landívar') ||
      text.includes('rafael') || text.includes('social') || text.includes('maya') ||
      text.includes('indígena') || text.includes('xinca') || text.includes('garífuna') ||
      text.includes('discriminación') || text.includes('igualdad') || text.includes('justicia') ||
      text.includes('derechos humanos') || text.includes('mineduc') || text.includes('mspas')) {
    return 'Sociales';
  }
  
  // Deportes - Nueva categoría
  if (text.includes('fútbol') || text.includes('futbol') || text.includes('deportes') ||
      text.includes('liga') || text.includes('municipal') || text.includes('comunicaciones') ||
      text.includes('antigua') || text.includes('xelajú') || text.includes('selección') ||
      text.includes('mundial') || text.includes('gol') || text.includes('partido')) {
    return 'Deportes';
  }
  
  // Entretenimiento - Nueva categoría
  if (text.includes('música') || text.includes('artista') || text.includes('cantante') ||
      text.includes('concierto') || text.includes('festival') || text.includes('teatro') ||
      text.includes('cine') || text.includes('televisión') || text.includes('tv') ||
      text.includes('farándula') || text.includes('celebridad')) {
    return 'Entretenimiento';
  }
  
  return 'General';
};

// Función para limpiar el texto del trend (quitar números de posición, etc.)
const cleanTrendText = (trendText) => {
  // Remover números de posición al inicio (ej: "1. #Hashtag" -> "#Hashtag")
  return trendText.replace(/^\d+\.\s*/, '').trim();
};

// Lista de palabras clave relacionadas con Guatemala para filtrar relevancia
const GUATEMALA_KEYWORDS = [
  'guatemala', 'guatemal', 'gt', 'chapín', 'chapin', 'guate',
  'congreso', 'gobierno', 'presidente', 'arévalo', 'arevalo', 'giammattei',
  'semilla', 'vamos', 'une', 'valor', 'todos', 'winaq',
  'usac', 'url', 'landívar', 'mariano', 'rafael',
  'antigua', 'quetzal', 'xela', 'coban', 'peten',
  'banguat', 'superintendencia', 'mp', 'tse', 'cicig',
  'guatemala city', 'ciudad guatemala', 'zona', 'mixco', 'villa nueva'
];

// Lista de caracteres y patrones que indican contenido no guatemalteco
const NON_GUATEMALA_PATTERNS = [
  /[\u4e00-\u9fff]/, // Caracteres chinos
  /[\u3040-\u309f\u30a0-\u30ff]/, // Caracteres japoneses (hiragana y katakana)
  /[\u0600-\u06ff]/, // Caracteres árabes
  /[\u0400-\u04ff]/, // Caracteres cirílicos (ruso)
];

// Función mejorada para extraer término de búsqueda del trend
const extractSearchTerm = (trendText) => {
  let cleanText = cleanTrendText(trendText);
  
  // Verificar si contiene caracteres no deseados
  for (const pattern of NON_GUATEMALA_PATTERNS) {
    if (pattern.test(cleanText)) {
      console.log(`🚫 Contenido no guatemalteco detectado: "${cleanText}" (original: "${trendText}")`);
      return null;
    }
  }
  
  // Si es un hashtag, remover el #
  if (cleanText.startsWith('#')) {
    cleanText = cleanText.substring(1);
  }
  
  // Remover conteos con paréntesis (ej: "término (123)")
  cleanText = cleanText.replace(/\s*\([^)]*\)$/, '');
  
  // Remover sufijos de números con K, M, etc. al final
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
  
  // Verificar relevancia para Guatemala
  const textLower = cleanText.toLowerCase();
  const isRelevant = GUATEMALA_KEYWORDS.some(keyword => 
    textLower.includes(keyword.toLowerCase()) ||
    textLower === keyword.toLowerCase()
  );
  
  // Si no es directamente relevante, verificar si parece ser un nombre/término local válido
  const isLocalTerm = /^[a-záéíóúñü\s]+$/i.test(cleanText) && cleanText.length >= 3;
  
  if (!isRelevant && !isLocalTerm) {
    console.log(`🚫 Término no relevante para Guatemala: "${cleanText}" (original: "${trendText}")`);
    return null;
  }
  
  console.log(`🧹 Limpieza exitosa: "${trendText}" -> "${cleanText}" ${isRelevant ? '(relevante)' : '(local)'}`);
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

// Verificar si ya existe un tweet con el mismo tweet_id y retornar datos completos
async function getTweetData(tweetId) {
  if (!tweetId) return null;
  const { data, error } = await supabase
    .from('trending_tweets')
    .select('*')
    .eq('tweet_id', tweetId)
    .maybeSingle();
  
  if (error) {
    console.error(`Error verificando tweet ${tweetId}:`, error);
    return null;
  }
  
  return data;
}

// Función para insertar o actualizar tweet (upsert)
async function upsertTweet(tweetData, isUpdate = false, existingId = null) {
  try {
    if (isUpdate && existingId) {
      // Actualizar tweet existente - solo los campos de análisis
      const { error } = await supabase
        .from('trending_tweets')
        .update({
          // Actualizar métricas si han cambiado
          likes: tweetData.likes || 0,
          retweets: tweetData.retweets || 0,
          replies: tweetData.replies || 0,
          // Campos de análisis de sentimiento (siempre actualizar)
          sentimiento: tweetData.sentimiento,
          score_sentimiento: tweetData.score_sentimiento,
          confianza_sentimiento: tweetData.confianza_sentimiento,
          emociones_detectadas: tweetData.emociones_detectadas,
          // Campos de análisis avanzado (siempre actualizar)
          intencion_comunicativa: tweetData.intencion_comunicativa,
          entidades_mencionadas: tweetData.entidades_mencionadas,
          analisis_ai_metadata: tweetData.analisis_ai_metadata,
          // Actualizar fecha de último análisis
          updated_at: new Date().toISOString()
        })
        .eq('id', existingId);
      
      if (error) {
        throw error;
      }
      
      return { success: true, action: 'updated', id: existingId };
    } else {
      // Insertar nuevo tweet
      const { error, data } = await supabase
        .from('trending_tweets')
        .insert(tweetData)
        .select();
      
      if (error) {
        throw error;
      }
      
      return { success: true, action: 'inserted', id: data[0]?.id };
    }
  } catch (error) {
    console.error('Error en upsertTweet:', error);
    return { success: false, error: error };
  }
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
    
    const trendsFound = trendingData.trends.length;
    systemLogger.setMetric('trends_found', trendsFound);
    systemLogger.logSuccess(`Obtenidos ${trendsFound} trending topics`);
    
    // 2. Para cada trend, obtener tweets de Nitter
    for (const trend of trendingData.trends) {
      try {
        const trendName = trend.name || trend;
        const searchTerm = extractSearchTerm(trendName);
        
        // Si el término es null o muy corto, saltar
        if (!searchTerm) {
          systemLogger.addWarning(`Saltando trend "${trendName}" - término no válido después de limpiar`, 'extractSearchTerm');
          continue;
        }
        
        const categoria = categorizeTrend(trendName);
        systemLogger.updateCategoriaStats(categoria);
        
        systemLogger.logProgress(`Buscando tweets para: "${searchTerm}" (${categoria})`);
        
        // Llamar al endpoint de nitter_context (mejor filtrado por ubicación)
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
              // Filtrar tweets no guatemaltecos a nivel de contenido
              const tweetText = tweet.texto || '';
              const usuario = tweet.usuario || '';
              
              // Verificar caracteres no deseados en el contenido del tweet
              const hasNonGuatemalan = NON_GUATEMALA_PATTERNS.some(pattern => 
                pattern.test(tweetText) || pattern.test(usuario)
              );
              
              if (hasNonGuatemalan) {
                systemLogger.addWarning(`Tweet filtrado por contenido no guatemalteco: @${usuario} - ${tweetText.substring(0, 50)}...`, 'content_filter');
                continue;
              }
              
              // Verificar que el tweet tenga contenido mínimo relevante
              if (tweetText.length < 10) {
                systemLogger.addWarning(`Tweet muy corto omitido: @${usuario} - ${tweetText}`, 'content_filter');
                continue;
              }
              
              systemLogger.incrementMetric('tweets_processed');
              
              // Análizar sentimiento individual
              const sentimentData = await analyzeTweetSentiment(tweet, categoria);
              
              // Crear objeto completo de datos del tweet
              const tweetData = {
                trend_original: trendName,
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
              };
              
              // Verificar si el tweet ya existe
              const existingTweetData = await getTweetData(tweet.tweet_id);
              const isUpdate = !!existingTweetData;
              
              if (isUpdate) {
                systemLogger.logProgress(`Tweet ${tweet.tweet_id} ya existe, actualizando campos de análisis...`);
              }
              
              // Insertar o actualizar tweet
              const result = await upsertTweet(tweetData, isUpdate, existingTweetData?.id);
              
              if (result.success) {
                systemLogger.incrementMetric('tweets_saved');
                
                // Calcular propagación viral para el log
                const engagement = (tweet.likes || 0) + (tweet.retweets || 0) + (tweet.replies || 0);
                let propagacion_viral = 'minima';
                if (engagement >= 1000) propagacion_viral = 'masiva';
                else if (engagement >= 500) propagacion_viral = 'alta';
                else if (engagement >= 100) propagacion_viral = 'media';
                else if (engagement >= 10) propagacion_viral = 'baja';
                
                systemLogger.updatePropagacionStats(propagacion_viral);
                
                const actionText = isUpdate ? 'actualizado' : 'nuevo';
                systemLogger.logSuccess(`Tweet ${actionText} guardado: @${tweet.usuario} - ${sentimentData.sentimiento} (${sentimentData.score_sentimiento}) | ${sentimentData.intencion_comunicativa} | ${sentimentData.entidades_mencionadas.length} entidades - ${tweet.texto.substring(0, 50)}...`);
              } else {
                systemLogger.addError(result.error, `${isUpdate ? 'Actualizando' : 'Insertando'} tweet ${tweet.tweet_id}`);
                systemLogger.incrementMetric('tweets_failed');
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
        systemLogger.addError(error, `Procesando trend "${trendName}"`);
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
if (import.meta.url === `file://${process.argv[1]}`) {
  fetchTrendingAndTweets();
}

export { fetchTrendingAndTweets };