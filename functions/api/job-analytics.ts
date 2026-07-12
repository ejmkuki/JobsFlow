import type { RequestContext } from '../_shared'
import { getSession, json, missingConfig } from '../_shared'

type FunnelCounts = {
  posted: number
  views: number
  applies: number
  advanced: number
  hired: number
}

async function jobFunnel(env: RequestContext['env'], jobId: string, tenantId: string): Promise<FunnelCounts | null> {
  const job = await env.DB!
    .prepare('SELECT view_count AS viewCount FROM jobs WHERE id = ? AND employer_tenant_id = ? LIMIT 1')
    .bind(jobId, tenantId)
    .first<{ viewCount: number }>()
  if (!job) return null

  const counts = await env.DB!
    .prepare(
      `SELECT
        COUNT(*) AS applies,
        SUM(CASE WHEN status NOT IN ('submitted', 'withdrawn') THEN 1 ELSE 0 END) AS advanced,
        SUM(CASE WHEN status = 'offer' THEN 1 ELSE 0 END) AS hired
       FROM job_applications WHERE job_id = ?`,
    )
    .bind(jobId)
    .first<{ applies: number; advanced: number | null; hired: number | null }>()

  return {
    posted: 1,
    views: job.viewCount,
    applies: counts?.applies ?? 0,
    advanced: counts?.advanced ?? 0,
    hired: counts?.hired ?? 0,
  }
}

async function workspaceFunnel(env: RequestContext['env'], tenantId: string): Promise<FunnelCounts> {
  const jobs = await env.DB!
    .prepare(`SELECT COUNT(*) AS posted, COALESCE(SUM(view_count), 0) AS views FROM jobs WHERE employer_tenant_id = ?`)
    .bind(tenantId)
    .first<{ posted: number; views: number }>()

  const counts = await env.DB!
    .prepare(
      `SELECT
        COUNT(*) AS applies,
        SUM(CASE WHEN status NOT IN ('submitted', 'withdrawn') THEN 1 ELSE 0 END) AS advanced,
        SUM(CASE WHEN status = 'offer' THEN 1 ELSE 0 END) AS hired
       FROM job_applications WHERE employer_tenant_id = ?`,
    )
    .bind(tenantId)
    .first<{ applies: number; advanced: number | null; hired: number | null }>()

  return {
    posted: jobs?.posted ?? 0,
    views: jobs?.views ?? 0,
    applies: counts?.applies ?? 0,
    advanced: counts?.advanced ?? 0,
    hired: counts?.hired ?? 0,
  }
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }
  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to view analytics.' }, 401)
  }
  if (session.tenantType !== 'employer') {
    return json({ ok: false, error: 'wrong_workspace_type', message: 'Analytics are available from an employer workspace.' }, 400)
  }

  const jobId = new URL(request.url).searchParams.get('jobId')

  if (jobId) {
    const funnel = await jobFunnel(env, jobId, session.tenantId)
    if (!funnel) {
      return json({ ok: false, error: 'not_found', message: 'That job is not in your workspace.' }, 404)
    }
    return json({ ok: true, funnel })
  }

  const funnel = await workspaceFunnel(env, session.tenantId)
  return json({ ok: true, funnel })
}
