-- Create extension for vector operations
CREATE EXTENSION IF NOT EXISTS vector;

-- Create new table for embeddings
CREATE TABLE image_embeddings (
    id SERIAL PRIMARY KEY,
    image_id INTEGER NOT NULL REFERENCES image_metadata(id) ON DELETE CASCADE,
    embedding vector(512) NOT NULL,
    version INTEGER DEFAULT 1,  -- to track model versions
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(image_id, version)  -- one embedding per version per image
);

-- Add index for similarity search
CREATE INDEX idx_embedding ON image_embeddings USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- Add index for quick lookups
CREATE INDEX idx_image_id ON image_embeddings(image_id);

-- Trigger to automatically update updated_at timestamp
CREATE TRIGGER update_image_embeddings_updated_at
    BEFORE UPDATE ON image_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
