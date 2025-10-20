#!/usr/bin/env node

/**
 * Script para re-analizar tweets existentes en la base de datos
 * Actualiza los campos de análisis de sentimiento, intención comunicativa y entidades
 * Útil para mejorar análisis existentes o aplicar nuevos modelos
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const SystemLogger = require('./system_logger');

// Configuración de Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qqshdccpmypelhmyqnut.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxc2hkY2NwbXlwZWxobXlxbnV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjAzNjcxMSwiZXhwIjoyMDYxNjEyNzExfQ.BaJ_z3Gp2pUnmYEDpfNTCIxpHloSjmxi43aKwm-93ZI';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Configuración de OpenAI
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ENABLE_SENTIMENT_ANALYSIS = process.env.ENABLE_SENTIMENT_ANALYSIS !== 'false';

let openai = null;
if (OPENAI_API_KEY && ENABLE_SENTIMENT_ANALYSIS) {
  openai = new OpenAI({ apiKey: OPENAI_API_KEY });
}

// Inicializar logger
let systemLogger = new SystemLogger();

/**
 * Parsear argumentos de línea de comandos
 */
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  const options = {
    limit: 20,
    daysBack: 7,
    forceAll: false,
    onlyFailed: false,
    categoria: null,
    source: 'manual'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--limit':
        options.limit = parseInt(args[++i]) || 20;
        break;
      case '--days-back':
        options.daysBack = parseInt(args[++i]) || 7;
        break;
      case '--force-all':
        options.forceAll = true;
        break;
      case '--only-failed':
        options.onlyFailed = true;
        break;
      case '--categoria':
        options.categoria = args[++i];
        break;
      case '--source':
        options.source = args[++i] || 'manual';
        break;
      case '--help':
        console.log(`
Uso: node reanalyze_tweets.js [opciones]

Opciones:
  --limit <número>        Número máximo de tweets a re-analizar (default: 20)
  --days-back <número>    Días hacia atrás para buscar tweets (default: 7)
  --force-all            Re-analizar todos los tweets, incluso los que ya tienen análisis
  --only-failed          Solo re-analizar tweets con análisis fallido
  --categoria <nombre>    Filtrar por categoría específica
  --source <origen>       Fuente de la ejecución (default: manual)
  --help                 Mostrar esta ayuda

Ejemplos:
  node reanalyze_tweets.js --limit 10
  node reanalyze_tweets.js --limit 50 --force-all
  node reanalyze_tweets.js --only-failed --days-back 30
        `);
        process.exit(0);
        break;
    }
  }

  return options;
}

/**
 * Función para analizar sentimiento de un tweet (similar a la del script principal)
 */
