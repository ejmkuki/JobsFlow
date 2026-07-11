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
import { notify, renderNotificationEmail } from '../lib/notify'

const appUrl = 'https://jobsflowai.ai'

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
      `SELECT j.id, j.employer_tenant_id AS employerTenantId, j.status, j.title, j.company, j.description,
              j.required_skills AS requiredSkills, u.email AS employerEmail
       FROM jobs j
       LEFT JOIN users u ON u.id = j.created_by_user_id
       WHERE j.id = ? LIMIT 1`,
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
      employerEmail: string | null
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

  // UNIQUE(job_id, candidate_tenant_id) means one application row per
  // candidate per job, ever. A withdrawn or declined application is not a
  // dead end — the candidate can reapply, which reopens that same row
  // (fresh cover note, resume, score, SLA clock) rather than being
  // permanently blocked. An application still in an active stage is a real
  // duplicate and stays blocked.
  const existing = await env.DB!
    .prepare('SELECT id, status FROM job_applications WHERE job_id = ? AND candidate_tenant_id = ? LIMIT 1')
    .bind(jobId, session.tenantId)
    .first<{ id: string; status: string }>()

  if (existing && existing.status !== 'withdrawn' && existing.status !== 'rejected') {
    return json({ ok: false, error: 'already_applied', message: 'You have already applied to this job.' }, 409)
  }

  const finalApplicationId = existing?.id ?? applicationId

  if (existing) {
    await env.DB!
      .prepare(
        `UPDATE job_applications SET
          candidate_name = ?, candidate_email = ?, resume_artifact_id = ?, cover_note = ?,
          readiness_score = ?, match_method = ?, match_rationale = ?, status = 'submitted',
          last_status_change_at = datetime('now'), updated_at = datetime('now'),
          employer_sla_due_at = datetime('now', ?), sla_breach_notified_at = NULL
        WHERE id = ?`,
      )
      .bind(
        session.displayName,
        session.email,
        resumeArtifactId || null,
        coverNote,
        match.score,
        match.method,
        matchRationale,
        `+${slaDays} days`,
        finalApplicationId,
      )
      .run()
    await writeApplicationEvent(env, {
      applicationId: finalApplicationId,
      actorType: 'candidate',
      actorUserId: session.userId,
      fromStatus: existing.status,
      toStatus: 'submitted',
      note: 'Reapplied',
    })
  } else {
    await env.DB!
      .prepare(
        `INSERT INTO job_applications (
          id, job_id, employer_tenant_id, candidate_tenant_id, candidate_user_id,
          candidate_name, candidate_email, resume_artifact_id, cover_note, readiness_score,
          match_method, match_rationale, status, employer_sla_due_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', datetime('now', ?))`,
      )
      .bind(
        finalApplicationId,
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
    await env.DB!.prepare('UPDATE jobs SET applicant_count = applicant_count + 1 WHERE id = ?').bind(jobId).run()
    await writeApplicationEvent(env, { applicationId: finalApplicationId, actorType: 'candidate', actorUserId: session.userId, toStatus: 'submitted' })
  }

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'application.submitted',
    actorType: 'user',
    action: existing ? 'Reapplied to a job' : 'Applied to a job',
    riskLevel: 'low',
    metadata: { jobId, applicationId: finalApplicationId },
  })

  const pipelineUrl = `${appUrl}/employer/candidates?job=${jobId}`
  const applicantEmail = renderNotificationEmail({
    heading: `New applicant: ${session.displayName}`,
    lines: [
      `${session.displayName} just applied to ${job.title}.`,
      match.method === 'unscored' ? '' : `Match: ${match.score}% (${match.method === 'ai' ? 'AI-scored' : 'keyword-scored'}).`,
    ].filter(Boolean),
    ctaLabel: 'Review applicant',
    ctaUrl: pipelineUrl,
  })
  await notify(env, {
    tenantId: job.employerTenantId,
    type: 'new_applicant',
    title: `New applicant: ${session.displayName}`,
    body: `Applied to ${job.title}.`,
    linkPath: `/employer/candidates?job=${jobId}`,
    email: job.employerEmail
      ? {
          to: job.employerEmail,
          subject: `New applicant for ${job.title}`,
          html: applicantEmail.html,
          text: applicantEmail.text,
          idempotencyKey: `new-applicant-${finalApplicationId}-${Math.floor(Date.now() / 60000)}`,
          tags: [{ name: 'template', value: 'new_applicant' }],
        }
      : undefined,
  })

  return json({ ok: true, applicationId: finalApplicationId, status: 'submitted', match }, 201)
}

