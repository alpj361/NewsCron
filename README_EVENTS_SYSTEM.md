# Sistema de Eventos - Fetch and Store

Sistema automatizado para obtener y almacenar eventos públicos de Guatemala desde ExtractorT hacia Supabase.

## 📋 Descripción

Este sistema replica la funcionalidad del News Scraper pero para eventos públicos, obteniendo información de fuentes como Guatemala.com, Eventbrite Guatemala y eTicket Guatemala.

## 🏗️ Arquitectura

```
ExtractorT (Puerto 8000)     NewsCron                    Supabase
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│  Events Scraper     │────▶│ fetch_and_store_    │────▶│  public_events      │
│  - Guatemala.com    │     │ events.js           │     │  table              │
│  - Eventbrite GT    │     │                     │     │                     │
│  - eTicket GT       │     │ Normalización       │     │  Views:             │
│                     │     │ Deduplicación       │     │  - upcoming_events  │
│  API Endpoints:     │     │ Validación          │     │  - events_by_       │
│  /api/publicevents  │     │                     │     │    category         │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
```

## 📁 Archivos del Sistema

### 1. Base de Datos
- **`create_public_events_table.sql`** - Script para crear tabla y vistas en Supabase

### 2. Scripts de Procesamiento
- **`fetch_and_store_events.js`** - Script principal para obtener y almacenar eventos
- **`test_events_fetch.js`** - Script de pruebas del sistema

## 🗄️ Esquema de Base de Datos

### Tabla: `public_events`

```sql
CREATE TABLE public_events (
    id BIGSERIAL PRIMARY KEY,
    titulo VARCHAR(500) NOT NULL,
    descripcion TEXT,
    categoria VARCHAR(100) NOT NULL DEFAULT 'General',
    fecha_evento DATE,
    ubicacion VARCHAR(300),
    fuente VARCHAR(100) NOT NULL,
    url VARCHAR(1000),
    fecha_scraping TIMESTAMPTZ DEFAULT NOW(),
    raw JSONB,
    
    -- Campos adicionales específicos de eventos
    precio VARCHAR(100),
    organizador VARCHAR(200),
    tipo_evento VARCHAR(50) DEFAULT 'Presencial',
    estado VARCHAR(50) DEFAULT 'Activo',
    
    -- Metadatos
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Vistas Disponibles

#### `upcoming_events`
Eventos activos próximos ordenados por fecha.

#### `events_by_category`
Estadísticas de eventos agrupados por categoría.

## 🔧 Configuración

### 1. Crear la Tabla en Supabase

```bash
# Ejecutar en Supabase SQL Editor
psql -f create_public_events_table.sql
```

### 2. Configurar Variables de Entorno

El script usa las credenciales hardcodeadas de Supabase. Para producción, considera usar variables de entorno:

```javascript
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qqshdccpmypelhmyqnut.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 'tu_service_key';
```

### 3. Verificar ExtractorT

El sistema usa ExtractorT desplegado en VPS:

```bash
# Verificar que ExtractorT esté disponible
curl https://api.standatpd.com/api/publicevents/test

# Debería responder:
# {"success": true, "message": "Events API is working", ...}
```

## 🚀 Uso

### Ejecutar Fetch and Store

```bash
cd NewsCron
node fetch_and_store_events.js
```

### Ejecutar Pruebas

```bash
# Pruebas básicas
node test_events_fetch.js

# Prueba completa (incluye fetch real)
node test_events_fetch.js --full
```

## 📊 Funcionalidades

### 1. Obtención de Eventos
- **Fuentes**: Guatemala.com, Eventbrite Guatemala, eTicket Guatemala
- **Categorías**: Música, Deportes, Cultura, Educación, Gastronomía, Tecnología, Negocios, Entretenimiento, General
- **Límites**: 20 eventos por fuente, 50 total por ejecución

### 2. Normalización de Datos
```javascript
{
  titulo: "Nombre del evento",
  descripcion: "Descripción del evento",
  categoria: "Música", // Categoría normalizada
  fecha_evento: "2025-02-15", // Formato ISO
  ubicacion: "Teatro Nacional, Guatemala City",
  fuente: "guatemala_com",
  url: "https://...",
  precio: null, // Por implementar
  organizador: null, // Por implementar
  tipo_evento: "Presencial",
  estado: "Activo",
  raw: { /* datos originales */ }
}
```

### 3. Deduplicación
- **Criterio**: URL + fecha_evento
- **Constraint**: `unique_event_url_fecha`

### 4. Validación
- **Categorías**: Solo valores permitidos
- **Estados**: Activo, Cancelado, Pospuesto, Finalizado
- **Tipos**: Presencial, Virtual, Híbrido

## 📈 Estadísticas y Monitoreo

### Logs de Ejecución
```
🎉 Iniciando fetch and store de eventos públicos
🔍 Verificando conectividad con ExtractorT...
✅ ExtractorT disponible

