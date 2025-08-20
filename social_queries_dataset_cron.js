/**
 * SOCIAL QUERIES DATASET CRON
 * Genera un dataset JSONL de ejemplos de consultas a redes sociales
 * a partir de tweets recientes en Supabase, siguiendo el estilo de vizta_openpipe_training.json
 */

import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

// Cargar variables de entorno
dotenv.config();

// CLI arguments
const argv = yargs(hideBin(process.argv))
  .option('days', {
    alias: 'd',
    type: 'number',
    default: 3,
    description: 'Días hacia atrás para leer tweets de Supabase'
  })
  .option('limit', {
    alias: 'l',
    type: 'number',
    default: 50,
    description: 'Máximo de ejemplos a generar (aprox. 1 por tweet)'
  })
  .option('out', {
    alias: 'o',
    type: 'string',
    default: path.resolve('social_queries_dataset.jsonl'),
    description: 'Ruta del archivo de salida JSONL'
  })
  .option('location', {
    alias: 'c',
    type: 'string',
    default: process.env.LOCATION || 'guatemala',
    description: 'Ubicación a usar en las queries de contexto'
  })
  .option('gemini', {
    type: 'boolean',
    default: false,
    description: 'Habilita análisis de una sola llamada con Gemini 2.5 Pro'
  })
  .option('gemini-out', {
    type: 'string',
    default: path.resolve('social_queries_gemini_summary.json'),
    description: 'Ruta del archivo de salida con el resumen de Gemini'
  })
  .option('gemini-model', {
    type: 'string',
    default: 'gemini-2.5-pro',
    description: 'Nombre del modelo de Gemini a usar'
  })
  .option('gemini-temperature', {
    type: 'number',
    default: 0.2,
    description: 'Temperatura para la generación de Gemini'
  })
  .option('gemini-max-tokens', {
    type: 'number',
    default: 1500,
    description: 'Límite de tokens de salida para Gemini'
  })
  .help()
  .argv;

// Configuración Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Prompt de sistema (igual al del set de entrenamiento existente)
const SYSTEM_PROMPT = `Eres Vizta, un asistente especializado en análisis político y social de Guatemala. Tienes acceso a las siguientes herramientas:\n\n- nitter_context: Para buscar tweets sobre TEMAS/PALABRAS CLAVE (no personas específicas)\n- nitter_profile: Para extraer posts de usuarios específicos de Twitter\n- perplexity_search: Para buscar INFORMACIÓN sobre personas, eventos o temas\n- search_political_context: Para buscar en tu memoria política (session: pulse-politics)\n- resolve_twitter_handle: Para encontrar handles de Twitter por nombre\n- user_projects: Para consultar proyectos del usuario\n- user_codex: Para buscar en documentos del usuario\n\nREGLAS IMPORTANTES:\n1. \"Extráeme información de X\" → usar perplexity_search\n2. \"Extráeme lo que dice X\" → si tiene @, usar nitter_profile directamente; si no tiene @, usar resolve_twitter_handle primero\n3. nitter_context SOLO para temas/palabras clave, NO para personas específicas\n4. Para cargos/posiciones: buscar primero en search_political_context, si no encuentra → perplexity_search\n5. Siempre usar \"guatemala\" como location en nitter_context`;

// Utilidades de extracción de señales desde el texto del tweet
function extractMentions(text) {
  const matches = text.match(/@[A-Za-z0-9_]{2,15}/g) || [];
  return Array.from(new Set(matches.map(m => m.replace(/^@/, ''))));
}

