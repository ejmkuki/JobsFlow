import type { RequestContext } from '../_shared'
import { enforceRateLimit, getSession, json, missingConfig, safeString, tooManyRequests } from '../_shared'
import { computeMatch, type JobForMatch } from '../lib/match'

type PreviewBody = { jobId?: unknown }

type JobRow = {
  employerTenantId: string
  status: string
  title: string
  company: string
  description: string
  requiredSkills: string
}

async function readBody(request: Request): Promise<PreviewBody> {
  try {
    return (await request.json()) as PreviewBody
  } catch {
    return {}
  }
}

// Candidate-facing "how well do I match this job" preview. Does not store
// anything — it just runs the match engine against the caller's resume.
export async function onRequestPost({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }
  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to check your fit.' }, 401)
  }

  const rate = await enforceRateLimit(env, `match-preview:${session.tenantId}`, 40, 60)
  if (!rate.allowed) {
    return tooManyRequests(rate)
  }

  const body = await readBody(request)
  const jobId = safeString(body.jobId, '')
  if (!jobId) {
    return json({ ok: false, error: 'job_required', message: 'Choose a job to check.' }, 400)
  }

  const job = await env.DB
    .prepare(
      `SELECT employer_tenant_id AS employerTenantId, status, title, company, description,
              required_skills AS requiredSkills
       FROM jobs WHERE id = ? LIMIT 1`,
    )
    .bind(jobId)
    .first<JobRow>()

  if (!job || job.status !== 'open') {
    return json({ ok: false, error: 'job_unavailable', message: 'That job is not open.' }, 404)
  }
  if (job.employerTenantId === session.tenantId) {
    return json({ ok: false, error: 'own_job', message: 'This is your own posting.' }, 400)
  }

  const profile = await env.DB
    .prepare('SELECT resume_text AS resumeText FROM candidate_resume_profiles WHERE tenant_id = ? LIMIT 1')
    .bind(session.tenantId)
    .first<{ resumeText: string }>()

  const jobForMatch: JobForMatch = {
    title: job.title,
    company: job.company,
    description: job.description,
    requiredSkills: JSON.parse(job.requiredSkills || '[]') as string[],
  }

  const match = await computeMatch(profile?.resumeText ?? '', jobForMatch, env)
  return json({ ok: true, match })
}
