-- Distinguishes must-have (required_skills, existing) from nice-to-have
-- skills on a job posting — same JSON-array-as-TEXT storage as required_skills.
ALTER TABLE jobs ADD COLUMN nice_to_have_skills TEXT NOT NULL DEFAULT '[]';
