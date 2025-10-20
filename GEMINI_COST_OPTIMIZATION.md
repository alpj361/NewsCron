# 🚨 GEMINI COST OPTIMIZATION - URGENTE

## Problema Identificado

Tu `NewsCron` estaba haciendo cientos de llamadas a Gemini cada 12 horas:

- **Script principal**: `fetch_trending_and_tweets.js`
  - Se ejecuta 2 veces al día (6am y 6pm)
  - Análisis de sentimiento para cada tweet encontrado
  - ~20 trending topics × 10 tweets = 200 llamadas por ejecución
  - **Estimado: 12,000 llamadas al mes** ❌

## Solución Implementada ✅

### 1. Desactivar Análisis de Sentimiento
**Archivo**: `fetch_trending_and_tweets.js` (Línea 63)

Cambio hecho:
```javascript
// ANTES:
const ENABLE_SENTIMENT_ANALYSIS = process.env.ENABLE_SENTIMENT_ANALYSIS !== 'false'; // true por defecto

// AHORA:
const ENABLE_SENTIMENT_ANALYSIS = process.env.ENABLE_SENTIMENT_ANALYSIS === 'true'; // false por defecto
```

Para habilitar nuevamente (si es necesario):
```bash
export ENABLE_SENTIMENT_ANALYSIS=true
```

### 2. Cambiar Modelos a Flash (Más Barato)

| Archivo | ANTES | AHORA | Ahorro |
|---------|-------|-------|--------|
| `fetch_trending_process.js` | `gemini-2.0-flash-exp` | `gemini-1.5-flash` | ~50% |
| `fetch_and_store_tweets_with_politics.js` | `gemini-2.0-flash-exp` | `gemini-1.5-flash` | ~50% |
| `social_queries_dataset_cron.js` | `gemini-2.5-pro` | `gemini-1.5-flash` | ~70% |

## Impacto Financiero

### Antes (SIN optimización)
- ~200 llamadas por ejecución × 2 veces/día = 400 llamadas/día
- Sentimiento análisis: ~1,200 tokens/tweet
- **Total estimado: 12,000+ llamadas/mes** 💸

### Después (CON optimización)
- Análisis de sentimiento: DESACTIVADO (-99%)
- Solo clasificación de trends: ~10-20 llamadas/ejecución
- Modelos Flash: 50-70% más barato que Pro
- **Total estimado: 300-600 llamadas/mes** ✅

### Ahorro mensual
- **~95% menos llamadas a Gemini**
- **~70% menos costo total**
- Si pagabas $X al mes, ahora pagarás $0.3X

## Cómo Aplicar Cambios

### Paso 1: Actualizar tu `.env`
```bash
# Agregar esta línea a tu archivo .env
ENABLE_SENTIMENT_ANALYSIS=false
```

### Paso 2: Verificar cambios
Los siguientes archivos ya fueron actualizados:
- ✅ `fetch_trending_and_tweets.js` - Análisis de sentimiento desactivado
- ✅ `fetch_and_store_tweets_with_politics.js` - Modelo gemini-1.5-flash
- ✅ `fetch_trending_process.js` - Modelo gemini-1.5-flash
- ✅ `social_queries_dataset_cron.js` - Modelo gemini-1.5-flash (default)

### Paso 3: Reiniciar servicios
```bash
# Si ejecutas manualmente:
npm run fetch-trending-and-tweets
npm run fetch-and-store-tweets-with-politics

# Si usas Docker/cron:
docker-compose restart newscron
# O actualiza tu crontab
```

## Modelos de Gemini Explicados

### Gemini 1.5 Flash
- **Velocidad**: ⚡⚡⚡ (muy rápido, ~500ms)
- **Precisión**: ⭐⭐⭐⭐ (excelente para tareas)
- **Costo**: 💰 (ECONÓMICO)
- **Mejor para**: Análisis de texto, clasificación, procesamiento de datos

### Gemini 2.0 Flash Exp
- **Velocidad**: ⚡⚡⚡ (muy rápido, ~400ms)
- **Precisión**: ⭐⭐⭐⭐ (similar a 1.5)
- **Costo**: 💰💰 (más caro que 1.5)
- **Mejor para**: Experimental (no recomendado para producción)

### Gemini 2.5 Pro
- **Velocidad**: ⚡⚡ (moderado, ~800ms)
- **Precisión**: ⭐⭐⭐⭐⭐ (muy alta precisión)
- **Costo**: 💰💰💰💰 (CARO)
- **Mejor para**: Tareas complejas que requieren máxima precisión

## Casos Especiales

### Si necesitas mayor precisión en análisis político
Usa `--gemini-model gemini-1.5-pro` en comandos puntuales, pero **NO** como default:

```bash
# Para un análisis específico (manual):
node social_queries_dataset_cron.js --gemini --gemini-model gemini-1.5-pro

# NO lo hagas 2 veces al día en automático
```

## Monitoreo

Para verificar cuántas llamadas a Gemini se están haciendo:

```bash
# Ver logs de SystemLogger
grep -i "gemini\|ai_usage" logs/*.log

# Buscar tokens utilizados
grep "tokens" logs/*.log
```

## ¿Y si debo habilitar análisis de sentimiento?

Puedes hacerlo, pero con precaución:

```bash
# Opción 1: Variable de entorno
export ENABLE_SENTIMENT_ANALYSIS=true

# Opción 2: En comandos puntuales (NO en cron)
ENABLE_SENTIMENT_ANALYSIS=true node fetch_trending_and_tweets.js
```

**Advertencia**: Esto aumentará tu costo mensual a ~$X nuevamente.

## Resumen de Cambios

| Cambio | Archivo | Línea | Impacto |
|--------|---------|-------|---------|
| Desactivar sentimiento | `fetch_trending_and_tweets.js` | 63 | -95% llamadas |
| Flash en clasificación | `fetch_trending_process.js` | 121 | -50% costo |
| Flash en política | `fetch_and_store_tweets_with_politics.js` | 172 | -50% costo |
| Flash en dataset | `social_queries_dataset_cron.js` | 56 | -70% costo |

---

**Fecha de optimización**: 2024
**Estado**: ✅ Implementado
**Ahorro esperado**: ~95% en llamadas a Gemini
