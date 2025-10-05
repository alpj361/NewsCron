# 🔧 Integración de Deportes en ExtractorW

## 📋 Resumen

Este documento explica cómo modificar ExtractorW para que detecte y guarde los campos `is_deportes` y `categoria_principal` al procesar trends.

## 🎯 Objetivo

Cuando ExtractorW procesa trends a través del endpoint `/api/cron/processTrends`, debe:
1. Detectar si el conjunto de trends procesado es mayormente deportivo
2. Determinar la categoría principal
3. Guardar estos campos en la tabla `trends` de Supabase

## 📍 Ubicación del Código

**Archivo**: `Pulse Journal/ExtractorW/server/routes/trends.js`

**Función**: `app.post('/api/cron/processTrends', ...)`

**Línea aproximada**: ~1080 (donde se hace el INSERT a Supabase)

## 🔧 Modificaciones Necesarias

### 1. Agregar Función de Detección de Deportes

**Ubicación**: Antes de la función `app.post('/api/cron/processTrends', ...)`

```javascript
/**
 * Detecta si un conjunto de trends/keywords es deportivo
 * @param {Array} keywords - Array de keywords con texto
 * @param {Array} wordCloud - Array de palabras del word cloud
 * @returns {Object} - { isDeportes, categoria, matchCount }
 */
function detectSportsContent(keywords, wordCloud) {
  // Combinar todos los textos para análisis
  const allKeywords = keywords.map(k => (k.keyword || k.text || '').toLowerCase()).join(' ');
  const allWords = wordCloud.map(w => (w.text || w.keyword || '').toLowerCase()).join(' ');
  const combinedText = `${allKeywords} ${allWords}`;
  
  // Palabras clave deportivas
  const sportsKeywords = [
    'municipal', 'comunicaciones', 'antigua', 'xelajú', 'xelaju',
    'fútbol', 'futbol', 'deportes', 'liga', 'selección', 'seleccion',
    'mundial', 'gol', 'goles', 'partido', 'campeonato', 'torneo',
    'clasificación', 'eliminatorias', 'copa', 'champions', 'concacaf',
    'jugador', 'entrenador', 'cremas', 'rojos'
  ];
  
  // Contar coincidencias
  let matchCount = 0;
  for (const keyword of sportsKeywords) {
    if (combinedText.includes(keyword)) {
      matchCount++;
    }
  }
  
  // Determinar si es deportivo (3 o más coincidencias)
  const isDeportes = matchCount >= 3;
  
  // Determinar categoría principal
  let categoria = 'General';
  
  if (isDeportes) {
    categoria = 'Deportes';
  } else if (combinedText.match(/polític|congreso|gobierno|presidente|ley|eleccion|partido|diputado/i)) {
    categoria = 'Política';
  } else if (combinedText.match(/econom|finanz|banco|precio|dólar|inflación|comercio|empleo/i)) {
    categoria = 'Económica';
  } else if (combinedText.match(/seguridad|violencia|crimen|policía|pnc|extorsión/i)) {
    categoria = 'Seguridad';
  } else if (combinedText.match(/educación|salud|familia|comunidad|cultura|derechos/i)) {
    categoria = 'Sociales';
  } else if (combinedText.match(/música|artista|cantante|concierto|festival|cine|tv/i)) {
    categoria = 'Entretenimiento';
  }
  
  return {
    isDeportes: isDeportes,
    categoria: categoria,
    matchCount: matchCount
  };
}
```

### 2. Modificar el INSERT a Supabase

**Ubicación**: Dentro de `app.post('/api/cron/processTrends', ...)`, aproximadamente línea 1080

**ANTES** del `INSERT`, agregar:

```javascript
// DETECCIÓN DE CATEGORÍA Y DEPORTES
const categoryDetection = detectSportsContent(enrichedTopKeywords, wordCloudData);

console.log(`🏷️  [CLASIFICACIÓN] Trend detectado como: ${categoryDetection.categoria}`);
console.log(`   - Es deportivo: ${categoryDetection.isDeportes}`);
console.log(`   - Coincidencias deportivas: ${categoryDetection.matchCount}`);
```

**MODIFICAR** el INSERT para incluir los nuevos campos:

