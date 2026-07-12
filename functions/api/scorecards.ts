import type { RequestContext, SessionContext } from '../_shared'
import { enforceRateLimit, getSession, json, missingConfig, safeString, tooManyRequests, writeAuditEvent } from '../_shared'

const maxCriteria = 12
const maxNoteChars = 4000
const recommendations = new Set(['strong_yes', 'yes', 'no', 'strong_no'])

type Criterion = { key: string; label: string; weight: number }
type TemplateRow = { id: string; jobId: string | null; name: string; criteria: string }
type SubmissionRow = {
  id: string
  interviewerUserId: string
  interviewerName: string
  scores: string
  recommendation: string
  notes: string
  createdAt: string
  updatedAt: string
}

function sanitizeCriteria(input: unknown): Criterion[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const criteria: Criterion[] = []
  for (const raw of input.slice(0, maxCriteria)) {
    if (!raw || typeof raw !== 'object') continue
    const key = safeString((raw as Record<string, unknown>).key, '').trim()
    const label = safeString((raw as Record<string, unknown>).label, '').trim()
    const weightRaw = Number((raw as Record<string, unknown>).weight)
    if (!key || !label || seen.has(key)) continue
    seen.add(key)
    criteria.push({ key, label, weight: Number.isFinite(weightRaw) && weightRaw > 0 ? Math.min(weightRaw, 10) : 1 })
  }
  return criteria
}

function weightedScore(criteria: Criterion[], scores: Record<string, number>): number | null {
  let weightSum = 0
  let scoreSum = 0
  for (const criterion of criteria) {
    const value = scores[criterion.key]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    weightSum += criterion.weight
    scoreSum += Math.max(1, Math.min(5, value)) * criterion.weight
  }
  return weightSum > 0 ? Math.round((scoreSum / weightSum) * 100) / 100 : null
}

async function verifyApplicationInTenant(env: RequestContext['env'], applicationId: string, tenantId: string) {
  return env.DB!
    .prepare(
      `SELECT a.id, a.job_id AS jobId, a.candidate_name AS candidateName, j.title AS jobTitle
       FROM job_applications a INNER JOIN jobs j ON j.id = a.job_id
       WHERE a.id = ? AND a.employer_tenant_id = ? LIMIT 1`,
    )
    .bind(applicationId, tenantId)
    .first<{ id: string; jobId: string; candidateName: string; jobTitle: string }>()
}

async function resolveTemplate(env: RequestContext['env'], tenantId: string, jobId: string) {
  const jobTemplate = await env.DB!
    .prepare('SELECT id, job_id AS jobId, name, criteria FROM scorecard_templates WHERE tenant_id = ? AND job_id = ? LIMIT 1')
    .bind(tenantId, jobId)
    .first<TemplateRow>()
  if (jobTemplate) return jobTemplate
  return env.DB!
    .prepare('SELECT id, job_id AS jobId, name, criteria FROM scorecard_templates WHERE tenant_id = ? AND job_id IS NULL LIMIT 1')
    .bind(tenantId)
    .first<TemplateRow>()
}

async function handleGetTemplate(env: RequestContext['env'], session: SessionContext, jobId: string) {
  const job = await env.DB!.prepare('SELECT id FROM jobs WHERE id = ? AND employer_tenant_id = ? LIMIT 1').bind(jobId, session.tenantId).first<{ id: string }>()
  if (!job) {
    return json({ ok: false, error: 'not_found', message: 'That job is not in your workspace.' }, 404)
  }
  const template = await resolveTemplate(env, session.tenantId, jobId)
  return json({
    ok: true,
    template: template ? { id: template.id, jobId: template.jobId, name: template.name, criteria: JSON.parse(template.criteria || '[]') as Criterion[] } : null,
  })
}

async function handleGetSubmissions(env: RequestContext['env'], session: SessionContext, applicationId: string) {
  const application = await verifyApplicationInTenant(env, applicationId, session.tenantId)
  if (!application) {
    return json({ ok: false, error: 'not_found', message: 'That applicant is not in your pipeline.' }, 404)
  }

  const template = await resolveTemplate(env, session.tenantId, application.jobId)
  const criteria = template ? (JSON.parse(template.criteria || '[]') as Criterion[]) : []

  const rows = await env.DB!
    .prepare(
      `SELECT s.id, s.interviewer_user_id AS interviewerUserId, u.display_name AS interviewerName,
              s.scores, s.recommendation, s.notes, s.created_at AS createdAt, s.updated_at AS updatedAt
       FROM scorecard_submissions s INNER JOIN users u ON u.id = s.interviewer_user_id
       WHERE s.application_id = ? ORDER BY s.created_at ASC`,
    )
    .bind(applicationId)
    .all<SubmissionRow>()

  const submissions = (rows.results ?? []).map((row) => ({
    ...row,
    scores: JSON.parse(row.scores || '{}') as Record<string, number>,
  }))

  const submissionScores = submissions.map((s) => weightedScore(criteria, s.scores)).filter((n): n is number => n !== null)
  const aggregateScore = submissionScores.length > 0 ? Math.round((submissionScores.reduce((a, b) => a + b, 0) / submissionScores.length) * 100) / 100 : null
  const recommendationTally: Record<string, number> = { strong_yes: 0, yes: 0, no: 0, strong_no: 0 }
  for (const s of submissions) {
    if (s.recommendation in recommendationTally) recommendationTally[s.recommendation] += 1
  }

  return json({
    ok: true,
    template: template ? { id: template.id, jobId: template.jobId, name: template.name, criteria } : null,
    submissions,
    aggregateScore,
    recommendationTally,
  })
}