function extractHashtags(text) {
  const matches = text.match(/#([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_]+)/g) || [];
  return Array.from(new Set(matches.map(h => h.replace(/^#/, ''))));
}

function extractKeywordFallback(text) {
  const lower = text
    .toLowerCase()
    .replace(/[\n\r]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-záéíóúüñ0-9\s]/gi, ' ');
  const stop = new Set([
    'de','la','que','el','en','y','a','los','del','se','las','por','un','para','con','no','una','su','al','lo','como','más','pero','sus','le','ya','o','fue','este','ha','sí','porque','esta','son','entre','está','cuando','muy','sin','sobre','también','me','hasta','hay','donde','quien','desde','todo','nos','durante','todos','uno','les','ni','contra','otros','ese','eso','ante','ellos','e','esto','mí','antes','algunos','qué','unos','yo','otro','otras','otra','él','tanto','esa','estos','mucho','quienes','nada','muchos','cual','poco','ella','estar','estas','algunas','algo','nosotros','mi','mis','tú','te','ti','tu','tus','ellas','nosotras','vosostros','vosostras','os','mío','mía','míos','mías','tuyo','tuya','tuyos','tuyas','suyo','suya','suyos','suyas','nuestro','nuestra','nuestros','nuestras','vuestro','vuestra','vuestros','vuestras','esos','esas','estoy','estás','está','estamos','estáis','están','esté','estés','estemos','estéis','estén','estaré','estarás','estará','estaremos','estaréis','estarán','estaría','estarías','estaríamos','estaríais','estarían','estaba','estabas','estábamos','estabais','estaban','estuve','estuviste','estuvo','estuvimos','estuvisteis','estuvieron','estuviera','estuvieras','estuviéramos','estuvierais','estuvieran','estuviese','estuvieses','estuviésemos','estuvieseis','estuviesen','estando','estado','estada','estados','estadas','estad','guatemala','gt','rt'
  ]);
  const tokens = lower.split(/\s+/).filter(Boolean);
  const candidates = tokens.filter(t => !stop.has(t) && t.length >= 5);
  if (candidates.length === 0) return null;
  return candidates[0];
}

// Extraer posibles actores (nombres propios multi-palabra y siglas)
function extractAcronyms(text) {
  const tokens = (text || '').split(/\s+/);
  const raw = tokens.filter(t => /^[A-ZÁÉÍÓÚÜÑ]{2,}$/.test(t.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, '')))
    .map(t => t.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, ''));
  const ACRONYM_WHITELIST = new Set([
    'PNC','MP','SBS','TSE','SAT','IGSS','CC','CSJ','CICIG','FECI','UNE','VAMOS','SEMILLA','USAC','MINGOB','MINEDUC','MINFIN','MSPAS','BANGUAT','SP'
  ]);
  const filtered = raw.filter(a => ACRONYM_WHITELIST.has(a));
  return Array.from(new Set(filtered));
}

function extractYears(text) {
  const matches = text.match(/\b(19\d{2}|20\d{2})\b/g) || [];
  return Array.from(new Set(matches));
}

// Variantes simples para un término base: hashtag, sin espacios, con/sin tildes, comillas
function toAscii(s) {
  return (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function buildVariants(term) {
  const variants = new Set();
  const raw = term.trim();
  const ascii = toAscii(raw);
  variants.add(raw);
  variants.add(ascii);
  if (!raw.startsWith('#') && raw.split(/\s+/).length > 1) {
    variants.add(`#${raw.replace(/\s+/g, '')}`);
    variants.add(`#${ascii.replace(/\s+/g, '')}`);
    variants.add(`"${raw}"`);
  }
  return Array.from(variants);
}

// Léxicos de polaridad (genéricos, en español)
const LEX_INDIGNACION = [
  'justicia', 'impunidad', 'vergüenza nacional', 'pacto de corruptos',
  '#Justicia', '#NoMasCorrupcion', 'corrupción'
];
const LEX_DEFENSA = [
  'montaje', 'persecución política', 'acusaciones falsas', 'no fueron culpables',
  'lawfare'
];

function formatSince(days) {
  const d = new Date();
  d.setDate(d.getDate() - Math.max(1, Number(days) || 1));
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Constructores de ejemplos de entrenamiento
function buildNitterContextExample(topic, location) {
  const user = `¿Qué se dice sobre ${topic} en Twitter?`;
  const args = {
    q: `${topic} ${capitalize(location)} OR ${topic}`,
    location: location,
    limit: 25
  };
  return {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user },
      {
        role: 'assistant',
        content: 'Analizo lo que se comenta en redes sociales.',
        function_call: {
          name: 'nitter_context',
          arguments: JSON.stringify(args)
        }
      }
    ]
  };
}

// Construir ejemplo nitter_context MULTIPOLAR (OR ampliado + lang + since)
function buildMultipolarContextExample({
  baseTopics = [],
  actors = [],
  memory = [],
  polar = 'both', // 'indignation' | 'defense' | 'both' | 'none'
  location,
  days
}) {
  // Ensamblar bolsa de términos con variantes y límite para no exceder longitud
  const bag = new Set();
  const pushVariants = (t) => buildVariants(t).forEach(v => bag.add(v));

  baseTopics.slice(0, 4).forEach(pushVariants);
  actors.slice(0, 4).forEach(pushVariants);
  memory.slice(0, 4).forEach(pushVariants);

  if (polar === 'indignation' || polar === 'both') {
    LEX_INDIGNACION.slice(0, 4).forEach(pushVariants);
  }
  if (polar === 'defense' || polar === 'both') {
    LEX_DEFENSA.slice(0, 3).forEach(pushVariants);
  }

  // Limitar a ~14 elementos para evitar queries demasiado largas
  const items = Array.from(bag).slice(0, 14);
  const orGroup = items.join(' OR ');
  const since = formatSince(days || 3);
  const q = `(${orGroup}) lang:es since:${since}`;

  const user = `Analiza la conversación en Twitter sobre ${baseTopics[0] || 'el tema'} con todas las narrativas`;
  const args = { q, location, limit: 25 };
  return {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user },
      {
        role: 'assistant',
        content: 'Analizo conversaciones multipolares (pro/contra, memoria, actores, desvíos).',
        function_call: { name: 'nitter_context', arguments: JSON.stringify(args) }
      }
    ]
  };
}

// Construye múltiples ejemplos separados por aspecto (núcleo, memoria, actores, polaridades)
function buildSeparatedContextExamples({ baseTopics = [], actors = [], memory = [], polar = 'both', location, days }) {
  const since = formatSince(days || 3);
  const examples = [];

  const mk = (label, terms) => {
    if (!terms || terms.length === 0) return null;
    const variants = new Set();
    terms.slice(0, 6).forEach(t => buildVariants(t).forEach(v => variants.add(v)));
    const items = Array.from(variants).slice(0, 12);
    if (items.length === 0) return null;
    const q = `(${items.join(' OR ')}) lang:es since:${since}`;
    const user = `Búsqueda enfocada (${label}) sobre ${baseTopics[0] || 'el tema'} en Twitter`;
    const args = { q, location, limit: 25 };
    return {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
        { role: 'assistant', content: `Ejecuto query enfocada en ${label}.`, function_call: { name: 'nitter_context', arguments: JSON.stringify(args) } }
      ]
    };
  };

  // Núcleo
  const core = mk('núcleo del tema', baseTopics);
  if (core) examples.push(core);

  // Memoria (años/eventos)
  const mem = mk('memoria histórica', memory);
  if (mem) examples.push(mem);

  // Actores/acrónimos
  const act = mk('actores/siglas', actors);
  if (act) examples.push(act);

  // Polaridades
  if (polar === 'indignation' || polar === 'both') {
    const ind = mk('indignación/activismo', LEX_INDIGNACION);
    if (ind) examples.push(ind);
  }
  if (polar === 'defense' || polar === 'both') {
    const def = mk('defensa/relativización', LEX_DEFENSA);
    if (def) examples.push(def);
  }

  return examples;
}

