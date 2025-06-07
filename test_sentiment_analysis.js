const fetch = require('node-fetch');
require('dotenv').config();

// Datos de prueba - tweets guatemaltecos reales con diferentes intenciones y entidades
const testTweets = [
  {
    tweet_id: "test_001",
    usuario: "test_user",
    fecha: "2h",
    texto: "¡Qué orgulloso me siento de ser guatemalteco! 🇬🇹 Nuestro país tiene mucho potencial y con trabajo unidos podemos lograr grandes cosas. #Guatemala #OrgulloChapín",
    likes: 150,
    retweets: 45,
    replies: 12,
    verified: false
  },
  {
    tweet_id: "test_002", 
    usuario: "ciudadano_gt",
    fecha: "4h",
    texto: "La corrupción en el gobierno de Arévalo nos tiene hartos. Ya basta de políticos que solo buscan enriquecerse mientras el pueblo sufre. #YaBasta #GuatemalaLibre",
    likes: 890,
    retweets: 234,
    replies: 156,
    verified: false
  },
  {
    tweet_id: "test_003",
    usuario: "neutral_news",
    fecha: "1h", 
    texto: "El Congreso de la República sesionará mañana para discutir el presupuesto 2024. Se esperan debates intensos entre las diferentes bancadas.",
    likes: 23,
    retweets: 8,
    replies: 4,
    verified: true
  },
  {
    tweet_id: "test_004",
    usuario: "comediante_chapin",
    fecha: "3h",
    texto: "Los políticos guatemaltecos son como los semáforos en Guatemala: no funcionan cuando más los necesitas 😂 #HumorChapin #Guatemala",
    likes: 2340,
    retweets: 678,
    replies: 89,
    verified: false
  },
  {
    tweet_id: "test_005",
    usuario: "alerta_ciudadana",
    fecha: "30m",
    texto: "🚨 ALERTA: Se reporta aumento de asaltos en zona 1 de Guatemala. Eviten circular solos por las noches. Comparte para que más personas se enteren. #SeguridadGT",
    likes: 567,
    retweets: 890,
    replies: 134,
    verified: false
  }
];