async function handleCreateTemplate(env: RequestContext['env'], session: SessionContext, body: Record<string, unknown>) {
  const jobId = safeString(body.jobId, '') || null
  const name = safeString(body.name, '').trim() || 'Interview scorecard'
  const criteria = sanitizeCriteria(body.criteria)
  if (criteria.length === 0) {
    return json({ ok: false, error: 'criteria_required', message: 'Add at least one scoring criterion.' }, 400)
  }

  if (jobId) {
    const job = await env.DB!.prepare('SELECT id FROM jobs WHERE id = ? AND employer_tenant_id = ? LIMIT 1').bind(jobId, session.tenantId).first<{ id: string }>()
    if (!job) {
      return json({ ok: false, error: 'not_found', message: 'That job is not in your workspace.' }, 404)
    }
  }

  const existing = jobId
    ? await env.DB!.prepare('SELECT id FROM scorecard_templates WHERE tenant_id = ? AND job_id = ? LIMIT 1').bind(session.tenantId, jobId).first<{ id: string }>()
    : await env.DB!.prepare('SELECT id FROM scorecard_templates WHERE tenant_id = ? AND job_id IS NULL LIMIT 1').bind(session.tenantId).first<{ id: string }>()

  const criteriaJson = JSON.stringify(criteria)
  if (existing) {
    await env.DB!.prepare('UPDATE scorecard_templates SET name = ?, criteria = ? WHERE id = ?').bind(name, criteriaJson, existing.id).run()
    return json({ ok: true, templateId: existing.id })
  }

  const templateId = crypto.randomUUID()
  await env.DB!
    .prepare('INSERT INTO scorecard_templates (id, tenant_id, job_id, name, criteria, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(templateId, session.tenantId, jobId, name, criteriaJson, session.userId)
    .run()
  return json({ ok: true, templateId }, 201)
}

async function handleSubmit(env: RequestContext['env'], session: SessionContext, body: Record<string, unknown>) {
  const applicationId = safeString(body.applicationId, '')
  const recommendation = safeString(body.recommendation, '')
  const notes = safeString(body.notes, '').slice(0, maxNoteChars)
  if (!applicationId || !recommendations.has(recommendation)) {
    return json({ ok: false, error: 'invalid_submission', message: 'Choose a recommendation before saving.' }, 400)
  }

  const application = await verifyApplicationInTenant(env, applicationId, session.tenantId)
  if (!application) {
    return json({ ok: false, error: 'not_found', message: 'That applicant is not in your pipeline.' }, 404)
  }

  const template = await resolveTemplate(env, session.tenantId, application.jobId)
  const criteria = template ? (JSON.parse(template.criteria || '[]') as Criterion[]) : []
  const criteriaKeys = new Set(criteria.map((c) => c.key))
  const rawScores = (body.scores && typeof body.scores === 'object' ? (body.scores as Record<string, unknown>) : {})
  const scores: Record<string, number> = {}
  for (const [key, value] of Object.entries(rawScores)) {
    if (!criteriaKeys.has(key)) continue
    const num = Number(value)
    if (Number.isFinite(num)) scores[key] = Math.max(1, Math.min(5, Math.round(num)))
  }

  const existing = await env.DB!
    .prepare('SELECT id FROM scorecard_submissions WHERE application_id = ? AND interviewer_user_id = ? LIMIT 1')
    .bind(applicationId, session.userId)
    .first<{ id: string }>()

  const scoresJson = JSON.stringify(scores)
  let submissionId: string
  if (existing) {
    submissionId = existing.id
    await env.DB!
      .prepare(`UPDATE scorecard_submissions SET scores = ?, recommendation = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(scoresJson, recommendation, notes, existing.id)
      .run()
  } else {
    submissionId = crypto.randomUUID()
    await env.DB!
      .prepare(
        `INSERT INTO scorecard_submissions (id, application_id, tenant_id, template_id, interviewer_user_id, scores, recommendation, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(submissionId, applicationId, session.tenantId, template?.id ?? null, session.userId, scoresJson, recommendation, notes)
      .run()
  }

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'scorecard.submitted',
    actorType: 'user',
    action: `Filed a scorecard for ${application.candidateName}`,
    riskLevel: 'low',
    metadata: { applicationId, recommendation },
  })

  return json({ ok: true, submissionId }, existing ? 200 : 201)
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }
  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to view scorecards.' }, 401)
  }

  const url = new URL(request.url)
  const jobId = url.searchParams.get('jobId')
  const applicationId = url.searchParams.get('applicationId')

  if (applicationId) {
    return handleGetSubmissions(env, session, applicationId)
  }
  if (jobId) {
    return handleGetTemplate(env, session, jobId)
  }
  return json({ ok: false, error: 'target_required', message: 'Specify a jobId or applicationId.' }, 400)
}

export async function onRequestPost({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }
  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to use scorecards.' }, 401)
  }

  const rate = await enforceRateLimit(env, `scorecard:${session.tenantId}`, 60, 60)
  if (!rate.allowed) {
    return tooManyRequests(rate)
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const action = safeString(body.action, 'submit')

  if (action === 'create_template') {
    return handleCreateTemplate(env, session, body)
  }
  return handleSubmit(env, session, body)
}
