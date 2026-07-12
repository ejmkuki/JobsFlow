-- Phase H #3: funnel analytics (post -> view -> apply -> advance -> hire).
-- Views are counted from the public, unauthenticated surfaces only (the
-- /jobs/{slug} permalink and the embeddable widget) — first-party, no PII,
-- just an aggregate counter. Apply/advance/hire are already derivable from
-- job_applications and job_application_events.
ALTER TABLE jobs ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;
