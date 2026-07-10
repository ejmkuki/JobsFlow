import type { RequestContext, SessionContext } from '../_shared'
import {
  clientIdentifier,
  enforceRateLimit,
  getSession,
  json,
  missingConfig,
  safeString,
  tooManyRequests,
  writeAuditEvent,
} from '../_shared'
import { computeMatch, type JobForMatch } from '../lib/match'

type ApplyBody = {
  action?: unknown
  jobId?: unknown
  applicationId?: unknown
  status?: unknown
  note?: unknown
  coverNote?: unknown
  resumeArtifactId?: unknown
  readinessScore?: unknown
}

type CandidateApplicationRow = {
  id: string
  jobId: string
  status: string
  readinessScore: number
  matchMethod: string
  matchRationale: string
  coverNote: string
  createdAt: string
  lastStatusChangeAt: string
  jobTitle: string
  company: string
  location: string
}

type EmployerApplicantRow = {
  id: string
  status: string
  candidateName: string
  candidateEmail: string
  readinessScore: number
  matchMethod: string
  matchRationale: string
  coverNote: string
  resumeArtifactId: string | null
  employerSlaDueAt: string | null
  createdAt: string
  lastStatusChangeAt: string
}

const employerTargets = new Set(['employer_review', 'screen', 'interview', 'offer', 'rejected'])
const slaDays = 7
const maxCoverNote = 4000

async function readBody(request: Request): Promise<ApplyBody> {
  try {
    return (await request.json()) as ApplyBody
  } catch {
    return {}
  }
}

async function writeApplicationEvent(
  env: RequestContext['env'],
  input: { applicationId: string; actorType: string; actorUserId?: string; fromStatus?: string; toStatus: string; note?: string },
) {
  await env.DB!
    .prepare(
      `INSERT INTO job_application_events (id, application_id, actor_type, actor_user_id, from_status, to_status, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.applicationId,
      input.actorType,
      input.actorUserId ?? null,
      input.fromStatus ?? null,
      input.toStatus,
      input.note ?? '',
    )
    .run()
}

async function handleApply(request: Request, env: RequestContext['env'], session: SessionContext, body: ApplyBody) {
  const jobId = safeString(body.jobId, '')
  if (!jobId) {
    return json({ ok: false, error: 'job_required', message: 'Choose a job before applying.' }, 400)
  }

  const job = await env.DB!
    .prepare(
      `SELECT id, employer_tenant_id AS employerTenantId, status, title, company, description,
              required_skills AS requiredSkills
       FROM jobs WHERE id = ? LIMIT 1`,
    )
    .bind(jobId)
    .first<{
      id: string
      employerTenantId: string
      status: string
      title: string
      company: string
      description: string
      requiredSkills: string
    }>()

  if (!job || job.status !== 'open') {
    return json({ ok: false, error: 'job_unavailable', message: 'That job is no longer accepting applications.' }, 404)
  }

  if (job.employerTenantId === session.tenantId) {
    return json({ ok: false, error: 'own_job', message: 'You cannot apply to your own posting.' }, 400)
  }

  // Verify any attached resume belongs to the applying candidate, and use
  // that specific file's text for scoring — the score should match whichever
  // resume the candidate actually chose to attach, not always the profile
  // default.
  const resumeArtifactId = safeString(body.resumeArtifactId, '')
  let resumeText: string
  if (resumeArtifactId) {
    const resume = await env.DB!
      .prepare('SELECT extracted_text AS extractedText FROM resume_artifacts WHERE id = ? AND tenant_id = ? LIMIT 1')
      .bind(resumeArtifactId, session.tenantId)
      .first<{ extractedText: string }>()
    if (!resume) {
      return json({ ok: false, error: 'resume_not_found', message: 'That resume is not in your workspace.' }, 400)
    }
    resumeText = resume.extractedText
  } else {
    const profile = await env.DB!
      .prepare('SELECT resume_text AS resumeText FROM candidate_resume_profiles WHERE tenant_id = ? LIMIT 1')
      .bind(session.tenantId)
      .first<{ resumeText: string }>()
    resumeText = profile?.resumeText ?? ''
  }

  const applicationId = crypto.randomUUID()
  const coverNote = safeString(body.coverNote, '').slice(0, maxCoverNote)

  // Score is computed server-side from the candidate's resume vs the job — never
  // taken from the client. body.readinessScore is intentionally ignored.
  const jobForMatch: JobForMatch = {
    title: job.title,
    company: job.company,
    description: job.description,
    requiredSkills: JSON.parse(job.requiredSkills || '[]') as string[],
  }
  const match = await computeMatch(resumeText, jobForMatch, env)
  const matchRationale = JSON.stringify({ matched: match.matched, gaps: match.gaps, summary: match.summary })

  try {
    await env.DB!
      .prepare(
        `INSERT INTO job_applications (
          id, job_id, employer_tenant_id, candidate_tenant_id, candidate_user_id,
          candidate_name, candidate_email, resume_artifact_id, cover_note, readiness_score,
          match_method, match_rationale, status, employer_sla_due_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', datetime('now', ?))`,
      )
      .bind(
        applicationId,
        jobId,
        job.employerTenantId,
        session.tenantId,
        session.userId,
        session.displayName,
        session.email,
        resumeArtifactId || null,
        coverNote,
        match.score,
        match.method,
        matchRationale,
        `+${slaDays} days`,
      )
      .run()
  } catch {
    // UNIQUE(job_id, candidate_tenant_id) -> already applied.
    return json({ ok: false, error: 'already_applied', message: 'You have already applied to this job.' }, 409)
  }

  await env.DB!.prepare('UPDATE jobs SET applicant_count = applicant_count + 1 WHERE id = ?').bind(jobId).run()
  await writeApplicationEvent(env, { applicationId, actorType: 'candidate', actorUserId: session.userId, toStatus: 'submitted' })
  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'application.submitted',
    actorType: 'user',
    action: 'Applied to a job',
    riskLevel: 'low',
    metadata: { jobId, applicationId },
  })

  return json({ ok: true, applicationId, status: 'submitted', match }, 201)
}

