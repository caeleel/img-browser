-- SigLIP 2 (google/siglip2-base-patch16-256, 768-d) embeddings. Replaces image_embeddings
-- (CLIP ViT-B/32, 512-d), which can be dropped once search is verified on this table.
--
-- No ANN index: at this library's size an exact scan is fast and never misses results.
CREATE TABLE image_embeddings_v2 (
    image_id INTEGER PRIMARY KEY REFERENCES image_metadata(id) ON DELETE CASCADE,
    embedding vector(768) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER update_image_embeddings_v2_updated_at
    BEFORE UPDATE ON image_embeddings_v2
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
