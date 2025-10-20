import fetch from 'node-fetch';
import pLimit from 'p-limit';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

// CLI arguments
const argv = yargs(hideBin(process.argv))
  .option('location', {
    alias: 'l',
    type: 'string',
    default: 'guatemala',
    description: 'País o región para buscar tendencias'
  })
  .option('limit', {
    alias: 'n',
    type: 'number',
    default: 15,
    description: 'Máximo de tweets a devolver por tendencia'
  })
  .option('concurrency', {
    alias: 'c',
    type: 'number',
    default: 4,
    description: 'Número de requests concurrentes'
  })
  .help()
  .argv;

// Configuración Supabase (usando variables de entorno)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Configuración de la API
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000'; // Default local; override con env

// Compatibilidad: usar /trending del root y /nitter_context bajo /api
const stripTrailingSlash = (url) => url.replace(/\/+$/, '');
const BASE = stripTrailingSlash(API_BASE_URL);
const HAS_API_SUFFIX = /\/api$/i.test(BASE);
const TRENDS_BASE = HAS_API_SUFFIX ? BASE.replace(/\/api$/i, '') : BASE;
const NITTER_BASE = HAS_API_SUFFIX ? BASE : `${BASE}/api`;
const NITTER_PATH = '/nitter_context/'; // FastAPI define ruta exacta con barra final

// Timeout configurable para requests
const HTTP_TIMEOUT_MS = parseInt(process.env.HTTP_TIMEOUT || '30000', 10);

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timeout);
  }
}

// Control de concurrencia
const limit = pLimit(argv.concurrency);

// Set para evitar duplicados en la misma ejecución
const seenTweetIds = new Set();

