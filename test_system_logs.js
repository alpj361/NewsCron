const { SystemLogger } = require('./system_logger');
require('dotenv').config();

async function testSystemLogs() {
  console.log('🧪 Probando Sistema de Logs\n');
  
  const logger = new SystemLogger();
  
  try {
    // 1. Iniciar ejecución de prueba
    console.log('1. Iniciando ejecución de prueba...');
    const executionId = await logger.startExecution('test_execution', {
      test_mode: true,
      version: '1.0.0',
      environment: 'development'
    });
    
    if (!executionId) {
      console.error('❌ Error iniciando ejecución');
      return;
    }
    
    console.log(`✅ Ejecución iniciada con ID: ${executionId}\n`);
    
    // 2. Simular métricas de procesamiento
    console.log('2. Simulando procesamiento...');
    
    // Simular encontrar trends
    logger.setMetric('trends_found', 5);
    logger.logProgress('Encontrados 5 trending topics');
    
    // Simular procesamiento de tweets
    for (let i = 1; i <= 15; i++) {
      logger.incrementMetric('tweets_processed');
      
      // Simular diferentes categorías
      const categorias = ['politica', 'deportes', 'economia', 'cultura', 'tecnologia'];
      const categoria = categorias[i % categorias.length];
      logger.updateCategoriaStats(categoria);
      
      // Simular diferentes sentimientos
      const sentimientos = ['positivo', 'negativo', 'neutral'];
      const sentimiento = sentimientos[i % sentimientos.length];
      logger.updateSentimientoStats(sentimiento);
      
      // Simular diferentes intenciones
      const intenciones = ['informativo', 'opinativo', 'humoristico', 'critico'];
      const intencion = intenciones[i % intenciones.length];
      logger.updateIntencionStats(intencion);
      
      // Simular diferentes propagaciones
      const propagaciones = ['minima', 'baja', 'media', 'alta', 'masiva'];
      const propagacion = propagaciones[i % propagaciones.length];
      logger.updatePropagacionStats(propagacion);
      
      // Simular AI requests
      const tokens = 150 + Math.floor(Math.random() * 100); // 150-250 tokens
      const success = Math.random() > 0.1; // 90% éxito
      logger.addAIRequestCost(tokens, success);
      
      if (Math.random() > 0.9) {
        // 10% duplicados
        logger.incrementMetric('duplicates_skipped');
      } else if (Math.random() > 0.95) {
        // 5% fallos
        logger.incrementMetric('tweets_failed');
        logger.addError(new Error('Error simulado'), `Tweet ${i}`);
      } else {
        // Tweets exitosos
        logger.incrementMetric('tweets_saved');
        logger.incrementMetric('tweets_found');
      }
      
      logger.logProgress(`Procesado tweet ${i}/15 - ${categoria} - ${sentimiento}`);
      
      // Simular pausa entre tweets
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Actualizar cada 5 tweets
      if (i % 5 === 0) {
        await logger.updateExecution('running');
        console.log(`📊 Progreso intermedio: ${i}/15 tweets`);
      }
    }
    
    // Simular algunos warnings
    logger.addWarning('API rate limit approaching', 'OpenAI API');
    logger.addWarning('Término de búsqueda muy corto', 'extractSearchTerm');
    
    console.log('\n3. Resumen de la ejecución:');
    const summary = logger.getExecutionSummary();
    console.log(`   🔄 Execution ID: ${summary.execution_id}`);
    console.log(`   ⏱️  Duración: ${summary.duration_seconds}s`);
    console.log(`   📊 Trends encontrados: ${summary.trends_found}`);
    console.log(`   🐦 Tweets procesados: ${summary.tweets_processed}`);
    console.log(`   💾 Tweets guardados: ${summary.tweets_saved}`);
    console.log(`   ❌ Tweets fallidos: ${summary.tweets_failed}`);
    console.log(`   🔁 Duplicados: ${summary.duplicates_skipped}`);
    console.log(`   🤖 Requests IA: ${summary.ai_requests_made}`);
    console.log(`   ✅ IA exitosos: ${summary.ai_requests_successful}`);
    console.log(`   ❌ IA fallidos: ${summary.ai_requests_failed}`);
    console.log(`   🪙 Tokens totales: ${summary.total_tokens_used}`);
    console.log(`   💰 Costo estimado: $${summary.estimated_cost_usd.toFixed(6)}`);
    console.log(`   ⚠️  Errores: ${summary.error_details.length}`);
    console.log(`   ⚠️  Warnings: ${summary.warnings.length}`);
    
    console.log('\n4. Estadísticas detalladas:');
    console.log('   📊 Categorías:', summary.categoria_stats);
    console.log('   😊 Sentimientos:', summary.sentimiento_stats);
    console.log('   💭 Intenciones:', summary.intencion_stats);
    console.log('   🚀 Propagación:', summary.propagacion_stats);
    
    // 4. Finalizar ejecución
    console.log('\n5. Finalizando ejecución...');
    await logger.finishExecution('completed', {
      test_completed: true,
      total_simulated_tweets: 15,
      test_summary: 'Prueba del sistema de logging completada exitosamente'
    });
    
    console.log('\n✅ Test completado! Revisa la tabla system_execution_logs en Supabase');
    console.log('📊 Dashboard views disponibles:');
    console.log('   - admin_execution_summary');
    console.log('   - daily_cost_stats');
    console.log('   - weekly_performance_stats');
    
  } catch (error) {
    console.error('❌ Error en test:', error);
    await logger.finishExecution('failed', {
      test_error: error.message
    });
  }
}

// Función para mostrar logs recientes
async function showRecentLogs() {
  const { SystemLogger } = require('./system_logger');
  const logger = new SystemLogger();
  
  try {
    console.log('\n📋 Mostrando logs recientes...\n');
    
    const { data, error } = await logger.supabase
      .from('admin_execution_summary')
      .select('*')
      .limit(5);
    
    if (error) {
      console.error('Error obteniendo logs:', error);
      return;
    }
    
    data.forEach((log, index) => {
      console.log(`${index + 1}. ${log.script_name} (${log.status})`);
      console.log(`   📅 Inicio: ${new Date(log.started_at).toLocaleString()}`);
      if (log.completed_at) {
        console.log(`   ✅ Final: ${new Date(log.completed_at).toLocaleString()}`);
      }
      console.log(`   ⏱️  Duración: ${log.duration_seconds}s`);
      console.log(`   🐦 Tweets: ${log.tweets_processed} procesados, ${log.tweets_saved} guardados`);
      console.log(`   🤖 IA: ${log.ai_requests_made} requests`);
      console.log(`   💰 Costo: $${parseFloat(log.estimated_cost_usd).toFixed(6)}`);
      console.log(`   📊 Éxito: ${log.success_rate_percent}% tweets, ${log.ai_success_rate_percent}% IA`);
      console.log(`   💸 Costo/tweet: $${parseFloat(log.cost_per_tweet).toFixed(6)}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('Error mostrando logs:', error);
  }
}

// Ejecutar test si se llama directamente
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'show') {
    showRecentLogs();
  } else {
    testSystemLogs();
  }
}

module.exports = { testSystemLogs, showRecentLogs }; 