function buildNitterProfileExample(handle) {
  const user = `Extráeme lo que dice @${handle}`;
  const args = { username: handle, limit: 15, include_retweets: false };
  return {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user },
      {
        role: 'assistant',
        content: `Te extraigo los posts recientes de @${handle}.`,
        function_call: {
          name: 'nitter_profile',
          arguments: JSON.stringify(args)
        }
      }
    ]
  };
}

function buildResolveHandleExample(name) {
  const user = `Extráeme lo que dice ${name} en redes`;
  const args = { name: name, context: 'Guatemala', sector: 'política' };
  return {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user },
      {
        role: 'assistant',
        content: `Te extraigo lo que dice ${name} en redes. Primero busco su handle de Twitter.`,
        function_call: {
          name: 'resolve_twitter_handle',
          arguments: JSON.stringify(args)
        }
      }
    ]
  };
}

function buildPerplexityInfoExample(name) {
  const user = `Extráeme información de ${name}`;
  const args = { query: `${name} Guatemala información reciente 2024`, location: 'Guatemala', focus: 'política' };
  return {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user },
      {
        role: 'assistant',
        content: `Te busco información actualizada sobre ${name}.`,
        function_call: {
          name: 'perplexity_search',
          arguments: JSON.stringify(args)
        }
      }
    ]
  };
}