📡 Procesando fuente: guatemala_com
✅ Obtenidos 15 eventos de ExtractorT
✅ Evento almacenado: Concierto de Rock Nacional (ID: 123)
📊 guatemala_com: 12 nuevos, 3 duplicados, 0 errores

📊 RESUMEN FINAL
Fuentes procesadas: 3
Eventos obtenidos: 45
Eventos nuevos: 38
Eventos duplicados: 7
Errores: 0
Tiempo de ejecución: 45s
```

### Consultas Útiles

```sql
-- Eventos próximos por categoría
SELECT categoria, COUNT(*) as total
FROM upcoming_events 
GROUP BY categoria 
ORDER BY total DESC;

-- Eventos por fuente
SELECT fuente, COUNT(*) as total, 
       COUNT(CASE WHEN fecha_evento >= CURRENT_DATE THEN 1 END) as proximos
FROM public_events 
GROUP BY fuente;

-- Eventos recientes
SELECT titulo, categoria, fecha_evento, fuente
FROM public_events 
WHERE fecha_scraping >= NOW() - INTERVAL '24 hours'
ORDER BY fecha_scraping DESC;
```

## 🔄 Automatización

### Cron Job Recomendado

```bash
# Ejecutar cada 6 horas
0 */6 * * * cd /path/to/NewsCron && node fetch_and_store_events.js >> events_cron.log 2>&1

# Limpiar eventos antiguos semanalmente
0 2 * * 0 cd /path/to/NewsCron && node -e "require('./fetch_and_store_events').limpiarEventosAntiguos(30)"
```

### Integración con PM2

```bash
# Instalar PM2
npm install -g pm2

# Crear ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'events-fetcher',
    script: 'fetch_and_store_events.js',
    cron_restart: '0 */6 * * *',
    autorestart: false,
    max_memory_restart: '1G'
  }]
};
EOF

# Iniciar con PM2
pm2 start ecosystem.config.js
```

## 🛠️ Mantenimiento

### Limpieza de Datos

```javascript
// Limpiar eventos antiguos (más de 30 días)
const { limpiarEventosAntiguos } = require('./fetch_and_store_events');
await limpiarEventosAntiguos(30);
```

### Reindexación

```sql
-- Reindexar tabla para mejor performance
REINDEX TABLE public_events;

-- Actualizar estadísticas
ANALYZE public_events;
```

## 🔍 Troubleshooting

### Problemas Comunes

1. **ExtractorT no disponible**
   ```
   ❌ Error conectando con ExtractorT: ECONNREFUSED
   ```
   - Verificar que ExtractorT esté disponible en https://api.standatpd.com
   - Verificar conectividad de red y DNS
   - Probar manualmente: `curl https://api.standatpd.com/api/publicevents/test`

2. **Tabla no existe**
   ```
   ❌ relation "public_events" does not exist
   ```
   - Ejecutar `create_public_events_table.sql` en Supabase

3. **Errores de duplicados**
   ```
   ⚠️ Evento duplicado (saltando): Nombre del evento
   ```
   - Normal, indica que el sistema de deduplicación funciona

4. **Timeout en requests**
   ```
   ❌ Error obteniendo eventos de ExtractorT: timeout
   ```
   - Aumentar timeout en configuración
   - Verificar carga del servidor ExtractorT

### Logs de Debug

```bash
# Habilitar logs detallados
DEBUG=* node fetch_and_store_events.js

# Ver logs de Supabase
tail -f /var/log/supabase/postgres.log
```

## 🚀 Próximas Mejoras

1. **Extracción de Precios**: Implementar parsing de información de precios
2. **Organizadores**: Extraer información de organizadores de eventos
3. **Imágenes**: Almacenar URLs de imágenes de eventos
4. **Geolocalización**: Convertir ubicaciones a coordenadas
5. **Notificaciones**: Sistema de alertas para eventos importantes
6. **API REST**: Endpoints para consultar eventos desde frontend
7. **Filtros Avanzados**: Búsqueda por rango de fechas, ubicación, etc.

## 📞 Soporte

Para problemas o mejoras, revisar:
1. Logs de ejecución
2. Estado de ExtractorT API
3. Conectividad con Supabase
4. Ejecutar script de pruebas

---

**Última actualización**: Enero 2025  
**Versión**: 1.0.0  
**Compatibilidad**: ExtractorT v1.0, Supabase PostgreSQL 15+ 