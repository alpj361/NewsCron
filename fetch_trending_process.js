import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import { SystemLogger } from './system_logger.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Configura tus credenciales de Supabase
const SUPABASE_URL = 'https://qqshdccpmypelhmyqnut.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxc2hkY2NwbXlwZWxobXlxbnV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjAzNjcxMSwiZXhwIjoyMDYxNjEyNzExfQ.BaJ_z3Gp2pUnmYEDpfNTCIxpHloSjmxi43aKwm-93ZI';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Configuración de la API
const EXTRACTORW_API_URL = 'https://server.standatpd.com/api';
const VPS_TRENDING_URL = 'https://api.standatpd.com/trending?location=guatemala&limit=50'; // Obtener 50 trends

// Configuración de Gemini AI
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBMEq9kbJN9i30iXqZK3rT7Kp9n7AwN_RM'; // Añadir tu API key

// Inicializar logger global
let systemLogger = new SystemLogger();

// ============================================================
// SISTEMA DE CLASIFICACIÓN Y BALANCEO CON GEMINI AI
// ============================================================

/**
 * Clasifica trends usando Gemini AI (una sola llamada para todos)
 * @param {Array} trends - Array de trends a clasificar
 * @returns {Promise<Array>} - Array de clasificaciones [{index, name, categoria}]
 */
async function classifyTrendsWithGemini(trends) {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  
  const trendNames = trends.map((t, i) => {
    const name = typeof t === 'string' ? t : (t.name || t);
    return `${i+1}. ${name}`;
  });
  
  const prompt = `Clasifica cada uno de estos ${trends.length} trending topics de Guatemala como DEPORTIVO o NO_DEPORTIVO.

TRENDING TOPICS:
${trendNames.join('\n')}

CRITERIOS PARA DEPORTIVO:
- Equipos de fútbol (Barcelona, Madrid, Liverpool, Municipal, Comunicaciones, etc.)
- Jugadores de fútbol (Messi, Lewandowski, Pedri, Rashford, etc.)
- Competiciones deportivas (LaLiga, Champions, Premier League, etc.)
- Eventos deportivos (partidos, fichajes, transferencias, entrenamientos)
- Términos relacionados con fútbol y deportes

CRITERIOS PARA NO_DEPORTIVO:
- Política, economía, noticias sociales
- Música, entretenimiento, celebridades no deportivas
- Eventos culturales, tecnología
- Cualquier tema que no esté directamente relacionado con deportes

Responde SOLO con un JSON array válido en este formato exacto (sin texto adicional):
[
  {"index": 1, "name": "nombre_trend", "categoria": "DEPORTIVO"},
  {"index": 2, "name": "nombre_trend", "categoria": "NO_DEPORTIVO"}
]`;

  console.log('🤖 [GEMINI] Clasificando trends con IA...');
  console.log(`   📊 Total a clasificar: ${trends.length} trends`);
  
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log('   📝 Respuesta de Gemini recibida');
    
    // Extraer JSON del response (buscar entre [ y ])
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('   ❌ No se pudo extraer JSON de la respuesta');
      throw new Error('No se pudo extraer JSON de la respuesta de Gemini');
    }
    
    const classifications = JSON.parse(jsonMatch[0]);
    
    console.log('   ✅ Clasificación completada exitosamente');
    console.log(`   📊 Total clasificados: ${classifications.length}`);
    
    // Contar deportivos vs no deportivos
    const deportivosCount = classifications.filter(c => c.categoria === 'DEPORTIVO').length;
    const noDeportivosCount = classifications.filter(c => c.categoria === 'NO_DEPORTIVO').length;
    
    console.log(`   ⚽ Deportivos: ${deportivosCount}`);
    console.log(`   📰 No deportivos: ${noDeportivosCount}`);
    
    return classifications;
  } catch (error) {
    console.error('   ❌ Error en clasificación con Gemini:', error.message);
    console.log('   ⚠️  Usando fallback: todos como NO_DEPORTIVO');
    
    // Fallback: clasificar todos como NO_DEPORTIVO para evitar fallar completamente
    return trends.map((t, i) => ({
      index: i + 1,
      name: typeof t === 'string' ? t : (t.name || t),
      categoria: 'NO_DEPORTIVO'
    }));
  }
}

