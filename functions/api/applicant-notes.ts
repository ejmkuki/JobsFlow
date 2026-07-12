import type { RequestContext } from '../_shared'
import { enforceRateLimit, getSession, json, missingConfig, safeString, tooManyRequests } from '../_shared'
import { notify, renderNotificationEmail } from '../lib/notify'

const appUrl = 'https://jobsflowai.ai'
const maxNoteChars = 4000

type NoteRow = {
  id: string
  body: string
  mentionedUserIds: string
  createdAt: string
  authorName: string
}

type TeamMember = { userId: string; email: string; displayName: string }

// Deterministic, not regex-fuzzy: a mention is a literal "@DisplayName"
// substring for one of the tenant's actual team members. Scales fine for a
// small team and never misfires on an ambiguous "@something" that isn't
// really anyone's name.
function findMentions(body: string, members: TeamMember[]): TeamMember[] {
  const lowerBody = body.toLowerCase()
  return members.filter((member) => member.displayName.trim() && lowerBody.includes(`@${member.displayName.toLowerCase()}`))
}

async function verifyApplicationInTenant(env: RequestContext['env'], applicationId: string, tenantId: string) {
  return env.DB!
    .prepare(
      `SELECT a.id, a.candidate_name AS candidateName, j.title AS jobTitle
       FROM job_applications a INNER JOIN jobs j ON j.id = a.job_id
       WHERE a.id = ? AND a.employer_tenant_id = ? LIMIT 1`,
    )
    .bind(applicationId, tenantId)
    .first<{ id: string; candidateName: string; jobTitle: string }>()
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to view notes.' }, 401)
  }

  const applicationId = new URL(request.url).searchParams.get('applicationId')
  if (!applicationId) {
    return json({ ok: false, error: 'application_required', message: 'Missing the applicant to view notes for.' }, 400)
  }

  const application = await verifyApplicationInTenant(env, applicationId, session.tenantId)
  if (!application) {
    return json({ ok: false, error: 'not_found', message: 'That applicant is not in your pipeline.' }, 404)
  }

  const rows = await env.DB
    .prepare(
      `SELECT n.id, n.body, n.mentioned_user_ids AS mentionedUserIds, n.created_at AS createdAt, u.display_name AS authorName
       FROM applicant_notes n INNER JOIN users u ON u.id = n.author_user_id
       WHERE n.application_id = ? ORDER BY n.created_at ASC`,
    )
    .bind(applicationId)
    .all<NoteRow>()

  return json({
    ok: true,
    notes: (rows.results ?? []).map((row) => ({ ...row, mentionedUserIds: JSON.parse(row.mentionedUserIds || '[]') as string[] })),
  })
}

export async function onRequestPost({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to add a note.' }, 401)
  }

  const rate = await enforceRateLimit(env, `applicant-note:${session.tenantId}`, 60, 60)
  if (!rate.allowed) {
    return tooManyRequests(rate)
  }

  const body = (await request.json().catch(() => ({}))) as { applicationId?: unknown; body?: unknown }
  const applicationId = safeString(body.applicationId, '')
  const noteBody = safeString(body.body, '').slice(0, maxNoteChars)
  if (!applicationId || !noteBody) {
    return json({ ok: false, error: 'note_required', message: 'Write a note before saving.' }, 400)
  }

  const application = await verifyApplicationInTenant(env, applicationId, session.tenantId)
  if (!application) {
    return json({ ok: false, error: 'not_found', message: 'That applicant is not in your pipeline.' }, 404)
  }

  const teamRows = await env.DB
    .prepare('SELECT id AS userId, email, display_name AS displayName FROM users WHERE tenant_id = ?')
    .bind(session.tenantId)
    .all<TeamMember>()
  const mentioned = findMentions(noteBody, (teamRows.results ?? []).filter((member) => member.userId !== session.userId))

  const noteId = crypto.randomUUID()
  await env.DB
    .prepare('INSERT INTO applicant_notes (id, application_id, tenant_id, author_user_id, body, mentioned_user_ids) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(noteId, applicationId, session.tenantId, session.userId, noteBody, JSON.stringify(mentioned.map((m) => m.userId)))
    .run()

  for (const member of mentioned) {
    const title = `${session.displayName} mentioned you on ${application.candidateName}`
    const line = `"${noteBody.slice(0, 200)}${noteBody.length > 200 ? '…' : ''}"`
    const linkPath = `/employer/candidates?applicant=${applicationId}`
    const mentionEmail = renderNotificationEmail({
      heading: title,
      lines: [`On ${application.candidateName}'s application for ${application.jobTitle}:`, line],
      ctaLabel: 'View applicant',
      ctaUrl: `${appUrl}${linkPath}`,
    })
    await notify(env, {
      tenantId: session.tenantId,
      type: 'note_mention',
      title,
      body: line,
      linkPath,
      email: {
        to: member.email,
        subject: title,
        html: mentionEmail.html,
        text: mentionEmail.text,
        idempotencyKey: `note-mention-${noteId}-${member.userId}`,
        tags: [{ name: 'template', value: 'note_mention' }],
      },
    })
  }

  return json({ ok: true, noteId, mentionedUserIds: mentioned.map((m) => m.userId) }, 201)
}
