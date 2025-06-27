#!/usr/bin/env node
/**
 * Test script for Events Fetch and Store
 * Tests the integration between ExtractorT and Supabase for events
 */

const { 
  fetchAndStoreEvents, 
  obtenerEventosDeExtractorT, 
  normalizarEvento, 
  eventoExiste 
} = require('./fetch_and_store_events');

const { createClient } = require('@supabase/supabase-js');

// Configuración de Supabase
const SUPABASE_URL = 'https://qqshdccpmypelhmyqnut.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxc2hkY2NwbXlwZWxobXlxbnV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjAzNjcxMSwiZXhwIjoyMDYxNjEyNzExfQ.BaJ_z3Gp2pUnmYEDpfNTCIxpHloSjmxi43aKwm-93ZI';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Prueba la conectividad con ExtractorT
 */
async function testExtractorTConnectivity() {
  console.log('🧪 Probando conectividad con ExtractorT...');
  
  try {
    const fetch = require('node-fetch');
    const testUrl = 'https://api.standatpd.com/api/publicevents/test';
    
    const response = await fetch(testUrl, {
      timeout: 10000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ ExtractorT está funcionando correctamente');
      console.log(`   Endpoint: ${data.endpoint}`);
      console.log(`   Versión: ${data.version}`);
      return true;
    } else {
      throw new Error('ExtractorT respondió pero con error');
    }
    
  } catch (error) {
    console.error('❌ Error conectando con ExtractorT:', error.message);
    console.log('💡 Asegúrate de que ExtractorT esté ejecutándose en puerto 8000');
    return false;
  }
}

/**
 * Prueba la conectividad con Supabase
 */
async function testSupabaseConnectivity() {
  console.log('\n🧪 Probando conectividad con Supabase...');
  
  try {
    // Verificar si la tabla existe
    const { data, error } = await supabase
      .from('public_events')
      .select('id')
      .limit(1);
    
    if (error) {
      throw error;
    }
    
    console.log('✅ Supabase está funcionando correctamente');
    console.log(`   Tabla public_events existe y es accesible`);
    return true;
    
  } catch (error) {
    console.error('❌ Error conectando con Supabase:', error.message);
    
    if (error.message.includes('relation "public_events" does not exist')) {
      console.log('💡 La tabla public_events no existe. Ejecuta create_public_events_table.sql primero');
    }
    
    return false;
  }
}

/**
 * Prueba la obtención de eventos desde ExtractorT
 */
async function testEventsFetching() {
  console.log('\n🧪 Probando obtención de eventos desde ExtractorT...');
  
  try {
    // Probar obtener eventos sin filtros
    const eventos = await obtenerEventosDeExtractorT(null, null, 5);
    
    console.log(`✅ Obtenidos ${eventos.length} eventos de prueba`);
    
    if (eventos.length > 0) {
      const eventoEjemplo = eventos[0];
      console.log('\n📋 Ejemplo de evento obtenido:');
      console.log(`   Título: ${eventoEjemplo.title || 'N/A'}`);
      console.log(`   Categoría: ${eventoEjemplo.category || 'N/A'}`);
      console.log(`   Fecha: ${eventoEjemplo.date || 'N/A'}`);
      console.log(`   Fuente: ${eventoEjemplo.source || 'N/A'}`);
      console.log(`   URL: ${eventoEjemplo.url || 'N/A'}`);
      
      // Probar normalización
      const eventoNormalizado = normalizarEvento(eventoEjemplo);
      console.log('\n🔄 Evento normalizado para Supabase:');
      console.log(`   Título: ${eventoNormalizado.titulo}`);
      console.log(`   Categoría: ${eventoNormalizado.categoria}`);
      console.log(`   Fecha evento: ${eventoNormalizado.fecha_evento}`);
      console.log(`   Ubicación: ${eventoNormalizado.ubicacion}`);
    }
    
    return eventos.length > 0;
    
  } catch (error) {
    console.error('❌ Error obteniendo eventos:', error.message);
    return false;
  }
}

/**
 * Prueba el almacenamiento en Supabase
 */
async function testEventStorage() {
  console.log('\n🧪 Probando almacenamiento en Supabase...');
  
  try {
    // Crear un evento de prueba
    const eventoTest = {
      titulo: 'Evento de Prueba - Test Script',
      descripcion: 'Este es un evento de prueba creado por el script de testing',
      categoria: 'Tecnología',
      fecha_evento: '2025-12-31',
      ubicacion: 'Guatemala City, Guatemala',
      fuente: 'test_script',
      url: `https://test.example.com/evento-${Date.now()}`,
      precio: 'Gratis',
      organizador: 'Test Script',
      tipo_evento: 'Virtual',
      estado: 'Activo',
      raw: { test: true, timestamp: Date.now() }
    };
    
    // Insertar evento de prueba
    const { data, error } = await supabase
      .from('public_events')
      .insert(eventoTest)
      .select('id, titulo, categoria');
    
    if (error) {
      throw error;
    }
    
    console.log('✅ Evento de prueba almacenado exitosamente');
    console.log(`   ID: ${data[0].id}`);
    console.log(`   Título: ${data[0].titulo}`);
    console.log(`   Categoría: ${data[0].categoria}`);
    
    // Limpiar evento de prueba
    await supabase
      .from('public_events')
      .delete()
      .eq('id', data[0].id);
    
    console.log('🧹 Evento de prueba eliminado');
    
    return true;
    
  } catch (error) {
    console.error('❌ Error almacenando evento:', error.message);
    return false;
  }
}

/**
 * Prueba las vistas de la base de datos
 */
async function testDatabaseViews() {
  console.log('\n🧪 Probando vistas de la base de datos...');
  
  try {
    // Probar vista upcoming_events
    const { data: upcomingEvents, error: upcomingError } = await supabase
      .from('upcoming_events')
      .select('*')
      .limit(5);
    
    if (upcomingError) {
      throw new Error(`Error en upcoming_events: ${upcomingError.message}`);
    }
    
    console.log(`✅ Vista upcoming_events: ${upcomingEvents.length} eventos próximos`);
    
    // Probar vista events_by_category
    const { data: categoryStats, error: categoryError } = await supabase
      .from('events_by_category')
      .select('*');
    
    if (categoryError) {
      throw new Error(`Error en events_by_category: ${categoryError.message}`);
    }
    
    console.log(`✅ Vista events_by_category: ${categoryStats.length} categorías`);
    
    if (categoryStats.length > 0) {
      console.log('\n📊 Estadísticas por categoría:');
      categoryStats.forEach(stat => {
        console.log(`   ${stat.categoria}: ${stat.total_events} total, ${stat.upcoming_events} próximos`);
      });
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Error probando vistas:', error.message);
    return false;
  }
}

/**
 * Ejecuta una prueba completa del sistema
 */
async function runFullTest() {
  console.log('\n🧪 Ejecutando prueba completa del sistema...');
  
  try {
    console.log('⚠️  ADVERTENCIA: Esta prueba ejecutará el proceso completo de fetch and store');
    console.log('   Esto puede tomar varios minutos y agregará eventos reales a la base de datos');
    
    // Confirmar antes de continuar
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const continuar = await new Promise(resolve => {
      rl.question('¿Continuar con la prueba completa? (y/N): ', answer => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
    
    if (!continuar) {
      console.log('❌ Prueba completa cancelada por el usuario');
      return false;
    }
    
    // Ejecutar fetch and store completo
    await fetchAndStoreEvents();
    
    console.log('✅ Prueba completa ejecutada exitosamente');
    return true;
    
  } catch (error) {
    console.error('❌ Error en prueba completa:', error.message);
    return false;
  }
}

/**
 * Función principal de testing
 */
async function main() {
  console.log('🚀 Iniciando pruebas del sistema de eventos');
  console.log('=' * 60);
  
  const resultados = {
    extractorT: false,
    supabase: false,
    fetching: false,
    storage: false,
    views: false,
    fullTest: false
  };
  
  try {
    // Ejecutar pruebas básicas
    resultados.extractorT = await testExtractorTConnectivity();
    resultados.supabase = await testSupabaseConnectivity();
    
    if (resultados.extractorT && resultados.supabase) {
      resultados.fetching = await testEventsFetching();
      resultados.storage = await testEventStorage();
      resultados.views = await testDatabaseViews();
      
      // Preguntar si ejecutar prueba completa
      if (process.argv.includes('--full')) {
        resultados.fullTest = await runFullTest();
      }
    }
    
    // Mostrar resumen
    console.log('\n📊 RESUMEN DE PRUEBAS');
    console.log('=' * 40);
    console.log(`ExtractorT Conectividad: ${resultados.extractorT ? '✅' : '❌'}`);
    console.log(`Supabase Conectividad: ${resultados.supabase ? '✅' : '❌'}`);
    console.log(`Obtención de Eventos: ${resultados.fetching ? '✅' : '❌'}`);
    console.log(`Almacenamiento: ${resultados.storage ? '✅' : '❌'}`);
    console.log(`Vistas de DB: ${resultados.views ? '✅' : '❌'}`);
    console.log(`Prueba Completa: ${resultados.fullTest ? '✅' : '⏭️ '}`);
    
    const exitosTotal = Object.values(resultados).filter(Boolean).length;
    const pruebasTotal = Object.keys(resultados).length - (resultados.fullTest ? 0 : 1);
    
    console.log(`\nResultado: ${exitosTotal}/${pruebasTotal} pruebas exitosas`);
    
    if (exitosTotal === pruebasTotal) {
      console.log('🎉 ¡Todas las pruebas pasaron! El sistema está listo para producción.');
    } else {
      console.log('⚠️  Algunas pruebas fallaron. Revisa los errores arriba.');
    }
    
  } catch (error) {
    console.error('❌ Error en las pruebas:', error.message);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('❌ Error fatal:', error.message);
      process.exit(1);
    });
}

module.exports = {
  testExtractorTConnectivity,
  testSupabaseConnectivity,
  testEventsFetching,
  testEventStorage,
  testDatabaseViews,
  runFullTest
}; 