CREATE TABLE image_metadata (
    id SERIAL PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    taken_at TIMESTAMP WITH TIME ZONE,
    latitude double precision,
    longitude double precision,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    notes TEXT,
    
    -- Camera details
    camera_make VARCHAR(100),
    camera_model VARCHAR(100),
    lens_model VARCHAR(100),
    
    -- Technical details
    aperture double precision,  -- f-number (e.g., 2.8)
    iso INTEGER,
    shutter_speed double precision,  -- seconds
    focal_length double precision,  -- mm

    -- File details
    orientation INTEGER,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indices
CREATE INDEX idx_path ON image_metadata(path);
CREATE INDEX idx_taken_at ON image_metadata(taken_at);
CREATE INDEX idx_location ON image_metadata(country, state, city);

-- Trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_image_metadata_updated_at
    BEFORE UPDATE ON image_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();