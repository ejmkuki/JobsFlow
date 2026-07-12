import type { RequestContext } from '../_shared'
import { enforceRateLimit, getSession, json, missingConfig, normalizeEmail, safeString, tooManyRequests } from '../_shared'
import { notify, renderNotificationEmail } from '../lib/notify'

const appUrl = 'https://jobsflowai.ai'
const inviteRoles = new Set(['recruiter', 'hiring_manager'])
const inviteExpiryDays = 14
const maxPendingInvites = 25

type MemberRow = { userId: string; email: string; displayName: string; role: string }
type InviteRow = { id: string; invitedEmail: string; role: string; createdAt: string; expiresAt: string }

async function requireOwner(env: RequestContext['env'], tenantId: string, userId: string) {
  const tenant = await env.DB!.prepare('SELECT owner_user_id AS ownerUserId FROM tenants WHERE id = ? LIMIT 1').bind(tenantId).first<{ ownerUserId: string | null }>()
  return tenant?.ownerUserId === userId
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to view your team.' }, 401)
  }

  const tenant = await env.DB
    .prepare('SELECT owner_user_id AS ownerUserId FROM tenants WHERE id = ? LIMIT 1')
    .bind(session.tenantId)
    .first<{ ownerUserId: string | null }>()

  const members = await env.DB
    .prepare('SELECT id AS userId, email, display_name AS displayName, role FROM users WHERE tenant_id = ? ORDER BY created_at ASC')
    .bind(session.tenantId)
    .all<MemberRow>()

  const invites = await env.DB
    .prepare(
      `SELECT id, invited_email AS invitedEmail, role, created_at AS createdAt, expires_at AS expiresAt
       FROM tenant_invites WHERE tenant_id = ? AND status = 'pending' ORDER BY created_at DESC`,
    )
    .bind(session.tenantId)
    .all<InviteRow>()

  return json({
    ok: true,
    members: (members.results ?? []).map((member) => ({ ...member, isOwner: member.userId === tenant?.ownerUserId })),
    invites: invites.results ?? [],
    isOwner: session.userId === tenant?.ownerUserId,
  })
}

export async function onRequestPost({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to invite a teammate.' }, 401)
  }

  const rate = await enforceRateLimit(env, `team-invite:${session.tenantId}`, 20, 60)
  if (!rate.allowed) {
    return tooManyRequests(rate)
  }

  if (!(await requireOwner(env, session.tenantId, session.userId))) {
    return json({ ok: false, error: 'owner_required', message: 'Only the workspace owner can invite teammates.' }, 403)
  }

  const body = (await request.json().catch(() => ({}))) as { email?: unknown; role?: unknown }
  const email = normalizeEmail(safeString(body.email, ''))
  const role = inviteRoles.has(String(body.role)) ? String(body.role) : 'recruiter'
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: 'invalid_email', message: 'Enter a valid email to invite.' }, 400)
  }

  const existingUser = await env.DB.prepare('SELECT id FROM users WHERE email = ? LIMIT 1').bind(email).first<{ id: string }>()
  if (existingUser) {
    return json(
      { ok: false, error: 'already_has_account', message: 'That email already has a JobsFlow account and cannot be invited into another workspace.' },
      400,
    )
  }

  const pendingCount = await env.DB
    .prepare(`SELECT COUNT(*) AS n FROM tenant_invites WHERE tenant_id = ? AND status = 'pending'`)
    .bind(session.tenantId)
    .first<{ n: number }>()
  if ((pendingCount?.n ?? 0) >= maxPendingInvites) {
    return json({ ok: false, error: 'limit_reached', message: `You can have up to ${maxPendingInvites} pending invites at once.` }, 400)
  }

  const existingInvite = await env.DB
    .prepare(`SELECT id FROM tenant_invites WHERE tenant_id = ? AND invited_email = ? AND status = 'pending' LIMIT 1`)
    .bind(session.tenantId, email)
    .first<{ id: string }>()
  if (existingInvite) {
    return json({ ok: false, error: 'already_invited', message: 'That email already has a pending invite.' }, 400)
  }

  const inviteId = crypto.randomUUID()
  await env.DB
    .prepare(
      `INSERT INTO tenant_invites (id, tenant_id, invited_email, role, invited_by_user_id, expires_at)
       VALUES (?, ?, ?, ?, ?, datetime('now', '+${inviteExpiryDays} days'))`,
    )
    .bind(inviteId, session.tenantId, email, role, session.userId)
    .run()

  const roleLabel = role === 'hiring_manager' ? 'hiring manager' : 'recruiter'
  const title = `${session.displayName} invited you to join ${session.tenantName} on JobsFlow AI`
  const emailBody = renderNotificationEmail({
    heading: title,
    lines: [
      `You've been invited as a ${roleLabel}. Sign in at JobsFlow AI with this email address (${email}) to join.`,
    ],
    ctaLabel: 'Sign in to JobsFlow AI',
    ctaUrl: `${appUrl}/auth`,
  })
  // The in-app row lands in the *inviter's* own tenant as a confirmation
  // record — the invitee has no tenant to read a notification from yet.
  // Email is the only channel that reaches them before they join.
  await notify(env, {
    tenantId: session.tenantId,
    type: 'team_invite_sent',
    title: `Invited ${email} as ${roleLabel}`,
    body: '',
    email: {
      to: email,
      subject: title,
      html: emailBody.html,
      text: emailBody.text,
      idempotencyKey: `team-invite-${inviteId}`,
      tags: [{ name: 'template', value: 'team_invite' }],
    },
  })

  return json({ ok: true, inviteId }, 201)
}

export async function onRequestDelete({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to manage your team.' }, 401)
  }

  if (!(await requireOwner(env, session.tenantId, session.userId))) {
    return json({ ok: false, error: 'owner_required', message: 'Only the workspace owner can manage the team.' }, 403)
  }

  const url = new URL(request.url)
  const inviteId = url.searchParams.get('inviteId')
  const userId = url.searchParams.get('userId')

  if (inviteId) {
    await env.DB
      .prepare(`UPDATE tenant_invites SET status = 'revoked' WHERE id = ? AND tenant_id = ? AND status = 'pending'`)
      .bind(inviteId, session.tenantId)
      .run()
    return json({ ok: true })
  }

  if (userId) {
    if (userId === session.userId) {
      return json({ ok: false, error: 'cannot_remove_self', message: 'The workspace owner cannot remove themselves.' }, 400)
    }
    await env.DB.prepare('DELETE FROM users WHERE id = ? AND tenant_id = ?').bind(userId, session.tenantId).run()
    return json({ ok: true })
  }

  return json({ ok: false, error: 'target_required', message: 'Specify an inviteId or userId to remove.' }, 400)
}
