import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestPost as jobsPost } from '../functions/api/jobs'
import { onRequestPost as searchPost } from '../functions/api/saved-searches'
import { onRequestGet as notificationsGet } from '../functions/api/notifications'
import { onRequestPost as alertsPost } from '../functions/api/saved-search-alerts'

const jsonHeaders = { 'content-type': 'application/json' }
const base = 'https://jobsflowai.ai'

async function createSession(env: Env, email: string, accountType: 'candidate' | 'employer') {
  const res = await callHandler(sessionPost, {
    env,
    method: 'POST',
    url: `${base}/api/session`,
    headers: { ...jsonHeaders, 'x-jobsflow-bootstrap-token': 'test-bootstrap' },
    body: JSON.stringify({ email, accountType }),
    cf: {},
  })
  return extractSessionCookie(res)!
}

async function postJob(env: Env, cookie: string, title: string) {
  const res = await callHandler(jobsPost, {
    env,
    method: 'POST',
    url: `${base}/api/jobs`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ title, requiredSkills: ['Oracle'] }),
  })
  const body = (await res.json()) as { job: { id: string } }
  return body.job.id
}

async function saveSearch(env: Env, cookie: string, query: string) {
  const res = await callHandler(searchPost, {
    env,
    method: 'POST',
    url: `${base}/api/saved-searches`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ query }),
  })
  const body = (await res.json()) as { savedSearchId: string }
  // SQLite's datetime('now') is second-precision — back-date last_checked_at
  // so a job posted moments later in the same test tick is unambiguously
  // "after" it, rather than racing to land in the same wall-clock second.
  await env.DB!
    .prepare(`UPDATE saved_searches SET last_checked_at = datetime('now', '-1 minute') WHERE id = ?`)
    .bind(body.savedSearchId)
    .run()
  return body.savedSearchId
}

function callAlerts(env: Env, secretHeader?: string) {
  return callHandler(alertsPost, {
    env,
    method: 'POST',
    url: `${base}/api/saved-search-alerts`,
    headers: secretHeader === undefined ? {} : { 'x-cron-secret': secretHeader },
  })
}

describe('POST /api/saved-search-alerts', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects requests without the correct shared secret', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap', CRON_SECRET: 'the-real-secret' })
    expect((await callAlerts(world.env, undefined)).status).toBe(401)
    expect((await callAlerts(world.env, 'wrong')).status).toBe(401)
  })

  it('notifies about a job posted after the saved search was created, and updates last_checked_at', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap', CRON_SECRET: 'the-real-secret' })
    const employer = await createSession(world.env, 'alert-emp1@co.com', 'employer')
    const candidate = await createSession(world.env, 'alert-cand1@me.com', 'candidate')

    await saveSearch(world.env, candidate, 'Oracle')
    await postJob(world.env, employer, 'Oracle DBA')

    const res = await callAlerts(world.env, 'the-real-secret')
    const body = (await res.json()) as { searchesChecked: number; notified: number }
    expect(body.notified).toBe(1)

    const notifications = await callHandler(notificationsGet, {
      env: world.env,
      url: `${base}/api/notifications`,
      headers: { cookie: candidate },
    })
    const notifBody = (await notifications.json()) as { notifications: Array<{ type: string }> }
    expect(notifBody.notifications.some((n) => n.type === 'saved_search_alert')).toBe(true)

    // Running it again finds nothing new — last_checked_at moved forward.
    const second = await callAlerts(world.env, 'the-real-secret')
    const secondBody = (await second.json()) as { notified: number }
    expect(secondBody.notified).toBe(0)
  })

  it('does not match a job that does not fit the saved search criteria', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap', CRON_SECRET: 'the-real-secret' })
    const employer = await createSession(world.env, 'alert-emp2@co.com', 'employer')
    const candidate = await createSession(world.env, 'alert-cand2@me.com', 'candidate')

    await saveSearch(world.env, candidate, 'MongoDB')
    await postJob(world.env, employer, 'Oracle DBA')

    const res = await callAlerts(world.env, 'the-real-secret')
    const body = (await res.json()) as { notified: number }
    expect(body.notified).toBe(0)
  })

  it('sends the alert email when RESEND_API_KEY is configured', async () => {
    const world = createTestWorld({
      AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap',
      CRON_SECRET: 'the-real-secret',
      RESEND_API_KEY: 'test-resend-key',
    })
    const employer = await createSession(world.env, 'alert-emp3@co.com', 'employer')
    const candidate = await createSession(world.env, 'alert-cand3@me.com', 'candidate')
    await saveSearch(world.env, candidate, 'Oracle')
    await postJob(world.env, employer, 'Oracle DBA')

    const sendSpy = vi.fn(async () => new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }))
    vi.stubGlobal('fetch', sendSpy)

    await callAlerts(world.env, 'the-real-secret')

    expect(sendSpy).toHaveBeenCalledTimes(1)
    const [, init] = sendSpy.mock.calls[0] as [string, RequestInit]
    const sentBody = JSON.parse(String(init.body)) as { to: string }
    expect(sentBody.to).toBe('alert-cand3@me.com')
  })
})
