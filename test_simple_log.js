const { SystemLogger } = require('./system_logger');

async function testBasicConnection() {
  console.log('🧪 Test básico de conexión a Supabase\n');
  
  const logger = new SystemLogger();
  
  try {
    console.log('1. Probando conexión a Supabase...');
    
    // Test básico de conexión
    const { data, error } = await logger.supabase
      .from('trending_tweets')
      .select('id')
      .limit(1);
    
    if (error) {
      console.error('❌ Error de conexión:', error);
      return;
    }
    
    console.log('✅ Conexión exitosa a Supabase');
    
    console.log('\n2. Probando si existe la tabla de logs...');
    
    // Verificar si existe la tabla system_execution_logs
    const { data: logData, error: logError } = await logger.supabase
      .from('system_execution_logs')
      .select('id')
      .limit(1);
    
    if (logError) {
      console.error('❌ La tabla system_execution_logs no existe o hay error:', logError);
      console.log('\n🔧 Para solucionarlo:');
      console.log('1. Ve a Supabase SQL Editor');
      console.log('2. Ejecuta el archivo create_system_logs_table.sql');
      console.log('3. Luego ejecuta: node test_system_logs.js');
      return;
    }
    
    console.log('✅ Tabla system_execution_logs existe');
    
    console.log('\n3. Probando crear un log básico...');
    
    const executionId = await logger.startExecution('test_connection', {
      test: true,
      timestamp: new Date().toISOString()
    });
    
    if (executionId) {
      console.log(`✅ Log creado exitosamente: ${executionId}`);
      
      // Agregar algunas métricas básicas
      logger.setMetric('trends_found', 1);
      logger.incrementMetric('tweets_processed', 1);
      
      await logger.finishExecution('completed', {
        test_completed: true
      });
      
      console.log('✅ Log finalizado exitosamente');
      console.log('\n🎉 ¡Sistema de logs funcionando correctamente!');
      console.log('📊 Ahora puedes ejecutar: node test_system_logs.js');
      
    } else {
      console.error('❌ Error creando log');
    }
    
  } catch (error) {
    console.error('❌ Error en test:', error);
  }
}

if (require.main === module) {
  testBasicConnection();
}

module.exports = { testBasicConnection }; 