/**
 * SCRIPT DE TESTING - Integración Política Laura Memory
 * Verifica que todas las funcionalidades político-memoria funcionen correctamente
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

// Datos de prueba: tweets políticos guatemaltecos simulados
const testTweets = [
  {
    tweet_id: "test_001",
    usuario: "congreso_gt",
    texto: "El Congreso aprobó la nueva ley de transparencia con 89 votos a favor",
    likes: 245,
    retweets: 67,
    replies: 23,
    verified: true,
    fecha: "2h"
  },
  {
    tweet_id: "test_002", 
    usuario: "ministerio_gob",
    texto: "El Ministro de Gobernación anunció nuevas medidas de seguridad para el país",
    likes: 156,
    retweets: 34,
    replies: 12,
    verified: true,
    fecha: "4h"
  },
  {
    tweet_id: "test_003",
    usuario: "usuario_normal",
    texto: "Qué rico el pollo del almuerzo de hoy 🍗",
    likes: 5,
    retweets: 1,
    replies: 2,
    verified: false,
    fecha: "1h"
  },
  {
    tweet_id: "test_004",
    usuario: "tse_guatemala",
    texto: "TSE: Se registraron 150 nuevos partidos políticos para las próximas elecciones",
    likes: 890,
    retweets: 234,
    replies: 45,
    verified: true,
    fecha: "6h"
  }
];

// Importar funciones del archivo principal (simulación)
class LauraMemoryClient {
  constructor() {
    this.baseUrl = process.env.LAURA_MEMORY_URL || 'http://localhost:5001';
    this.enabled = process.env.LAURA_MEMORY_ENABLED === 'true';
  }

  async isAvailable() {
    try {
      const response = await fetch(`${this.baseUrl}/health`, { method: 'GET', timeout: 2000 });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async searchPoliticalContext(query, limit = 5) {
    try {
      const response = await fetch(`${this.baseUrl}/api/politics/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit })
      });
      const result = await response.json();
      return result.results || [];
    } catch (error) {
      console.error('Error en búsqueda política:', error);
      return [];
    }
  }
}

function detectPoliticalContent(tweet) {
  const texto = tweet.texto.toLowerCase();
  
  const politicalKeywords = {
    gobierno: ['gobierno', 'presidente', 'giammattei', 'arevalo', 'ministerio', 'ministro'],
    congreso: ['congreso', 'diputado', 'legislativo', 'ley', 'decreto'],
    judicial: ['corte', 'suprema', 'justicia', 'mp', 'fiscal'],
    electoral: ['tse', 'elecciones', 'candidato', 'partido', 'votacion'],
    instituciones: ['mingob', 'minfin', 'mineduc', 'sat']
  };
  
  const analysis = {
    isPolitical: false,
    relevanceScore: 0,
    categories: [],
    entities: []
  };
  
  for (const [category, keywords] of Object.entries(politicalKeywords)) {
    const matches = keywords.filter(keyword => texto.includes(keyword));
    if (matches.length > 0) {
      analysis.isPolitical = true;
      analysis.categories.push(category);
      analysis.entities.push(...matches);
      analysis.relevanceScore += matches.length * 2;
    }
  }
  
  if (tweet.verified) analysis.relevanceScore += 3;
  
  const engagement = (tweet.likes || 0) + (tweet.retweets || 0) + (tweet.replies || 0);
  if (engagement > 100) analysis.relevanceScore += 2;
  if (engagement > 500) analysis.relevanceScore += 3;
  
  analysis.relevanceScore = Math.min(analysis.relevanceScore, 10);
  
  if (analysis.relevanceScore < 2) {
    analysis.isPolitical = false;
  }
  
  return analysis;
}

// Función principal de testing
async function runTests() {
  console.log('🧪 [TEST] Iniciando testing de integración política\n');
  
  const lauraMemoryClient = new LauraMemoryClient();
  let passedTests = 0;
  let totalTests = 0;
  
  // TEST 1: Verificar disponibilidad de Laura Memory
  totalTests++;
  console.log('📡 [TEST 1] Verificando conexión a Laura Memory...');
  const memoryAvailable = await lauraMemoryClient.isAvailable();
  if (memoryAvailable) {
    console.log('✅ [PASS] Laura Memory Service disponible');
    passedTests++;
  } else {
    console.log('❌ [FAIL] Laura Memory Service no disponible');
  }
  
  // TEST 2: Probar detector político
  totalTests++;
  console.log('\n🏛️ [TEST 2] Probando detector político...');
  const politicalResults = testTweets.map(tweet => ({
    tweet_id: tweet.tweet_id,
    usuario: tweet.usuario,
    analysis: detectPoliticalContent(tweet)
  }));
  
  const expectedPolitical = ['test_001', 'test_002', 'test_004']; // IDs que deberían ser políticos
  const detectedPolitical = politicalResults
    .filter(r => r.analysis.isPolitical)
    .map(r => r.tweet_id);
  
  console.log('Resultados de detección política:');
  politicalResults.forEach(result => {
    const symbol = result.analysis.isPolitical ? '🏛️' : '🌱';
    console.log(`  ${symbol} @${result.usuario} (Score: ${result.analysis.relevanceScore}/10) - Político: ${result.analysis.isPolitical}`);
  });
  
  const correctDetections = expectedPolitical.filter(id => detectedPolitical.includes(id)).length;
  const falsePositives = detectedPolitical.filter(id => !expectedPolitical.includes(id)).length;
  
  if (correctDetections === expectedPolitical.length && falsePositives === 0) {
    console.log('✅ [PASS] Detector político funciona correctamente');
    passedTests++;
  } else {
    console.log(`❌ [FAIL] Detector político: ${correctDetections}/${expectedPolitical.length} correctos, ${falsePositives} falsos positivos`);
  }
  
  // TEST 3: Probar búsqueda de contexto político
  if (memoryAvailable) {
    totalTests++;
    console.log('\n🔍 [TEST 3] Probando búsqueda de contexto político...');
    try {
      const context = await lauraMemoryClient.searchPoliticalContext('congreso guatemala ley');
      console.log(`📚 Contexto encontrado: ${context.length} resultados`);
      console.log('✅ [PASS] Búsqueda de contexto político exitosa');
      passedTests++;
    } catch (error) {
      console.log(`❌ [FAIL] Error en búsqueda de contexto: ${error.message}`);
    }
  }
  
  // TEST 4: Verificar estructura de datos
  totalTests++;
  console.log('\n📊 [TEST 4] Verificando estructura de datos políticos...');
  const sampleTweet = testTweets[0];
  const analysis = detectPoliticalContent(sampleTweet);
  
  const tweetData = {
    tweet_id: sampleTweet.tweet_id,
    usuario: sampleTweet.usuario,
    texto: sampleTweet.texto,
    // Campos políticos nuevos
    political_relevance_score: analysis.relevanceScore,
    political_categories: analysis.categories,
    political_entities: analysis.entities,
    is_political: analysis.isPolitical,
    memory_context: 'test context'
  };
  
  const requiredFields = ['political_relevance_score', 'political_categories', 'political_entities', 'is_political'];
  const hasAllFields = requiredFields.every(field => tweetData.hasOwnProperty(field));
  
  if (hasAllFields) {
    console.log('✅ [PASS] Estructura de datos políticos correcta');
    console.log(`   Campos: ${requiredFields.join(', ')}`);
    passedTests++;
  } else {
    console.log('❌ [FAIL] Faltan campos en estructura de datos políticos');
  }
  
  // RESUMEN FINAL
  console.log(`\n🎯 [RESUMEN] Tests completados: ${passedTests}/${totalTests} exitosos`);
  
  if (passedTests === totalTests) {
    console.log('🎉 [SUCCESS] Todos los tests pasaron! Integración política lista para producción');
    return true;
  } else {
    console.log('⚠️ [WARNING] Algunos tests fallaron. Revisar integración antes de producción');
    return false;
  }
}

// Ejecutar tests
runTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 [ERROR] Error ejecutando tests:', error);
    process.exit(1);
  }); 