# Análisis de Sentimiento para Trending Tweets

## 🎯 Descripción

Sistema de análisis de sentimiento integrado para tweets de trending topics guatemaltecos usando **GPT-3.5 Turbo**. Analiza cada tweet individualmente para obtener máxima precisión considerando el contexto local guatemalteco.

## 📊 Características

- ✅ **Análisis individual por tweet** para máxima precisión
- ✅ **Contexto guatemalteco** - Entiende lenguaje chapín, sarcasmo, referencias locales
- ✅ **Categorización mejorada** - Política, Económica, Sociales, General
- ✅ **Análisis de intención** - Informativo, opinativo, humorístico, alarmista, crítico, etc.
- ✅ **Detección de entidades** - Personas, organizaciones, lugares, eventos
- ✅ **Clasificación viral** - Automática basada en engagement (likes+retweets+replies)
- ✅ **Datos ricos** - Sentimiento, score, confianza, emociones, contexto
- ✅ **Costo optimizado** - ~$0.04/mes con 100 tweets/día
- ✅ **Fallback robusto** - Funciona sin API key

## 💰 Costos Estimados

| Volumen | Costo/día | Costo/mes |
|---------|-----------|-----------|
| 50 tweets | $0.0010 | $0.030 |
| 100 tweets | $0.0020 | $0.060 |
| 200 tweets | $0.0040 | $0.120 |

*Nota: Costos ligeramente aumentados por análisis más completo (intención + entidades)*

## 🏗️ Estructura de Datos

### Campos Añadidos a `trending_tweets`

```sql
-- Análisis de sentimiento
sentimiento TEXT ('positivo'|'negativo'|'neutral')
score_sentimiento DECIMAL(3,2) (-1.0 a 1.0)
confianza_sentimiento DECIMAL(3,2) (0.0 a 1.0)
emociones_detectadas JSONB (array de strings)

-- Análisis avanzado
intencion_comunicativa TEXT ('informativo'|'opinativo'|'humoristico'|'alarmista'|'critico'|'promocional'|'conversacional'|'protesta')
propagacion_viral TEXT ('viral'|'alto_engagement'|'medio_engagement'|'bajo_engagement'|'sin_engagement')
score_propagacion INTEGER (calculado automáticamente)
entidades_mencionadas JSONB (array de objetos con entidades)
analisis_ai_metadata JSONB (metadatos completos)
```

### Ejemplo de Análisis Completo

```json
{
  "sentimiento": "positivo",
  "score_sentimiento": 0.75,
  "confianza_sentimiento": 0.85,
  "emociones_detectadas": ["alegría", "esperanza", "orgullo"],
  "intencion_comunicativa": "opinativo",
  "propagacion_viral": "medio_engagement",
  "score_propagacion": 567,
  "entidades_mencionadas": [
    {
      "nombre": "Guatemala",
      "tipo": "lugar",
      "contexto": "país centroamericano"
    },
    {
      "nombre": "Bernardo Arévalo",
      "tipo": "persona", 
      "contexto": "presidente de Guatemala"
    }
  ],
  "analisis_ai_metadata": {
    "modelo": "gpt-3.5-turbo",
    "timestamp": "2025-01-19T10:30:00Z",
    "contexto_local": "Expresión de orgullo nacional guatemalteco",
    "intensidad": "alta",
    "categoria": "Sociales",
    "tokens_usados": 285,
    "costo_estimado": 0.0004275
  }
}
```

## 🚀 Instalación y Configuración

### 1. Instalar Dependencias

```bash
cd NewsCron
npm install
```

### 2. Configurar Variables de Entorno

Crea un archivo `.env` basado en `env-example.txt`:

```bash
cp env-example.txt .env
```

Edita `.env` con tus credenciales:

```bash
# OpenAI API Key (requerida para sentimientos)
OPENAI_API_KEY=sk-tu_api_key_aqui

# Habilitar análisis de sentimiento
ENABLE_SENTIMENT_ANALYSIS=true

# Configuración existente de Supabase
SUPABASE_URL=https://qqshdccpmypelhmyqnut.supabase.co
SUPABASE_KEY=tu_service_role_key
```

### 3. Actualizar Base de Datos

Ejecuta en Supabase SQL Editor:

```sql
-- Copiar y ejecutar todo el contenido de add_sentiment_columns.sql
```

### 4. Verificar Instalación

```bash
# Prueba rápida del análisis
npm run test-sentiment

# Ejecutar extracción completa
npm run fetch-tweets
```

## 📋 Uso

### Ejecución Manual

```bash
node fetch_trending_and_tweets.js
```

### Configuración de Cron

