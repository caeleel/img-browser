-- Cover image shown on a folder's card. Folder paths end with '/', like S3 prefixes.
CREATE TABLE folder_covers (
    folder_path TEXT PRIMARY KEY,
    image_id INTEGER NOT NULL REFERENCES image_metadata(id) ON DELETE CASCADE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_folder_covers_image_id ON folder_covers(image_id);
