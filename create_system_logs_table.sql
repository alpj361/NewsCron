-- Tabla de logs del sistema para monitoreo de costos y rendimiento
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS system_execution_logs (
  id BIGSERIAL PRIMARY KEY,
  
  -- Información de la ejecución
  execution_id UUID DEFAULT gen_random_uuid(),
  script_name TEXT NOT NULL,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  duration_seconds INTEGER,
  status TEXT CHECK (status IN ('running', 'completed', 'failed', 'partial')) DEFAULT 'running',
  
  -- Métricas de procesamiento
  trends_found INTEGER DEFAULT 0,
  tweets_found INTEGER DEFAULT 0,
  tweets_processed INTEGER DEFAULT 0,
  tweets_saved INTEGER DEFAULT 0,
  tweets_failed INTEGER DEFAULT 0,
  duplicates_skipped INTEGER DEFAULT 0,
  
  -- Métricas de IA y costos
  ai_requests_made INTEGER DEFAULT 0,
  ai_requests_successful INTEGER DEFAULT 0,
  ai_requests_failed INTEGER DEFAULT 0,
  total_tokens_used INTEGER DEFAULT 0,
  estimated_cost_usd DECIMAL(10,6) DEFAULT 0.000000,
  
  -- Análisis por categoría
  categoria_stats JSONB DEFAULT '{}'::jsonb,
  sentimiento_stats JSONB DEFAULT '{}'::jsonb,
  intencion_stats JSONB DEFAULT '{}'::jsonb,
  propagacion_stats JSONB DEFAULT '{}'::jsonb,
  
  -- Información técnica
  api_response_time_ms INTEGER,
  memory_usage_mb INTEGER,
  error_details JSONB DEFAULT '[]'::jsonb,
  warnings JSONB DEFAULT '[]'::jsonb,
  
  -- Metadatos
  location TEXT DEFAULT 'guatemala',
  environment TEXT DEFAULT 'production',
  version TEXT DEFAULT '1.0',
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para optimización
CREATE INDEX IF NOT EXISTS idx_system_logs_started_at ON system_execution_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_status ON system_execution_logs(status);
CREATE INDEX IF NOT EXISTS idx_system_logs_script_name ON system_execution_logs(script_name);
CREATE INDEX IF NOT EXISTS idx_system_logs_execution_id ON system_execution_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_cost ON system_execution_logs(estimated_cost_usd DESC);

-- Índice compuesto para consultas de dashboard
CREATE INDEX IF NOT EXISTS idx_system_logs_dashboard ON system_execution_logs(started_at DESC, status, script_name);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_system_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_system_logs_updated_at
    BEFORE UPDATE ON system_execution_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_system_logs_updated_at();

-- Comentarios para documentación
COMMENT ON TABLE system_execution_logs IS 'Logs de ejecución del sistema para monitoreo de costos y rendimiento';
COMMENT ON COLUMN system_execution_logs.execution_id IS 'ID único de la ejecución para tracking';
COMMENT ON COLUMN system_execution_logs.estimated_cost_usd IS 'Costo estimado en USD de la ejecución';
COMMENT ON COLUMN system_execution_logs.categoria_stats IS 'Estadísticas por categoría de tweets';
COMMENT ON COLUMN system_execution_logs.sentimiento_stats IS 'Distribución de sentimientos detectados';
COMMENT ON COLUMN system_execution_logs.error_details IS 'Detalles de errores ocurridos durante la ejecución';

-- Vista para dashboard de administrador
CREATE OR REPLACE VIEW admin_execution_summary AS
SELECT 
    execution_id,
    script_name,
    started_at,
    completed_at,
    duration_seconds,
    status,
    tweets_processed,
    tweets_saved,
    ai_requests_made,
    estimated_cost_usd,
    CASE 
        WHEN tweets_processed > 0 THEN 
            ROUND((tweets_saved::DECIMAL / tweets_processed) * 100, 2)
        ELSE 0 
    END as success_rate_percent,
    CASE 
        WHEN ai_requests_made > 0 THEN 
            ROUND((ai_requests_successful::DECIMAL / ai_requests_made) * 100, 2)
        ELSE 0 
    END as ai_success_rate_percent,
    CASE 
        WHEN tweets_processed > 0 THEN 
            ROUND(estimated_cost_usd / tweets_processed, 6)
        ELSE 0 
    END as cost_per_tweet
FROM system_execution_logs
ORDER BY started_at DESC;

-- Consultas útiles para dashboard

-- Estadísticas de costos diarios
CREATE OR REPLACE VIEW daily_cost_stats AS
SELECT 
    DATE(started_at) as date,
    COUNT(*) as executions,
    SUM(tweets_processed) as total_tweets,
    SUM(estimated_cost_usd) as total_cost,
    AVG(estimated_cost_usd) as avg_cost_per_execution,
    MAX(estimated_cost_usd) as max_cost,
    SUM(ai_requests_made) as total_ai_requests
FROM system_execution_logs
WHERE status = 'completed'
GROUP BY DATE(started_at)
ORDER BY date DESC;

-- Estadísticas de rendimiento por semana
CREATE OR REPLACE VIEW weekly_performance_stats AS
SELECT 
    DATE_TRUNC('week', started_at) as week,
    COUNT(*) as executions,
    AVG(duration_seconds) as avg_duration,
    AVG(tweets_processed) as avg_tweets_per_execution,
    SUM(estimated_cost_usd) as total_cost,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_executions
FROM system_execution_logs
GROUP BY DATE_TRUNC('week', started_at)
ORDER BY week DESC;

-- Verificar estructura
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'system_execution_logs' 
ORDER BY ordinal_position; 