-- Phase F #1: public, SEO-stable job permalinks at /jobs/{slug}. Generated
-- once at post time (functions/lib/slug.ts) and never regenerated on edit —
-- changing a job's URL would break search indexing and any link already
-- shared. Backfill for pre-existing rows is best-effort slugification
-- (SQLite has no regex replace); new inserts always use the proper JS
-- slugify() which strips everything non-alphanumeric.
ALTER TABLE jobs ADD COLUMN slug TEXT;

UPDATE jobs SET slug = lower(
  trim(
    replace(replace(replace(replace(replace(trim(title), ' ', '-'), '/', '-'), '.', '-'), ',', '-'), '''', ''),
    '-'
  )
) || '-' || substr(id, 1, 8)
WHERE slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_slug ON jobs(slug);
