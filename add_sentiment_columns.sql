-- Script para añadir campos de análisis de sentimiento a la tabla trending_tweets existente
-- Ejecutar en Supabase SQL Editor

-- Añadir columnas de análisis de sentimiento
ALTER TABLE trending_tweets 
ADD COLUMN IF NOT EXISTS sentimiento TEXT CHECK (sentimiento IN ('positivo', 'negativo', 'neutral')) DEFAULT 'neutral',
ADD COLUMN IF NOT EXISTS score_sentimiento DECIMAL(3,2) CHECK (score_sentimiento >= -1.0 AND score_sentimiento <= 1.0) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS confianza_sentimiento DECIMAL(3,2) CHECK (confianza_sentimiento >= 0.0 AND confianza_sentimiento <= 1.0) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS emociones_detectadas JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS analisis_ai_metadata JSONB DEFAULT '{}'::jsonb;

-- Añadir nuevos campos de análisis avanzado
ALTER TABLE trending_tweets
ADD COLUMN IF NOT EXISTS intencion_comunicativa TEXT CHECK (intencion_comunicativa IN ('informativo', 'opinativo', 'humoristico', 'alarmista', 'critico', 'promocional', 'conversacional', 'protesta')) DEFAULT 'informativo',
ADD COLUMN IF NOT EXISTS propagacion_viral TEXT CHECK (propagacion_viral IN ('viral', 'alto_engagement', 'medio_engagement', 'bajo_engagement', 'sin_engagement')) DEFAULT 'sin_engagement',
ADD COLUMN IF NOT EXISTS score_propagacion INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS entidades_mencionadas JSONB DEFAULT '[]'::jsonb;

-- Crear índices para optimizar consultas de sentimiento y análisis avanzado
CREATE INDEX IF NOT EXISTS idx_trending_tweets_sentimiento ON trending_tweets(sentimiento);
CREATE INDEX IF NOT EXISTS idx_trending_tweets_score_sentimiento ON trending_tweets(score_sentimiento);
CREATE INDEX IF NOT EXISTS idx_trending_tweets_intencion ON trending_tweets(intencion_comunicativa);
CREATE INDEX IF NOT EXISTS idx_trending_tweets_propagacion ON trending_tweets(propagacion_viral);
CREATE INDEX IF NOT EXISTS idx_trending_tweets_score_propagacion ON trending_tweets(score_propagacion);

-- Índice para búsqueda de entidades (GIN para búsqueda eficiente en JSONB)
CREATE INDEX IF NOT EXISTS idx_trending_tweets_entidades ON trending_tweets USING GIN (entidades_mencionadas);

-- Añadir comentarios para documentación
COMMENT ON COLUMN trending_tweets.sentimiento IS 'Clasificación de sentimiento: positivo, negativo, neutral';
COMMENT ON COLUMN trending_tweets.score_sentimiento IS 'Puntuación numérica del sentimiento (-1.0 a 1.0)';
COMMENT ON COLUMN trending_tweets.confianza_sentimiento IS 'Nivel de confianza del análisis (0.0 a 1.0)';
COMMENT ON COLUMN trending_tweets.emociones_detectadas IS 'Array de emociones detectadas con intensidad';
COMMENT ON COLUMN trending_tweets.analisis_ai_metadata IS 'Metadatos del análisis de IA (modelo usado, timestamp, etc.)';

-- Comentarios para nuevos campos
COMMENT ON COLUMN trending_tweets.intencion_comunicativa IS 'Intención del tweet: informativo, opinativo, humorístico, alarmista, crítico, promocional, conversacional, protesta';
COMMENT ON COLUMN trending_tweets.propagacion_viral IS 'Nivel de propagación basado en engagement: viral, alto, medio, bajo, sin engagement';
COMMENT ON COLUMN trending_tweets.score_propagacion IS 'Score numérico de propagación calculado desde likes+retweets+replies';
COMMENT ON COLUMN trending_tweets.entidades_mencionadas IS 'Array de entidades extraídas: personas, organizaciones, lugares, eventos';

-- Actualizar descripción de la tabla
COMMENT ON TABLE trending_tweets IS 'Almacena tweets obtenidos basándose en trending topics con análisis completo de sentimiento, intención y entidades';

-- Función para calcular score de propagación automáticamente
CREATE OR REPLACE FUNCTION calculate_propagation_score()
RETURNS TRIGGER AS $$
BEGIN
    -- Calcular score basado en métricas de engagement
    NEW.score_propagacion := (NEW.likes * 1) + (NEW.retweets * 3) + (NEW.replies * 2);
    
    -- Clasificar nivel de propagación
    IF NEW.score_propagacion >= 10000 THEN
        NEW.propagacion_viral := 'viral';
    ELSIF NEW.score_propagacion >= 1000 THEN
        NEW.propagacion_viral := 'alto_engagement';
    ELSIF NEW.score_propagacion >= 100 THEN
        NEW.propagacion_viral := 'medio_engagement';
    ELSIF NEW.score_propagacion >= 10 THEN
        NEW.propagacion_viral := 'bajo_engagement';
    ELSE
        NEW.propagacion_viral := 'sin_engagement';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para calcular propagación automáticamente
CREATE TRIGGER trigger_calculate_propagation
    BEFORE INSERT OR UPDATE ON trending_tweets
    FOR EACH ROW
    EXECUTE FUNCTION calculate_propagation_score();

-- Consulta para verificar la estructura actualizada
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'trending_tweets' 
ORDER BY ordinal_position; 