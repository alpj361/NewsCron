# Sistema de Logs para Monitoreo de Costos

Este sistema permite monitorear y analizar todas las ejecuciones del script de trending tweets, incluyendo costos de IA, rendimiento y estadísticas detalladas.

## 🚀 Configuración Inicial

### 1. Crear la Tabla de Logs

Ejecuta el siguiente script SQL en Supabase:

```bash
# En tu directorio NewsCron
psql -h db.qqshdccpmypelhmyqnut.supabase.co -U postgres -d postgres -f create_system_logs_table.sql
```

O copia y pega el contenido de `create_system_logs_table.sql` en el SQL Editor de Supabase.

### 2. Verificar Dependencias

```bash
npm install @supabase/supabase-js dotenv
```

## 📊 Características del Sistema

### Métricas Registradas
- **Ejecución**: Duración, estado, fecha inicio/fin
- **Procesamiento**: Trends encontrados, tweets procesados/guardados/fallidos
- **IA**: Requests realizados, tokens usados, costos estimados
- **Análisis**: Distribución de sentimientos, intenciones, categorías
- **Errores**: Detalles de errores y warnings

### Vistas Disponibles
- `admin_execution_summary`: Resumen ejecutivo con métricas clave
- `daily_cost_stats`: Estadísticas de costos diarios
- `weekly_performance_stats`: Rendimiento semanal

## 🧪 Pruebas

### Test del Sistema de Logs
```bash
node test_system_logs.js
```

### Ver Logs Recientes
```bash
node test_system_logs.js show
```

## 📈 Uso en Dashboard de Admin

### Consultas Útiles para Frontend

#### Últimas Ejecuciones
```sql
SELECT * FROM admin_execution_summary 
ORDER BY started_at DESC 
LIMIT 10;
```

#### Costos Diarios
```sql
SELECT * FROM daily_cost_stats 
WHERE date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY date DESC;
```

#### Estadísticas de Rendimiento
```sql
SELECT 
  AVG(duration_seconds) as avg_duration,
  AVG(success_rate_percent) as avg_success_rate,
  SUM(estimated_cost_usd) as total_cost_week
FROM admin_execution_summary 
WHERE started_at >= CURRENT_DATE - INTERVAL '7 days'
AND status = 'completed';
```

#### Top Categorías por Volumen
```sql
SELECT 
  jsonb_object_keys(categoria_stats) as categoria,
  SUM((categoria_stats->>jsonb_object_keys(categoria_stats))::int) as total_tweets
FROM system_execution_logs 
WHERE status = 'completed'
AND started_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY categoria
ORDER BY total_tweets DESC;
```

## 🎯 Implementación en Script Principal

El sistema está integrado automáticamente en `fetch_trending_and_tweets.js`:

```javascript
const { SystemLogger } = require('./system_logger');

// Inicializar logger
let systemLogger = new SystemLogger();

async function fetchTrendingAndTweets() {
  // Iniciar logging
  const executionId = await systemLogger.startExecution('fetch_trending_and_tweets');
  
  try {
    // Tu lógica existente...
    systemLogger.incrementMetric('tweets_processed');
    systemLogger.addAIRequestCost(tokens, success);
    
    // Finalizar exitosamente
    await systemLogger.finishExecution('completed');
  } catch (error) {
    // Finalizar con error
    systemLogger.addError(error, 'Contexto del error');
    await systemLogger.finishExecution('failed');
  }
}
```

## 📊 Ejemplo de Datos en Dashboard

### Card de Costos
```json
{
  "costo_hoy": "$0.0234",
  "costo_semana": "$0.1567",
  "tweets_procesados": 245,
  "promedio_por_tweet": "$0.000094"
}
```

### Card de Rendimiento
```json
{
  "ejecuciones_exitosas": "95%",
  "tiempo_promedio": "45s",
  "ia_success_rate": "92%",
  "errores_ultimas_24h": 3
}
```

### Gráfico de Sentimientos
```json
{
  "positivo": 45,
  "neutral": 38,
  "negativo": 17
}
```

## 🔧 Funciones del SystemLogger

### Básicas
- `startExecution(scriptName, metadata)`: Inicia una nueva ejecución
- `finishExecution(status, finalMetadata)`: Finaliza la ejecución
- `updateExecution(status)`: Actualiza el progreso

### Métricas
- `incrementMetric(name, value)`: Incrementa una métrica
- `setMetric(name, value)`: Establece valor de métrica
- `addAIRequestCost(tokens, success)`: Registra costos de IA

### Estadísticas
- `updateCategoriaStats(categoria)`: Actualiza stats de categoría
- `updateSentimientoStats(sentimiento)`: Actualiza stats de sentimiento
- `updateIntencionStats(intencion)`: Actualiza stats de intención
- `updatePropagacionStats(propagacion)`: Actualiza stats de propagación

### Logging
- `logProgress(message)`: Log de progreso
- `logSuccess(message)`: Log de éxito
- `addError(error, context)`: Registra error
- `addWarning(warning, context)`: Registra warning

## 🚨 Alertas Recomendadas

### Para el Dashboard de Admin
1. **Costo diario > $1.00**: Alerta de costo alto
2. **Success rate < 80%**: Alerta de rendimiento
3. **Duración > 300s**: Alerta de tiempo excesivo
4. **IA failure rate > 20%**: Alerta de problemas con IA
5. **Errores > 10 en 24h**: Alerta de estabilidad

## 📱 Integración con TypeScript

Para el frontend, define estos tipos:

```typescript
interface ExecutionLog {
  execution_id: string;
  script_name: string;
  started_at: string;
  completed_at?: string;
  duration_seconds?: number;
  status: 'running' | 'completed' | 'failed' | 'partial';
  tweets_processed: number;
  tweets_saved: number;
  estimated_cost_usd: number;
  success_rate_percent: number;
  ai_success_rate_percent: number;
  cost_per_tweet: number;
}

interface DailyCostStats {
  date: string;
  executions: number;
  total_tweets: number;
  total_cost: number;
  avg_cost_per_execution: number;
  max_cost: number;
  total_ai_requests: number;
}
```

## 🔄 Mantenimiento

### Limpieza de Logs Antiguos
```sql
-- Mantener solo últimos 90 días
DELETE FROM system_execution_logs 
WHERE started_at < CURRENT_DATE - INTERVAL '90 days';
```

### Vacuum Regular
```sql
-- Optimizar tabla después de eliminar registros
VACUUM ANALYZE system_execution_logs;
```

Este sistema te dará visibilidad completa sobre los costos y rendimiento de tu aplicación de trending tweets! 🚀 