const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

// Configura tus credenciales de Supabase
const SUPABASE_URL = 'https://qqshdccpmypelhmyqnut.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxc2hkY2NwbXlwZWxobXlxbnV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjAzNjcxMSwiZXhwIjoyMDYxNjEyNzExfQ.BaJ_z3Gp2pUnmYEDpfNTCIxpHloSjmxi43aKwm-93ZI'; // Usa la service role key
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// URL del ExtractorT Events API (VPS)
const EXTRACTORT_API_URL = 'https://api.standatpd.com/api/publicevents';

// Configuración de categorías y fuentes
const configuracion = {
  fuentes: [
    { source: 'guatemala_com', descripcion: 'Guatemala.com Events' },
    { source: 'eventbrite_guatemala', descripcion: 'Eventbrite Guatemala' },
    { source: 'eticket_guatemala', descripcion: 'eTicket Guatemala' }
  ],
  categorias: [
    'Música', 'Deportes', 'Cultura', 'Educación', 
    'Gastronomía', 'Tecnología', 'Negocios', 
    'Entretenimiento', 'General'
  ],
  limite_por_fuente: 20,
  limite_total: 50
};

/**
 * Verifica si un evento ya existe en la base de datos
 * @param {string} url - URL del evento
 * @param {string} fecha_evento - Fecha del evento
 * @returns {boolean} - True si el evento ya existe
 */
async function eventoExiste(url, fecha_evento) {
  if (!url) return false;
  
  try {
    const { data, error } = await supabase
      .from('public_events')
      .select('id')
      .eq('url', url)
      .eq('fecha_evento', fecha_evento)
      .maybeSingle();
    
    if (error) {
      console.error('Error verificando evento existente:', error);
      return false;
    }
    
    return !!data;
  } catch (error) {
    console.error('Error en eventoExiste:', error);
    return false;
  }
}

/**
 * Normaliza los datos del evento para almacenamiento en Supabase
 * @param {Object} evento - Datos del evento desde ExtractorT
 * @returns {Object} - Evento normalizado para Supabase
 */
function normalizarEvento(evento) {
  return {
    titulo: evento.title || 'Sin título',
    descripcion: evento.description || null,
    categoria: evento.category || 'General',
    fecha_evento: evento.date || null,
    ubicacion: evento.location || null,
    fuente: evento.source || 'unknown',
    url: evento.url || null,
    precio: null, // ExtractorT no extrae precio por ahora
    organizador: null, // ExtractorT no extrae organizador por ahora
    tipo_evento: 'Presencial', // Default
    estado: 'Activo', // Default
    raw: evento // Guardar datos originales completos
  };
}

/**
 * Obtiene eventos de ExtractorT API
 * @param {string} source - Fuente específica (opcional)
 * @param {string} category - Categoría específica (opcional)
 * @param {number} limit - Límite de eventos
 * @returns {Array} - Array de eventos
 */
async function obtenerEventosDeExtractorT(source = null, category = null, limit = 50) {
  try {
    // Construir URL con parámetros
    const params = new URLSearchParams();
    if (source) params.append('source', source);
    if (category) params.append('category', category);
    params.append('limit', limit.toString());
    
    const url = `${EXTRACTORT_API_URL}?${params.toString()}`;
    
    console.log(`🔍 Obteniendo eventos de: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'NewsCron-EventsFetcher/1.0'
      },
      timeout: 30000 // 30 segundos timeout
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(`API Error: ${data.error || 'Unknown error'}`);
    }
    
    console.log(`✅ Obtenidos ${data.events.length} eventos de ExtractorT`);
    return data.events || [];
    
  } catch (error) {
    console.error(`❌ Error obteniendo eventos de ExtractorT:`, error.message);
    return [];
  }
}

/**
 * Almacena un evento en Supabase
 * @param {Object} evento - Evento normalizado
 * @returns {boolean} - True si se almacenó exitosamente
 */
async function almacenarEvento(evento) {
  try {
    const { data, error } = await supabase
      .from('public_events')
      .insert(evento)
      .select('id, titulo');
    
    if (error) {
      // Si es error de duplicado, no es crítico
      if (error.code === '23505') { // unique_violation
        console.log(`⚠️  Evento duplicado (saltando): ${evento.titulo}`);
        return false;
      }
      throw error;
    }
    
    console.log(`✅ Evento almacenado: ${evento.titulo} (ID: ${data[0]?.id})`);
    return true;
    
  } catch (error) {
    console.error(`❌ Error almacenando evento "${evento.titulo}":`, error.message);
    return false;
  }
}

/**
 * Procesa y almacena eventos por fuente
 * @param {string} source - Fuente a procesar
 * @returns {Object} - Estadísticas del procesamiento
 */
async function procesarEventosPorFuente(source) {
  console.log(`\n📡 Procesando fuente: ${source}`);
  
  const stats = {
    fuente: source,
    obtenidos: 0,
    nuevos: 0,
    duplicados: 0,
    errores: 0
  };
  
  try {
    // Obtener eventos de esta fuente
    const eventos = await obtenerEventosDeExtractorT(source, null, configuracion.limite_por_fuente);
    stats.obtenidos = eventos.length;
    
    if (eventos.length === 0) {
      console.log(`⚠️  No se encontraron eventos para ${source}`);
      return stats;
    }
    
    // Procesar cada evento
    for (const evento of eventos) {
      try {
        // Verificar si ya existe
        const existe = await eventoExiste(evento.url, evento.date);
        
        if (existe) {
          stats.duplicados++;
          continue;
        }
        
        // Normalizar y almacenar
        const eventoNormalizado = normalizarEvento(evento);
        const almacenado = await almacenarEvento(eventoNormalizado);
        
        if (almacenado) {
          stats.nuevos++;
        } else {
          stats.errores++;
        }
        
        // Pequeña pausa para no sobrecargar la DB
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ Error procesando evento individual:`, error.message);
        stats.errores++;
      }
    }
    
  } catch (error) {
    console.error(`❌ Error procesando fuente ${source}:`, error.message);
    stats.errores++;
  }
  
  return stats;
}

