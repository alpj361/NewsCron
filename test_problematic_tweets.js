const fetch = require('node-fetch');
require('dotenv').config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Tweets problemáticos de prueba
const problematicTweets = [
  {
    texto: "⚽️ #ChinoDeportes: La Selecta igualó 1-1 con Guatemala 🇬🇹",
    categoria: "Deportes"
  },
  {
    texto: 'El presidente dijo: "Vamos a mejorar la economía", pero ¿será cierto?',
    categoria: "Política"
  },
  {
    texto: "¡Increíble! 😱\nEl nuevo proyecto es\n\"revolucionario\"",
    categoria: "General"
  },
  {
    texto: "Unicode test: ñáéíóú ¿¡ €$¢ ©®™",
    categoria: "General"
  }
];

async function testTweetAnalysis(tweet, categoria) {
  console.log(`\n🧪 Probando tweet: ${tweet.substring(0, 50)}...`);
  
  const prompt = `Analiza COMPLETAMENTE este tweet guatemalteco de la categoría "${categoria}":

Tweet: "${tweet}"

Responde ÚNICAMENTE con un JSON válido:
{
  "sentimiento": "positivo|negativo|neutral",
  "score": 0.75,
  "confianza": 0.85,
  "emociones": ["alegría"],
  "intencion_comunicativa": "informativo",
  "entidades_mencionadas": [],
  "contexto_local": "contexto detectado",
  "intensidad": "media"
}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Eres un experto en análisis de sentimientos. ${prompt}`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          topK: 1,
          topP: 1,
          maxOutputTokens: 300,
          stopSequences: []
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiResponse) {
      throw new Error('No response from Gemini');
    }

    console.log(`📝 Respuesta raw: ${aiResponse.substring(0, 100)}...`);

    // Probar la función de limpieza mejorada
    let cleanResponse = aiResponse
      .replace(/```json|```/g, '')
      .replace(/^\s*[\r\n]+|[\r\n]+\s*$/g, '')
      .trim();
    
    let analysis;
    let parseMethod = "directo";
    
    try {
      analysis = JSON.parse(cleanResponse);
      console.log(`✅ JSON parseado directamente`);
    } catch (firstError) {
      parseMethod = "corregido";
      console.log(`⚠️  Primer intento falló: ${firstError.message}`);
      
      try {
        cleanResponse = cleanResponse
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t')
          .replace(/'/g, "\\'");
        
        analysis = JSON.parse(cleanResponse);
        console.log(`✅ JSON parseado después de corrección`);
      } catch (secondError) {
        parseMethod = "manual";
        console.log(`⚠️  Segundo intento falló: ${secondError.message}`);
        
        const sentimientoMatch = cleanResponse.match(/"?sentimiento"?\s*:\s*"?(\w+)"?/i);
        const scoreMatch = cleanResponse.match(/"?score"?\s*:\s*(\d*\.?\d+)/i);
        
        analysis = {
          sentimiento: sentimientoMatch ? sentimientoMatch[1] : 'neutral',
          score: scoreMatch ? parseFloat(scoreMatch[1]) : 0.0,
          intencion_comunicativa: 'informativo'
        };
        console.log(`✅ Análisis manual exitoso`);
      }
    }

    console.log(`📊 Resultado (${parseMethod}):`, {
      sentimiento: analysis.sentimiento,
      score: analysis.score,
      intencion: analysis.intencion_comunicativa
    });

    return { success: true, method: parseMethod, analysis };

  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  if (!GEMINI_API_KEY) {
    console.log("❌ GEMINI_API_KEY no configurada");
    return;
  }

  console.log("🧪 Probando tweets problemáticos...\n");

  let results = {
    total: problematicTweets.length,
    success: 0,
    direct: 0,
    corrected: 0,
    manual: 0,
    failed: 0
  };

  for (const tweet of problematicTweets) {
    const result = await testTweetAnalysis(tweet.texto, tweet.categoria);
    
    if (result.success) {
      results.success++;
      results[result.method]++;
    } else {
      results.failed++;
    }

    // Pausa entre requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log("\n📊 Resumen de pruebas:");
  console.log(`Total: ${results.total}`);
  console.log(`✅ Exitosos: ${results.success}`);
  console.log(`📋 Parse directo: ${results.direct}`);
  console.log(`🔧 Parse corregido: ${results.corrected}`);
  console.log(`🛠️  Parse manual: ${results.manual}`);
  console.log(`❌ Fallidos: ${results.failed}`);
  
  const successRate = (results.success / results.total * 100).toFixed(1);
  console.log(`📈 Tasa de éxito: ${successRate}%`);
}

if (require.main === module) {
  runTests();
}

module.exports = { testTweetAnalysis }; 