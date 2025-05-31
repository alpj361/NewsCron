const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

// Configura tus credenciales de Supabase
const SUPABASE_URL = 'https://qqshdccpmypelhmyqnut.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxc2hkY2NwbXlwZWxobXlxbnV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjAzNjcxMSwiZXhwIjoyMDYxNjEyNzExfQ.BaJ_z3Gp2pUnmYEDpfNTCIxpHloSjmxi43aKwm-93ZI';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Configuración de la API
const API_BASE_URL = 'https://api.standatpd.com';
const LOCATION = 'guatemala';

// Mapeo de categorías basado en contenido
const categorizeTrend = (trendText) => {
  const text = trendText.toLowerCase();
  
  if (text.includes('política') || text.includes('político') || text.includes('congreso') || 
      text.includes('gobierno') || text.includes('presidente') || text.includes('ley') ||
      text.includes('elecciones') || text.includes('partido') || text.includes('diputado')) {
    return 'Política';
  }
  
  if (text.includes('finanzas') || text.includes('economía') || text.includes('banco') ||
      text.includes('impuesto') || text.includes('precio') || text.includes('dólar') ||
      text.includes('inflación') || text.includes('comercio')) {
    return 'Económica';
  }
  
  if (text.includes('educación') || text.includes('salud') || text.includes('familia') ||
      text.includes('sociedad') || text.includes('comunidad') || text.includes('cultura')) {
    return 'Sociales';
  }
  
  return 'General';
};

// Función para limpiar el texto del trend (quitar números de posición, etc.)
const cleanTrendText = (trendText) => {
  // Remover números de posición al inicio (ej: "1. #Hashtag" -> "#Hashtag")
  return trendText.replace(/^\d+\.\s*/, '').trim();
};

// Función para extraer término de búsqueda del trend
const extractSearchTerm = (trendText) => {
  const cleanText = cleanTrendText(trendText);
  
  // Si es un hashtag, remover el #
  if (cleanText.startsWith('#')) {
    return cleanText.substring(1);
  }
  
  // Si tiene paréntesis con conteo, remover esa parte
  return cleanText.replace(/\s*\([^)]*\)$/, '').trim();
};

// Verificar si ya existe un tweet con el mismo tweet_id
async function tweetExiste(tweetId) {
  if (!tweetId) return false;
  const { data, error } = await supabase
    .from('trending_tweets')
    .select('id')
    .eq('tweet_id', tweetId)
    .maybeSingle();
  return !!data;
}

// Función principal para obtener trending y tweets
async function fetchTrendingAndTweets() {
  try {
    console.log('🔍 Obteniendo trending topics...');
    
    // 1. Obtener trending topics
    const trendingRes = await fetch(`${API_BASE_URL}/trending`);
    const trendingData = await trendingRes.json();
    
    if (trendingData.status !== 'success' || !trendingData.trends) {
      console.error('❌ Error obteniendo trending topics:', trendingData.message);
      return;
    }
    
    console.log(`✅ Obtenidos ${trendingData.trends.length} trending topics`);
    
    // 2. Para cada trend, obtener tweets de Nitter
    for (const trend of trendingData.trends) {
      try {
        const searchTerm = extractSearchTerm(trend);
        const categoria = categorizeTrend(trend);
        
        console.log(`\n🔍 Buscando tweets para: "${searchTerm}" (${categoria})`);
        
        // Llamar al endpoint de nitter_context
        const nitterRes = await fetch(
          `${API_BASE_URL}/nitter_context?q=${encodeURIComponent(searchTerm)}&location=${LOCATION}&limit=10`
        );
        const nitterData = await nitterRes.json();
        
        if (nitterData.status === 'success' && nitterData.tweets) {
          console.log(`✅ Encontrados ${nitterData.tweets.length} tweets para "${searchTerm}"`);
          
          // 3. Guardar tweets en Supabase
          for (const tweet of nitterData.tweets) {
            // Evitar duplicados
            if (await tweetExiste(tweet.tweet_id)) {
              console.log(`⏭️  Tweet ${tweet.tweet_id} ya existe, saltando...`);
              continue;
            }
            
            const { error } = await supabase.from('trending_tweets').insert({
              trend_original: trend,
              trend_clean: searchTerm,
              categoria: categoria,
              tweet_id: tweet.tweet_id,
              usuario: tweet.usuario,
              fecha_tweet: tweet.fecha,
              texto: tweet.texto,
              enlace: tweet.enlace,
              likes: tweet.likes || 0,
              retweets: tweet.retweets || 0,
              replies: tweet.replies || 0,
              verified: tweet.verified || false,
              location: LOCATION,
              fecha_captura: new Date().toISOString(),
              raw_data: tweet
            });
            
            if (error) {
              console.error(`❌ Error insertando tweet ${tweet.tweet_id}:`, error);
            } else {
              console.log(`✅ Tweet guardado: @${tweet.usuario} - ${tweet.texto.substring(0, 50)}...`);
            }
          }
        } else {
          console.log(`⚠️  No se encontraron tweets para "${searchTerm}": ${nitterData.message}`);
        }
        
        // Pausa entre requests para no sobrecargar la API
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`❌ Error procesando trend "${trend}":`, error);
        continue;
      }
    }
    
    console.log('\n🎉 Proceso completado: Trending topics y tweets guardados');
    
  } catch (error) {
    console.error('❌ Error en el proceso principal:', error);
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  fetchTrendingAndTweets();
}

module.exports = { fetchTrendingAndTweets }; 