// Función de análisis (copiada del archivo principal)
async function analyzeTweetSentiment(tweet, categoria) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  if (!OPENAI_API_KEY) {
    console.log('❌ OPENAI_API_KEY no configurada');
    return {
      sentimiento: 'neutral',
      score_sentimiento: 0.0,
      confianza_sentimiento: 0.3,
      emociones_detectadas: [],
      analisis_ai_metadata: { error: 'No API key' }
    };
  }

  try {
    console.log(`🧠 Analizando: "${tweet.texto.substring(0, 60)}..."`);
    
    const prompt = `Analiza el sentimiento de este tweet guatemalteco de la categoría "${categoria}":

Tweet: "${tweet.texto}"

Contexto:
- Usuario: @${tweet.usuario}
- Categoría: ${categoria}
- Ubicación: Guatemala
- Likes: ${tweet.likes || 0}, Retweets: ${tweet.retweets || 0}, Replies: ${tweet.replies || 0}

Instrucciones de Análisis:
1. SENTIMIENTO: Considera contexto guatemalteco, lenguaje chapín, sarcasmo, ironía
2. INTENCIÓN: Identifica el propósito comunicativo del tweet
3. ENTIDADES: Extrae personas, organizaciones, lugares, eventos mencionados

Responde ÚNICAMENTE con un JSON válido:
{
  "sentimiento": "positivo|negativo|neutral",
  "score": 0.75,
  "confianza": 0.85,
  "emociones": ["alegría", "esperanza"],
  "intencion_comunicativa": "informativo|opinativo|humoristico|alarmista|critico|promocional|conversacional|protesta",
  "entidades_mencionadas": [
    {
      "nombre": "Bernardo Arévalo",
      "tipo": "persona",
      "contexto": "presidente de Guatemala"
    }
  ],
  "contexto_local": "breve explicación del contexto guatemalteco detectado",
  "intensidad": "alta|media|baja"
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Eres un experto en análisis de sentimientos especializado en el contexto guatemalteco. Responde siempre con JSON válido.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 300
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content;
    
    if (!aiResponse) {
      throw new Error('No response from OpenAI');
    }

    const cleanResponse = aiResponse.replace(/```json|```/g, '').trim();
    const analysis = JSON.parse(cleanResponse);
    
    // Calcular score de propagación
    const scoreEngagement = (tweet.likes * 1) + (tweet.retweets * 3) + (tweet.replies * 2);
    let nivelPropagacion = 'sin_engagement';
    if (scoreEngagement >= 10000) nivelPropagacion = 'viral';
    else if (scoreEngagement >= 1000) nivelPropagacion = 'alto_engagement';
    else if (scoreEngagement >= 100) nivelPropagacion = 'medio_engagement';
    else if (scoreEngagement >= 10) nivelPropagacion = 'bajo_engagement';

    const result = {
      sentimiento: analysis.sentimiento || 'neutral',
      score_sentimiento: analysis.score || 0.0,
      confianza_sentimiento: analysis.confianza || 0.5,
      emociones_detectadas: analysis.emociones || [],
      intencion_comunicativa: analysis.intencion_comunicativa || 'informativo',
      entidades_mencionadas: analysis.entidades_mencionadas || [],
      propagacion_viral: nivelPropagacion,
      score_propagacion: scoreEngagement,
      analisis_ai_metadata: {
        modelo: 'gpt-3.5-turbo',
        timestamp: new Date().toISOString(),
        contexto_local: analysis.contexto_local || '',
        intensidad: analysis.intensidad || 'media',
        categoria: categoria,
        tokens_usados: data.usage?.total_tokens || 0,
        costo_estimado: (data.usage?.total_tokens || 0) * 0.0015 / 1000
      }
    };

    console.log(`✅ Análisis completo:`);
    console.log(`   😊 Sentimiento: ${result.sentimiento} (${result.score_sentimiento})`);
    console.log(`   🎯 Intención: ${result.intencion_comunicativa}`);
    console.log(`   🔥 Propagación: ${result.propagacion_viral} (score: ${result.score_propagacion})`);
    console.log(`   👥 Entidades: ${result.entidades_mencionadas.length} detectadas`);
    console.log(`   💰 Costo: $${result.analisis_ai_metadata.costo_estimado.toFixed(6)}`);
    console.log(`   📝 Contexto: ${result.analisis_ai_metadata.contexto_local}`);
    
    return result;

  } catch (error) {
    console.error(`❌ Error:`, error.message);
    return {
      sentimiento: 'neutral',
      score_sentimiento: 0.0,
      confianza_sentimiento: 0.3,
      emociones_detectadas: [],
      analisis_ai_metadata: { error: error.message }
    };
  }
}

// Ejecutar pruebas
async function runTests() {
  console.log('🧪 Iniciando pruebas de análisis de sentimiento...\n');
  
  let totalCost = 0;
  const categorias = ['Sociales', 'Política', 'Política', 'General', 'Sociales'];
  
  for (let i = 0; i < testTweets.length; i++) {
    const tweet = testTweets[i];
    const categoria = categorias[i];
    
    console.log(`\n--- Prueba ${i + 1}/${testTweets.length} ---`);
    console.log(`Tweet: "${tweet.texto}"`);
    console.log(`Categoría: ${categoria}`);
    
    const result = await analyzeTweetSentiment(tweet, categoria);
    
    if (result.analisis_ai_metadata.costo_estimado) {
      totalCost += result.analisis_ai_metadata.costo_estimado;
    }
    
    console.log(`Resultado completo:`, JSON.stringify(result, null, 2));
    
    // Pausa entre pruebas
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`\n🎉 Pruebas completadas!`);
  console.log(`💰 Costo total estimado: $${totalCost.toFixed(6)}`);
  console.log(`📊 Costo promedio por tweet: $${(totalCost / testTweets.length).toFixed(6)}`);
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { analyzeTweetSentiment, runTests }; 