// Función para obtener tendencias (usando ExtractorT)
async function getTrends(location) {
  const response = await fetchWithTimeout(`${TRENDS_BASE}/trending?location=${location}`);
  
  if (!response.ok) {
    throw new Error(`Error obteniendo tendencias: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  if (data.status !== 'success' || !data.trends) {
    throw new Error('No se encontraron tendencias');
  }
  
  return data.trends.map(trend => typeof trend === 'string' ? trend : trend.name);
}

// Función para limpiar texto de tendencia (del archivo original)
function cleanTrendText(trendText) {
  let cleanText = trendText.replace(/^\d+\.\s*/, '').trim();
  
  if (cleanText.startsWith('#')) {
    cleanText = cleanText.substring(1);
  }
  
  cleanText = cleanText
    .replace(/\s*\([^)]*\)$/, '')
    .replace(/\d+[KMB]?$/i, '')
    .replace(/\s*\d+$/, '')
    .trim();
  
  return cleanText.length >= 2 ? cleanText : null;
}

// Función para hacer retry con back-off (usando ExtractorT local con queries inteligentes)
async function fetchTweetsWithRetry(query, location, limit) {
  const delays = [500, 1000, 2000]; // 0.5s, 1s, 2s
  
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // ExtractorT ya maneja la lógica inteligente, solo pasamos el query original
      const encodedQuery = encodeURIComponent(query);
      // Usar ruta modular exacta con barra final para evitar redirecciones 307
      const url = `${NITTER_BASE}${NITTER_PATH}?q=${encodedQuery}&location=${location}&limit=${limit}`;
      
      console.log(`[TREND] Procesando: "${query}"`);
      console.log(`[FILTER] Ubicación: ${location}, Límite: ${limit}`);
      
      const response = await fetchWithTimeout(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Verificar si tiene tweets válidos
      if (data.status === 'success' && data.tweets && data.tweets.length > 0) {
        console.log(`[RESULT] Tweets encontrados: ${data.tweets.length}/${limit}`);
        console.log(`✅ ${query} · Búsqueda exitosa: ${data.tweets.length} tweets`);
        return data.tweets;
      }
      
      // Si no hay tweets, seguir con el siguiente intento
      if (attempt < 2) {
        console.log(`⏳ ${query} · Sin resultados en intento ${attempt + 1}, reintentando...`);
        await new Promise(resolve => setTimeout(resolve, delays[attempt]));
      }
      
    } catch (error) {
      if (attempt === 2) {
        console.log(`❌ ${query} · Todos los intentos fallaron: ${error.message}`);
        throw error;
      }
      console.log(`⚠️  ${query} · Error en intento ${attempt + 1}: ${error.message}, reintentando...`);
      await new Promise(resolve => setTimeout(resolve, delays[attempt]));
    }
  }
  
  return []; // Retornar array vacío si no se encontraron tweets después de todos los intentos
}

// Función para convertir fecha de Nitter (del archivo original)
function parseNitterDate(dateString) {
  if (!dateString) return new Date().toISOString();
  
  try {
    if (/^\d+[mhsdwy]$/.test(dateString)) {
      const now = new Date();
      const value = parseInt(dateString);
      const unit = dateString.slice(-1);
      
      switch (unit) {
        case 'm': now.setMinutes(now.getMinutes() - value); break;
        case 'h': now.setHours(now.getHours() - value); break;
        case 'd': now.setDate(now.getDate() - value); break;
        case 'w': now.setDate(now.getDate() - (value * 7)); break;
        case 'y': now.setFullYear(now.getFullYear() - value); break;
        case 's': now.setSeconds(now.getSeconds() - value); break;
        default: return new Date().toISOString();
      }
      
      return now.toISOString();
    }
    
    const cleanDate = dateString.replace(' · ', ' ').replace(' UTC', '');
    const date = new Date(cleanDate + ' UTC');
    
    return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  } catch (error) {
    return new Date().toISOString();
  }
}

// Función para guardar tweets en Supabase
async function upsertTweet(tweetData) {
  try {
    const { error } = await supabase
      .from('trending_tweets')
      .upsert(tweetData, { onConflict: 'tweet_id' });
    
    if (error) {
      throw error;
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error };
  }
}

// Función principal para procesar una tendencia
async function processTrend(trend, location, limit) {
  const cleanTrend = cleanTrendText(trend);
  
  if (!cleanTrend) {
    console.log(`❌ ${trend} · Término no válido después de limpiar`);
    return;
  }
  
  try {
    const tweets = await fetchTweetsWithRetry(cleanTrend, location, limit);
    
    if (tweets.length === 0) {
      console.log(`❌ ${trend} · No se encontraron tweets`);
      return;
    }
    
    let savedCount = 0;
    
    for (const tweet of tweets) {
      // Verificar duplicados
      if (seenTweetIds.has(tweet.tweet_id)) {
        continue;
      }
      
      seenTweetIds.add(tweet.tweet_id);
      
      // Preparar datos del tweet
      const tweetData = {
        trend_original: trend,
        trend_clean: cleanTrend,
        tweet_id: tweet.tweet_id,
        usuario: tweet.usuario,
        fecha_tweet: parseNitterDate(tweet.fecha),
        texto: tweet.texto,
        enlace: tweet.enlace,
        likes: tweet.likes || 0,
        retweets: tweet.retweets || 0,
        replies: tweet.replies || 0,
        verified: tweet.verified || false,
        location: location,
        fecha_captura: new Date().toISOString(),
        raw_data: tweet
      };
      
      // Guardar en Supabase
      const result = await upsertTweet(tweetData);
      
      if (result.success) {
        savedCount++;
      }
    }
    
    console.log(`✅ ${trend} · ${savedCount} tweets`);
    
  } catch (error) {
    console.log(`❌ ${trend} · ${error.message}`);
  }
}

// Función principal
async function main() {
  console.log(`🚀 Iniciando con location=${argv.location}, limit=${argv.limit}, concurrency=${argv.concurrency}`);
  
  try {
    // Obtener tendencias
    const trends = await getTrends(argv.location);
    console.log(`📈 Obtenidas ${trends.length} tendencias`);
    
    // Procesar tendencias con concurrencia limitada
    const tasks = trends.map(trend => 
      limit(() => processTrend(trend, argv.location, argv.limit))
    );
    
    await Promise.all(tasks);
    
    console.log(`🎉 Proceso completado. ${seenTweetIds.size} tweets únicos procesados`);
    
  } catch (error) {
    console.error(`💥 Error general: ${error.message}`);
    process.exit(1);
  }
}

// Ejecutar
main().catch(console.error);