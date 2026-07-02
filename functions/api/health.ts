import type { RequestContext } from '../_shared'
import { json, requireDb } from '../_shared'

export async function onRequestGet({ env }: RequestContext) {
  const db = requireDb(env)
  let databaseReady = false

  if (db) {
    try {
      const row = await db.prepare('SELECT COUNT(*) AS count FROM tenants').first<{ count: number }>()
      databaseReady = typeof row?.count === 'number'
    } catch {
      databaseReady = false
    }
  }

  return json({
    ok: true,
    service: 'JobsFlow API',
    runtime: 'Cloudflare Pages Functions',
    bindings: {
      db: Boolean(env.DB),
      resumeBucket: Boolean(env.RESUME_BUCKET),
      sessionSecret: Boolean(env.AUTH_SESSION_SECRET),
      bootstrapToken: Boolean(env.AUTH_BOOTSTRAP_TOKEN),
    },
    databaseReady,
    externalSubmissionsEnabled: false,
  })
}
