import type { RequestContext } from '../_shared'
import {
  enforceRateLimit,
  getSession,
  json,
  missingConfig,
  safeString,
  tooManyRequests,
  writeAuditEvent,
} from '../_shared'

type JobRow = {
  id: string
  employerTenantId: string
  company: string
  title: string
  location: string
  employmentType: string
  workplaceType: string
  description: string
  requiredSkills: string
  salaryMinCents: number | null
  salaryMaxCents: number | null
  salaryCurrency: string
  status: string
  applicantCount: number
  createdAt: string
}

type JobBody = {
  id?: unknown
  title?: unknown
  company?: unknown
  location?: unknown
  employmentType?: unknown
  workplaceType?: unknown
  description?: unknown
  requiredSkills?: unknown
  salaryMinCents?: unknown
  salaryMaxCents?: unknown
  salaryCurrency?: unknown
  status?: unknown
}

const employmentTypes = new Set(['full_time', 'part_time', 'contract', 'internship'])
const workplaceTypes = new Set(['remote', 'hybrid', 'onsite'])
const jobStatuses = new Set(['open', 'paused', 'closed', 'draft'])
const maxSkills = 20
const maxDescription = 8000

async function readBody(request: Request): Promise<JobBody> {
  try {
    return (await request.json()) as JobBody
  } catch {
    return {}
  }
}

function normalizeSkills(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 48)
    .slice(0, maxSkills)
}

function toIntOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null
}

function serializeJob(row: JobRow) {
  return {
    id: row.id,
    company: row.company,
    title: row.title,
    location: row.location,
    employmentType: row.employmentType,
    workplaceType: row.workplaceType,
    description: row.description,
    requiredSkills: JSON.parse(row.requiredSkills || '[]') as string[],
    salaryMinCents: row.salaryMinCents,
    salaryMaxCents: row.salaryMaxCents,
    salaryCurrency: row.salaryCurrency,
    status: row.status,
    applicantCount: row.applicantCount,
    createdAt: row.createdAt,
  }
}

const jobColumns = `
  id,
  employer_tenant_id AS employerTenantId,
  company,
  title,
  location,
  employment_type AS employmentType,
  workplace_type AS workplaceType,
  description,
  required_skills AS requiredSkills,
  salary_min_cents AS salaryMinCents,
  salary_max_cents AS salaryMaxCents,
  salary_currency AS salaryCurrency,
  status,
  applicant_count AS applicantCount,
  created_at AS createdAt
`

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to browse jobs.' }, 401)
  }

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  const scope = url.searchParams.get('scope')
  const query = url.searchParams.get('q')?.trim() ?? ''

  if (id) {
    const row = await env.DB
      .prepare(`SELECT ${jobColumns} FROM jobs WHERE id = ? LIMIT 1`)
      .bind(id)
      .first<JobRow>()
    if (!row || (row.status !== 'open' && row.employerTenantId !== session.tenantId)) {
      return json({ ok: false, error: 'not_found', message: 'That job is no longer available.' }, 404)
    }
    return json({ ok: true, job: serializeJob(row) })
  }

  // Employer's own jobs (any status).
  if (scope === 'mine') {
    const rows = await env.DB
      .prepare(`SELECT ${jobColumns} FROM jobs WHERE employer_tenant_id = ? ORDER BY created_at DESC LIMIT 50`)
      .bind(session.tenantId)
      .all<JobRow>()
    return json({ ok: true, jobs: (rows.results ?? []).map(serializeJob) })
  }

  // Public browse: open jobs, optional keyword filter.
  const like = `%${query.replace(/[%_]/g, '')}%`
  const rows = query
    ? await env.DB
        .prepare(
          `SELECT ${jobColumns} FROM jobs
           WHERE status = 'open' AND (title LIKE ? OR company LIKE ? OR required_skills LIKE ?)
           ORDER BY created_at DESC LIMIT 50`,
        )
        .bind(like, like, like)
        .all<JobRow>()
    : await env.DB
        .prepare(`SELECT ${jobColumns} FROM jobs WHERE status = 'open' ORDER BY created_at DESC LIMIT 50`)
        .all<JobRow>()

  return json({ ok: true, jobs: (rows.results ?? []).map(serializeJob) })
}

