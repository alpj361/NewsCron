-- Crear tabla para almacenar tweets relacionados con trending topics
CREATE TABLE IF NOT EXISTS trending_tweets (
  id BIGSERIAL PRIMARY KEY,
  
  -- Información del trend
  trend_original TEXT NOT NULL, -- El trend original tal como viene de la API
  trend_clean TEXT NOT NULL,    -- El término de búsqueda limpio extraído del trend
  categoria TEXT NOT NULL,      -- Categoría asignada (Política, Económica, Sociales, General)
  
  -- Información del tweet
  tweet_id TEXT NOT NULL,       -- ID único del tweet
  usuario TEXT NOT NULL,        -- Username del autor del tweet
  fecha_tweet TIMESTAMP,        -- Fecha del tweet original
  texto TEXT NOT NULL,          -- Contenido del tweet
  enlace TEXT,                  -- URL al tweet original
  
  -- Métricas del tweet
  likes INTEGER DEFAULT 0,
  retweets INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  verified BOOLEAN DEFAULT false,
  
  -- Metadatos
  location TEXT DEFAULT 'guatemala',        -- Ubicación para la cual se obtuvo
  fecha_captura TIMESTAMP DEFAULT NOW(),    -- Cuando se capturó este tweet
  raw_data JSONB,                          -- Datos originales completos del tweet
  
  -- Timestamps automáticos
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_trending_tweets_tweet_id ON trending_tweets(tweet_id);
CREATE INDEX IF NOT EXISTS idx_trending_tweets_trend_clean ON trending_tweets(trend_clean);
CREATE INDEX IF NOT EXISTS idx_trending_tweets_categoria ON trending_tweets(categoria);
CREATE INDEX IF NOT EXISTS idx_trending_tweets_fecha_captura ON trending_tweets(fecha_captura);
CREATE INDEX IF NOT EXISTS idx_trending_tweets_location ON trending_tweets(location);
CREATE INDEX IF NOT EXISTS idx_trending_tweets_usuario ON trending_tweets(usuario);

-- Índice compuesto para evitar duplicados por tweet_id y fecha
CREATE UNIQUE INDEX IF NOT EXISTS idx_trending_tweets_unique 
ON trending_tweets(tweet_id, DATE(fecha_captura));

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_trending_tweets_updated_at 
BEFORE UPDATE ON trending_tweets 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comentarios para documentación
COMMENT ON TABLE trending_tweets IS 'Almacena tweets obtenidos basándose en trending topics';
COMMENT ON COLUMN trending_tweets.trend_original IS 'Trend original tal como viene de la API de trending';
COMMENT ON COLUMN trending_tweets.trend_clean IS 'Término de búsqueda limpio usado para obtener tweets';
COMMENT ON COLUMN trending_tweets.categoria IS 'Categoría automáticamente asignada basada en contenido';
COMMENT ON COLUMN trending_tweets.tweet_id IS 'ID único del tweet en la plataforma original';
COMMENT ON COLUMN trending_tweets.raw_data IS 'Datos completos del tweet en formato JSON'; 