```bash
# Ejecutar cada 4 horas
0 */4 * * * cd /path/to/NewsCron && node fetch_trending_and_tweets.js
```

### Pruebas

```bash
# Prueba análisis de sentimiento
npm run test-sentiment

# Prueba con tweets específicos
node test_sentiment_analysis.js
```

## 🔧 Configuración Avanzada

### Variables de Entorno Opcionales

```bash
# Límites y delays
MAX_TWEETS_PER_TREND=10
DELAY_BETWEEN_TWEETS=500
DELAY_BETWEEN_TRENDS=2000

# Debug
DEBUG_MODE=false
```

### Desactivar Sentimientos

```bash
ENABLE_SENTIMENT_ANALYSIS=false
```

## 📊 Monitoreo

### Logs del Sistema

```bash
# Logs en tiempo real
tail -f /var/log/newscron.log

# Buscar errores
grep "❌" /var/log/newscron.log
```

### Estadísticas de Costos

El sistema reporta automáticamente:
- Tweets procesados por ejecución
- Costo estimado por sesión
- Tokens consumidos

Ejemplo de output:
```
🎉 Proceso completado:
   📊 Total tweets procesados: 67
   🧠 Total análisis de sentimiento: 67
   💰 Costo estimado: $0.0018
```

## 🔍 Consultas Útiles

### Tweets por Sentimiento

```sql
SELECT sentimiento, COUNT(*) as total
FROM trending_tweets 
WHERE fecha_captura >= NOW() - INTERVAL '24 hours'
GROUP BY sentimiento;
```

### Emociones Más Comunes

```sql
SELECT emotion, COUNT(*) as frecuencia
FROM trending_tweets,
     jsonb_array_elements_text(emociones_detectadas) as emotion
WHERE fecha_captura >= NOW() - INTERVAL '7 days'
GROUP BY emotion
ORDER BY frecuencia DESC
LIMIT 10;
```

### Análisis por Categoría

```sql
SELECT 
  categoria,
  sentimiento,
  COUNT(*) as total,
  AVG(score_sentimiento) as score_promedio
FROM trending_tweets 
WHERE fecha_captura >= NOW() - INTERVAL '24 hours'
GROUP BY categoria, sentimiento
ORDER BY categoria, sentimiento;
```

### Análisis de Intenciones

```sql
SELECT 
  intencion_comunicativa,
  COUNT(*) as total,
  ROUND(AVG(score_propagacion), 0) as engagement_promedio
FROM trending_tweets 
WHERE fecha_captura >= NOW() - INTERVAL '24 hours'
GROUP BY intencion_comunicativa
ORDER BY total DESC;
```

### Tweets Virales

```sql
SELECT 
  texto,
  usuario,
  propagacion_viral,
  score_propagacion,
  sentimiento,
  intencion_comunicativa
FROM trending_tweets 
WHERE propagacion_viral IN ('viral', 'alto_engagement')
  AND fecha_captura >= NOW() - INTERVAL '24 hours'
ORDER BY score_propagacion DESC
LIMIT 10;
```

### Entidades Más Mencionadas

```sql
SELECT 
  entidad->>'nombre' as entidad_nombre,
  entidad->>'tipo' as tipo_entidad,
  COUNT(*) as menciones
FROM trending_tweets,
     jsonb_array_elements(entidades_mencionadas) as entidad
WHERE fecha_captura >= NOW() - INTERVAL '7 days'
GROUP BY entidad->>'nombre', entidad->>'tipo'
ORDER BY menciones DESC
LIMIT 15;
```

## 🛠️ Resolución de Problemas

### Error: "OpenAI API error: 401"
- Verificar que `OPENAI_API_KEY` sea válida
- Confirmar que tenga créditos disponibles

### Error: "No response from OpenAI"
- Revisar conectividad a internet
- Verificar límites de rate de OpenAI

### Tweets sin análisis
- El sistema continúa funcionando sin análisis si hay errores
- Verificar logs para identificar problemas

### Costos altos
- Reducir `MAX_TWEETS_PER_TREND` 
- Aumentar `DELAY_BETWEEN_TWEETS`
- Considerar ejecutar menos frecuentemente

## 📈 Mejoras Futuras

- [ ] Análisis de emociones más granular
- [ ] Detección de temas específicos guatemaltecos
- [ ] Integración con métricas de engagement
- [ ] Dashboard de tendencias de sentimiento
- [ ] Alertas por cambios de sentimiento

## 🤝 Soporte

Para problemas o preguntas:
1. Revisar logs del sistema
2. Ejecutar `npm run test-sentiment` para diagnóstico
3. Verificar configuración de variables de entorno
4. Consultar documentación de OpenAI API 