-- Per-file extracted text, so a candidate with multiple resume files can
-- Check Fit against a specific one instead of only the single profile text.
ALTER TABLE resume_artifacts ADD COLUMN extracted_text TEXT NOT NULL DEFAULT '';