async function analyzeTweetSentiment(tweet, categoria) {
  if (!openai || !ENABLE_SENTIMENT_ANALYSIS) {
    return getDefaultSentimentData('OpenAI no configurado');
  }

  try {
    systemLogger.incrementMetric('ai_requests_made');
    
    const prompt = `
Analiza el siguiente tweet en español de Guatemala y proporciona un análisis completo:

Tweet: "${tweet.texto}"
Categoría: ${categoria}
Usuario: @${tweet.usuario}
Métricas: ${tweet.likes} likes, ${tweet.retweets} retweets, ${tweet.replies} replies

Proporciona tu análisis en el siguiente formato JSON exacto:
{
  "sentimiento": "positivo|negativo|neutral",
  "score_sentimiento": -1.0 a 1.0,
  "confianza_sentimiento": 0.0 a 1.0,
  "emociones_detectadas": ["alegría", "enojo", "miedo", "tristeza", "sorpresa", "asco"],
  "intencion_comunicativa": "informativo|opinativo|humoristico|alarmista|critico|promocional|conversacional|protesta",
  "entidades_mencionadas": [
    {"nombre": "nombre_entidad", "tipo": "persona|organizacion|lugar|evento", "contexto": "breve descripción"}
  ]
}

IMPORTANTE: Considera el contexto guatemalteco, usa solo las categorías especificadas, y asegúrate de que sea JSON válido.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Eres un experto en análisis de sentimiento y comunicación digital para el contexto guatemalteco. Responde únicamente con JSON válido."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 500,
      temperature: 0.3
    });

    systemLogger.incrementMetric('ai_requests_successful');
    
    const tokenUsage = response.usage;
    if (tokenUsage) {
      systemLogger.incrementMetric('total_tokens_used', tokenUsage.total_tokens);
      // Estimar costo (aproximadamente $0.000002 por token para gpt-4o-mini)
      const estimatedCost = tokenUsage.total_tokens * 0.000002;
      systemLogger.incrementMetric('estimated_cost_usd', estimatedCost);
    }

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('Respuesta vacía de OpenAI');
    }

    let analysisResult;
    try {
      analysisResult = JSON.parse(content);
    } catch (parseError) {
      console.log(`❌ Error parseando JSON de OpenAI: ${parseError.message}`);
      console.log(`Contenido recibido: ${content}`);
      throw new Error(`JSON inválido: ${parseError.message}`);
    }

    // Validar estructura
    const requiredFields = ['sentimiento', 'score_sentimiento', 'confianza_sentimiento', 'emociones_detectadas', 'intencion_comunicativa', 'entidades_mencionadas'];
    for (const field of requiredFields) {
      if (!(field in analysisResult)) {
        throw new Error(`Campo requerido faltante: ${field}`);
      }
    }

    // Agregar metadatos del análisis
    analysisResult.analisis_ai_metadata = {
      modelo: 'gpt-4o-mini',
      timestamp: new Date().toISOString(),
      contexto_local: 'Guatemala',
      categoria: categoria,
      tokens_usados: tokenUsage?.total_tokens || 0,
      costo_estimado: tokenUsage ? tokenUsage.total_tokens * 0.000002 : 0
    };

    systemLogger.updateSentimientoStats(analysisResult.sentimiento);
    systemLogger.updateIntencionStats(analysisResult.intencion_comunicativa);

    return analysisResult;

  } catch (error) {
    systemLogger.incrementMetric('ai_requests_failed');
    systemLogger.addError(error, `Analizando sentimiento del tweet ${tweet.tweet_id}`);
    
    const defaultData = getDefaultSentimentData(error.message);
    defaultData.analisis_ai_metadata.error = error.message;
    return defaultData;
  }
}

/**
 * Datos por defecto cuando el análisis falla
 */
function getDefaultSentimentData(error) {
  return {
    sentimiento: 'neutral',
    score_sentimiento: 0.0,
    confianza_sentimiento: 0.0,
    emociones_detectadas: [],
    intencion_comunicativa: 'informativo',
    entidades_mencionadas: [],
    analisis_ai_metadata: {
      modelo: 'fallback',
      timestamp: new Date().toISOString(),
      contexto_local: 'Guatemala',
      error: error || 'Sin análisis disponible'
    }
  };
}

/**
 * Probar conexión a Supabase y verificar esquema de la tabla
 */
async function testSupabaseConnection() {
  try {
    console.log('🔍 Verificando conexión a Supabase...');
    
    // Verificar conexión básica
    const { data, error } = await supabase
      .from('trending_tweets')
      .select('id, tweet_id, texto, usuario, sentimiento, intencion_comunicativa, fecha_captura')
      .limit(1);

    if (error) {
      throw new Error(`Error conectando a Supabase: ${error.message}`);
    }

    console.log('✅ Conexión a Supabase exitosa');
    
    if (data && data.length > 0) {
      const sampleTweet = data[0];
      console.log('📊 Estructura de tabla verificada:');
      console.log(`   ID: ${sampleTweet.id}`);
      console.log(`   Tweet ID: ${sampleTweet.tweet_id}`);
      console.log(`   Texto: ${sampleTweet.texto ? sampleTweet.texto.substring(0, 50) + '...' : 'Sin texto'}`);
      console.log(`   Usuario: ${sampleTweet.usuario || 'Sin usuario'}`);
      console.log(`   Sentimiento actual: ${sampleTweet.sentimiento || 'null'}`);
      console.log(`   Intención actual: ${sampleTweet.intencion_comunicativa || 'null'}`);
      console.log(`   Fecha captura: ${sampleTweet.fecha_captura || 'null'}`);
    } else {
      console.log('⚠️  Tabla existe pero no contiene datos');
    }

    return true;
  } catch (error) {
    console.error('❌ Error verificando conexión:', error.message);
    throw error;
  }
}

/**
 * Función principal para re-analizar tweets
 */
async function reanalyzeTweets(options = {}) {
  const {
    limit = 50,
    daysBack = 7,
    forceAll = false,
    onlyFailed = false,
    categoria = null
  } = options;

  // Verificar conexión antes de comenzar
  await testSupabaseConnection();

  // Inicializar logging de ejecución
  const executionId = await systemLogger.startExecution('reanalyze_tweets', {
    limit,
    daysBack,
    forceAll,
    onlyFailed,
    categoria
  });

  try {
    systemLogger.logProgress('Iniciando re-análisis de tweets...');

    // Primero verificar que la tabla existe y tiene datos
    const { data: testQuery, error: testError } = await supabase
      .from('trending_tweets')
      .select('id')
      .limit(1);

    if (testError) {
      throw new Error(`Error conectando a trending_tweets: ${testError.message}`);
    }

    console.log('✅ Conexión a trending_tweets verificada');

    // Construir query base - usar fecha_captura en lugar de created_at
    let query = supabase
      .from('trending_tweets')
      .select('*')
      .order('fecha_captura', { ascending: false })
      .limit(limit);

    // Filtros de fecha
    if (daysBack > 0) {
      const dateLimit = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('fecha_captura', dateLimit);
    }

    // Filtros condicionales
    if (categoria) {
      query = query.eq('categoria', categoria);
      console.log(`📁 Filtrando por categoría: ${categoria}`);
    }

    // Mejorar filtros para evitar problemas con Supabase
    if (onlyFailed) {
      console.log('🔄 Modo: Solo tweets con análisis fallido');
      // Filtro más simple: tweets sin sentimiento o con sentimiento neutral/error
      query = query.in('sentimiento', ['neutral', null]);
    } else if (!forceAll) {
      console.log('🔄 Modo: Solo tweets sin análisis reciente');
      // Solo tweets sin sentimiento
      query = query.is('sentimiento', null);
    } else {
      console.log('🔄 Modo: Forzar re-análisis de todos los tweets');
      // No agregar filtros adicionales para forceAll
    }

    console.log('📡 Ejecutando consulta a Supabase...');
    const { data: tweets, error } = await query;

    if (error) {
      console.error('❌ Error en consulta Supabase:', error.message);
      throw new Error(`Error obteniendo tweets: ${error.message}`);
    }

    if (!tweets || tweets.length === 0) {
      console.log('📭 No se encontraron tweets para re-analizar con los filtros especificados');
      console.log('💡 Sugerencias:');
      console.log('   - Usa --force-all para re-analizar todos los tweets');
      console.log('   - Aumenta --days-back para buscar en más días');
      console.log('   - Verifica que hay tweets en la base de datos');
      systemLogger.logSuccess('No se encontraron tweets para re-analizar');
      await systemLogger.finishExecution('completed');
      return { total_processed: 0, successfully_updated: 0, failed_updates: 0, success_rate: '0%' };
    }

    console.log(`✅ Encontrados ${tweets.length} tweets para re-analizar`);
    
    // Mostrar estadísticas de los tweets encontrados
    const sentimentStats = {};
    const intentionStats = {};
    tweets.forEach(tweet => {
      const sentiment = tweet.sentimiento || 'null';
      const intention = tweet.intencion_comunicativa || 'null';
      sentimentStats[sentiment] = (sentimentStats[sentiment] || 0) + 1;
      intentionStats[intention] = (intentionStats[intention] || 0) + 1;
    });
    
    console.log('📊 Estadísticas actuales de sentimiento:');
    Object.entries(sentimentStats).forEach(([sentiment, count]) => {
      console.log(`   ${sentiment}: ${count} tweets`);
    });
    
    console.log('📊 Estadísticas actuales de intención:');
    Object.entries(intentionStats).forEach(([intention, count]) => {
      console.log(`   ${intention}: ${count} tweets`);
    });

    systemLogger.logSuccess(`Encontrados ${tweets.length} tweets para re-analizar`);

    let processed = 0;
    let updated = 0;
    let failed = 0;

    // Procesar cada tweet
    for (const tweet of tweets) {
      try {
        processed++;
        systemLogger.logProgress(`Procesando tweet ${processed}/${tweets.length}: ${tweet.tweet_id}`);

        // Crear objeto de tweet para análisis
        const tweetForAnalysis = {
          tweet_id: tweet.tweet_id,
          texto: tweet.texto,
          usuario: tweet.usuario,
          likes: tweet.likes || 0,
          retweets: tweet.retweets || 0,
          replies: tweet.replies || 0
        };

        // Analizar sentimiento
        const sentimentData = await analyzeTweetSentiment(tweetForAnalysis, tweet.categoria);

        // Validar que el análisis fue exitoso
        if (!sentimentData || !sentimentData.sentimiento) {
          throw new Error('Análisis de sentimiento falló - datos inválidos');
        }

        console.log(`   📊 Análisis: ${sentimentData.sentimiento} (${sentimentData.score_sentimiento}) | ${sentimentData.intencion_comunicativa}`);

        // Preparar datos para actualización con validación
        const updateData = {
          // Campos de análisis de sentimiento
          sentimiento: sentimentData.sentimiento || 'neutral',
          score_sentimiento: Number(sentimentData.score_sentimiento) || 0.0,
          confianza_sentimiento: Number(sentimentData.confianza_sentimiento) || 0.0,
          emociones_detectadas: Array.isArray(sentimentData.emociones_detectadas) ? sentimentData.emociones_detectadas : [],
          // Campos de análisis avanzado
          intencion_comunicativa: sentimentData.intencion_comunicativa || 'informativo',
          entidades_mencionadas: Array.isArray(sentimentData.entidades_mencionadas) ? sentimentData.entidades_mencionadas : [],
          analisis_ai_metadata: sentimentData.analisis_ai_metadata || {},
          // Actualizar timestamp
          updated_at: new Date().toISOString()
        };

        // Validar que los datos se pueden serializar
        try {
          JSON.stringify(updateData);
        } catch (serializationError) {
          throw new Error(`Error de serialización: ${serializationError.message}`);
        }

        // Actualizar en base de datos
        const { data: updateResult, error: updateError } = await supabase
          .from('trending_tweets')
          .update(updateData)
          .eq('id', tweet.id)
          .select('id, sentimiento, intencion_comunicativa'); // Confirmar campos actualizados

        if (updateError) {
          failed++;
          console.error(`   ❌ Error actualizando tweet ${tweet.tweet_id}:`, updateError.message);
          systemLogger.addError(updateError, `Actualizando tweet ${tweet.tweet_id}`);
        } else if (!updateResult || updateResult.length === 0) {
          failed++;
          console.error(`   ❌ No se encontró el tweet para actualizar: ${tweet.tweet_id}`);
          systemLogger.addError(new Error('Tweet no encontrado'), `Actualizando tweet ${tweet.tweet_id}`);
        } else {
          updated++;
          const updatedTweet = updateResult[0];
          console.log(`   ✅ Tweet ${tweet.tweet_id} actualizado exitosamente:`);
          console.log(`      Sentimiento: ${updatedTweet.sentimiento}`);
          console.log(`      Intención: ${updatedTweet.intencion_comunicativa}`);
          systemLogger.logSuccess(`Tweet ${tweet.tweet_id} actualizado: ${updatedTweet.sentimiento} | ${updatedTweet.intencion_comunicativa}`);
        }

        // Pausa entre tweets para no sobrecargar la API
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Actualizar progreso cada 10 tweets
        if (processed % 10 === 0) {
          await systemLogger.updateExecution('running', {
            progress: `${processed}/${tweets.length}`,
            updated,
            failed
          });
        }

      } catch (error) {
        failed++;
        systemLogger.addError(error, `Procesando tweet ${tweet.tweet_id}`);
      }
    }

    // Finalizar ejecución
    const summary = {
      total_processed: processed,
      successfully_updated: updated,
      failed_updates: failed,
      success_rate: processed > 0 ? ((updated / processed) * 100).toFixed(2) + '%' : '0%'
    };

    systemLogger.logSuccess(`Re-análisis completado: ${updated}/${processed} tweets actualizados exitosamente`);
    await systemLogger.finishExecution('completed', summary);
    
    return summary;

  } catch (error) {
    systemLogger.addError(error, 'Proceso principal de re-análisis');
    await systemLogger.finishExecution('failed', {
      error_summary: error.message
    });
    throw error;
  }
}

// CLI handling
if (require.main === module) {
  const options = parseCommandLineArgs();

  console.log('🔄 Iniciando re-análisis de tweets desde:', options.source);
  console.log('📋 Opciones:', {
    limit: options.limit,
    daysBack: options.daysBack,
    forceAll: options.forceAll,
    onlyFailed: options.onlyFailed,
    categoria: options.categoria || 'todas'
  });
  
  reanalyzeTweets(options)
    .then((result) => {
      console.log('✅ Re-análisis completado exitosamente');
      // Imprimir métricas para que el servidor pueda parsearlas
      console.log(`📊 tweets procesados: ${result?.total_processed || options.limit}`);
      console.log(`✅ tweets actualizados: ${result?.successfully_updated || 0}`);
      console.log(`❌ tweets fallidos: ${result?.failed_updates || 0}`);
      console.log(`📈 tasa de éxito: ${result?.success_rate || '0%'}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error en re-análisis:', error.message);
      console.error('📊 tweets procesados: 0');
      console.error('❌ tweets fallidos: 1');
      process.exit(1);
    });
}

module.exports = { reanalyzeTweets }; 