/**
 * Filtra y balancea trends usando clasificación de Gemini AI
 * @param {Array} rawTrends - Array de trends originales del VPS (hasta 50)
 * @returns {Promise<Object>} - { balancedTrends, stats, preclassificationHints }
 */
async function filterAndBalanceTrendsWithAI(rawTrends) {
  if (!rawTrends || !Array.isArray(rawTrends) || rawTrends.length === 0) {
    console.log('⚠️  [FILTRO] No hay trends para procesar');
    return {
      balancedTrends: [],
      stats: {
        total_received: 0,
        deportivos_found: 0,
        no_deportivos_found: 0,
        deportivos_selected: 0,
        no_deportivos_selected: 0,
        total_selected: 0,
        sports_percentage: 0
      },
      preclassificationHints: {}
    };
  }
  
  console.log(`\n🎯 [FILTRO] Iniciando clasificación IA de ${rawTrends.length} trends...`);
  
  // PASO 1: Clasificar con Gemini (una sola llamada para todos)
  const classifications = await classifyTrendsWithGemini(rawTrends);
  
  // PASO 2: Separar en deportivos y no deportivos
  const deportivos = [];
  const noDeportivos = [];
  
  for (let i = 0; i < rawTrends.length; i++) {
    const trend = rawTrends[i];
    const trendName = typeof trend === 'string' ? trend : (trend.name || trend);
    const classification = classifications.find(c => c.index === i + 1);
    const isDeportivo = classification?.categoria === 'DEPORTIVO';
    
    if (isDeportivo) {
      deportivos.push(trend);
      console.log(`   ⚽ Deportivo: "${trendName}"`);
    } else {
      noDeportivos.push(trend);
      console.log(`   📰 General: "${trendName}"`);
    }
  }
  
  // PASO 3: Balancear: 5 deportivos + 10 no deportivos
  const MAX_DEPORTIVOS = 5;
  const MAX_NO_DEPORTIVOS = 10;
  
  const deportivosSeleccionados = deportivos.slice(0, MAX_DEPORTIVOS);
  const noDeportivosSeleccionados = noDeportivos.slice(0, MAX_NO_DEPORTIVOS);
  
  // Combinar: primero no deportivos (para dar prioridad), luego deportivos
  const trendsBalanceados = [
    ...noDeportivosSeleccionados,
    ...deportivosSeleccionados
  ];
  
  const stats = {
    total_received: rawTrends.length,
    deportivos_found: deportivos.length,
    no_deportivos_found: noDeportivos.length,
    deportivos_selected: deportivosSeleccionados.length,
    no_deportivos_selected: noDeportivosSeleccionados.length,
    total_selected: trendsBalanceados.length,
    sports_percentage: trendsBalanceados.length > 0 
      ? Math.round((deportivosSeleccionados.length / trendsBalanceados.length) * 100) 
      : 0
  };
  
  console.log(`\n✅ [FILTRO] Balanceo con IA completado:`);
  console.log(`   📊 Recibidos: ${stats.total_received} trends`);
  console.log(`   ⚽ Deportivos encontrados: ${stats.deportivos_found}`);
  console.log(`   📰 No deportivos encontrados: ${stats.no_deportivos_found}`);
  console.log(`   ✅ Deportivos seleccionados: ${stats.deportivos_selected}/${MAX_DEPORTIVOS}`);
  console.log(`   ✅ No deportivos seleccionados: ${stats.no_deportivos_selected}/${MAX_NO_DEPORTIVOS}`);
  console.log(`   📊 Total a procesar: ${stats.total_selected}`);
  console.log(`   🎯 % Deportes: ${stats.sports_percentage}%`);
  
  // PASO 4: Crear hints de preclasificación para ExtractorW
  const preclassificationHints = {};
  classifications.forEach(c => {
    preclassificationHints[c.name] = c.categoria;
  });
  
  return {
    balancedTrends: trendsBalanceados,
    stats: stats,
    preclassificationHints: preclassificationHints
  };
}

// ============================================================
// FIN SISTEMA DE CLASIFICACIÓN Y BALANCEO
// ============================================================

/**
 * Función principal que replica el botón "trending" pero de forma automatizada y sin cobrar créditos
 * 
 * Esta función hace exactamente lo mismo que cuando presionas el botón "Buscar Tendencias" en la interfaz:
 * 1. Obtiene datos raw de trending topics del VPS
 * 2. Los procesa con IA para generar word clouds, keywords, categorías 
 * 3. Los guarda en Supabase
 * 4. Inicia procesamiento background para análisis detallado
 * 
 * La diferencia es que usa el endpoint /api/cron/processTrends que NO consume créditos
 */