async function handleAdvance(env: RequestContext['env'], session: SessionContext, body: ApplyBody) {
  const applicationId = safeString(body.applicationId, '')
  const target = safeString(body.status, '')
  if (!applicationId || !employerTargets.has(target)) {
    return json({ ok: false, error: 'invalid_transition', message: 'Choose a valid next stage.' }, 400)
  }

  const application = await env.DB!
    .prepare(
      `SELECT a.id, a.status, a.candidate_tenant_id AS candidateTenantId, a.candidate_name AS candidateName,
              a.candidate_email AS candidateEmail, a.job_id AS jobId, j.title AS jobTitle, j.company AS company
       FROM job_applications a
       INNER JOIN jobs j ON j.id = a.job_id
       WHERE a.id = ? AND a.employer_tenant_id = ? LIMIT 1`,
    )
    .bind(applicationId, session.tenantId)
    .first<{
      id: string
      status: string
      candidateTenantId: string
      candidateName: string
      candidateEmail: string
      jobId: string
      jobTitle: string
      company: string
    }>()

  if (!application) {
    return json({ ok: false, error: 'not_found', message: 'That applicant is not in your pipeline.' }, 404)
  }

  const clearSla = target === 'rejected' || target === 'offer'
  await env.DB!
    .prepare(
      `UPDATE job_applications
       SET status = ?, last_status_change_at = datetime('now'), updated_at = datetime('now'),
           employer_sla_due_at = ${clearSla ? 'NULL' : `datetime('now', '+${slaDays} days')`},
           sla_breach_notified_at = NULL
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

  // Notify the candidate for the transitions that actually matter to them —
  // not every internal pipeline micro-stage (employer_review, screen).
  const statusCopy: Record<string, { title: string; line: string }> = {
    interview: {
      title: `You're moving to interview for ${application.jobTitle}`,
      line: `${application.company} has moved your application for ${application.jobTitle} to the interview stage.`,
    },
    offer: {
      title: `You have an offer for ${application.jobTitle}`,
      line: `${application.company} has extended an offer for ${application.jobTitle}. Congratulations!`,
    },
    rejected: {
      title: `Update on your application for ${application.jobTitle}`,
      line: `${application.company} has decided not to move forward with your application for ${application.jobTitle} at this time.`,
    },
  }
  const copy = statusCopy[target]
  if (copy) {
    const applicationsUrl = `${appUrl}/candidate/applications`
    const statusEmail = renderNotificationEmail({
      heading: copy.title,
      lines: [copy.line],
      ctaLabel: 'View application',
      ctaUrl: applicationsUrl,
    })
    await notify(env, {
      tenantId: application.candidateTenantId,
      type: `application_${target}`,
      title: copy.title,
      body: copy.line,
      linkPath: '/candidate/applications',
      email: {
        to: application.candidateEmail,
        subject: copy.title,
        html: statusEmail.html,
        text: statusEmail.text,
        idempotencyKey: `application-${target}-${applicationId}-${Math.floor(Date.now() / 60000)}`,
        tags: [{ name: 'template', value: `application_${target}` }],
      },
    })
  }

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

  // Cross-job overdue-reply count for the employer's whole workspace — the
  // per-applicant SLA badge is buried per-job, this is the rollup meant to
  // surface on the employer's landing page instead.
  if (url.searchParams.get('rollup') === 'sla') {
    const row = await env.DB
      .prepare(
        `SELECT COUNT(*) AS overdueCount
         FROM job_applications
         WHERE employer_tenant_id = ?
           AND employer_sla_due_at IS NOT NULL
           AND employer_sla_due_at < datetime('now')
           AND status NOT IN ('rejected', 'offer', 'withdrawn')`,
      )
      .bind(session.tenantId)
      .first<{ overdueCount: number }>()
    return json({ ok: true, overdueCount: row?.overdueCount ?? 0 })
  }

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
