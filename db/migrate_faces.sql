-- Face search. Faces are detected and embedded locally by scripts/index_faces.py
-- (InsightFace buffalo_l: SCRFD detector + ArcFace 512-d embeddings) from the 800px thumbnails,
-- then clustered into persons (the old, unused `people` table is unrelated). Persons start unnamed; the user names, merges and corrects them.

CREATE TABLE persons (
    id SERIAL PRIMARY KEY,
    name TEXT,                                   -- NULL until the user names them
    hidden BOOLEAN NOT NULL DEFAULT FALSE,       -- user chose to hide this person from the People page
    cover_face_id INTEGER,                       -- FK added below, after faces exists
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE faces (
    id SERIAL PRIMARY KEY,
    image_id INTEGER NOT NULL REFERENCES image_metadata(id) ON DELETE CASCADE,
    -- Bounding box as fractions (0-1) of the displayed image, i.e. after EXIF rotation
    x REAL NOT NULL,
    y REAL NOT NULL,
    width REAL NOT NULL,
    height REAL NOT NULL,
    det_score REAL NOT NULL,
    embedding vector(512) NOT NULL,
    person_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
    -- TRUE once the user has placed (or removed) this face by hand; clustering never moves it again
    user_assigned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_faces_image_id ON faces(image_id);
CREATE INDEX idx_faces_person_id ON faces(person_id);

ALTER TABLE persons
    ADD CONSTRAINT persons_cover_face_id_fkey FOREIGN KEY (cover_face_id) REFERENCES faces(id) ON DELETE SET NULL;

-- Which images have been scanned for faces (including ones with none), so re-runs only do new images
CREATE TABLE face_scans (
    image_id INTEGER PRIMARY KEY REFERENCES image_metadata(id) ON DELETE CASCADE,
    face_count INTEGER NOT NULL,
    scanned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER update_persons_updated_at
    BEFORE UPDATE ON persons
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