// Heurística simple para detectar posibles nombres propios multi-palabra
function extractPossiblePersonName(text) {
  const pattern = /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\b/g;
  const matches = [];
  let m;
  while ((m = pattern.exec(text)) !== null) {
    matches.push(`${m[1]} ${m[2]}`);
  }
  return matches.length > 0 ? matches[0] : null;
}

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function countMapIncrement(map, key) {
  if (!key) return;
  const current = map.get(key) || 0;
  map.set(key, current + 1);
}

function topEntries(map, topN = 10) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([value, count]) => ({ value, count }));
}

// Obtiene tweets de Supabase
async function getTweetsFromSupabase(days, limit) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const { data, error } = await supabase
    .from('trending_tweets')
    .select('*')
    .gte('fecha_captura', startDate.toISOString())
    .order('fecha_captura', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Error obteniendo tweets: ${error.message}`);
  return data || [];
}

// Genera ejemplos desde un tweet
function generateExamplesFromTweet(tweet, options) {
  const text = tweet.texto || '';
  const examples = [];

  const mentions = extractMentions(text);
  if (mentions.length > 0) {
    examples.push(buildNitterProfileExample(mentions[0]));
  }

  const hashtags = extractHashtags(text);
  if (hashtags.length > 0) {
    // Generar queries separadas: núcleo + memoria + actores + polaridades
    const actors = extractAcronyms(text);
    const years = extractYears(text);
    const baseTopics = [hashtags[0]].concat(hashtags.slice(1, 2));
    const memory = years;
    const polar = 'both';
    const separated = buildSeparatedContextExamples({ baseTopics, actors, memory, polar, location: options.location, days: options.days });
    // Limitar a 3 ejemplos por tweet para controlar tamaño
    examples.push(...separated.slice(0, 3));
  } else {
    const keyword = extractKeywordFallback(text);
    if (keyword) {
      const actors = extractAcronyms(text);
      const years = extractYears(text);
      const baseTopics = [keyword];
      const memory = years.slice(0, 2);
      const polar = 'both';
      const separated = buildSeparatedContextExamples({ baseTopics, actors, memory, polar, location: options.location, days: options.days });
      examples.push(...separated.slice(0, 3));
    }
  }

  const person = extractPossiblePersonName(text);
  if (person && (!mentions || mentions.length === 0)) {
    // Alternar entre info y handle
    if (Math.random() < 0.5) {
      examples.push(buildPerplexityInfoExample(person));
    } else {
      examples.push(buildResolveHandleExample(person));
    }
  }

  return examples;
}

function aggregateSignals(tweets) {
  const mentionCounts = new Map();
  const hashtagCounts = new Map();
  const keywordCounts = new Map();
  const toolTypeCounts = new Map();

  for (const tweet of tweets) {
    const text = (tweet.texto || '').trim();
    const mentions = extractMentions(text);
    const hashtags = extractHashtags(text);
    const keyword = extractKeywordFallback(text);
    const person = extractPossiblePersonName(text);

    if (mentions.length > 0) {
      countMapIncrement(toolTypeCounts, 'nitter_profile');
      for (const m of mentions) countMapIncrement(mentionCounts, m.toLowerCase());
    }

    if (hashtags.length > 0) {
      countMapIncrement(toolTypeCounts, 'nitter_context');
      for (const h of hashtags) countMapIncrement(hashtagCounts, h.toLowerCase());
    } else if (keyword) {
      countMapIncrement(toolTypeCounts, 'nitter_context');
      countMapIncrement(keywordCounts, keyword.toLowerCase());
    }

    if (person && mentions.length === 0) {
      // sin @ → resolución o info
      countMapIncrement(toolTypeCounts, 'resolve_or_info');
    }
  }

  return {
    totalTweets: tweets.length,
    topMentions: topEntries(mentionCounts),
    topHashtags: topEntries(hashtagCounts),
    topKeywords: topEntries(keywordCounts),
    toolMix: topEntries(toolTypeCounts)
  };
}

async function analyzeWithGeminiOnce(aggregate, sampleTweets, options) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY no está configurado');
  }

  const prompt = `Eres un analista de patrones de consultas en redes sociales de Guatemala.\n\nResumen de señales observadas (derivadas de tweets recientes):\n- Total de tweets: ${aggregate.totalTweets}\n- Top @menciones (conteo): ${aggregate.topMentions.map(m => `${m.value}:${m.count}`).join(', ') || 'N/A'}\n- Top #hashtags (conteo): ${aggregate.topHashtags.map(h => `${h.value}:${h.count}`).join(', ') || 'N/A'}\n- Top palabras clave (conteo): ${aggregate.topKeywords.map(k => `${k.value}:${k.count}`).join(', ') || 'N/A'}\n- Mezcla/uso de herramientas inferido: ${aggregate.toolMix.map(t => `${t.value}:${t.count}`).join(', ') || 'N/A'}\n\nMuestra de textos (máx 10):\n${sampleTweets.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\nTarea: Produce UN SOLO JSON que razone sobre lo observado y proponga cómo entrenar un asistente para decidir herramienta y construir queries. Formato estricto:\n{\n  \"top_topics\": [{\"topic\": string, \"weight\": number, \"evidence\": [string]}],\n  \"query_templates\": [string],\n  \"tool_selection_rules\": [string],\n  \"anomalies\": [string],\n  \"reasoning_summary\": string\n}\n\nReglas: No inventes datos. Basarte en señales y muestra. Mantén JSON válido.`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: argv['gemini-temperature'],
      maxOutputTokens: argv['gemini-max-tokens']
    }
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${argv['gemini-model']}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    throw new Error(`Gemini API error: ${resp.status} ${resp.statusText}`);
  }
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { raw: text };
  }
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { raw: text };
  }
}