/**
 * Función principal para obtener y almacenar eventos
 */
async function fetchAndStoreEvents() {
  console.log('🎉 Iniciando fetch and store de eventos públicos');
  console.log('=' * 60);
  
  const inicioTiempo = Date.now();
  const estadisticasGlobales = {
    fuentes_procesadas: 0,
    total_obtenidos: 0,
    total_nuevos: 0,
    total_duplicados: 0,
    total_errores: 0,
    tiempo_ejecucion: 0
  };
  
  try {
    // Verificar conectividad con ExtractorT
    console.log('🔍 Verificando conectividad con ExtractorT...');
    const testResponse = await fetch(`${EXTRACTORT_API_URL}/test`, { timeout: 10000 });
    
    if (!testResponse.ok) {
      throw new Error(`ExtractorT no disponible: ${testResponse.status}`);
    }
    
    console.log('✅ ExtractorT disponible');
    
    // Procesar cada fuente
    for (const { source, descripcion } of configuracion.fuentes) {
      try {
        const stats = await procesarEventosPorFuente(source);
        
        // Acumular estadísticas
        estadisticasGlobales.fuentes_procesadas++;
        estadisticasGlobales.total_obtenidos += stats.obtenidos;
        estadisticasGlobales.total_nuevos += stats.nuevos;
        estadisticasGlobales.total_duplicados += stats.duplicados;
        estadisticasGlobales.total_errores += stats.errores;
        
        console.log(`📊 ${source}: ${stats.nuevos} nuevos, ${stats.duplicados} duplicados, ${stats.errores} errores`);
        
        // Pausa entre fuentes
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`❌ Error procesando fuente ${source}:`, error.message);
        estadisticasGlobales.total_errores++;
      }
    }
    
    // Calcular tiempo de ejecución
    estadisticasGlobales.tiempo_ejecucion = Math.round((Date.now() - inicioTiempo) / 1000);
    
    // Mostrar resumen final
    console.log('\n📊 RESUMEN FINAL');
    console.log('=' * 40);
    console.log(`Fuentes procesadas: ${estadisticasGlobales.fuentes_procesadas}`);
    console.log(`Eventos obtenidos: ${estadisticasGlobales.total_obtenidos}`);
    console.log(`Eventos nuevos: ${estadisticasGlobales.total_nuevos}`);
    console.log(`Eventos duplicados: ${estadisticasGlobales.total_duplicados}`);
    console.log(`Errores: ${estadisticasGlobales.total_errores}`);
    console.log(`Tiempo de ejecución: ${estadisticasGlobales.tiempo_ejecucion}s`);
    
    // Obtener estadísticas de la base de datos
    const { data: dbStats, error: dbError } = await supabase
      .from('events_by_category')
      .select('*');
    
    if (!dbError && dbStats) {
      console.log('\n📈 ESTADÍSTICAS POR CATEGORÍA');
      console.log('=' * 40);
      dbStats.forEach(stat => {
        console.log(`${stat.categoria}: ${stat.total_events} total (${stat.upcoming_events} próximos)`);
      });
    }
    
    console.log('\n🎉 Eventos guardados en Supabase exitosamente');
    
  } catch (error) {
    console.error('❌ Error en fetchAndStoreEvents:', error.message);
    process.exit(1);
  }
}

/**
 * Función para limpiar eventos antiguos (opcional)
 * @param {number} diasAtras - Días hacia atrás para mantener eventos
 */
async function limpiarEventosAntiguos(diasAtras = 30) {
  try {
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - diasAtras);
    
    const { data, error } = await supabase
      .from('public_events')
      .delete()
      .lt('fecha_evento', fechaLimite.toISOString().split('T')[0])
      .eq('estado', 'Finalizado');
    
    if (error) throw error;
    
    console.log(`🧹 Limpiados eventos antiguos (más de ${diasAtras} días)`);
    
  } catch (error) {
    console.error('❌ Error limpiando eventos antiguos:', error.message);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  fetchAndStoreEvents()
    .then(() => {
      console.log('✅ Proceso completado exitosamente');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Proceso falló:', error.message);
      process.exit(1);
    });
}

module.exports = {
  fetchAndStoreEvents,
  limpiarEventosAntiguos,
  obtenerEventosDeExtractorT,
  normalizarEvento,
  eventoExiste
}; 