# Sistema de Upsert para Tweets - Documentación

## Resumen

El sistema ha sido actualizado para manejar tweets duplicados de manera inteligente, permitiendo **sobrescribir campos de análisis** cuando se re-analiza un tweet existente según su `tweet_id`.

## Cambios Implementados

### 1. Función de Upsert en `fetch_trending_and_tweets.js`

#### Funciones Principales:

- **`getTweetData(tweetId)`**: Verifica si existe un tweet y retorna todos sus datos
- **`upsertTweet(tweetData, isUpdate, existingId)`**: Inserta nuevo tweet o actualiza campos específicos

#### Comportamiento del Upsert:

```javascript
// Si es actualización, solo actualiza estos campos:
- likes, retweets, replies (métricas actualizadas)
- sentimiento, score_sentimiento, confianza_sentimiento (análisis de sentimiento)
- intencion_comunicativa, entidades_mencionadas (análisis avanzado)
- analisis_ai_metadata (metadatos del análisis)
- updated_at (timestamp de última actualización)

// Si es inserción, guarda todos los campos del tweet completo
```

### 2. Script de Re-análisis: `reanalyze_tweets.js`

Permite re-analizar tweets existentes con nuevos modelos o criterios.

#### Uso:

```bash
# Re-analizar últimos 50 tweets de 7 días
node reanalyze_tweets.js

# Re-analizar solo tweets con análisis fallido
node reanalyze_tweets.js --only-failed

# Re-analizar todos los tweets de política (forzar)
node reanalyze_tweets.js --categoria Política --force-all --limit 100

# Re-analizar tweets de últimos 3 días
node reanalyze_tweets.js --days 3 --limit 200
```

#### Opciones:

- `--limit N`: Número máximo de tweets a procesar (default: 50)
- `--days N`: Tweets de los últimos N días (default: 7)
- `--force-all`: Re-analizar todos, incluso los recientes
- `--only-failed`: Solo tweets con análisis fallido o por defecto
- `--categoria CAT`: Filtrar por categoría específica

### 3. Script de Limpieza: `fix_duplicate_tweets.js`

Identifica y consolida tweets duplicados manteniendo la mejor versión.

#### Uso:

```bash
# Generar reporte de duplicados
node fix_duplicate_tweets.js report

# Vista previa de consolidación (dry run)
node fix_duplicate_tweets.js fix

# Aplicar consolidación real
node fix_duplicate_tweets.js fix --execute
```

#### Criterios de Selección del Mejor Tweet:

1. **Análisis completo**: Tweets con análisis de IA real (no fallback)
2. **Fecha más reciente**: Tweet actualizado más recientemente
3. **Métricas de engagement**: Mayor suma de likes + retweets + replies

## Campos que se Sobrescriben

### Campos de Análisis (siempre actualizados):

```sql
sentimiento                -- 'positivo' | 'negativo' | 'neutral'
score_sentimiento          -- -1.0 a 1.0
confianza_sentimiento      -- 0.0 a 1.0
emociones_detectadas       -- JSONB array
intencion_comunicativa     -- 'informativo' | 'opinativo' | etc.
entidades_mencionadas      -- JSONB array con entidades extraídas
analisis_ai_metadata       -- JSONB con metadatos del análisis
updated_at                 -- Timestamp de última actualización
```

### Campos de Métricas (actualizados si han cambiado):

```sql
likes                      -- Número de likes actuales
retweets                   -- Número de retweets actuales
replies                    -- Número de replies actuales
```

### Campos que NO se Sobrescriben:

```sql
-- Datos básicos del tweet (inmutables)
tweet_id, usuario, fecha_tweet, texto, enlace
verified, location, fecha_captura, raw_data
created_at

-- Datos de contexto (inmutables)
trend_original, trend_clean, categoria
```

## Flujo de Procesamiento

### Nuevo Tweet:
```
1. Buscar tweet por tweet_id
2. No existe → Analizar sentimiento
3. Insertar registro completo
4. Log: "Tweet nuevo guardado"
```

### Tweet Existente:
```
1. Buscar tweet por tweet_id
2. Existe → Analizar sentimiento (re-análisis)
3. Actualizar solo campos de análisis y métricas
4. Log: "Tweet actualizado guardado"
```

## Logs de Sistema

El sistema registra en `system_execution_logs`:

- Tweets procesados, guardados, actualizados
- Requests de IA realizados, exitosos, fallidos
- Tokens usados y costo estimado
- Estadísticas por categoría, sentimiento, intención
- Errores y warnings detallados

## Configuración

### Variables de Entorno:

```bash
# Requeridas
SUPABASE_URL=https://qqshdccpmypelhmyqnut.supabase.co
SUPABASE_KEY=tu_service_role_key
OPENAI_API_KEY=tu_openai_api_key

# Opcionales
ENABLE_SENTIMENT_ANALYSIS=true
API_BASE_URL=https://api.standatpd.com
LOCATION=guatemala
```

## Monitoreo

### Verificar Duplicados:
```bash
# Reporte de duplicados
node fix_duplicate_tweets.js report

# Estadísticas por categoría y usuario
```

### Verificar Re-análisis:
```sql
-- Tweets re-analizados recientemente
SELECT tweet_id, sentimiento, updated_at 
FROM trending_tweets 
WHERE updated_at > created_at 
ORDER BY updated_at DESC;

-- Tweets con análisis fallido
SELECT tweet_id, analisis_ai_metadata->>'modelo' as modelo
FROM trending_tweets 
WHERE analisis_ai_metadata->>'modelo' = 'fallback';
```

### Métricas de Costo:
```sql
-- Costo estimado por día
SELECT 
  DATE(started_at) as fecha,
  SUM(estimated_cost_usd) as costo_total,
  SUM(total_tokens_used) as tokens_total
FROM system_execution_logs 
GROUP BY DATE(started_at) 
ORDER BY fecha DESC;
```

## Casos de Uso

### 1. Actualización Diaria Automática
El script principal ahora actualiza automáticamente tweets existentes si se encuentran nuevamente en trending topics.

### 2. Mejora de Análisis
Usar `reanalyze_tweets.js` cuando se mejore el prompt de análisis o se actualice el modelo de IA.

### 3. Limpieza de Base de Datos
Usar `fix_duplicate_tweets.js` periódicamente para mantener la integridad de datos.

### 4. Análisis Histórico
Re-procesar tweets históricos con nuevos criterios de análisis:

```bash
# Re-analizar todos los tweets de política de la última semana
node reanalyze_tweets.js --categoria Política --days 7 --force-all --limit 1000
```

## Consideraciones

### Performance:
- Pausa de 500ms entre tweets en procesamiento normal
- Pausa de 1000ms en re-análisis para no sobrecargar APIs
- Límites configurables para evitar costos excesivos

### Costos:
- Monitoreo automático de tokens y costos de OpenAI
- Logs detallados de usage para auditoría
- Análisis fallback sin costo cuando falla la IA

### Integridad:
- Triggers automáticos para calcular `score_propagacion`
- Validación de datos antes de insertar/actualizar
- Manejo de errores robusto con fallbacks

## Troubleshooting

### Error: "Tweet ya existe"
Ya no ocurre - el sistema actualiza automáticamente.

### Error: "Análisis fallido"
Revisar logs y usar `--only-failed` para re-intentar.

### Error: "Muchos duplicados"
Ejecutar `fix_duplicate_tweets.js fix --execute` para limpiar.

### Costos altos de IA
Revisar `system_execution_logs` para identificar usage excesivo y ajustar límites. 