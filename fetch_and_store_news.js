import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import { SystemLogger } from './system_logger.js';

// Configura tus credenciales de Supabase
const SUPABASE_URL = 'https://qqshdccpmypelhmyqnut.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxc2hkY2NwbXlwZWxobXlxbnV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjAzNjcxMSwiZXhwIjoyMDYxNjEyNzExfQ.BaJ_z3Gp2pUnmYEDpfNTCIxpHloSjmxi43aKwm-93ZI'; // Usa la service role key
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const categorias = [
  { context: 'politica', categoria: 'Política' },
  { context: 'finanzas', categoria: 'Económica' },
  { context: 'sociedad', categoria: 'Sociales' }
];

const BASE_URL = process.env.NEWS_API_BASE_URL || 'https://api.standatpd.com';

// Inicializar logger global
const systemLogger = new SystemLogger();

async function noticiaExiste(url, fecha) {
  if (!url) return false;
  const { data, error } = await supabase
    .from('news')
    .select('id')
    .eq('url', url)
    .eq('fecha', fecha)
    .maybeSingle();
  return !!data;
}

async function fetchAndStore() {
  // Inicializar logging de ejecución
  const executionId = await systemLogger.startExecution('fetch_and_store_news', {
    base_url: BASE_URL,
    categories_to_process: categorias.map(c => c.context).join(', ')
  });

  try {
    let totalNewsProcessed = 0;
    let totalNewsSaved = 0;
    let totalNewsSkipped = 0;

    systemLogger.logProgress('Iniciando procesamiento de noticias por categorías...');

    for (const { context, categoria } of categorias) {
      systemLogger.logProgress(`Procesando categoría: ${categoria} (context: ${context})`);
      
      try {
        const res = await fetch(`${BASE_URL}/api/news?context=${context}`);
        
        if (!res.ok) {
          systemLogger.addWarning(`API respondió con status ${res.status} para categoría ${categoria}`, 'API_REQUEST');
          continue;
        }
        
        const data = await res.json();
        const newsCount = data.news?.length || 0;
        totalNewsProcessed += newsCount;
        
        systemLogger.logProgress(`${newsCount} noticias encontradas para ${categoria}`);

        for (const noticia of data.news || []) {
          // Evita duplicados por url y fecha
          if (await noticiaExiste(noticia.url, noticia.published_at)) {
            totalNewsSkipped++;
            continue;
          }
          
          const { error } = await supabase.from('news').insert({
            categoria,
            titulo: noticia.title,
            resumen: noticia.summary,
            fuente: noticia.source,
            url: noticia.url,
            fecha: noticia.published_at,
            raw: noticia
          });
          
          if (error) {
            systemLogger.addError(error, `Insertando noticia: ${noticia.title}`);
            console.error('Error insertando noticia:', error);
          } else {
            totalNewsSaved++;
          }
        }
        
        systemLogger.logSuccess(`Categoría ${categoria} completada`);
        
      } catch (categoryError) {
        systemLogger.addError(categoryError, `Procesando categoría ${categoria}`);
        console.error(`Error procesando categoría ${categoria}:`, categoryError);
      }
    }

    // Actualizar métricas finales
    systemLogger.setMetric('news_processed', totalNewsProcessed);
    systemLogger.setMetric('news_saved', totalNewsSaved);
    systemLogger.setMetric('news_skipped', totalNewsSkipped);

    // Finalizar ejecución exitosa
    await systemLogger.finishExecution('completed', {
      total_news_processed: totalNewsProcessed,
      total_news_saved: totalNewsSaved,
      total_news_skipped: totalNewsSkipped,
      final_summary: `${totalNewsSaved} noticias nuevas guardadas de ${totalNewsProcessed} procesadas`
    });

    console.log(`✅ Proceso completado: ${totalNewsSaved} noticias nuevas guardadas de ${totalNewsProcessed} procesadas`);
    console.log(`📊 ${totalNewsSkipped} noticias ya existían (duplicados omitidos)`);

  } catch (error) {
    systemLogger.addError(error, 'Proceso principal de noticias');
    await systemLogger.finishExecution('failed', {
      error_summary: error.message
    });
    console.error('Error en fetchAndStore:', error);
    throw error;
  }
}

// Si el archivo es ejecutado directamente, correr la función
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 Ejecutando procesamiento de noticias...');
  console.log('🕐 Inicio:', new Date().toLocaleString());
  console.log('📍 Categorías a procesar:', categorias.map(c => c.categoria).join(', '));
  console.log('=' * 60);
  
  fetchAndStore()
    .then(() => {
      console.log('\n' + '=' * 60);
      console.log('🏁 EJECUCIÓN FINALIZADA');
      console.log('🕐 Fin:', new Date().toLocaleString());
      process.exit(0);
    })
    .catch(error => {
      console.error('\n' + '=' * 60);
      console.error('💥 ERROR CRÍTICO EN EJECUCIÓN:');
      console.error(error);
      console.log('🕐 Fin con error:', new Date().toLocaleString());
      process.exit(1);
    });
}

export { fetchAndStore }; 