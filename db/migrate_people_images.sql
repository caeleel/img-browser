-- Join table between people and images to track who appears in which image
CREATE TABLE people_images (
    id SERIAL PRIMARY KEY,
    person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    image_id INTEGER NOT NULL REFERENCES image_metadata(id) ON DELETE CASCADE,
    
    -- Bounding box coordinates for the face in the image (normalized 0-1)
    face_left REAL NOT NULL,
    face_top REAL NOT NULL,
    face_right REAL NOT NULL,
    face_bottom REAL NOT NULL,
    
    -- Confidence score for the face detection/recognition
    confidence REAL NOT NULL DEFAULT 0.0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique person-image combinations
    UNIQUE(person_id, image_id, face_left, face_top, face_right, face_bottom)
);

-- Create indices for efficient queries
CREATE INDEX idx_people_images_person_id ON people_images(person_id);
CREATE INDEX idx_people_images_image_id ON people_images(image_id);
CREATE INDEX idx_people_images_confidence ON people_images(confidence);

-- Now add the foreign key constraint to people table
ALTER TABLE people 
ADD CONSTRAINT fk_people_representative_image 
FOREIGN KEY (representative_image_id) REFERENCES image_metadata(id) ON DELETE SET NULL;