import type { RequestContext } from '../_shared'
import { getSession, json, missingConfig } from '../_shared'

type AuditRow = {
  action: string
  actorType: string
  createdAt: string
  eventType: string
  id: string
  metadata: string
  riskLevel: string
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before reading audit logs.' }, 401)
  }

  const rows = await env.DB
    .prepare(
      `
      SELECT
        id,
        event_type AS eventType,
        actor_type AS actorType,
        action,
        risk_level AS riskLevel,
        metadata,
        created_at AS createdAt
      FROM audit_events
      WHERE tenant_id = ?
      ORDER BY created_at DESC
      LIMIT 50
      `,
    )
    .bind(session.tenantId)
    .all<AuditRow>()

  return json({
    ok: true,
    events: (rows.results ?? []).map((event) => ({
      ...event,
      metadata: JSON.parse(event.metadata || '{}') as Record<string, unknown>,
    })),
  })
}
