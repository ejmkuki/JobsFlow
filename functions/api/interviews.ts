import type { RequestContext, SessionContext } from '../_shared'
import { enforceRateLimit, getSession, json, missingConfig, safeString, tooManyRequests, writeAuditEvent } from '../_shared'
import { notify, renderNotificationEmail } from '../lib/notify'
import { buildIcsEvent, icsToBase64 } from '../lib/ics'

const appUrl = 'https://jobsflowai.ai'
const maxSlots = 5
const maxLocationChars = 300
const maxNotesChars = 2000

type Slot = { start: string; end: string }
type ApplicationRow = {
  id: string
  jobId: string
  employerTenantId: string
  candidateTenantId: string
  candidateName: string
  candidateEmail: string
  jobTitle: string
  company: string
  employerEmail: string | null
}
type ProposalRow = {
  id: string
  applicationId: string
  employerTenantId: string
  candidateTenantId: string
  slots: string
  location: string
  notes: string
  status: string
  confirmedStart: string | null
  confirmedEnd: string | null
  createdAt: string
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime())
}

function sanitizeSlots(input: unknown): Slot[] {
  if (!Array.isArray(input)) return []
  const slots: Slot[] = []
  for (const raw of input.slice(0, maxSlots)) {
    if (!raw || typeof raw !== 'object') continue
    const start = (raw as Record<string, unknown>).start
    const end = (raw as Record<string, unknown>).end
    if (!isIsoDate(start) || !isIsoDate(end)) continue
    if (new Date(end).getTime() <= new Date(start).getTime()) continue
    slots.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() })
  }
  return slots
}

async function fetchApplication(env: RequestContext['env'], applicationId: string): Promise<ApplicationRow | null> {
  const row = await env.DB!
    .prepare(
      `SELECT a.id, a.job_id AS jobId, a.employer_tenant_id AS employerTenantId, a.candidate_tenant_id AS candidateTenantId,
              a.candidate_name AS candidateName, a.candidate_email AS candidateEmail,
              j.title AS jobTitle, j.company AS company, u.email AS employerEmail
       FROM job_applications a
       INNER JOIN jobs j ON j.id = a.job_id
       LEFT JOIN users u ON u.id = j.created_by_user_id
       WHERE a.id = ? LIMIT 1`,
    )
    .bind(applicationId)
    .first<ApplicationRow>()
  return row ?? null
}

function icsAttachment(uid: string, start: string, end: string, summary: string, description: string, location: string) {
  const ics = buildIcsEvent({ uid, start, end, summary, description, location })
  return [{ filename: 'interview.ics', content: icsToBase64(ics) }]
}

