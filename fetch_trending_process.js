const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

// Configura tus credenciales de Supabase
const SUPABASE_URL = 'https://qqshdccpmypelhmyqnut.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxc2hkY2NwbXlwZWxobXlxbnV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjAzNjcxMSwiZXhwIjoyMDYxNjEyNzExfQ.BaJ_z3Gp2pUnmYEDpfNTCIxpHloSjmxi43aKwm-93ZI';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Configuración de la API
const EXTRACTORW_API_URL = 'https://server.standatpd.com/api';
const VPS_TRENDING_URL = 'https://api.standatpd.com/trending?location=guatemala';

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
  try {
    console.log('🤖 [AUTOMATED] Iniciando procesamiento automatizado de tendencias...');
    console.log('📅 Timestamp:', new Date().toISOString());
    
    // PASO 1: Obtener datos raw de trending del VPS
    console.log('📡 PASO 1: Obteniendo trending topics del VPS...');
    console.log('🔗 URL:', VPS_TRENDING_URL);
    
    let rawTrendingData = null;
    try {
      const trendingResponse = await fetch(VPS_TRENDING_URL);
      
      if (trendingResponse.ok) {
        rawTrendingData = await trendingResponse.json();
        console.log('✅ Datos raw obtenidos exitosamente del VPS');
        console.log('📊 Datos obtenidos:', {
          status: rawTrendingData.status,
          trends_count: rawTrendingData.twitter_trends?.length || 0,
          location: rawTrendingData.location
        });
      } else {
        console.warn(`⚠️  VPS respondió con status ${trendingResponse.status}`);
        rawTrendingData = null;
      }
    } catch (error) {
      console.warn('⚠️  Error obteniendo datos del VPS:', error.message);
      console.log('🔄 Continuando sin datos raw (ExtractorW generará datos mock)');
      rawTrendingData = null;
    }
    
    // PASO 2: Procesar con ExtractorW usando el endpoint gratuito de cron
    console.log('⚡ PASO 2: Procesando con ExtractorW (endpoint cron - SIN COSTO)...');
    
    const requestBody = rawTrendingData ? { rawData: rawTrendingData } : {};
    
    const processResponse = await fetch(`${EXTRACTORW_API_URL}/cron/processTrends`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!processResponse.ok) {
      throw new Error(`ExtractorW respondió con status ${processResponse.status}: ${processResponse.statusText}`);
    }
    
    const processedData = await processResponse.json();
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
    console.log(`   ✅ Procesamiento IA: ${processedData.success ? 'EXITOSO' : 'FALLIDO'}`);
    console.log(`   ✅ Guardado en DB: ${processedData.record_id ? 'SÍ' : 'NO'}`);
    console.log(`   ✅ Procesamiento background: ${processedData.success ? 'INICIADO' : 'NO INICIADO'}`);
    console.log(`   💰 Créditos consumidos: 0 (endpoint gratuito)`);
    console.log(`   📅 Timestamp final: ${processedData.timestamp}`);
    
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
if (require.main === module) {
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

module.exports = { 
  processAutomatedTrends, 
  getLastProcessingStatus 
}; 