async function processAutomatedTrends() {
  // Inicializar logging de ejecución
  const executionId = await systemLogger.startExecution('fetch_trending_process', {
    extractorw_url: EXTRACTORW_API_URL,
    vps_trending_url: VPS_TRENDING_URL,
    process_type: 'automated_trending'
  });

  try {
    systemLogger.logProgress('Iniciando procesamiento automatizado de tendencias...');
    console.log('🤖 [AUTOMATED] Iniciando procesamiento automatizado de tendencias...');
    console.log('📅 Timestamp:', new Date().toISOString());
    
    // PASO 1: Obtener datos raw de trending del VPS
    systemLogger.logProgress('PASO 1: Obteniendo trending topics del VPS...');
    console.log('📡 PASO 1: Obteniendo trending topics del VPS...');
    console.log('🔗 URL:', VPS_TRENDING_URL);
    
    let rawTrendingData = null;
    try {
      const trendingResponse = await fetch(VPS_TRENDING_URL);
      
      if (trendingResponse.ok) {
        rawTrendingData = await trendingResponse.json();
        systemLogger.logSuccess('Datos raw obtenidos exitosamente del VPS');
        systemLogger.setMetric('trends_found', rawTrendingData.trends?.length || 0);
        console.log('✅ Datos raw obtenidos exitosamente del VPS');
        console.log('📊 Datos obtenidos:', {
          status: rawTrendingData.status,
          trends_count: rawTrendingData.trends?.length || 0,
          location: rawTrendingData.location
        });
      } else {
        systemLogger.addWarning(`VPS respondió con status ${trendingResponse.status}`, 'VPS_REQUEST');
        console.warn(`⚠️  VPS respondió con status ${trendingResponse.status}`);
        rawTrendingData = null;
      }
    } catch (error) {
      systemLogger.addWarning(`Error obteniendo datos del VPS: ${error.message}`, 'VPS_REQUEST');
      console.warn('⚠️  Error obteniendo datos del VPS:', error.message);
      console.log('🔄 Continuando sin datos raw (ExtractorW generará datos mock)');
      rawTrendingData = null;
    }
    
    // PASO 1.5: CLASIFICAR Y BALANCEAR TRENDS CON IA (máximo 5 deportivos + 10 no deportivos)
    let balancedTrends = [];
    let balanceStats = {};
    let preclassificationHints = {};
    
    if (rawTrendingData && rawTrendingData.trends) {
      const balanceResult = await filterAndBalanceTrendsWithAI(rawTrendingData.trends);
      balancedTrends = balanceResult.balancedTrends;
      balanceStats = balanceResult.stats;
      preclassificationHints = balanceResult.preclassificationHints;
      
      // Registrar métricas de balanceo
      systemLogger.setMetric('trends_total_received', balanceStats.total_received);
      systemLogger.setMetric('trends_deportivos_found', balanceStats.deportivos_found);
      systemLogger.setMetric('trends_no_deportivos_found', balanceStats.no_deportivos_found);
      systemLogger.setMetric('trends_deportivos_selected', balanceStats.deportivos_selected);
      systemLogger.setMetric('trends_no_deportivos_selected', balanceStats.no_deportivos_selected);
      systemLogger.setMetric('trends_total_selected', balanceStats.total_selected);
      systemLogger.setMetric('trends_sports_percentage', balanceStats.sports_percentage);
      
      systemLogger.logSuccess(`Balanceo completado: ${balanceStats.deportivos_selected} deportes + ${balanceStats.no_deportivos_selected} generales`);
    }
    
    // PASO 2: Procesar con ExtractorW usando el endpoint gratuito de cron
    systemLogger.logProgress('PASO 2: Procesando con ExtractorW (endpoint cron - SIN COSTO)...');
    console.log('⚡ PASO 2: Procesando con ExtractorW (endpoint cron - SIN COSTO)...');
    
    // PASO 2.1: Convertir estructura de trends balanceados a twitter_trends para compatibilidad con ExtractorW
    let requestBody = {};
    if (balancedTrends.length > 0) {
      // ExtractorW espera rawData.twitter_trends, usar los trends balanceados
      requestBody = { 
        rawData: { 
          twitter_trends: balancedTrends.map(trend => trend.name || trend),
          location: rawTrendingData?.location || 'guatemala',
          source: rawTrendingData?.source || 'extractorT',
          // Metadatos de balanceo para tracking
          balance_metadata: balanceStats,
          // Hints de preclasificación de Gemini
          preclassification_hints: preclassificationHints
        } 
      };
      
      console.log('🔄 Datos balanceados convertidos a twitter_trends:', {
        original_count: rawTrendingData?.trends?.length || 0,
        balanced_count: balancedTrends.length,
        deportivos: balanceStats.deportivos_selected,
        no_deportivos: balanceStats.no_deportivos_selected,
        sample: requestBody.rawData.twitter_trends.slice(0, 3)
      });
    } else if (rawTrendingData && rawTrendingData.trends) {
      // Fallback: si no hay trends balanceados, usar los originales (no debería pasar)
      requestBody = { 
        rawData: { 
          twitter_trends: rawTrendingData.trends.map(trend => trend.name || trend),
          location: rawTrendingData.location || 'guatemala',
          source: rawTrendingData.source || 'extractorT'
        } 
      };
      
      console.log('⚠️  Usando trends originales sin balanceo (fallback)');
    }
    
    const processResponse = await fetch(`${EXTRACTORW_API_URL}/cron/processTrends`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!processResponse.ok) {
      throw new Error(`ExtractorW respondió con status ${processResponse.status}: ${processResponse.statusText}`);
    }
    
    const processedData = await processResponse.json();
    systemLogger.logSuccess('Procesamiento completado por ExtractorW');
    systemLogger.setMetric('ai_requests_made', 1);
    systemLogger.setMetric('ai_requests_successful', processedData.success ? 1 : 0);
    if (!processedData.success) {
      systemLogger.setMetric('ai_requests_failed', 1);
    }
    
    console.log('✅ Procesamiento completado por ExtractorW');
    console.log('📊 Resultado:', {
      success: processedData.success,
      source: processedData.source,
      timestamp: processedData.timestamp,
      word_cloud_count: processedData.data?.wordCloudData?.length || 0,
      keywords_count: processedData.data?.topKeywords?.length || 0,
      categories_count: processedData.data?.categoryData?.length || 0,
      record_id: processedData.record_id
    });
    
    // PASO 3: Verificar que los datos se guardaron correctamente
    if (processedData.success && processedData.record_id) {
      console.log('🗄️  PASO 3: Verificando datos en Supabase...');
      
      try {
        const { data: savedTrend, error } = await supabase
          .from('trends')
          .select('*')
          .eq('id', processedData.record_id)
          .single();
          
        if (error) {
          console.warn('⚠️  Error verificando datos en Supabase:', error.message);
        } else {
          console.log('✅ Datos verificados en Supabase');
          console.log('📋 Resumen guardado:', {
            id: savedTrend.id,
            timestamp: savedTrend.timestamp,
            processing_status: savedTrend.processing_status,
            source: savedTrend.source,
            word_cloud_data_count: savedTrend.word_cloud_data?.length || 0,
            top_keywords_count: savedTrend.top_keywords?.length || 0,
            category_data_count: savedTrend.category_data?.length || 0
          });
        }
      } catch (verifyError) {
        console.warn('⚠️  Error en verificación:', verifyError.message);
      }
    }
    
    // PASO 4: Resumen final
    console.log('\n🎉 PROCESO AUTOMATIZADO COMPLETADO EXITOSAMENTE');
    console.log('📋 Resumen de la operación:');
    console.log(`   ✅ Datos raw obtenidos: ${rawTrendingData ? 'SÍ' : 'NO (usó mock data)'}`);
       console.log(`   ⚽ Trends recibidos: ${balanceStats.total_received || 0}`);
       console.log(`   🤖 [CLASIFICACIÓN] Gemini AI clasificó los trends`);
       console.log(`      - Deportivos encontrados: ${balanceStats.deportivos_found || 0}`);
       console.log(`      - No deportivos encontrados: ${balanceStats.no_deportivos_found || 0}`);
       console.log(`   ⚖️  [BALANCEO] Selección automática aplicada:`);
       console.log(`      - Deportivos seleccionados: ${balanceStats.deportivos_selected || 0}/5`);
       console.log(`      - No deportivos seleccionados: ${balanceStats.no_deportivos_selected || 0}/10`);
       console.log(`      - Total procesado: ${balanceStats.total_selected || 0}`);
       console.log(`      - % Deportes: ${balanceStats.sports_percentage || 0}%`);
    console.log(`   ✅ Procesamiento IA: ${processedData.success ? 'EXITOSO' : 'FALLIDO'}`);
    console.log(`   ✅ Guardado en DB: ${processedData.record_id ? 'SÍ' : 'NO'}`);
    console.log(`   ✅ Procesamiento background: ${processedData.success ? 'INICIADO' : 'NO INICIADO'}`);
    console.log(`   💰 Créditos consumidos: 0 (endpoint gratuito)`);
    console.log(`   📅 Timestamp final: ${processedData.timestamp}`);
    
    // Finalizar ejecución exitosa
    await systemLogger.finishExecution('completed', {
      record_id: processedData.record_id,
      credits_consumed: 0,
      data_source: rawTrendingData ? 'vps' : 'mock',
      final_summary: 'Proceso automatizado completado exitosamente'
    });
    
    return {
      success: true,
      message: 'Trending topics procesados automáticamente',
      timestamp: processedData.timestamp,
      record_id: processedData.record_id,
      credits_consumed: 0,
      source: 'automated_cron',
      data_summary: {
        word_cloud_count: processedData.data?.wordCloudData?.length || 0,
        keywords_count: processedData.data?.topKeywords?.length || 0,
        categories_count: processedData.data?.categoryData?.length || 0
      }
    };
    
  } catch (error) {
    systemLogger.addError(error, 'Proceso principal automatizado');
    await systemLogger.finishExecution('failed', {
      error_summary: error.message,
      credits_consumed: 0
    });
    
    console.error('❌ ERROR EN PROCESAMIENTO AUTOMATIZADO:', error);
    console.error('📋 Detalles del error:', {
      message: error.message,
      stack: error.stack?.split('\n')[0] // Solo la primera línea del stack
    });
    
    return {
      success: false,
      error: 'Error en procesamiento automatizado',
      message: error.message,
      timestamp: new Date().toISOString(),
      credits_consumed: 0,
      source: 'automated_cron'
    };
  }
}

