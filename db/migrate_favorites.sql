CREATE TABLE favorites (
    id SERIAL PRIMARY KEY,
    image_id INTEGER NOT NULL REFERENCES image_metadata(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(image_id)
);

CREATE INDEX idx_favorites_image_id ON favorites(image_id); 