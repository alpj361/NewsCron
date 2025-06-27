-- Create public_events table for storing scraped events from Guatemala sources
-- Similar structure to news table but adapted for events

CREATE TABLE IF NOT EXISTS public_events (
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
    
    -- Additional event-specific fields
    precio VARCHAR(100),
    organizador VARCHAR(200),
    tipo_evento VARCHAR(50) DEFAULT 'Presencial',
    estado VARCHAR(50) DEFAULT 'Activo',
    
    -- Metadata fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_event_url_fecha UNIQUE(url, fecha_evento),
    CONSTRAINT valid_categoria CHECK (categoria IN (
        'Música', 'Deportes', 'Cultura', 'Educación', 
        'Gastronomía', 'Tecnología', 'Negocios', 
        'Entretenimiento', 'General'
    )),
    CONSTRAINT valid_estado CHECK (estado IN ('Activo', 'Cancelado', 'Pospuesto', 'Finalizado'))
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_public_events_categoria ON public_events(categoria);
CREATE INDEX IF NOT EXISTS idx_public_events_fecha_evento ON public_events(fecha_evento);
CREATE INDEX IF NOT EXISTS idx_public_events_fuente ON public_events(fuente);
CREATE INDEX IF NOT EXISTS idx_public_events_fecha_scraping ON public_events(fecha_scraping);
CREATE INDEX IF NOT EXISTS idx_public_events_ubicacion ON public_events(ubicacion);
CREATE INDEX IF NOT EXISTS idx_public_events_estado ON public_events(estado);

-- Create a GIN index for JSONB raw data
CREATE INDEX IF NOT EXISTS idx_public_events_raw_gin ON public_events USING GIN(raw);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_public_events_updated_at 
    BEFORE UPDATE ON public_events 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add RLS (Row Level Security) policies if needed
ALTER TABLE public_events ENABLE ROW LEVEL SECURITY;

-- Policy to allow read access to all authenticated users
CREATE POLICY "Allow read access to all users" ON public_events
    FOR SELECT USING (true);

-- Policy to allow insert/update for service role
CREATE POLICY "Allow insert for service role" ON public_events
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update for service role" ON public_events
    FOR UPDATE USING (true);

-- Grant permissions
GRANT SELECT ON public_events TO anon, authenticated;
GRANT ALL ON public_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public_events_id_seq TO anon, authenticated, service_role;

-- Add comments for documentation
COMMENT ON TABLE public_events IS 'Stores public events scraped from various Guatemala sources';
COMMENT ON COLUMN public_events.titulo IS 'Event title/name';
COMMENT ON COLUMN public_events.descripcion IS 'Event description';
COMMENT ON COLUMN public_events.categoria IS 'Event category (Música, Deportes, etc.)';
COMMENT ON COLUMN public_events.fecha_evento IS 'Date when the event takes place';
COMMENT ON COLUMN public_events.ubicacion IS 'Event location/venue';
COMMENT ON COLUMN public_events.fuente IS 'Source where the event was scraped from';
COMMENT ON COLUMN public_events.url IS 'Original URL of the event';
COMMENT ON COLUMN public_events.fecha_scraping IS 'When the event was scraped';
COMMENT ON COLUMN public_events.raw IS 'Raw JSON data from the scraper';
COMMENT ON COLUMN public_events.precio IS 'Event price information';
COMMENT ON COLUMN public_events.organizador IS 'Event organizer';
COMMENT ON COLUMN public_events.tipo_evento IS 'Event type (Presencial, Virtual, Híbrido)';
COMMENT ON COLUMN public_events.estado IS 'Event status (Activo, Cancelado, etc.)';

-- Create a view for active upcoming events
CREATE OR REPLACE VIEW upcoming_events AS
SELECT 
    id,
    titulo,
    descripcion,
    categoria,
    fecha_evento,
    ubicacion,
    fuente,
    url,
    precio,
    organizador,
    tipo_evento,
    fecha_scraping
FROM public_events 
WHERE estado = 'Activo' 
  AND (fecha_evento IS NULL OR fecha_evento >= CURRENT_DATE)
ORDER BY fecha_evento ASC NULLS LAST, fecha_scraping DESC;

COMMENT ON VIEW upcoming_events IS 'View showing only active upcoming events';

-- Create a view for events by category
CREATE OR REPLACE VIEW events_by_category AS
SELECT 
    categoria,
    COUNT(*) as total_events,
    COUNT(CASE WHEN fecha_evento >= CURRENT_DATE THEN 1 END) as upcoming_events,
    COUNT(CASE WHEN fecha_evento < CURRENT_DATE THEN 1 END) as past_events,
    MAX(fecha_scraping) as last_updated
FROM public_events 
WHERE estado = 'Activo'
GROUP BY categoria
ORDER BY total_events DESC;

COMMENT ON VIEW events_by_category IS 'Statistics of events grouped by category';

-- Sample data for testing (optional)
-- INSERT INTO public_events (titulo, descripcion, categoria, fecha_evento, ubicacion, fuente, url, raw) VALUES
-- ('Concierto de Rock Nacional', 'Gran concierto con las mejores bandas de Guatemala', 'Música', '2025-02-15', 'Teatro Nacional, Guatemala City', 'guatemala_com', 'https://example.com/evento1', '{"test": true}'),
-- ('Torneo de Fútbol Local', 'Campeonato de fútbol amateur', 'Deportes', '2025-02-20', 'Estadio Municipal', 'eventbrite_guatemala', 'https://example.com/evento2', '{"test": true}'),
-- ('Exposición de Arte Contemporáneo', 'Muestra de artistas guatemaltecos', 'Cultura', '2025-02-25', 'Museo Nacional', 'eticket_guatemala', 'https://example.com/evento3', '{"test": true}');

-- Final verification
SELECT 'public_events table created successfully' as status; 