/**
 * Función para obtener el estado del último procesamiento
 */
async function getLastProcessingStatus() {
  try {
    const { data: latestTrend, error } = await supabase
      .from('trends')
      .select('*')
      .eq('source', 'cron_job_automated')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
      
    if (error) {
      console.log('ℹ️  No hay procesamientos previos automatizados');
      return null;
    }
    
    return {
      id: latestTrend.id,
      timestamp: latestTrend.timestamp,
      created_at: latestTrend.created_at,
      processing_status: latestTrend.processing_status,
      has_about: (latestTrend.about?.length || 0) > 0,
      has_statistics: Object.keys(latestTrend.statistics || {}).length > 0,
      word_cloud_count: latestTrend.word_cloud_data?.length || 0,
      keywords_count: latestTrend.top_keywords?.length || 0,
      categories_count: latestTrend.category_data?.length || 0
    };
  } catch (error) {
    console.error('Error obteniendo último procesamiento:', error);
    return null;
  }
}

// Si el archivo es ejecutado directamente, correr la función
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.includes('fetch_trending_process.js')) {
  console.log('🚀 Ejecutando procesamiento automatizado de trending topics...');
  console.log('🕐 Inicio:', new Date().toLocaleString());
  console.log('📍 Este proceso NO consume créditos (usa endpoint cron gratuito)');
  console.log('=' * 60);
  
  processAutomatedTrends()
    .then(result => {
      console.log('\n' + '=' * 60);
      console.log('🏁 EJECUCIÓN FINALIZADA');
      console.log('📊 Resultado final:', JSON.stringify(result, null, 2));
      console.log('🕐 Fin:', new Date().toLocaleString());
      
      if (result.success) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n' + '=' * 60);
      console.error('💥 ERROR CRÍTICO EN EJECUCIÓN:');
      console.error(error);
      console.log('🕐 Fin con error:', new Date().toLocaleString());
      process.exit(1);
    });
}

export { 
  processAutomatedTrends, 
  getLastProcessingStatus 
}; 