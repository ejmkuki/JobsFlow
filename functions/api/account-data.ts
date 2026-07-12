import type { RequestContext } from '../_shared'
import { clearSessionCookieHeader, enforceRateLimit, getSession, json, missingConfig, safeString, tooManyRequests } from '../_shared'

// Candidate self-service data export + account deletion (GDPR/CCPA-shaped).
// Both actions are scoped to the caller's own candidate tenant — there is no
// path for an employer tenant or another candidate's session to reach these.

async function exportCandidateData(env: RequestContext['env'], tenantId: string) {
  const [profile, resumeProfile, resumes, applications, savedJobs, savedSearches, notifications] = await Promise.all([
    env.DB!
      .prepare('SELECT target_roles AS targetRoles, salary_floor_cents AS salaryFloorCents, exclusions, created_at AS createdAt FROM candidate_profiles WHERE tenant_id = ? LIMIT 1')
      .bind(tenantId)
      .first(),
    env.DB!
      .prepare('SELECT headline, resume_text AS resumeText, updated_at AS updatedAt FROM candidate_resume_profiles WHERE tenant_id = ? LIMIT 1')
      .bind(tenantId)
      .first(),
    env.DB!
      .prepare('SELECT id, filename, content_type AS contentType, size_bytes AS sizeBytes, created_at AS createdAt FROM resume_artifacts WHERE tenant_id = ?')
      .bind(tenantId)
      .all(),
    env.DB!
      .prepare(
        `SELECT a.id, a.status, a.cover_note AS coverNote, a.readiness_score AS readinessScore, a.match_method AS matchMethod,
                a.created_at AS createdAt, j.title AS jobTitle, j.company AS company
         FROM job_applications a INNER JOIN jobs j ON j.id = a.job_id WHERE a.candidate_tenant_id = ?`,
      )
      .bind(tenantId)
      .all(),
    env.DB!.prepare('SELECT job_id AS jobId, created_at AS createdAt FROM saved_jobs WHERE tenant_id = ?').bind(tenantId).all(),
    env.DB!
      .prepare('SELECT label, query, workplace_type AS workplaceType, employment_type AS employmentType, created_at AS createdAt FROM saved_searches WHERE tenant_id = ?')
      .bind(tenantId)
      .all(),
    env.DB!
      .prepare('SELECT type, title, body, created_at AS createdAt FROM notifications WHERE tenant_id = ?')
      .bind(tenantId)
      .all(),
  ])

  return {
    exportedAt: new Date().toISOString(),
    profile: profile ?? null,
    resumeProfile: resumeProfile ?? null,
    resumeFiles: resumes.results ?? [],
    applications: applications.results ?? [],
    savedJobs: savedJobs.results ?? [],
    savedSearches: savedSearches.results ?? [],
    notifications: notifications.results ?? [],
  }
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }
  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to export your data.' }, 401)
  }
  if (session.tenantType !== 'candidate') {
    return json({ ok: false, error: 'wrong_workspace_type', message: 'Data export is available from a candidate workspace.' }, 400)
  }

  const rate = await enforceRateLimit(env, `account-export:${session.tenantId}`, 5, 300)
  if (!rate.allowed) {
    return tooManyRequests(rate)
  }

  const data = await exportCandidateData(env, session.tenantId)
  return json({ ok: true, data })
}

export async function onRequestPost({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }
  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to manage your account.' }, 401)
  }
  if (session.tenantType !== 'candidate') {
    return json({ ok: false, error: 'wrong_workspace_type', message: 'Account deletion is available from a candidate workspace.' }, 400)
  }

  const rate = await enforceRateLimit(env, `account-delete:${session.tenantId}`, 3, 300)
  if (!rate.allowed) {
    return tooManyRequests(rate)
  }

  const body = (await request.json().catch(() => ({}))) as { action?: unknown; confirmEmail?: unknown }
  if (safeString(body.action, '') !== 'delete') {
    return json({ ok: false, error: 'action_required', message: 'Specify action: delete.' }, 400)
  }
  if (safeString(body.confirmEmail, '').trim().toLowerCase() !== session.email.toLowerCase()) {
    return json({ ok: false, error: 'confirmation_mismatch', message: 'Type your account email exactly to confirm deletion.' }, 400)
  }

  if (env.RESUME_BUCKET) {
    const resumes = await env.DB
      .prepare('SELECT object_key AS objectKey FROM resume_artifacts WHERE tenant_id = ?')
      .bind(session.tenantId)
      .all<{ objectKey: string }>()
    await Promise.all((resumes.results ?? []).map((resume) => env.RESUME_BUCKET!.delete(resume.objectKey).catch(() => {})))
  }

  // tenants row cascades every candidate-owned table (profile, resumes,
  // applications, saved jobs/searches, notifications, sessions) via
  // ON DELETE CASCADE — no per-table cleanup needed beyond the R2 files above.
  await env.DB.prepare('DELETE FROM tenants WHERE id = ?').bind(session.tenantId).run()

  return json(
    { ok: true },
    {
      headers: {
        'set-cookie': clearSessionCookieHeader(request),
      },
    },
  )
}