async function handleAdvance(env: RequestContext['env'], session: SessionContext, body: ApplyBody) {
  const applicationId = safeString(body.applicationId, '')
  const target = safeString(body.status, '')
  if (!applicationId || !employerTargets.has(target)) {
    return json({ ok: false, error: 'invalid_transition', message: 'Choose a valid next stage.' }, 400)
  }

  const application = await env.DB!
    .prepare('SELECT id, status FROM job_applications WHERE id = ? AND employer_tenant_id = ? LIMIT 1')
    .bind(applicationId, session.tenantId)
    .first<{ id: string; status: string }>()

  if (!application) {
    return json({ ok: false, error: 'not_found', message: 'That applicant is not in your pipeline.' }, 404)
  }

  const clearSla = target === 'rejected' || target === 'offer'
  await env.DB!
    .prepare(
      `UPDATE job_applications
       SET status = ?, last_status_change_at = datetime('now'), updated_at = datetime('now'),
           employer_sla_due_at = ${clearSla ? 'NULL' : `datetime('now', '+${slaDays} days')`}
       WHERE id = ?`,
    )
    .bind(target, applicationId)
    .run()

  await writeApplicationEvent(env, {
    applicationId,
    actorType: 'employer',
    actorUserId: session.userId,
    fromStatus: application.status,
    toStatus: target,
    note: safeString(body.note, ''),
  })
  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'application.advanced',
    actorType: 'user',
    action: `Moved applicant to ${target}`,
    riskLevel: 'low',
    metadata: { applicationId, from: application.status, to: target },
  })

  return json({ ok: true, applicationId, status: target })
}

async function handleWithdraw(env: RequestContext['env'], session: SessionContext, body: ApplyBody) {
  const applicationId = safeString(body.applicationId, '')
  const application = await env.DB!
    .prepare('SELECT id, status FROM job_applications WHERE id = ? AND candidate_tenant_id = ? LIMIT 1')
    .bind(applicationId, session.tenantId)
    .first<{ id: string; status: string }>()

  if (!application) {
    return json({ ok: false, error: 'not_found', message: 'That application is not in your workspace.' }, 404)
  }

  await env.DB!
    .prepare(
      `UPDATE job_applications SET status = 'withdrawn', last_status_change_at = datetime('now'),
       updated_at = datetime('now'), employer_sla_due_at = NULL WHERE id = ?`,
    )
    .bind(applicationId)
    .run()

  await writeApplicationEvent(env, {
    applicationId,
    actorType: 'candidate',
    actorUserId: session.userId,
    fromStatus: application.status,
    toStatus: 'withdrawn',
  })

  return json({ ok: true, applicationId, status: 'withdrawn' })
}

