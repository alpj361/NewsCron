const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

// Configura tus credenciales de Supabase
const SUPABASE_URL = 'https://qqshdccpmypelhmyqnut.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxc2hkY2NwbXlwZWxobXlxbnV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjAzNjcxMSwiZXhwIjoyMDYxNjEyNzExfQ.BaJ_z3Gp2pUnmYEDpfNTCIxpHloSjmxi43aKwm-93ZI';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Configuración de la API
const API_BASE_URL = 'https://api.standatpd.com'; // Cambiado a puerto 8001 para evitar conflictos
// const API_BASE_URL = 'https://api.standatpd.com'; // Producción - comentado temporalmente
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
  let cleanText = cleanTrendText(trendText);
  
  // Si es un hashtag, remover el #
  if (cleanText.startsWith('#')) {
    cleanText = cleanText.substring(1);
  }
  
  // Remover conteos con paréntesis (ej: "término (123)")
  cleanText = cleanText.replace(/\s*\([^)]*\)$/, '');
  
  // Remover sufijos de números con K, M, etc. al final
  // Ejemplos: Taylor839K -> Taylor, USAC14K -> USAC, Rep TV138K -> Rep TV
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
  
  console.log(`🧹 Limpieza: "${trendText}" -> "${cleanText}"`);
  return cleanText;
};

// Función para convertir fecha de Nitter a formato ISO
const parseNitterDate = (dateString) => {
  if (!dateString) return null;
  
  try {
    // Manejar fechas relativas: "3m", "16m", "2h", "58m", etc.
    if (/^\d+[mhsdwy]$/.test(dateString)) {
      const now = new Date();
      const value = parseInt(dateString);
      const unit = dateString.slice(-1);
      
      switch (unit) {
        case 'm': // minutos
          now.setMinutes(now.getMinutes() - value);
          break;
        case 'h': // horas  
          now.setHours(now.getHours() - value);
          break;
        case 'd': // días
          now.setDate(now.getDate() - value);
          break;
        case 'w': // semanas
          now.setDate(now.getDate() - (value * 7));
          break;
        case 'y': // años
          now.setFullYear(now.getFullYear() - value);
          break;
        case 's': // segundos
          now.setSeconds(now.getSeconds() - value);
          break;
        default:
          console.log(`⚠️  Unidad de tiempo no reconocida: "${unit}" en "${dateString}"`);
          return new Date().toISOString(); // Usar fecha actual como fallback
      }
      
      console.log(`🕒 Fecha relativa convertida: "${dateString}" -> ${now.toISOString()}`);
      return now.toISOString();
    }
    
    // Formato típico de Nitter: "May 30, 2025 · 11:10 PM UTC"
    // Remover el separador " · " y limpiar
    const cleanDate = dateString.replace(' · ', ' ').replace(' UTC', '');
    
    // Crear objeto Date y convertir a ISO
    const date = new Date(cleanDate + ' UTC');
    
    // Verificar si la fecha es válida
    if (isNaN(date.getTime())) {
      console.log(`⚠️  Fecha inválida: "${dateString}" - usando fecha actual`);
      return new Date().toISOString(); // Usar fecha actual como fallback
    }
    
    return date.toISOString();
  } catch (error) {
    console.log(`❌ Error parseando fecha "${dateString}":`, error.message);
    return new Date().toISOString(); // Usar fecha actual como fallback
  }
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
    console.log('📡 URL:', `${API_BASE_URL}/trending?location=${LOCATION}`);
    
    // 1. Obtener trending topics
    const trendingRes = await fetch(`${API_BASE_URL}/trending?location=${LOCATION}`);
    console.log('📊 Response status:', trendingRes.status);
    
    if (!trendingRes.ok) {
      throw new Error(`HTTP ${trendingRes.status}: ${trendingRes.statusText}`);
    }
    
    const trendingData = await trendingRes.json();
    console.log('📦 Response data:', JSON.stringify(trendingData, null, 2));
    
    if (trendingData.status !== 'success' || !trendingData.twitter_trends) {
      console.error('❌ Error obteniendo trending topics:', trendingData.message || 'No trends found');
      return;
    }
    
    console.log(`✅ Obtenidos ${trendingData.twitter_trends.length} trending topics`);
    
    // 2. Para cada trend, obtener tweets de Nitter
    for (const trend of trendingData.twitter_trends) {
      try {
        const searchTerm = extractSearchTerm(trend);
        
        // Si el término es null o muy corto, saltar
        if (!searchTerm) {
          console.log(`⏭️  Saltando trend "${trend}" - término no válido después de limpiar`);
          continue;
        }
        
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
              fecha_tweet: parseNitterDate(tweet.fecha),
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