async function main() {
  const start = Date.now();
  console.log(`🚀 [DATASET CRON] Generando dataset JSONL de consultas sociales`);
  console.log(`⚙️ [CONFIG] Días: ${argv.days}, Límite: ${argv.limit}, Out: ${argv.out}`);

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_KEY en el entorno');
  }

  const tweets = await getTweetsFromSupabase(argv.days, Math.max(argv.limit, 50));
  console.log(`📊 Tweets obtenidos: ${tweets.length}`);

  const outPath = argv.out;
  // Asegurar que el directorio de salida exista si el usuario pasó una ruta con carpetas
  try {
    const outDir = path.dirname(outPath);
    if (outDir && outDir !== '.' && outDir !== '/') {
      fs.mkdirSync(outDir, { recursive: true });
    }
  } catch (e) {
    console.warn(`⚠️ No se pudo crear el directorio de salida: ${e.message}`);
  }
  const outStream = fs.createWriteStream(outPath, { flags: 'w' });

  let exampleCount = 0;
  for (const tweet of tweets) {
    if (exampleCount >= argv.limit) break;
    const examples = generateExamplesFromTweet(tweet, { location: argv.location, days: argv.days });
    for (const ex of examples) {
      if (exampleCount >= argv.limit) break;
      outStream.write(JSON.stringify(ex) + '\n');
      exampleCount++;
    }
  }

  outStream.end();
  const durationSec = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`✅ Dataset creado: ${outPath}`);
  console.log(`🧾 Ejemplos escritos: ${exampleCount} en ${durationSec}s`);

  // Llamada única a Gemini (opcional)
  if (argv.gemini) {
    console.log('🧠 Ejecutando análisis único con Gemini...');
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY no configurada para análisis Gemini');
    }
    const aggregate = aggregateSignals(tweets);
    const sampleTexts = tweets
      .slice(0, 10)
      .map(t => (t.texto || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const geminiSummary = await analyzeWithGeminiOnce(aggregate, sampleTexts, {});
    const geminiOut = argv['gemini-out'];
    // Asegurar directorio para salida de Gemini
    try {
      const geminiDir = path.dirname(geminiOut);
      if (geminiDir && geminiDir !== '.' && geminiDir !== '/') {
        fs.mkdirSync(geminiDir, { recursive: true });
      }
    } catch (e) {
      console.warn(`⚠️ No se pudo crear el directorio para Gemini: ${e.message}`);
    }
    fs.writeFileSync(geminiOut, JSON.stringify(geminiSummary, null, 2));
    console.log(`📝 Resumen Gemini escrito en: ${geminiOut}`);
  }
}

main().catch(err => {
  console.error('💥 Error:', err.message);
  process.exit(1);
});

