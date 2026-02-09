-- Agregar columna source_type a trending_tweets
-- Valores: 'trend' (por defecto) o 'profile'

ALTER TABLE trending_tweets 
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'trend';

-- Agregar constraint para validar valores
ALTER TABLE trending_tweets 
ADD CONSTRAINT IF NOT EXISTS check_source_type 
CHECK (source_type IN ('trend', 'profile'));

-- Crear índice para filtrar por source_type
CREATE INDEX IF NOT EXISTS idx_trending_tweets_source_type 
ON trending_tweets(source_type);

-- Comentario para documentación
COMMENT ON COLUMN trending_tweets.source_type IS 'Origen del tweet: trend (de tendencias) o profile (de perfil específico)';