export async function onRequestPost({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  // Any signed-in account can post a role. JobsFlow is one login with a Find
  // Work / Hire switch, so the applicant and hiring sides are not separate
  // account types.
  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to post a job.' }, 401)
  }

  const rate = await enforceRateLimit(env, `job-post:${session.tenantId}`, 30, 60)
  if (!rate.allowed) {
    return tooManyRequests(rate)
  }

  const body = await readBody(request)
  const title = safeString(body.title, '')
  if (!title) {
    return json({ ok: false, error: 'title_required', message: 'Give the role a title before posting.' }, 400)
  }

  const company = safeString(body.company, session.tenantName)
  const location = safeString(body.location, 'Remote')
  const employmentType = employmentTypes.has(String(body.employmentType)) ? String(body.employmentType) : 'full_time'
  const workplaceType = workplaceTypes.has(String(body.workplaceType)) ? String(body.workplaceType) : 'remote'
  const description = safeString(body.description, '').slice(0, maxDescription)
  const requiredSkills = normalizeSkills(body.requiredSkills)
  const salaryMinCents = toIntOrNull(body.salaryMinCents)
  const salaryMaxCents = toIntOrNull(body.salaryMaxCents)
  const salaryCurrency = safeString(body.salaryCurrency, 'USD').slice(0, 8)
  const status = body.status === 'draft' ? 'draft' : 'open'
  const jobId = crypto.randomUUID()

  await env.DB
    .prepare(
      `INSERT INTO jobs (
        id, employer_tenant_id, created_by_user_id, title, company, location,
        employment_type, workplace_type, description, required_skills,
        salary_min_cents, salary_max_cents, salary_currency, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      jobId,
      session.tenantId,
      session.userId,
      title,
      company,
      location,
      employmentType,
      workplaceType,
      description,
      JSON.stringify(requiredSkills),
      salaryMinCents,
      salaryMaxCents,
      salaryCurrency,
      status,
    )
    .run()

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'job.posted',
    actorType: 'user',
    action: `Posted job "${title}"`,
    riskLevel: 'low',
    metadata: { jobId, status },
  })

  const row = await env.DB
    .prepare(`SELECT ${jobColumns} FROM jobs WHERE id = ? LIMIT 1`)
    .bind(jobId)
    .first<JobRow>()

  return json({ ok: true, job: row ? serializeJob(row) : null }, 201)
}

// Edit an existing role. Only the owning tenant can update its own postings.
export async function onRequestPut({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to edit a job.' }, 401)
  }

  const rate = await enforceRateLimit(env, `job-edit:${session.tenantId}`, 60, 60)
  if (!rate.allowed) {
    return tooManyRequests(rate)
  }

  const body = await readBody(request)
  const id = safeString(body.id, '')
  if (!id) {
    return json({ ok: false, error: 'id_required', message: 'Missing the job to edit.' }, 400)
  }

  const owned = await env.DB
    .prepare('SELECT id FROM jobs WHERE id = ? AND employer_tenant_id = ? LIMIT 1')
    .bind(id, session.tenantId)
    .first<{ id: string }>()
  if (!owned) {
    return json({ ok: false, error: 'not_found', message: 'That role is not in your workspace.' }, 404)
  }

  const title = safeString(body.title, '')
  if (!title) {
    return json({ ok: false, error: 'title_required', message: 'Give the role a title.' }, 400)
  }

  const company = safeString(body.company, session.tenantName)
  const location = safeString(body.location, 'Remote')
  const employmentType = employmentTypes.has(String(body.employmentType)) ? String(body.employmentType) : 'full_time'
  const workplaceType = workplaceTypes.has(String(body.workplaceType)) ? String(body.workplaceType) : 'remote'
  const description = safeString(body.description, '').slice(0, maxDescription)
  const requiredSkills = normalizeSkills(body.requiredSkills)
  const salaryMinCents = toIntOrNull(body.salaryMinCents)
  const salaryMaxCents = toIntOrNull(body.salaryMaxCents)
  const salaryCurrency = safeString(body.salaryCurrency, 'USD').slice(0, 8)
  const status = jobStatuses.has(String(body.status)) ? String(body.status) : 'open'

  await env.DB
    .prepare(
      `UPDATE jobs SET
        title = ?, company = ?, location = ?, employment_type = ?, workplace_type = ?,
        description = ?, required_skills = ?, salary_min_cents = ?, salary_max_cents = ?,
        salary_currency = ?, status = ?
      WHERE id = ? AND employer_tenant_id = ?`,
    )
    .bind(
      title,
      company,
      location,
      employmentType,
      workplaceType,
      description,
      JSON.stringify(requiredSkills),
      salaryMinCents,
      salaryMaxCents,
      salaryCurrency,
      status,
      id,
      session.tenantId,
    )
    .run()

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'job.updated',
    actorType: 'user',
    action: `Updated job "${title}"`,
    riskLevel: 'low',
    metadata: { jobId: id, status },
  })

  const row = await env.DB
    .prepare(`SELECT ${jobColumns} FROM jobs WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<JobRow>()

  return json({ ok: true, job: row ? serializeJob(row) : null })
}

// Delete a role. Cascades to its applications (FK ON DELETE CASCADE). Only the
// owning tenant can delete its own postings.
export async function onRequestDelete({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to delete a job.' }, 401)
  }

  const rate = await enforceRateLimit(env, `job-delete:${session.tenantId}`, 30, 60)
  if (!rate.allowed) {
    return tooManyRequests(rate)
  }

  const url = new URL(request.url)
  const id = url.searchParams.get('id') ?? safeString((await readBody(request)).id, '')
  if (!id) {
    return json({ ok: false, error: 'id_required', message: 'Missing the job to delete.' }, 400)
  }

  const owned = await env.DB
    .prepare('SELECT title FROM jobs WHERE id = ? AND employer_tenant_id = ? LIMIT 1')
    .bind(id, session.tenantId)
    .first<{ title: string }>()
  if (!owned) {
    return json({ ok: false, error: 'not_found', message: 'That role is not in your workspace.' }, 404)
  }

  await env.DB.prepare('DELETE FROM jobs WHERE id = ? AND employer_tenant_id = ?').bind(id, session.tenantId).run()

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'job.deleted',
    actorType: 'user',
    action: `Deleted job "${owned.title}"`,
    riskLevel: 'medium',
    metadata: { jobId: id },
  })

  return json({ ok: true })
}
