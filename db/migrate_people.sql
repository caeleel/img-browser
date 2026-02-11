-- People table to store recognized individuals
CREATE TABLE people (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    face_encoding VECTOR(128) NOT NULL, -- Face encoding vector for face recognition
    representative_image_id INTEGER, -- Reference to a representative image for this person
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on face encoding for similarity searches
CREATE INDEX idx_people_face_encoding ON people USING ivfflat (face_encoding vector_cosine_ops);

-- Trigger to automatically update updated_at timestamp
CREATE TRIGGER update_people_updated_at
    BEFORE UPDATE ON people
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add constraint to make representative_image_id reference image_metadata table
-- (We'll add this after creating the join table)