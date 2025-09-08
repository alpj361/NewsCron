# Mejoras Implementadas en NewsCron - Fetch Trending and Tweets

## 📋 Resumen de Cambios

El archivo principal que debes usar es **`fetch_trending_and_tweets.js`** (no `fetch_and_store_tweets.js`) ya que incluye análisis de sentimientos avanzado y logging completo.

## 🔧 Mejoras Implementadas

### 1. **Extracción Inteligente de Keywords**
- ✅ **Filtrado de caracteres no guatemaltecos**: Detecta y rechaza contenido en chino, japonés, árabe, cirílico
- ✅ **Lista de keywords guatemaltecos**: 25+ términos específicos de Guatemala para validar relevancia
- ✅ **Validación de términos locales**: Permite nombres/términos en español con acentos
- ✅ **Logging detallado**: Muestra qué trends son filtrados y por qué

```javascript
// Ejemplo de filtrado mejorado
const GUATEMALA_KEYWORDS = [
  'guatemala', 'guatemal', 'gt', 'chapín', 'chapin', 'guate',
  'congreso', 'gobierno', 'presidente', 'arévalo', 'arevalo',
  'usac', 'url', 'landívar', 'quetzal', 'xela', 'coban', 'peten'
];
```

### 2. **Filtrado por Ubicación Mejorado**
- ✅ **Cambio a `nitter_context`**: Usa el endpoint que mejor maneja ubicación vs `twitter_direct`
- ✅ **Filtrado a nivel de tweet**: Verifica contenido de tweets individuales
- ✅ **Validación de longitud**: Rechaza tweets muy cortos (<10 caracteres)
- ✅ **Detección de patrones no guatemaltecos**: Filtering avanzado por contenido

### 3. **Análisis de Sentimientos Actualizado**
- ✅ **Modelo correcto**: Cambiado de `gpt-5-mini` (no existe) a `gpt-4-turbo-preview`
- ✅ **Prompt mejorado**: Incluye contexto cultural guatemalteco específico
- ✅ **Análisis más completo**: Detecta modismos chapines, sarcasmo local, referencias culturales
- ✅ **Manejo de errores mejorado**: Parsing de JSON más robusto
- ✅ **Tokens aumentados**: De 300 a 400 tokens para respuestas más completas

```javascript
// Prompt mejorado incluye:
- Modismos chapines
- Sarcasmo local  
- Referencias culturales guatemaltecas
- Figuras públicas locales
- Instituciones guatemaltecas
```

### 4. **Categorización Expandida**
- ✅ **Categorías nuevas**: Agregadas "Seguridad", "Deportes", "Entretenimiento"
- ✅ **Términos específicos de Guatemala**: 
  - Política: CC, TSE, MP, CICIG, partidos locales
  - Seguridad: PNC, MINGOB, extorsión, pandillas
  - Deportes: Municipal, Comunicaciones, Xelajú, selección
  - Educación: USAC, URL, Landívar, MINEDUC

### 5. **Configuración Actualizada**
- ✅ **Variables de entorno**: Archivo `env.example.updated` con todas las configuraciones
- ✅ **Costos actualizados**: Variable para GPT-4 Turbo pricing
- ✅ **Rate limiting configurable**: Delays ajustables entre requests

## 🚀 Cómo Usar las Mejoras

### 1. Configurar Variables de Entorno
```bash
cp env.example.updated .env
# Editar .env con tus API keys y configuraciones
```

### 2. Variables Críticas a Configurar
```bash
OPENAI_API_KEY=tu_api_key_aqui
OPENAI_GPT4_TURBO_COST_PER_1M=30.00
API_BASE_URL=http://tu-extractort-url:8000
ENABLE_SENTIMENT_ANALYSIS=true
```

### 3. Ejecutar el Cron Mejorado
```bash
cd NewsCron
node fetch_trending_and_tweets.js
```

## 📊 Métricas y Logging

El sistema ahora registra:
- ✅ Trends filtrados por contenido no guatemalteco
- ✅ Tweets rechazados por idioma/irrelevancia  
- ✅ Categorización automática mejorada
- ✅ Análisis de sentimientos con modelo correcto
- ✅ Costos de tokens y tiempo de respuesta AI
- ✅ Estadísticas de propagación viral

## 🔍 Filtros Implementados

### Nivel 1: Trends
- ❌ Caracteres chinos/japoneses/árabes/cirílicos
- ❌ Términos demasiado cortos (<2 caracteres)
- ❌ No contiene keywords guatemaltecos relevantes

### Nivel 2: Tweets  
- ❌ Contenido en idiomas no latinos
- ❌ Tweets muy cortos (<10 caracteres)
- ❌ Usuarios con nombres en caracteres no latinos

## 🎯 Beneficios Esperados

1. **Mayor relevancia**: Solo contenido guatemalteco real
2. **Menos ruido**: Filtrado de contenido asiático/extranjero
3. **Análisis más preciso**: IA entrenada en contexto guatemalteco
4. **Categorización mejorada**: 6 categorías vs 4 anteriores  
5. **Costos controlados**: Uso del modelo GPT-4 Turbo real
6. **Mejor debugging**: Logs detallados de filtrado

## ⚠️ Consideraciones

1. **API Keys**: Asegúrate de tener OpenAI API Key válida
2. **Modelo**: GPT-4 Turbo es más costoso que GPT-3.5, ajusta el límite según presupuesto
3. **Rate Limits**: Los delays están configurados conservadoramente (500ms entre tweets)
4. **ExtractorT**: Asegúrate que el endpoint `/nitter_context` funcione correctamente

## 🔄 Próximos Pasos Recomendados

1. Probar en modo debug con pocos trends
2. Monitorear costos de OpenAI en primeros días
3. Ajustar keywords guatemaltecos según resultados
4. Optimizar delays según performance de tu API
5. Considerar agregar más categorías específicas si es necesario