```javascript
const { data, error } = await supabase
  .from('trends')
  .insert([{
    timestamp: processingTimestamp,
    word_cloud_data: wordCloudData,
    top_keywords: enrichedTopKeywords,
    category_data: categoryData,
    about: ultraSimplifiedAboutArray,
    statistics: statistics,
    processing_status: 'complete',
    
    // ====== NUEVOS CAMPOS ======
    is_deportes: categoryDetection.isDeportes,
    categoria_principal: categoryDetection.categoria,
    // ===========================
    
    raw_data: {
      trends: basicProcessedTrends,
      statistics: statistics,
      location: 'guatemala',
      processing_time: (Date.now() - startTime) / 1000,
      source: 'cron-automated',
      // Metadata de clasificación
      classification_metadata: {
        sports_match_count: categoryDetection.matchCount,
        detected_category: categoryDetection.categoria,
        is_sports: categoryDetection.isDeportes
      }
    },
    controversy_analyses: controversyAnalyses,
    controversy_statistics: controversyStatistics,
    controversy_chart_data: controversyChartData
  }])
  .select();
```

### 3. Agregar Logging de Verificación

**DESPUÉS** del INSERT exitoso, agregar:

```javascript
if (!error && data && data[0]) {
  console.log('✅ Resultados guardados correctamente');
  console.log(`📊 Clasificación guardada:`);
  console.log(`   - ID: ${data[0].id}`);
  console.log(`   - Categoría: ${data[0].categoria_principal}`);
  console.log(`   - Es deportivo: ${data[0].is_deportes}`);
  recordId = data[0].id;
}
```

## 🔍 Verificación

Después de implementar los cambios, verifica que funciona correctamente:

### 1. Ejecutar el cron manualmente

```bash
cd "Pulse Journal/NewsCron"
node fetch_trending_process.js
```

### 2. Revisar los logs

Busca estas líneas en la salida:

```
🏷️  [CLASIFICACIÓN] Trend detectado como: Deportes
   - Es deportivo: true
   - Coincidencias deportivas: 5
```

### 3. Consultar Supabase

```sql
SELECT 
    id,
    timestamp,
    categoria_principal,
    is_deportes,
    created_at
FROM public.trends
ORDER BY created_at DESC
LIMIT 5;
```

Deberías ver los nuevos campos poblados correctamente.

## 📊 Ejemplos de Clasificación Esperada

### Trend Deportivo
- **Input**: Keywords como "Municipal", "Liga Nacional", "gol"
- **Output**: 
  - `is_deportes`: `true`
  - `categoria_principal`: `'Deportes'`
  - `matchCount`: 5+

### Trend Político
- **Input**: Keywords como "Congreso", "presidente", "ley"
- **Output**:
  - `is_deportes`: `false`
  - `categoria_principal`: `'Política'`
  - `matchCount`: 0-2

### Trend General
- **Input**: Keywords diversos sin patrón claro
- **Output**:
  - `is_deportes`: `false`
  - `categoria_principal`: `'General'`
  - `matchCount`: 0

## ⚠️ Consideraciones Importantes

### Autenticación
**IMPORTANTE**: ExtractorW requiere autenticación para modificaciones.

- Si necesitas hacer pruebas, solicita el bearer token al administrador
- O permite que el administrador ejecute las modificaciones directamente

### Threshold de Deportes
El umbral actual es **3 coincidencias** para marcar como deportivo.

Si notas falsos positivos/negativos, ajusta esta línea:
```javascript
const isDeportes = matchCount >= 3; // Cambiar a 2, 4, etc. según necesidad
```

### Keywords Deportivas
La lista de keywords puede expandirse según las necesidades.

Equipos adicionales de Guatemala:
- Cobán Imperial
- Malacateco
- Suchitepéquez
- Guastatoya
- Mixco

## 🚀 Próximos Pasos

Después de implementar esto:

1. ✅ **Fase 1**: Migración SQL completada
2. ✅ **Fase 2 y 3**: `fetch_trending_process.js` modificado con balanceo
3. ⏳ **Fase 3.5**: ExtractorW modificado (este documento) → **TÚ AQUÍ**
4. ⏳ **Fase 4**: Frontend ThePulse actualizado

## 📞 Testing

Para probar sin afectar producción:

1. Crea un registro de prueba manualmente en Supabase
2. Verifica que los campos `is_deportes` y `categoria_principal` acepten los valores
3. Ejecuta el cron en modo test si está disponible

---

**Nota**: Este documento asume que tienes acceso a modificar ExtractorW. Si no es así, proporciona este documento al administrador del sistema.
