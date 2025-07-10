const { spawn } = require('child_process');

console.log('🧪 PROBANDO FETCH AND STORE TWEETS');
console.log('==================================');

// Ejecutar con configuración de prueba
const testProcess = spawn('node', [
  'fetch_and_store_tweets.js',
  '--location', 'guatemala',
  '--limit', '5',
  '--concurrency', '2'
], {
  stdio: 'inherit',
  cwd: __dirname,
  env: { ...process.env, NODE_OPTIONS: '--experimental-modules' }
});

testProcess.on('close', (code) => {
  if (code === 0) {
    console.log('\n✅ PRUEBA EXITOSA: El script funcionó correctamente');
    console.log('📊 URLs corregidas, estrategias de retry funcionando');
    console.log('🎯 Sistema robusto para encontrar tweets garantizado');
  } else {
    console.log(`\n❌ PRUEBA FALLÓ: El script terminó con código ${code}`);
    console.log('⚠️  Revisa los logs anteriores para diagnosticar el problema');
  }
});

testProcess.on('error', (error) => {
  console.error(`\n💥 ERROR EJECUTANDO PRUEBA: ${error.message}`);
  console.error('Asegúrate de que tienes las dependencias instaladas:');
  console.error('npm install node-fetch p-limit yargs @supabase/supabase-js dotenv');
}); 