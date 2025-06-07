const { createClient } = require('@supabase/supabase-js');

// Configura tus credenciales de Supabase
const SUPABASE_URL = 'https://qqshdccpmypelhmyqnut.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxc2hkY2NwbXlwZWxobXlxbnV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjAzNjcxMSwiZXhwIjoyMDYxNjEyNzExfQ.BaJ_z3Gp2pUnmYEDpfNTCIxpHloSjmxi43aKwm-93ZI';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Verifica el estado del procesamiento background de los trending topics automatizados
 */
async function checkBackgroundProcessingStatus() {
  try {
    console.log('🔍 Verificando estado del procesamiento background...');
    
    // Obtener los últimos 5 procesamientos automatizados
    const { data: trends, error } = await supabase
      .from('trends')
      .select('*')
      .eq('source', 'cron_job_automated')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (error) {
      console.error('❌ Error obteniendo datos:', error);
      return;
    }
    
    if (!trends || trends.length === 0) {
      console.log('📭 No hay procesamientos automatizados en la base de datos');
      console.log('💡 Ejecuta primero: node fetch_trending_process.js');
      return;
    }
    
    console.log(`📊 Encontrados ${trends.length} procesamientos automatizados:\n`);
    
    trends.forEach((trend, index) => {
      const createdAt = new Date(trend.created_at);
      const timeDiff = Date.now() - createdAt.getTime();
      const minutesAgo = Math.floor(timeDiff / (1000 * 60));
      
      console.log(`${index + 1}. 📅 ${createdAt.toLocaleString()} (hace ${minutesAgo} minutos)`);
      console.log(`   🆔 ID: ${trend.id}`);
      console.log(`   📍 Status: ${trend.processing_status || 'unknown'}`);
      console.log(`   📊 Datos básicos:`);
      console.log(`      • Word Cloud: ${trend.word_cloud_data?.length || 0} elementos`);
      console.log(`      • Keywords: ${trend.top_keywords?.length || 0} elementos`);
      console.log(`      • Categorías: ${trend.category_data?.length || 0} elementos`);
      
      // Verificar procesamiento background
      const hasAbout = trend.about && Array.isArray(trend.about) && trend.about.length > 0;
      const hasStatistics = trend.statistics && Object.keys(trend.statistics).length > 0;
      
      console.log(`   🧠 Procesamiento IA Background:`);
      console.log(`      • About/Contexto: ${hasAbout ? `✅ ${trend.about.length} items` : '⏳ Pendiente'}`);
      console.log(`      • Estadísticas: ${hasStatistics ? '✅ Completado' : '⏳ Pendiente'}`);
      
      if (hasAbout && hasStatistics) {
        console.log(`   🎉 ¡Procesamiento COMPLETAMENTE terminado!`);
      } else if (minutesAgo > 10) {
        console.log(`   ⚠️  Background pendiente después de ${minutesAgo} minutos`);
      } else {
        console.log(`   ⏳ Background en proceso... (puede tardar 2-5 minutos)`);
      }
      
      console.log(''); // Línea en blanco
    });
    
    // Resumen general
    const completeProcessings = trends.filter(t => 
      t.about && Array.isArray(t.about) && t.about.length > 0 &&
      t.statistics && Object.keys(t.statistics).length > 0
    );
    
    console.log('📋 RESUMEN:');
    console.log(`   • Total procesamientos: ${trends.length}`);
    console.log(`   • Completos (con IA): ${completeProcessings.length}`);
    console.log(`   • Pendientes background: ${trends.length - completeProcessings.length}`);
    
    if (completeProcessings.length > 0) {
      console.log('\n✅ El procesamiento background SÍ está funcionando correctamente');
    } else if (trends.length > 0) {
      const latestTrend = trends[0];
      const latestTime = new Date(latestTrend.created_at);
      const minutesAgo = Math.floor((Date.now() - latestTime.getTime()) / (1000 * 60));
      
      if (minutesAgo < 10) {
        console.log('\n⏳ Procesamiento background reciente, espera 2-5 minutos más');
      } else {
        console.log('\n⚠️  Posible problema con el procesamiento background');
        console.log('💡 Verifica los logs del servidor ExtractorW');
      }
    }
    
  } catch (error) {
    console.error('❌ Error verificando estado:', error);
  }
}

/**
 * Monitorea en tiempo real el progreso del último procesamiento
 */
async function monitorLatestProcessing(durationMinutes = 10) {
  console.log(`🔄 Monitoreando progreso por ${durationMinutes} minutos...\n`);
  
  const startTime = Date.now();
  const endTime = startTime + (durationMinutes * 60 * 1000);
  
  while (Date.now() < endTime) {
    try {
      const { data: latestTrend, error } = await supabase
        .from('trends')
        .select('*')
        .eq('source', 'cron_job_automated')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (error || !latestTrend) {
        console.log('❌ No se encontró procesamiento reciente');
        break;
      }
      
      const hasAbout = latestTrend.about && Array.isArray(latestTrend.about) && latestTrend.about.length > 0;
      const hasStatistics = latestTrend.statistics && Object.keys(latestTrend.statistics).length > 0;
      
      const elapsedMinutes = Math.floor((Date.now() - startTime) / (1000 * 60));
      
      process.stdout.write(`\r⏱️  Min ${elapsedMinutes}: About ${hasAbout ? '✅' : '⏳'} | Stats ${hasStatistics ? '✅' : '⏳'}`);
      
      if (hasAbout && hasStatistics) {
        console.log('\n\n🎉 ¡Procesamiento background completado exitosamente!');
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 30000)); // Esperar 30 segundos
      
    } catch (error) {
      console.error('\n❌ Error en monitoreo:', error);
      break;
    }
  }
  
  console.log('\n🏁 Monitoreo finalizado');
}

// Ejecutar según los argumentos
const args = process.argv.slice(2);

if (args.includes('--monitor') || args.includes('-m')) {
  const duration = parseInt(args.find(arg => arg.match(/^\d+$/))) || 10;
  monitorLatestProcessing(duration);
} else {
  checkBackgroundProcessingStatus();
} 