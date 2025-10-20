-- ============================================================
-- MIGRACIÓN: Sistema de Filtrado de Deportes en Trends
-- Fecha: 2025-10-05
-- Propósito: Agregar campos para clasificar y balancear trends deportivos
-- ============================================================

-- 1. Agregar campos de clasificación a la tabla trends
ALTER TABLE public.trends 
ADD COLUMN IF NOT EXISTS is_deportes BOOLEAN DEFAULT FALSE;

ALTER TABLE public.trends 
ADD COLUMN IF NOT EXISTS categoria_principal TEXT DEFAULT 'General';

-- 2. Crear índices para búsquedas eficientes
CREATE INDEX IF NOT EXISTS trends_is_deportes_idx ON public.trends(is_deportes);
CREATE INDEX IF NOT EXISTS trends_categoria_principal_idx ON public.trends(categoria_principal);

-- Verificar que el índice de timestamp existe
CREATE INDEX IF NOT EXISTS trends_timestamp_idx ON public.trends(timestamp DESC);

-- 3. Comentarios para documentación
COMMENT ON COLUMN public.trends.is_deportes IS 'Indica si el trend es principalmente deportivo (true) o no (false). Usado para balanceo de contenido.';
COMMENT ON COLUMN public.trends.categoria_principal IS 'Categoría principal detectada: Deportes, Política, Económica, Seguridad, Sociales, Entretenimiento, General';

-- 4. Backfill: Actualizar registros existentes basados en contenido
-- Esta consulta marca como deportivos los trends que contienen keywords deportivas

UPDATE public.trends
SET 
    is_deportes = TRUE,
    categoria_principal = 'Deportes'
WHERE 
    is_deportes = FALSE -- Solo actualizar los que aún no están marcados
    AND (
        -- Buscar en word_cloud_data
        (word_cloud_data::text ~* 'fútbol|futbol|liga|municipal|comunicaciones|antigua|xelajú|xelaju|selección|seleccion|mundial|gol|partido|deportes|campeonato|torneo|copa|jugador|entrenador')
        OR
        -- Buscar en top_keywords
        (top_keywords::text ~* 'fútbol|futbol|liga|municipal|comunicaciones|antigua|xelajú|xelaju|selección|seleccion|mundial|gol|partido|deportes|campeonato|torneo|copa|jugador|entrenador')
        OR
        -- Buscar en category_data
        (category_data::text ~* 'deportes|fútbol|futbol')
    );

-- 5. Actualizar categorías para registros no deportivos (opcional, basado en heurística simple)
UPDATE public.trends
SET categoria_principal = 'Política'
WHERE 
    is_deportes = FALSE 
    AND categoria_principal = 'General'
    AND (
        word_cloud_data::text ~* 'polític|congreso|gobierno|presidente|ley|eleccion|partido|diputado'
        OR top_keywords::text ~* 'polític|congreso|gobierno|presidente|ley|eleccion|partido|diputado'
    );

UPDATE public.trends
SET categoria_principal = 'Económica'
WHERE 
    is_deportes = FALSE 
    AND categoria_principal = 'General'
    AND (
        word_cloud_data::text ~* 'econom|finanz|banco|precio|dólar|inflación|comercio|empleo'
        OR top_keywords::text ~* 'econom|finanz|banco|precio|dólar|inflación|comercio|empleo'
    );

UPDATE public.trends
SET categoria_principal = 'Seguridad'
WHERE 
    is_deportes = FALSE 
    AND categoria_principal = 'General'
    AND (
        word_cloud_data::text ~* 'seguridad|violencia|crimen|policía|pnc|extorsión|pandillas'
        OR top_keywords::text ~* 'seguridad|violencia|crimen|policía|pnc|extorsión|pandillas'
    );

UPDATE public.trends
SET categoria_principal = 'Sociales'
WHERE 
    is_deportes = FALSE 
    AND categoria_principal = 'General'
    AND (
        word_cloud_data::text ~* 'educación|salud|familia|comunidad|cultura|derechos|universidad'
        OR top_keywords::text ~* 'educación|salud|familia|comunidad|cultura|derechos|universidad'
    );

UPDATE public.trends
SET categoria_principal = 'Entretenimiento'
WHERE 
    is_deportes = FALSE 
    AND categoria_principal = 'General'
    AND (
        word_cloud_data::text ~* 'música|artista|cantante|concierto|festival|cine|televisión|farándula'
        OR top_keywords::text ~* 'música|artista|cantante|concierto|festival|cine|televisión|farándula'
    );

-- 6. Crear vistas de conveniencia para consultas frecuentes
CREATE OR REPLACE VIEW trends_recent_deportes AS
SELECT 
    id,
    timestamp,
    created_at,
    word_cloud_data,
    top_keywords,
    category_data,
    about,
    statistics,
    processing_status,
    is_deportes,
    categoria_principal
FROM public.trends
WHERE is_deportes = TRUE
ORDER BY created_at DESC;

CREATE OR REPLACE VIEW trends_recent_generales AS
SELECT 
    id,
    timestamp,
    created_at,
    word_cloud_data,
    top_keywords,
    category_data,
    about,
    statistics,
    processing_status,
    is_deportes,
    categoria_principal
FROM public.trends
WHERE is_deportes = FALSE
ORDER BY created_at DESC;

-- 7. Vista de estadísticas de distribución por categoría
CREATE OR REPLACE VIEW trends_distribution_stats AS
SELECT 
    DATE(created_at) as fecha,
    categoria_principal,
    is_deportes,
    COUNT(*) as total_trends,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY DATE(created_at)), 2) as porcentaje_del_dia
FROM public.trends
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at), categoria_principal, is_deportes
ORDER BY fecha DESC, total_trends DESC;

-- 8. Verificación y reporte de resultados del backfill
DO $$
DECLARE
    total_trends INTEGER;
    deportivos_count INTEGER;
    no_deportivos_count INTEGER;
    porcentaje_deportivos NUMERIC;
BEGIN
    -- Contar totales
    SELECT COUNT(*) INTO total_trends FROM public.trends;
    SELECT COUNT(*) INTO deportivos_count FROM public.trends WHERE is_deportes = TRUE;
    SELECT COUNT(*) INTO no_deportivos_count FROM public.trends WHERE is_deportes = FALSE;
    
    -- Calcular porcentaje
    IF total_trends > 0 THEN
        porcentaje_deportivos := ROUND((deportivos_count::NUMERIC / total_trends::NUMERIC) * 100, 2);
    ELSE
        porcentaje_deportivos := 0;
    END IF;
    
    -- Imprimir resultados
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'RESUMEN DE MIGRACIÓN - Sistema de Filtrado de Deportes';
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'Total de trends: %', total_trends;
    RAISE NOTICE 'Trends deportivos: % (%%)', deportivos_count, porcentaje_deportivos;
    RAISE NOTICE 'Trends no deportivos: % (%%)', no_deportivos_count, ROUND(100 - porcentaje_deportivos, 2);
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'Distribución por categoría principal:';
    
    -- Mostrar distribución por categoría
    FOR rec IN 
        SELECT categoria_principal, COUNT(*) as total
        FROM public.trends
        GROUP BY categoria_principal
        ORDER BY total DESC
    LOOP
        RAISE NOTICE '  - %: %', rec.categoria_principal, rec.total;
    END LOOP;
    
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'Migración completada exitosamente';
    RAISE NOTICE '============================================================';
END $$;
