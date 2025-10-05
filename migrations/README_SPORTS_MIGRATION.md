# 🏆 Guía de Migración - Sistema de Filtrado de Deportes

## 📋 Resumen

Esta migración agrega funcionalidad para balancear trends deportivos y no deportivos, evitando que los deportes opaquen otros temas importantes.

## 🎯 Cambios Aplicados

### Nuevos Campos en `public.trends`:
- `is_deportes` (BOOLEAN): Indica si el trend es deportivo
- `categoria_principal` (TEXT): Categoría detectada (Deportes, Política, Económica, etc.)

### Índices Creados:
- `trends_is_deportes_idx`: Para filtrar rápidamente por deportes
- `trends_categoria_principal_idx`: Para filtrar por categoría
- `trends_timestamp_idx`: Verificado para ordenamiento por fecha

### Vistas Creadas:
- `trends_recent_deportes`: Últimos trends deportivos
- `trends_recent_generales`: Últimos trends no deportivos
- `trends_distribution_stats`: Estadísticas de distribución por categoría

## 🚀 Instrucciones de Ejecución

### Opción 1: Usando Supabase MCP (Recomendado)

1. Abre tu cliente MCP de Supabase
2. Ejecuta el archivo: `migrations/add_sports_filter_to_trends.sql`
3. Verifica los mensajes NOTICE para ver el resumen de la migración

### Opción 2: Usando Supabase Dashboard

1. Ve a tu proyecto en [Supabase Dashboard](https://supabase.com/dashboard)
2. Navega a: SQL Editor
3. Copia y pega el contenido de `add_sports_filter_to_trends.sql`
4. Ejecuta el script
5. Revisa los resultados en la pestaña de "Results"

### Opción 3: Usando CLI de Supabase

```bash
cd "Pulse Journal/NewsCron/migrations"
supabase db execute -f add_sports_filter_to_trends.sql --project-ref YOUR_PROJECT_REF
```

## ✅ Verificación Post-Migración

Ejecuta estas consultas para verificar que todo funcionó correctamente:

### 1. Verificar campos nuevos
```sql
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'trends' 
AND column_name IN ('is_deportes', 'categoria_principal');
```

### 2. Ver distribución de categorías
```sql
SELECT 
    categoria_principal,
    is_deportes,
    COUNT(*) as total,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as porcentaje
FROM public.trends
GROUP BY categoria_principal, is_deportes
ORDER BY total DESC;
```

### 3. Ver trends recientes deportivos
```sql
SELECT id, timestamp, categoria_principal, is_deportes
FROM trends_recent_deportes
LIMIT 10;
```

### 4. Ver trends recientes generales
```sql
SELECT id, timestamp, categoria_principal, is_deportes
FROM trends_recent_generales
LIMIT 10;
```

### 5. Ver estadísticas de los últimos 7 días
```sql
SELECT * FROM trends_distribution_stats
WHERE fecha >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY fecha DESC, total_trends DESC;
```

## 📊 Resultados Esperados

Después de ejecutar la migración, deberías ver:

- ✅ **Campos agregados**: `is_deportes` y `categoria_principal` en todos los registros
- ✅ **Backfill completado**: Registros históricos clasificados correctamente
- ✅ **Índices creados**: Búsquedas rápidas habilitadas
- ✅ **Vistas disponibles**: Consultas simplificadas para deportes y generales

### Distribución Típica Esperada (puede variar):
- **Deportes**: 30-40% de los trends totales
- **Política**: 20-30%
- **Económica**: 10-15%
- **Sociales**: 10-15%
- **General**: 10-20%
- **Otros**: 5-10%

## 🔧 Troubleshooting

### Error: "column already exists"
Si algún campo ya existe, la migración lo ignorará gracias a `IF NOT EXISTS`. No es un problema.

### Error: "permission denied"
Asegúrate de estar usando el **service_role_key** o tener permisos de administrador en Supabase.

### Resultados inesperados en el backfill
Si los porcentajes no se ven correctos, puedes volver a ejecutar solo la sección de UPDATE:

```sql
-- Re-ejecutar backfill de deportes
UPDATE public.trends
SET is_deportes = FALSE, categoria_principal = 'General'
WHERE TRUE; -- Resetear todo

-- Luego ejecutar las secciones UPDATE del script original
```

## 📈 Monitoreo Post-Migración

Después de la migración, monitorea:

1. **Dashboard de Admin**: Verifica la distribución en tiempo real
2. **Logs del Cron**: Observa los nuevos logs de clasificación
3. **Frontend**: Comprueba que la nueva sección "Deportes" funciona

## 🔄 Rollback (Si es necesario)

Si necesitas revertir la migración:

```sql
-- Eliminar campos
ALTER TABLE public.trends DROP COLUMN IF EXISTS is_deportes;
ALTER TABLE public.trends DROP COLUMN IF EXISTS categoria_principal;

-- Eliminar índices
DROP INDEX IF EXISTS trends_is_deportes_idx;
DROP INDEX IF EXISTS trends_categoria_principal_idx;

-- Eliminar vistas
DROP VIEW IF EXISTS trends_recent_deportes;
DROP VIEW IF EXISTS trends_recent_generales;
DROP VIEW IF EXISTS trends_distribution_stats;
```

## 📞 Soporte

Si encuentras problemas durante la migración:
1. Revisa los logs de Supabase
2. Verifica que la tabla `trends` existe
3. Confirma que tienes los permisos necesarios
4. Consulta la documentación de Supabase MCP

---

**Próximos Pasos**: Después de ejecutar esta migración, continúa con:
- ✅ Fase 2: Modificar `fetch_trending_process.js` (detección y balanceo)
- ✅ Fase 3: Actualizar ExtractorW para guardar los nuevos campos
- ✅ Fase 4: Actualizar frontend ThePulse para mostrar la división
