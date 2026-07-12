-- Phase E #4: explicit consent before AI-assisted matching ever touches a
-- candidate's application. Recorded once per candidate tenant, the first
-- time they apply; not asked again after that.
ALTER TABLE candidate_resume_profiles ADD COLUMN ai_consent_at TEXT;
