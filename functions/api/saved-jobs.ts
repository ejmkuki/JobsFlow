import type { RequestContext } from '../_shared'
import { enforceRateLimit, getSession, json, missingConfig, safeString, tooManyRequests } from '../_shared'

type SavedJobRow = {
  jobId: string
  title: string
  company: string
  location: string
  employmentType: string
  workplaceType: string
  requiredSkills: string
  salaryMinCents: number | null
  salaryMaxCents: number | null
  salaryCurrency: string
  status: string
  savedAt: string
}

function serializeSavedJob(row: SavedJobRow) {
  return {
    jobId: row.jobId,
    title: row.title,
    company: row.company,
    location: row.location,
    employmentType: row.employmentType,
    workplaceType: row.workplaceType,
    requiredSkills: JSON.parse(row.requiredSkills || '[]') as string[],
    salaryMinCents: row.salaryMinCents,
    salaryMaxCents: row.salaryMaxCents,
    salaryCurrency: row.salaryCurrency,
    status: row.status,
    savedAt: row.savedAt,
  }
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to view saved jobs.' }, 401)
  }

  const rows = await env.DB
    .prepare(
      `SELECT
        j.id AS jobId,
        j.title AS title,
        j.company AS company,
        j.location AS location,
        j.employment_type AS employmentType,
        j.workplace_type AS workplaceType,
        j.required_skills AS requiredSkills,
        j.salary_min_cents AS salaryMinCents,
        j.salary_max_cents AS salaryMaxCents,
        j.salary_currency AS salaryCurrency,
        j.status AS status,
        s.created_at AS savedAt
       FROM saved_jobs s
       INNER JOIN jobs j ON j.id = s.job_id
       WHERE s.tenant_id = ?
       ORDER BY s.created_at DESC
       LIMIT 100`,
    )
    .bind(session.tenantId)
    .all<SavedJobRow>()

  return json({ ok: true, savedJobs: (rows.results ?? []).map(serializeSavedJob) })
}

export async function onRequestPost({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to save a job.' }, 401)
  }

  const rate = await enforceRateLimit(env, `saved-job:${session.tenantId}`, 60, 60)
  if (!rate.allowed) {
    return tooManyRequests(rate)
  }

  const body = (await request.json().catch(() => ({}))) as { jobId?: unknown }
  const jobId = safeString(body.jobId, '')
  if (!jobId) {
    return json({ ok: false, error: 'job_required', message: 'Missing the job to save.' }, 400)
  }

  const job = await env.DB.prepare('SELECT id FROM jobs WHERE id = ? LIMIT 1').bind(jobId).first<{ id: string }>()
  if (!job) {
    return json({ ok: false, error: 'not_found', message: 'That job is no longer available.' }, 404)
  }

  await env.DB
    .prepare('INSERT OR IGNORE INTO saved_jobs (id, tenant_id, job_id) VALUES (?, ?, ?)')
    .bind(crypto.randomUUID(), session.tenantId, jobId)
    .run()

  return json({ ok: true }, 201)
}

export async function onRequestDelete({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to unsave a job.' }, 401)
  }

  const url = new URL(request.url)
  const jobId = url.searchParams.get('jobId')
  if (!jobId) {
    return json({ ok: false, error: 'job_required', message: 'Missing the job to unsave.' }, 400)
  }

  await env.DB.prepare('DELETE FROM saved_jobs WHERE tenant_id = ? AND job_id = ?').bind(session.tenantId, jobId).run()

  return json({ ok: true })
}
