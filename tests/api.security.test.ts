import { describe, expect, it } from 'vitest'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import {
  onRequestGet as sessionGet,
  onRequestPost as sessionPost,
} from '../functions/api/session'
import { onRequestGet as resumesGet, onRequestPost as resumesPost } from '../functions/api/resumes'
import { onRequestGet as auditGet } from '../functions/api/audit'
import { onRequestPost as packetPost } from '../functions/api/packet-review'
import { onRequestPost as pipelinePost } from '../functions/api/pipeline'

const jsonHeaders = { 'content-type': 'application/json' }

async function createSession(env: ReturnType<typeof createTestWorld>['env'], email: string) {
  const res = await callHandler(sessionPost, {
    env,
    method: 'POST',
    url: 'https://jobsflowai.ai/api/session',
    headers: { ...jsonHeaders, 'x-jobsflow-bootstrap-token': 'test-bootstrap' },
    body: JSON.stringify({ email, accountType: 'candidate' }),
    cf: {},
  })
  const cookie = extractSessionCookie(res)
  const body = (await res.json()) as { session?: { tenantId: string; userId: string } }
  return { res, cookie, tenantId: body.session?.tenantId, userId: body.session?.userId }
}

describe('POST /api/session authorization', () => {
  it('ignores a forged cf-access-authenticated-user-email header (no session granted)', async () => {
    const { env } = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const res = await callHandler(sessionPost, {
      env,
      method: 'POST',
      url: 'https://jobsflowai.ai/api/session',
      headers: { ...jsonHeaders, 'cf-access-authenticated-user-email': 'victim@example.com' },
      body: '{}',
      cf: {},
    })
    expect(res.status).toBe(403)
    expect(extractSessionCookie(res)).toBeNull()
  })

  it('rejects a bootstrap request with no email', async () => {
    const { env } = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const res = await callHandler(sessionPost, {
      env,
      method: 'POST',
      headers: { ...jsonHeaders, 'x-jobsflow-bootstrap-token': 'test-bootstrap' },
      body: '{}',
      cf: {},
    })
    expect(res.status).toBe(403)
  })

  it('creates a signed session for a valid bootstrap request', async () => {
    const { env } = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const { res, cookie } = await createSession(env, 'founder@example.com')
    expect(res.status).toBe(201)
    expect(cookie).toBeTruthy()

    const me = await callHandler(sessionGet, { env, headers: { cookie: cookie! } })
    const body = (await me.json()) as { authenticated: boolean; session: { email: string } }
    expect(body.authenticated).toBe(true)
    expect(body.session.email).toBe('founder@example.com')
  })
})

describe('cross-tenant isolation', () => {
  it('audit history only returns the calling tenant events', async () => {
    const { env } = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const a = await createSession(env, 'tenant-a@example.com')
    await createSession(env, 'tenant-b@example.com')

    const res = await callHandler(auditGet, { env, headers: { cookie: a.cookie! } })
    const body = (await res.json()) as { events: Array<{ action: string }> }
    // Each tenant creation writes exactly one audit event; tenant A must not
    // see tenant B's event.
    expect(body.events.length).toBe(1)
  })

  it('resume listing is scoped to the calling tenant', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const a = await createSession(world.env, 'tenant-a@example.com')
    const b = await createSession(world.env, 'tenant-b@example.com')

    // Insert a resume owned by tenant B directly.
    world.db
      .prepare(
        `INSERT INTO resume_artifacts (id, tenant_id, user_id, object_key, filename, content_type, size_bytes, source_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('resume-b', b.tenantId, b.userId, 'k', 'b.pdf', 'application/pdf', 10, 'hash')

    const aList = await callHandler(resumesGet, { env: world.env, headers: { cookie: a.cookie! } })
    const aBody = (await aList.json()) as { resumes: unknown[] }
    expect(aBody.resumes.length).toBe(0)

    const bList = await callHandler(resumesGet, { env: world.env, headers: { cookie: b.cookie! } })
    const bBody = (await bList.json()) as { resumes: Array<{ id: string }> }
    expect(bBody.resumes.map((r) => r.id)).toContain('resume-b')
  })
})

describe('unauthenticated access is rejected', () => {
  it('tenant-scoped endpoints return 401 without a session', async () => {
    const { env } = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    for (const handler of [auditGet, resumesGet]) {
      const res = await callHandler(handler, { env })
      expect(res.status).toBe(401)
    }
    for (const handler of [resumesPost, packetPost, pipelinePost]) {
      const res = await callHandler(handler, { env, method: 'POST', headers: jsonHeaders, body: '{}' })
      expect([401, 403]).toContain(res.status)
    }
  })
})
