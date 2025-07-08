const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

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
  for (const { context, categoria } of categorias) {
    const res = await fetch(`${BASE_URL}/api/news?context=${context}`);
    const data = await res.json();
    for (const noticia of data.news) {
      // Evita duplicados por url y fecha
      if (await noticiaExiste(noticia.url, noticia.published_at)) continue;
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
        console.error('Error insertando noticia:', error);
      }
    }
  }
  console.log('Noticias guardadas en Supabase');
}

fetchAndStore(); 