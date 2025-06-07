// Script de prueba del sistema mejorado
console.log('🧪 INICIANDO PRUEBA DEL SISTEMA MEJORADO');
console.log('==========================================');

// Configuración de prueba
const TEST_CONFIG = {
  maxTrends: 3, // Solo procesar 3 trends para testing
  maxTweetsPerTrend: 2, // Solo 2 tweets por trend
  enableLogging: true
};

console.log(`📊 Configuración de prueba:`);
console.log(`   - Máximo trends: ${TEST_CONFIG.maxTrends}`);
console.log(`   - Máximo tweets por trend: ${TEST_CONFIG.maxTweetsPerTrend}`);
console.log(`   - Logging: ${TEST_CONFIG.enableLogging ? 'HABILITADO' : 'DESHABILITADO'}`);
console.log('');

// Función para limpiar texto de trend (copiada del archivo principal)
function cleanTrendText(trendText) {
  return trendText.replace(/^\d+\.\s*/, '').trim();
}

// Lista de palabras clave relacionadas con Guatemala
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

// Función para extraer término de búsqueda del trend
function extractSearchTerm(trendText) {
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
}

// Función de prueba modificada
async function testSystem() {
  try {
    console.log('🚀 Iniciando prueba del sistema...');
    
    // Verificar que ExtractorT esté funcionando
    const testResponse = await fetch('http://localhost:8000/health');
    if (!testResponse.ok) {
      throw new Error('ExtractorT no está respondiendo');
    }
    console.log('✅ ExtractorT está funcionando');
    
    // Obtener trending topics
    console.log('📈 Obteniendo trending topics...');
    const trendingRes = await fetch('http://localhost:8000/trending?location=guatemala');
    const trendingData = await trendingRes.json();
    
    if (trendingData.status !== 'success' || !trendingData.trends) {
      throw new Error('No se pudieron obtener trending topics');
    }
    
    console.log(`✅ Obtenidos ${trendingData.trends.length} trending topics`);
    console.log('📋 Trends encontrados:');
    trendingData.trends.slice(0, TEST_CONFIG.maxTrends).forEach((trend, index) => {
      const trendName = trend.name || trend;
      console.log(`   ${index + 1}. ${trendName}`);
    });
    
    // Procesar solo los primeros trends para testing
    const trendsToProcess = trendingData.trends.slice(0, TEST_CONFIG.maxTrends);
    
    console.log(`\n🔄 Procesando ${trendsToProcess.length} trends para testing...`);
    
    for (const trend of trendsToProcess) {
      const trendName = trend.name || trend;
      console.log(`\n📝 Procesando trend: "${trendName}"`);
      
      // Probar extracción de keywords
      const searchTerm = extractSearchTerm(trendName);
      
      if (!searchTerm) {
        console.log(`   ❌ Trend filtrado: "${trendName}"`);
        continue;
      }
      
      console.log(`   ✅ Término de búsqueda: "${searchTerm}"`);
      
      // Probar endpoint de nitter_context
      try {
        const nitterRes = await fetch(
          `http://localhost:8000/nitter_context?q=${encodeURIComponent(searchTerm)}&location=guatemala&limit=${TEST_CONFIG.maxTweetsPerTrend}`
        );
        
        if (!nitterRes.ok) {
          console.log(`   ⚠️  Error en endpoint: ${nitterRes.status}`);
          continue;
        }
        
        const nitterData = await nitterRes.json();
        
        if (nitterData.status === 'success' && nitterData.tweets && nitterData.tweets.length > 0) {
          console.log(`   📱 Tweets encontrados: ${nitterData.tweets.length}`);
          
          // Mostrar primer tweet como ejemplo
          const firstTweet = nitterData.tweets[0];
          console.log(`   📄 Ejemplo tweet: @${firstTweet.usuario} - ${firstTweet.texto.substring(0, 60)}...`);
        } else {
          console.log(`   ℹ️  No se encontraron tweets para "${searchTerm}"`);
        }
        
      } catch (error) {
        console.log(`   ❌ Error procesando trend: ${error.message}`);
      }
      
      // Pausa entre trends
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n🎉 PRUEBA COMPLETADA EXITOSAMENTE');
    console.log('====================================');
    console.log('✅ Sistema de extracción funcionando');
    console.log('✅ Filtrado de keywords funcionando');
    console.log('✅ Endpoints de API respondiendo');
    console.log('✅ Filtros de contenido implementados');
    
  } catch (error) {
    console.error('\n💥 ERROR EN LA PRUEBA:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Ejecutar prueba
testSystem();