async function handlePropose(env: RequestContext['env'], session: SessionContext, body: Record<string, unknown>) {
  const applicationId = safeString(body.applicationId, '')
  const slots = sanitizeSlots(body.slots)
  const location = safeString(body.location, '').slice(0, maxLocationChars)
  const notes = safeString(body.notes, '').slice(0, maxNotesChars)

  if (slots.length === 0) {
    return json({ ok: false, error: 'slots_required', message: 'Propose at least one time slot.' }, 400)
  }

  const application = await fetchApplication(env, applicationId)
  if (!application || application.employerTenantId !== session.tenantId) {
    return json({ ok: false, error: 'not_found', message: 'That applicant is not in your pipeline.' }, 404)
  }

  const proposalId = crypto.randomUUID()
  await env.DB!
    .prepare(
      `INSERT INTO interview_proposals (id, application_id, employer_tenant_id, candidate_tenant_id, proposed_by_user_id, slots, location, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(proposalId, applicationId, application.employerTenantId, application.candidateTenantId, session.userId, JSON.stringify(slots), location, notes)
    .run()

  const title = `Interview times proposed for ${application.jobTitle}`
  const slotLines = slots.map((slot) => `- ${new Date(slot.start).toUTCString()}`)
  const emailBody = renderNotificationEmail({
    heading: title,
    lines: [`${application.company} proposed times for your ${application.jobTitle} interview:`, ...slotLines, location ? `Location: ${location}` : ''].filter(
      Boolean,
    ),
    ctaLabel: 'Choose a time',
    ctaUrl: `${appUrl}/candidate/applications`,
  })
  await notify(env, {
    tenantId: application.candidateTenantId,
    type: 'interview_proposed',
    title,
    body: `${slots.length} time${slots.length === 1 ? '' : 's'} proposed.`,
    linkPath: '/candidate/applications',
    email: {
      to: application.candidateEmail,
      subject: title,
      html: emailBody.html,
      text: emailBody.text,
      idempotencyKey: `interview-proposed-${proposalId}`,
      tags: [{ name: 'template', value: 'interview_proposed' }],
    },
  })

  return json({ ok: true, proposalId }, 201)
}

async function handleConfirm(env: RequestContext['env'], session: SessionContext, body: Record<string, unknown>) {
  const proposalId = safeString(body.proposalId, '')
  const slotIndex = Number(body.slotIndex)

  const proposal = await env.DB!
    .prepare(
      `SELECT id, application_id AS applicationId, employer_tenant_id AS employerTenantId, candidate_tenant_id AS candidateTenantId,
              slots, location, status
       FROM interview_proposals WHERE id = ? LIMIT 1`,
    )
    .bind(proposalId)
    .first<{ id: string; applicationId: string; employerTenantId: string; candidateTenantId: string; slots: string; location: string; status: string }>()

  if (!proposal || proposal.candidateTenantId !== session.tenantId) {
    return json({ ok: false, error: 'not_found', message: 'That interview proposal is not in your workspace.' }, 404)
  }
  if (proposal.status !== 'pending') {
    return json({ ok: false, error: 'not_pending', message: 'That proposal has already been resolved.' }, 400)
  }

  const slots = JSON.parse(proposal.slots || '[]') as Slot[]
  const slot = Number.isInteger(slotIndex) ? slots[slotIndex] : undefined
  if (!slot) {
    return json({ ok: false, error: 'invalid_slot', message: 'Choose one of the proposed times.' }, 400)
  }

  await env.DB!
    .prepare(`UPDATE interview_proposals SET status = 'confirmed', confirmed_start = ?, confirmed_end = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(slot.start, slot.end, proposal.id)
    .run()

  const application = await fetchApplication(env, proposal.applicationId)
  if (!application) {
    return json({ ok: true, proposalId: proposal.id })
  }

  const summary = `Interview: ${application.candidateName} — ${application.jobTitle}`
  const description = `Interview between ${application.company} and ${application.candidateName} for ${application.jobTitle}.`
  const attachments = icsAttachment(`interview-${proposal.id}@jobsflowai.ai`, slot.start, slot.end, summary, description, proposal.location)
  const whenLabel = new Date(slot.start).toUTCString()

  const candidateEmail = renderNotificationEmail({
    heading: `Interview confirmed for ${application.jobTitle}`,
    lines: [`Your interview with ${application.company} is set for ${whenLabel}.`, proposal.location ? `Location: ${proposal.location}` : ''].filter(Boolean),
  })
  await notify(env, {
    tenantId: application.candidateTenantId,
    type: 'interview_confirmed',
    title: `Interview confirmed for ${application.jobTitle}`,
    body: whenLabel,
    linkPath: '/candidate/applications',
    email: {
      to: application.candidateEmail,
      subject: `Interview confirmed: ${application.jobTitle}`,
      html: candidateEmail.html,
      text: candidateEmail.text,
      idempotencyKey: `interview-confirmed-candidate-${proposal.id}`,
      tags: [{ name: 'template', value: 'interview_confirmed' }],
      attachments,
    },
  })

  if (application.employerEmail) {
    const employerEmail = renderNotificationEmail({
      heading: `${application.candidateName} confirmed an interview time`,
      lines: [`${application.candidateName} confirmed ${whenLabel} for ${application.jobTitle}.`, proposal.location ? `Location: ${proposal.location}` : ''].filter(
        Boolean,
      ),
      ctaLabel: 'View applicant',
      ctaUrl: `${appUrl}/employer/candidates?job=${application.jobId}`,
    })
    await notify(env, {
      tenantId: application.employerTenantId,
      type: 'interview_confirmed',
      title: `${application.candidateName} confirmed an interview time`,
      body: whenLabel,
      linkPath: `/employer/candidates?job=${application.jobId}`,
      email: {
        to: application.employerEmail,
        subject: `Interview confirmed: ${application.candidateName}`,
        html: employerEmail.html,
        text: employerEmail.text,
        idempotencyKey: `interview-confirmed-employer-${proposal.id}`,
        tags: [{ name: 'template', value: 'interview_confirmed' }],
        attachments,
      },
    })
  }

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'interview.confirmed',
    actorType: 'user',
    action: `Confirmed interview time for ${application.jobTitle}`,
    riskLevel: 'low',
    metadata: { proposalId: proposal.id, applicationId: proposal.applicationId },
  })

  return json({ ok: true, proposalId: proposal.id })
}

