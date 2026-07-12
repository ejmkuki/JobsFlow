import type { RequestContext } from '../_shared'
import { enforceRateLimit, getSession, json, missingConfig, safeString, tooManyRequests } from '../_shared'

type ReferralRow = {
  code: string
  jobId: string
  jobTitle: string
  jobSlug: string
  createdAt: string
  referredApplications: number
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }
  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to view your referrals.' }, 401)
  }

  const rows = await env.DB
    .prepare(
      `SELECT rc.code, rc.job_id AS jobId, j.title AS jobTitle, j.slug AS jobSlug, rc.created_at AS createdAt,
              (SELECT COUNT(*) FROM job_applications a WHERE a.referred_by_tenant_id = rc.tenant_id AND a.job_id = rc.job_id) AS referredApplications
       FROM referral_codes rc INNER JOIN jobs j ON j.id = rc.job_id
       WHERE rc.tenant_id = ? ORDER BY rc.created_at DESC`,
    )
    .bind(session.tenantId)
    .all<ReferralRow>()

  const referrals = rows.results ?? []
  return json({ ok: true, referrals, totalReferredApplications: referrals.reduce((sum, r) => sum + r.referredApplications, 0) })
}

export async function onRequestPost({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }
  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to share a role.' }, 401)
  }

  const rate = await enforceRateLimit(env, `referral:${session.tenantId}`, 30, 60)
  if (!rate.allowed) {
    return tooManyRequests(rate)
  }

  const body = (await request.json().catch(() => ({}))) as { jobId?: unknown }
  const jobId = safeString(body.jobId, '')
  if (!jobId) {
    return json({ ok: false, error: 'job_required', message: 'Choose a job to share.' }, 400)
  }

  const job = await env.DB
    .prepare(`SELECT id, employer_tenant_id AS employerTenantId FROM jobs WHERE id = ? AND status = 'open' LIMIT 1`)
    .bind(jobId)
    .first<{ id: string; employerTenantId: string }>()
  if (!job) {
    return json({ ok: false, error: 'not_found', message: 'That job is not open right now.' }, 404)
  }
  if (job.employerTenantId === session.tenantId) {
    return json({ ok: false, error: 'own_job', message: 'You cannot refer your own posting.' }, 400)
  }

  const existing = await env.DB
    .prepare('SELECT code FROM referral_codes WHERE tenant_id = ? AND job_id = ? LIMIT 1')
    .bind(session.tenantId, jobId)
    .first<{ code: string }>()
  if (existing) {
    return json({ ok: true, code: existing.code })
  }

  const code = crypto.randomUUID().replace(/-/g, '').slice(0, 10)
  await env.DB
    .prepare('INSERT INTO referral_codes (code, tenant_id, job_id) VALUES (?, ?, ?)')
    .bind(code, session.tenantId, jobId)
    .run()

  return json({ ok: true, code }, 201)
}
