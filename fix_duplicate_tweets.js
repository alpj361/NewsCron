#!/usr/bin/env node

/**
 * Script para identificar y manejar tweets duplicados en la base de datos
 * Consolida registros duplicados manteniendo el más reciente y con mejor análisis
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Configuración de Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qqshdccpmypelhmyqnut.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxc2hkY2NwbXlwZWxobXlxbnV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjAzNjcxMSwiZXhwIjoyMDYxNjEyNzExfQ.BaJ_z3Gp2pUnmYEDpfNTCIxpHloSjmxi43aKwm-93ZI';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Encuentra tweets duplicados agrupados por tweet_id
 */
async function findDuplicates() {
  console.log('🔍 Buscando tweets duplicados...');
  
  const { data, error } = await supabase
    .rpc('find_duplicate_tweets');
  
  if (error) {
    // Si la función no existe, usar query manual
    console.log('Función RPC no encontrada, usando query manual...');
    
    const { data: manualData, error: manualError } = await supabase
      .from('trending_tweets')
      .select('tweet_id, count(*)')
      .group('tweet_id')
      .having('count(*) > 1');
    
    if (manualError) {
      throw new Error(`Error buscando duplicados: ${manualError.message}`);
    }
    
    // Para cada tweet_id duplicado, obtener todos los registros
    const duplicates = [];
    for (const item of manualData || []) {
      const { data: tweets } = await supabase
        .from('trending_tweets')
        .select('*')
        .eq('tweet_id', item.tweet_id)
        .order('created_at', { ascending: false });
      
      if (tweets && tweets.length > 1) {
        duplicates.push({
          tweet_id: item.tweet_id,
          count: tweets.length,
          tweets: tweets
        });
      }
    }
    
    return duplicates;
  }
  
  return data || [];
}

/**
 * Selecciona el mejor tweet de un grupo de duplicados
 * Prioriza: análisis más completo > fecha más reciente > más métricas
 */
function selectBestTweet(tweets) {
  return tweets.reduce((best, current) => {
    // Prioridad 1: Tweet con análisis completo (no fallback)
    const bestHasAnalysis = best.analisis_ai_metadata?.modelo !== 'fallback' && best.sentimiento !== 'neutral';
    const currentHasAnalysis = current.analisis_ai_metadata?.modelo !== 'fallback' && current.sentimiento !== 'neutral';
    
    if (currentHasAnalysis && !bestHasAnalysis) return current;
    if (bestHasAnalysis && !currentHasAnalysis) return best;
    
    // Prioridad 2: Fecha más reciente
    const bestDate = new Date(best.updated_at || best.created_at);
    const currentDate = new Date(current.updated_at || current.created_at);
    
    if (currentDate > bestDate) return current;
    if (bestDate > currentDate) return best;
    
    // Prioridad 3: Más métricas de engagement
    const bestEngagement = (best.likes || 0) + (best.retweets || 0) + (best.replies || 0);
    const currentEngagement = (current.likes || 0) + (current.retweets || 0) + (current.replies || 0);
    
    if (currentEngagement > bestEngagement) return current;
    
    return best;
  });
}

/**
 * Consolida tweets duplicados
 */
async function consolidateDuplicates(dryRun = true) {
  const duplicates = await findDuplicates();
  
  if (duplicates.length === 0) {
    console.log('✅ No se encontraron tweets duplicados');
    return { processed: 0, consolidated: 0, errors: 0 };
  }
  
  console.log(`📊 Encontrados ${duplicates.length} grupos de tweets duplicados`);
  
  let consolidated = 0;
  let errors = 0;
  
  for (const group of duplicates) {
    try {
      console.log(`\n🔄 Procesando grupo: ${group.tweet_id} (${group.count} duplicados)`);
      
      // Seleccionar el mejor tweet
      const bestTweet = selectBestTweet(group.tweets);
      const tweetsToDelete = group.tweets.filter(t => t.id !== bestTweet.id);
      
      console.log(`   📌 Manteniendo tweet ID ${bestTweet.id} (creado: ${bestTweet.created_at})`);
      console.log(`   🗑️  Eliminando ${tweetsToDelete.length} duplicados`);
      
      if (!dryRun) {
        // Eliminar duplicados
        for (const tweet of tweetsToDelete) {
          const { error } = await supabase
            .from('trending_tweets')
            .delete()
            .eq('id', tweet.id);
          
          if (error) {
            console.error(`   ❌ Error eliminando tweet ${tweet.id}: ${error.message}`);
            errors++;
          } else {
            console.log(`   ✅ Eliminado tweet ${tweet.id}`);
          }
        }
        
        consolidated++;
      } else {
        console.log(`   💡 [DRY RUN] Se eliminarían ${tweetsToDelete.length} duplicados`);
      }
      
    } catch (error) {
      console.error(`❌ Error procesando grupo ${group.tweet_id}:`, error.message);
      errors++;
    }
  }
  
  return {
    processed: duplicates.length,
    consolidated: consolidated,
    errors: errors
  };
}