async function handleCancel(env: RequestContext['env'], session: SessionContext, body: Record<string, unknown>) {
  const proposalId = safeString(body.proposalId, '')
  const proposal = await env.DB!
    .prepare('SELECT id, application_id AS applicationId, candidate_tenant_id AS candidateTenantId, status FROM interview_proposals WHERE id = ? AND employer_tenant_id = ? LIMIT 1')
    .bind(proposalId, session.tenantId)
    .first<{ id: string; applicationId: string; candidateTenantId: string; status: string }>()

  if (!proposal) {
    return json({ ok: false, error: 'not_found', message: 'That interview proposal is not in your workspace.' }, 404)
  }
  if (proposal.status === 'cancelled') {
    return json({ ok: true, proposalId: proposal.id })
  }

  await env.DB!.prepare(`UPDATE interview_proposals SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).bind(proposal.id).run()

  const application = await fetchApplication(env, proposal.applicationId)
  if (application) {
    const cancelEmail = renderNotificationEmail({
      heading: `Interview times withdrawn for ${application.jobTitle}`,
      lines: [`${application.company} withdrew the proposed interview times for ${application.jobTitle}. They may follow up with new times.`],
    })
    await notify(env, {
      tenantId: proposal.candidateTenantId,
      type: 'interview_cancelled',
      title: `Interview times withdrawn for ${application.jobTitle}`,
      body: '',
      linkPath: '/candidate/applications',
      email: {
        to: application.candidateEmail,
        subject: `Interview times withdrawn: ${application.jobTitle}`,
        html: cancelEmail.html,
        text: cancelEmail.text,
        idempotencyKey: `interview-cancelled-${proposal.id}`,
        tags: [{ name: 'template', value: 'interview_cancelled' }],
      },
    })
  }

  return json({ ok: true, proposalId: proposal.id })
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }
  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to view interview scheduling.' }, 401)
  }

  const applicationId = new URL(request.url).searchParams.get('applicationId')
  if (!applicationId) {
    return json({ ok: false, error: 'application_required', message: 'Missing the applicant to view scheduling for.' }, 400)
  }

  const application = await fetchApplication(env, applicationId)
  if (!application || (application.employerTenantId !== session.tenantId && application.candidateTenantId !== session.tenantId)) {
    return json({ ok: false, error: 'not_found', message: 'That applicant is not in your workspace.' }, 404)
  }

  const rows = await env.DB
    .prepare(
      `SELECT id, application_id AS applicationId, employer_tenant_id AS employerTenantId, candidate_tenant_id AS candidateTenantId,
              slots, location, notes, status, confirmed_start AS confirmedStart, confirmed_end AS confirmedEnd, created_at AS createdAt
       FROM interview_proposals WHERE application_id = ? ORDER BY created_at DESC`,
    )
    .bind(applicationId)
    .all<ProposalRow>()

  const proposals = (rows.results ?? []).map((row) => ({ ...row, slots: JSON.parse(row.slots || '[]') as Slot[] }))
  return json({ ok: true, proposals })
}

export async function onRequestPost({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }
  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to use interview scheduling.' }, 401)
  }

  const rate = await enforceRateLimit(env, `interview:${session.tenantId}`, 30, 60)
  if (!rate.allowed) {
    return tooManyRequests(rate)
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const action = safeString(body.action, 'propose')

  if (action === 'confirm') {
    return handleConfirm(env, session, body)
  }
  if (action === 'cancel') {
    return handleCancel(env, session, body)
  }
  return handlePropose(env, session, body)
}