export async function onRequestPost({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in first.' }, 401)
  }

  const rate = await enforceRateLimit(env, `job-app:${clientIdentifier(request)}`, 40, 60)
  if (!rate.allowed) {
    return tooManyRequests(rate)
  }

  const body = await readBody(request)
  const action = safeString(body.action, 'apply')

  if (action === 'advance') {
    return handleAdvance(env, session, body)
  }
  if (action === 'withdraw') {
    return handleWithdraw(env, session, body)
  }
  return handleApply(request, env, session, body)
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in first.' }, 401)
  }

  const url = new URL(request.url)
  const jobId = url.searchParams.get('jobId')
  const applicationId = url.searchParams.get('applicationId')

  // Full detail + status timeline for one application. Either side of it
  // (the candidate who applied, or the employer whose job it's on) can view.
  if (applicationId) {
    const application = await env.DB
      .prepare(
        `SELECT
          a.id AS id,
          a.status AS status,
          a.candidate_name AS candidateName,
          a.candidate_email AS candidateEmail,
          a.readiness_score AS readinessScore,
          a.match_method AS matchMethod,
          a.match_rationale AS matchRationale,
          a.cover_note AS coverNote,
          a.resume_artifact_id AS resumeArtifactId,
          a.employer_sla_due_at AS employerSlaDueAt,
          a.created_at AS createdAt,
          a.last_status_change_at AS lastStatusChangeAt,
          j.id AS jobId,
          j.title AS jobTitle,
          j.company AS company,
          j.location AS location
        FROM job_applications a
        INNER JOIN jobs j ON j.id = a.job_id
        WHERE a.id = ? AND (a.employer_tenant_id = ? OR a.candidate_tenant_id = ?)
        LIMIT 1`,
      )
      .bind(applicationId, session.tenantId, session.tenantId)
      .first<EmployerApplicantRow & { jobId: string; jobTitle: string; company: string; location: string }>()

    if (!application) {
      return json({ ok: false, error: 'not_found', message: 'That application is not in your workspace.' }, 404)
    }

    const events = await env.DB
      .prepare(
        `SELECT
          actor_type AS actorType,
          from_status AS fromStatus,
          to_status AS toStatus,
          note,
          created_at AS createdAt
        FROM job_application_events
        WHERE application_id = ?
        ORDER BY created_at ASC, rowid ASC`,
      )
      .bind(applicationId)
      .all<{ actorType: string; fromStatus: string | null; toStatus: string; note: string; createdAt: string }>()

    return json({ ok: true, application, events: events.results ?? [] })
  }

  // Employer view: applicants for a job they own.
  if (jobId) {
    const job = await env.DB
      .prepare('SELECT id FROM jobs WHERE id = ? AND employer_tenant_id = ? LIMIT 1')
      .bind(jobId, session.tenantId)
      .first<{ id: string }>()
    if (!job) {
      return json({ ok: false, error: 'not_found', message: 'That job is not in your workspace.' }, 404)
    }

    const rows = await env.DB
      .prepare(
        `SELECT
          id,
          status,
          candidate_name AS candidateName,
          candidate_email AS candidateEmail,
          readiness_score AS readinessScore,
          match_method AS matchMethod,
          match_rationale AS matchRationale,
          cover_note AS coverNote,
          resume_artifact_id AS resumeArtifactId,
          employer_sla_due_at AS employerSlaDueAt,
          created_at AS createdAt,
          last_status_change_at AS lastStatusChangeAt
        FROM job_applications
        WHERE job_id = ? AND employer_tenant_id = ?
        ORDER BY readiness_score DESC, created_at DESC
        LIMIT 100`,
      )
      .bind(jobId, session.tenantId)
      .all<EmployerApplicantRow>()

    return json({ ok: true, applicants: rows.results ?? [] })
  }

  // Candidate view: my applications with job context.
  const rows = await env.DB
    .prepare(
      `SELECT
        a.id AS id,
        a.job_id AS jobId,
        a.status AS status,
        a.readiness_score AS readinessScore,
        a.match_method AS matchMethod,
        a.match_rationale AS matchRationale,
        a.cover_note AS coverNote,
        a.created_at AS createdAt,
        a.last_status_change_at AS lastStatusChangeAt,
        j.title AS jobTitle,
        j.company AS company,
        j.location AS location
      FROM job_applications a
      INNER JOIN jobs j ON j.id = a.job_id
      WHERE a.candidate_tenant_id = ?
      ORDER BY a.created_at DESC
      LIMIT 100`,
    )
    .bind(session.tenantId)
    .all<CandidateApplicationRow>()

  return json({ ok: true, applications: rows.results ?? [] })
}