/**
 * Crea una función RPC en Supabase para encontrar duplicados eficientemente
 */
async function createDuplicateFindFunction() {
  const sqlFunction = `
CREATE OR REPLACE FUNCTION find_duplicate_tweets()
RETURNS TABLE(tweet_id TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.tweet_id,
    COUNT(*) as count
  FROM trending_tweets t
  GROUP BY t.tweet_id
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql;
  `;
  
  console.log('📝 Creando función RPC para encontrar duplicados...');
  
  const { error } = await supabase.rpc('exec_sql', { sql: sqlFunction });
  
  if (error) {
    console.log('⚠️  No se pudo crear la función RPC (puede que no tengas permisos)');
    console.log('   Usando método manual...');
  } else {
    console.log('✅ Función RPC creada exitosamente');
  }
}

/**
 * Generar reporte de duplicados
 */
async function generateDuplicateReport() {
  console.log('📋 Generando reporte de duplicados...');
  
  const duplicates = await findDuplicates();
  
  if (duplicates.length === 0) {
    console.log('✅ No hay duplicados para reportar');
    return;
  }
  
  console.log(`\n📊 REPORTE DE DUPLICADOS`);
  console.log(`================================`);
  console.log(`Total de grupos duplicados: ${duplicates.length}`);
  
  let totalDuplicates = 0;
  const categoryCounts = {};
  const userCounts = {};
  
  for (const group of duplicates) {
    totalDuplicates += group.count - 1; // -1 porque uno se mantiene
    
    // Análisis por categoría
    const categoria = group.tweets[0]?.categoria || 'Desconocido';
    categoryCounts[categoria] = (categoryCounts[categoria] || 0) + 1;
    
    // Análisis por usuario
    const usuario = group.tweets[0]?.usuario || 'Desconocido';
    userCounts[usuario] = (userCounts[usuario] || 0) + 1;
    
    console.log(`\n📱 Tweet ID: ${group.tweet_id}`);
    console.log(`   Duplicados: ${group.count}`);
    console.log(`   Usuario: @${group.tweets[0]?.usuario || 'Desconocido'}`);
    console.log(`   Categoría: ${categoria}`);
    console.log(`   Texto: ${group.tweets[0]?.texto?.substring(0, 80) || 'Sin texto'}...`);
  }
  
  console.log(`\n📈 ESTADÍSTICAS`);
  console.log(`Total de registros duplicados a eliminar: ${totalDuplicates}`);
  
  console.log(`\n🏷️  Por categoría:`);
  Object.entries(categoryCounts)
    .sort(([,a], [,b]) => b - a)
    .forEach(([cat, count]) => console.log(`   ${cat}: ${count} grupos`));
  
  console.log(`\n👤 Top usuarios con más duplicados:`);
  Object.entries(userCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .forEach(([user, count]) => console.log(`   @${user}: ${count} grupos`));
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'report';
  
  async function main() {
    try {
      switch (command) {
        case 'report':
          await generateDuplicateReport();
          break;
          
        case 'fix':
          const dryRun = !args.includes('--execute');
          if (dryRun) {
            console.log('🧪 Ejecutando en modo DRY RUN (no se realizarán cambios)');
            console.log('   Usa --execute para aplicar los cambios realmente');
          }
          
          const result = await consolidateDuplicates(dryRun);
          
          console.log(`\n📊 RESUMEN:`);
          console.log(`   Grupos procesados: ${result.processed}`);
          console.log(`   Grupos consolidados: ${result.consolidated}`);
          console.log(`   Errores: ${result.errors}`);
          
          if (dryRun && result.processed > 0) {
            console.log(`\n💡 Para aplicar los cambios, ejecuta:`);
            console.log(`   node fix_duplicate_tweets.js fix --execute`);
          }
          break;
          
        case 'create-function':
          await createDuplicateFindFunction();
          break;
          
        case 'help':
        default:
          console.log(`
🔧 Script para manejar tweets duplicados

Comandos:
  report              Generar reporte de duplicados (default)
  fix                 Consolidar duplicados (dry run por defecto)
  fix --execute       Consolidar duplicados (aplicar cambios)
  create-function     Crear función RPC en Supabase
  help                Mostrar esta ayuda

Ejemplos:
  node fix_duplicate_tweets.js
  node fix_duplicate_tweets.js report
  node fix_duplicate_tweets.js fix
  node fix_duplicate_tweets.js fix --execute
          `);
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  }
  
  main();
}

module.exports = {
  findDuplicates,
  consolidateDuplicates,
  generateDuplicateReport
}; 