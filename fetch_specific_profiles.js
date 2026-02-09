/**
 * fetch_specific_profiles.js
 * 
 * Cron job para extraer tweets de perfiles de noticias específicos.
 * Se ejecuta cada 2 horas y guarda en trending_tweets con source_type='profile'.
 * 
 * Perfiles monitoreados:
 * - PrensaComunitar
 * - QuorumGT
 * - PlazaPublicaGT
 */

import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// ============== CONFIGURACIÓN ==============

// Perfiles de noticias a monitorear
const NEWS_PROFILES = [
    'PrensaComunitar',
    'QuorumGT',
    'PlazaPublicaGT'
];

// Configuración
const TWEETS_PER_PROFILE = 10;
const API_BASE_URL = process.env.EXTRACTOR_API_URL || 'https://api.standatpd.com';

// Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qqshdccpmypelhmyqnut.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============== FUNCIONES PRINCIPALES ==============

/**
 * Obtiene tweets de un perfil específico
 */
async function fetchProfileTweets(username) {
    const url = `${API_BASE_URL}/profile/${username}?limit=${TWEETS_PER_PROFILE}`;
    console.log(`📡 Fetching tweets from @${username}...`);

    try {
        const response = await fetch(url, { timeout: 60000 });
        const data = await response.json();

        if (data.status === 'success' && data.tweets && data.tweets.length > 0) {
            console.log(`✅ @${username}: ${data.tweets.length} tweets obtenidos`);
            return data.tweets;
        } else {
            console.log(`⚠️ @${username}: ${data.message || 'No tweets found'}`);
            return [];
        }
    } catch (error) {
        console.error(`❌ Error fetching @${username}: ${error.message}`);
        return [];
    }
}

/**
 * Verifica si un tweet ya existe en la base de datos
 */
async function tweetExists(tweetId) {
    const { data, error } = await supabase
        .from('trending_tweets')
        .select('id')
        .eq('tweet_id', tweetId)
        .limit(1);

    if (error) {
        console.error(`❌ Error checking tweet ${tweetId}: ${error.message}`);
        return false;
    }

    return data && data.length > 0;
}

/**
 * Guarda un tweet en la base de datos
 */
async function saveTweet(tweet, profileUsername) {
    // Verificar si ya existe
    const exists = await tweetExists(tweet.tweet_id);
    if (exists) {
        console.log(`   ⏩ Tweet ${tweet.tweet_id} ya existe, saltando...`);
        return { saved: false, reason: 'duplicate' };
    }

    // Parsear fecha
    let fechaTweet = null;
    try {
        if (tweet.fecha) {
            fechaTweet = new Date(tweet.fecha).toISOString();
        }
    } catch (e) {
        fechaTweet = new Date().toISOString();
    }

    // Preparar datos para insertar
    const tweetData = {
        // Identificadores
        tweet_id: tweet.tweet_id,
        source_type: 'profile',  // <- Marca como tweet de perfil

        // Trend fields (usamos el username como "trend")
        trend_original: `@${profileUsername}`,
        trend_clean: profileUsername,
        categoria: 'Noticias',  // Categoría fija para perfiles de noticias

        // Información del tweet
        usuario: tweet.usuario || profileUsername,
        fecha_tweet: fechaTweet,
        texto: tweet.texto,
        enlace: tweet.enlace,

        // Métricas
        likes: tweet.likes || 0,
        retweets: tweet.retweets || 0,
        replies: tweet.replies || 0,
        verified: tweet.verified || false,

        // Sin análisis de sentimiento
        sentimiento: 'neutral',
        score_sentimiento: 0,
        confianza_sentimiento: 0,
        intencion_comunicativa: 'informativo',  // Default para perfiles de noticias

        // Metadatos
        location: 'guatemala',
        raw_data: tweet
    };

    // Insertar en Supabase
    const { data, error } = await supabase
        .from('trending_tweets')
        .insert([tweetData])
        .select();

    if (error) {
        console.error(`   ❌ Error guardando tweet ${tweet.tweet_id}: ${error.message}`);
        return { saved: false, reason: 'error', error: error.message };
    }

    console.log(`   ✅ Tweet guardado: ${tweet.texto.substring(0, 50)}...`);
    return { saved: true, id: data[0]?.id };
}

/**
 * Procesa todos los perfiles de noticias
 */
async function processAllProfiles() {
    console.log('\n' + '='.repeat(60));
    console.log(`🗞️  FETCH SPECIFIC PROFILES - ${new Date().toISOString()}`);
    console.log('='.repeat(60));
    console.log(`📋 Perfiles a procesar: ${NEWS_PROFILES.join(', ')}`);
    console.log(`🔢 Límite por perfil: ${TWEETS_PER_PROFILE}`);
    console.log(`🌐 API: ${API_BASE_URL}`);
    console.log('');

    const stats = {
        profiles_processed: 0,
        total_tweets_fetched: 0,
        tweets_saved: 0,
        duplicates_skipped: 0,
        errors: 0
    };

    for (const profile of NEWS_PROFILES) {
        console.log(`\n📢 Procesando @${profile}...`);

        try {
            const tweets = await fetchProfileTweets(profile);
            stats.total_tweets_fetched += tweets.length;

            for (const tweet of tweets) {
                const result = await saveTweet(tweet, profile);

                if (result.saved) {
                    stats.tweets_saved++;
                } else if (result.reason === 'duplicate') {
                    stats.duplicates_skipped++;
                } else {
                    stats.errors++;
                }
            }

            stats.profiles_processed++;

            // Pequeña pausa entre perfiles para no sobrecargar
            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
            console.error(`❌ Error procesando @${profile}: ${error.message}`);
            stats.errors++;
        }
    }

    // Resumen final
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN');
    console.log('='.repeat(60));
    console.log(`✅ Perfiles procesados: ${stats.profiles_processed}/${NEWS_PROFILES.length}`);
    console.log(`📥 Tweets obtenidos: ${stats.total_tweets_fetched}`);
    console.log(`💾 Tweets guardados: ${stats.tweets_saved}`);
    console.log(`⏩ Duplicados saltados: ${stats.duplicates_skipped}`);
    console.log(`❌ Errores: ${stats.errors}`);
    console.log('='.repeat(60) + '\n');

    return stats;
}

// ============== EJECUCIÓN ==============

processAllProfiles()
    .then(stats => {
        console.log('✅ Proceso completado exitosamente');
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ Error fatal:', error);
        process.exit(1);
    });
