import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestPost as jobsPost } from '../functions/api/jobs'
import { onRequestGet as notificationsGet, onRequestPost as notificationsPost } from '../functions/api/notifications'
import { onRequestPost as appsPost } from '../functions/api/job-applications'

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

async function postJob(env: Env, cookie: string) {
  const res = await callHandler(jobsPost, {
    env,
    method: 'POST',
    url: `${base}/api/jobs`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ title: 'DBA', requiredSkills: ['Oracle'] }),
  })
  const body = (await res.json()) as { job: { id: string } }
  return body.job.id
}

async function apply(env: Env, cookie: string, jobId: string) {
  return callHandler(appsPost, {
    env,
    method: 'POST',
    url: `${base}/api/job-applications`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ action: 'apply', jobId }),
  })
}

async function advance(env: Env, cookie: string, applicationId: string, status: string) {
  return callHandler(appsPost, {
    env,
    method: 'POST',
    url: `${base}/api/job-applications`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ action: 'advance', applicationId, status }),
  })
}

async function listNotifications(env: Env, cookie: string) {
  const res = await callHandler(notificationsGet, { env, url: `${base}/api/notifications`, headers: { cookie } })
  return (await res.json()) as { notifications: Array<{ id: string; type: string; title: string; readAt: string | null }>; unreadCount: number }
}

describe('lifecycle notifications', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('notifies the employer tenant when a candidate applies', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'notify-emp1@co.com', 'employer')
    const candidate = await createSession(world.env, 'notify-cand1@me.com', 'candidate')
    const jobId = await postJob(world.env, employer)

    await apply(world.env, candidate, jobId)

    const employerNotifications = await listNotifications(world.env, employer)
    expect(employerNotifications.unreadCount).toBe(1)
    expect(employerNotifications.notifications[0].type).toBe('new_applicant')

    // The candidate's own tenant gets nothing from their own apply action.
    const candidateNotifications = await listNotifications(world.env, candidate)
    expect(candidateNotifications.unreadCount).toBe(0)
  })

  it('notifies the candidate when moved to interview, offer, or rejected — but not internal micro-stages', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'notify-emp2@co.com', 'employer')
    const candidate = await createSession(world.env, 'notify-cand2@me.com', 'candidate')
    const jobId = await postJob(world.env, employer)
    const applyRes = await apply(world.env, candidate, jobId)
    const { applicationId } = (await applyRes.json()) as { applicationId: string }

    await advance(world.env, employer, applicationId, 'employer_review')
    const afterInternalStage = await listNotifications(world.env, candidate)
    expect(afterInternalStage.unreadCount).toBe(0) // employer_review is not a candidate-notifying transition

    await advance(world.env, employer, applicationId, 'interview')
    const afterInterview = await listNotifications(world.env, candidate)
    expect(afterInterview.unreadCount).toBe(1)
    expect(afterInterview.notifications[0].type).toBe('application_interview')
  })

  it('marks a single notification and all notifications as read', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'notify-emp3@co.com', 'employer')
    const candidate = await createSession(world.env, 'notify-cand3@me.com', 'candidate')
    const jobId = await postJob(world.env, employer)
    await apply(world.env, candidate, jobId)

    const before = await listNotifications(world.env, employer)
    expect(before.unreadCount).toBe(1)
    const id = before.notifications[0].id

    await callHandler(notificationsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/notifications`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ id }),
    })
    const afterOne = await listNotifications(world.env, employer)
    expect(afterOne.unreadCount).toBe(0)
    expect(afterOne.notifications[0].readAt).not.toBeNull()

    // markAll on an already-fully-read inbox is a harmless no-op.
    await callHandler(notificationsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/notifications`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ markAll: true }),
    })
    const afterAll = await listNotifications(world.env, employer)
    expect(afterAll.unreadCount).toBe(0)
  })

  it('keeps notifications scoped to their own tenant', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'notify-emp4@co.com', 'employer')
    const stranger = await createSession(world.env, 'notify-stranger@co.com', 'employer')
    const candidate = await createSession(world.env, 'notify-cand4@me.com', 'candidate')
    const jobId = await postJob(world.env, employer)
    await apply(world.env, candidate, jobId)

    const strangerView = await listNotifications(world.env, stranger)
    expect(strangerView.unreadCount).toBe(0)
    expect(strangerView.notifications.length).toBe(0)
  })

  it('does not let one tenant mark another tenant\'s notification as read by guessing its id', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'notify-emp6@co.com', 'employer')
    const stranger = await createSession(world.env, 'notify-stranger2@co.com', 'employer')
    const candidate = await createSession(world.env, 'notify-cand6@me.com', 'candidate')
    const jobId = await postJob(world.env, employer)
    await apply(world.env, candidate, jobId)

    const owner = await listNotifications(world.env, employer)
    const targetId = owner.notifications[0].id
    expect(owner.unreadCount).toBe(1)

    await callHandler(notificationsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/notifications`,
      headers: { ...jsonHeaders, cookie: stranger },
      body: JSON.stringify({ id: targetId }),
    })

    // Unaffected — the UPDATE's WHERE clause requires tenant_id to match too.
    const afterAttempt = await listNotifications(world.env, employer)
    expect(afterAttempt.unreadCount).toBe(1)
    expect(afterAttempt.notifications[0].readAt).toBeNull()

    // markAll from the stranger's own (empty) inbox is a no-op, doesn't touch the real owner's.
    await callHandler(notificationsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/notifications`,
      headers: { ...jsonHeaders, cookie: stranger },
      body: JSON.stringify({ markAll: true }),
    })
    const afterMarkAll = await listNotifications(world.env, employer)
    expect(afterMarkAll.unreadCount).toBe(1)
  })

  it('sends the new-applicant email to the employer when RESEND_API_KEY is configured', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap', RESEND_API_KEY: 'test-resend-key' })
    const employer = await createSession(world.env, 'notify-emp5@co.com', 'employer')
    const candidate = await createSession(world.env, 'notify-cand5@me.com', 'candidate')
    const jobId = await postJob(world.env, employer)

    const sendSpy = vi.fn(async () => new Response(JSON.stringify({ id: 'email_123' }), { status: 200 }))
    vi.stubGlobal('fetch', sendSpy)

    await apply(world.env, candidate, jobId)

    expect(sendSpy).toHaveBeenCalledTimes(1)
    const [url, init] = sendSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    const sentBody = JSON.parse(String(init.body)) as { to: string; subject: string }
    expect(sentBody.to).toBe('notify-emp5@co.com')
    expect(sentBody.subject).toContain('DBA')
  })
})
