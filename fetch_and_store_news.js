import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

// Configura tus credenciales de Supabase
const SUPABASE_URL = 'https://TU_SUPABASE_URL.supabase.co';
const SUPABASE_KEY = 'TU_SUPABASE_SERVICE_ROLE_KEY'; // Usa la service role key
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const categorias = [
  { context: 'politica', categoria: 'Política' },
  { context: 'finanzas', categoria: 'Económica' },
  { context: 'sociedad', categoria: 'Sociales' }
];

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
    const res = await fetch(`https://api.standatpd.com/news?context=${context}`);
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