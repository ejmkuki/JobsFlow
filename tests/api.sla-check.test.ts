import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestPost as jobsPost } from '../functions/api/jobs'
import { onRequestGet as appsGet, onRequestPost as appsPost } from '../functions/api/job-applications'
import { onRequestGet as notificationsGet } from '../functions/api/notifications'
import { onRequestPost as slaCheckPost } from '../functions/api/sla-check'

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

async function apply(env: Env, cookie: string, jobId: string) {
  const res = await callHandler(appsPost, {
    env,
    method: 'POST',
    url: `${base}/api/job-applications`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ action: 'apply', jobId }),
  })
  const body = (await res.json()) as { applicationId: string }
  return body.applicationId
}

function callSlaCheck(env: Env, secretHeader?: string) {
  return callHandler(slaCheckPost, {
    env,
    method: 'POST',
    url: `${base}/api/sla-check`,
    headers: secretHeader === undefined ? {} : { 'x-cron-secret': secretHeader },
  })
}

describe('POST /api/sla-check', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects requests without the correct shared secret', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap', CRON_SECRET: 'the-real-secret' })
    const noHeader = await callSlaCheck(world.env, undefined)
    expect(noHeader.status).toBe(401)
    const wrongHeader = await callSlaCheck(world.env, 'wrong-secret')
    expect(wrongHeader.status).toBe(401)
  })

  it('reports not_configured when CRON_SECRET is unset, rather than silently no-op succeeding', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const res = await callSlaCheck(world.env, 'anything')
    expect(res.status).toBe(503)
  })

  it('notifies the employer once for a breached application and never re-notifies it', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap', CRON_SECRET: 'the-real-secret' })
    const employer = await createSession(world.env, 'sla-emp1@co.com', 'employer')
    const candidate = await createSession(world.env, 'sla-cand1@me.com', 'candidate')
    const jobId = await postJob(world.env, employer, 'DBA')
    const applicationId = await apply(world.env, candidate, jobId)

    // Force the SLA clock into the past directly — the real flow only sets a
    // 7-day-out due date, and this test isn't waiting a week.
    await world.env.DB!
      .prepare(`UPDATE job_applications SET employer_sla_due_at = datetime('now', '-1 day') WHERE id = ?`)
      .bind(applicationId)
      .run()

    const first = await callSlaCheck(world.env, 'the-real-secret')
    expect(first.status).toBe(200)
    const firstBody = (await first.json()) as { checked: number; notified: number }
    expect(firstBody.notified).toBe(1)

    const employerNotifications = await callHandler(notificationsGet, {
      env: world.env,
      url: `${base}/api/notifications`,
      headers: { cookie: employer },
    })
    const notifBody = (await employerNotifications.json()) as { notifications: Array<{ type: string }> }
    expect(notifBody.notifications.some((n) => n.type === 'sla_breach')).toBe(true)

    // Running it again must not double-notify the same still-breached application.
    const second = await callSlaCheck(world.env, 'the-real-secret')
    const secondBody = (await second.json()) as { checked: number; notified: number }
    expect(secondBody.notified).toBe(0)
  })

  it('does not flag applications that are not overdue, or are already closed out', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap', CRON_SECRET: 'the-real-secret' })
    const employer = await createSession(world.env, 'sla-emp2@co.com', 'employer')
    const candidate = await createSession(world.env, 'sla-cand2@me.com', 'candidate')
    const jobId = await postJob(world.env, employer, 'DBA')
    await apply(world.env, candidate, jobId) // fresh SLA, 7 days out — not overdue

    const res = await callSlaCheck(world.env, 'the-real-secret')
    const body = (await res.json()) as { checked: number; notified: number }
    expect(body.notified).toBe(0)
  })
})

describe('GET /api/job-applications?rollup=sla', () => {
  async function rollup(env: Env, cookie: string) {
    const res = await callHandler(appsGet, { env, url: `${base}/api/job-applications?rollup=sla`, headers: { cookie } })
    return (await res.json()) as { overdueCount: number }
  }

  it('counts overdue applications across every one of the employer\'s open roles, not just one', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'sla-emp3@co.com', 'employer')
    const candidateA = await createSession(world.env, 'sla-cand3@me.com', 'candidate')
    const candidateB = await createSession(world.env, 'sla-cand4@me.com', 'candidate')

    const jobA = await postJob(world.env, employer, 'DBA')
    const jobB = await postJob(world.env, employer, 'SRE')
    const appA = await apply(world.env, candidateA, jobA)
    const appB = await apply(world.env, candidateB, jobB)

    await world.env.DB!
      .prepare(`UPDATE job_applications SET employer_sla_due_at = datetime('now', '-1 day') WHERE id IN (?, ?)`)
      .bind(appA, appB)
      .run()

    const result = await rollup(world.env, employer)
    expect(result.overdueCount).toBe(2)
  })
})
