-- Faces tagged by hand: the user draws a box in the viewer around a face the detector missed or
-- filtered out. These have no detection score or embedding, so they never influence clustering;
-- they only say who is in the photo (always user_assigned).
ALTER TABLE faces ALTER COLUMN embedding DROP NOT NULL;
ALTER TABLE faces ALTER COLUMN det_score DROP NOT NULL;
