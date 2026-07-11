import type { RequestContext } from '../_shared'
import { getSession, json, missingConfig, safeString } from '../_shared'

type NotificationRow = {
  id: string
  type: string
  title: string
  body: string
  linkPath: string | null
  readAt: string | null
  createdAt: string
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to view notifications.' }, 401)
  }

  const rows = await env.DB
    .prepare(
      `SELECT id, type, title, body, link_path AS linkPath, read_at AS readAt, created_at AS createdAt
       FROM notifications WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 30`,
    )
    .bind(session.tenantId)
    .all<NotificationRow>()

  const unread = await env.DB
    .prepare('SELECT COUNT(*) AS n FROM notifications WHERE tenant_id = ? AND read_at IS NULL')
    .bind(session.tenantId)
    .first<{ n: number }>()

  return json({ ok: true, notifications: rows.results ?? [], unreadCount: unread?.n ?? 0 })
}

export async function onRequestPost({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to update notifications.' }, 401)
  }

  const body = (await request.json().catch(() => ({}))) as { id?: unknown; markAll?: unknown }

  if (body.markAll) {
    await env.DB
      .prepare(`UPDATE notifications SET read_at = datetime('now') WHERE tenant_id = ? AND read_at IS NULL`)
      .bind(session.tenantId)
      .run()
    return json({ ok: true })
  }

  const id = safeString(body.id, '')
  if (!id) {
    return json({ ok: false, error: 'id_required', message: 'Missing the notification to update.' }, 400)
  }

  await env.DB
    .prepare(`UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND tenant_id = ?`)
    .bind(id, session.tenantId)
    .run()

  return json({ ok: true })
}
