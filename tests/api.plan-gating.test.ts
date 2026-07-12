import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie, type TestWorld } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestPost as jobsPost, onRequestPut as jobsPut } from '../functions/api/jobs'
import { onRequestPost as appsPost } from '../functions/api/job-applications'
import { onRequestPut as profilePut } from '../functions/api/profile'

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

function upgradeToPaid(world: TestWorld, email: string) {
  world.db.prepare(`UPDATE tenants SET plan_code = 'hiring_team_pro' WHERE id = (SELECT tenant_id FROM users WHERE email = ?)`).run(email)
}

function postJob(env: Env, cookie: string, title: string, status?: string) {
  return callHandler(jobsPost, {
    env,
    method: 'POST',
    url: `${base}/api/jobs`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ title, requiredSkills: ['Oracle'], status }),
  })
}

describe('plan gating', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('caps a free-plan employer at 3 open jobs, but still allows posting as a draft', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'plan-emp1@co.com', 'employer')

    for (let i = 0; i < 3; i += 1) {
      const res = await postJob(world.env, employer, `Role ${i}`)
      expect(res.status).toBe(201)
    }

    const fourth = await postJob(world.env, employer, 'Role 4')
    expect(fourth.status).toBe(402)
    const fourthBody = (await fourth.json()) as { error: string }
    expect(fourthBody.error).toBe('plan_limit_reached')

    const asDraft = await postJob(world.env, employer, 'Role 4 draft', 'draft')
    expect(asDraft.status).toBe(201)
  })

  it('never caps a paid-plan employer', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'plan-emp2@co.com', 'employer')
    upgradeToPaid(world, 'plan-emp2@co.com')

    for (let i = 0; i < 5; i += 1) {
      const res = await postJob(world.env, employer, `Role ${i}`)
      expect(res.status).toBe(201)
    }
  })

  it('blocks flipping a paused job back to open once already at the free cap', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'plan-emp3@co.com', 'employer')

    const jobIds: string[] = []
    for (let i = 0; i < 3; i += 1) {
      const res = await postJob(world.env, employer, `Role ${i}`)
      const body = (await res.json()) as { job: { id: string } }
      jobIds.push(body.job.id)
    }

    const pauseRes = await callHandler(jobsPut, {
      env: world.env,
      method: 'PUT',
      url: `${base}/api/jobs`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ id: jobIds[0], title: 'Role 0', requiredSkills: ['Oracle'], status: 'paused' }),
    })
    expect(pauseRes.status).toBe(200)

    const fourthRes = await postJob(world.env, employer, 'Role 4', 'draft')
    const fourthBody = (await fourthRes.json()) as { job: { id: string } }

    // Reopening the paused job is fine (not exceeding the cap — it just
    // re-takes a slot it already had).
    const reopenPaused = await callHandler(jobsPut, {
      env: world.env,
      method: 'PUT',
      url: `${base}/api/jobs`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ id: jobIds[0], title: 'Role 0', requiredSkills: ['Oracle'], status: 'open' }),
    })
    expect(reopenPaused.status).toBe(200)

    // But publishing the 4th (draft) job while 3 are already open is over the cap.
    const publishFourth = await callHandler(jobsPut, {
      env: world.env,
      method: 'PUT',
      url: `${base}/api/jobs`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ id: fourthBody.job.id, title: 'Role 4', requiredSkills: ['Oracle'], status: 'open' }),
    })
    expect(publishFourth.status).toBe(402)
  })

  it('keeps AI matching keyword-only for a free-plan employer even with ANTHROPIC_API_KEY set', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap', ANTHROPIC_API_KEY: 'test-anthropic-key' })
    const employer = await createSession(world.env, 'plan-emp4@co.com', 'employer')
    const candidate = await createSession(world.env, 'plan-cand4@me.com', 'candidate')

    const fetchSpy = vi.fn(async () => new Response(
      JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ score: 90, matched: ['Oracle'], gaps: [], summary: 'Great fit.' }) }] }),
      { status: 200 },
    ))
    vi.stubGlobal('fetch', fetchSpy)

    await callHandler(profilePut, {
      env: world.env,
      method: 'PUT',
      url: `${base}/api/profile`,
      headers: { ...jsonHeaders, cookie: candidate },
      body: JSON.stringify({ resumeText: 'Ten years of Oracle administration.' }),
    })

    const jobRes = await postJob(world.env, employer, 'DBA')
    const jobBody = (await jobRes.json()) as { job: { id: string } }

    const applyRes = await callHandler(appsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/job-applications`,
      headers: { ...jsonHeaders, cookie: candidate },
      body: JSON.stringify({ action: 'apply', jobId: jobBody.job.id, aiConsent: true }),
    })
    const applyBody = (await applyRes.json()) as { match: { method: string } }
    expect(applyBody.match.method).toBe('keyword')
    // The Anthropic API must never even be called for a free-plan employer's job.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('allows the AI matching tier for a paid-plan employer', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap', ANTHROPIC_API_KEY: 'test-anthropic-key' })
    const employer = await createSession(world.env, 'plan-emp5@co.com', 'employer')
    upgradeToPaid(world, 'plan-emp5@co.com')
    const candidate = await createSession(world.env, 'plan-cand5@me.com', 'candidate')

    const fetchSpy = vi.fn(async () => new Response(
      JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ score: 90, matched: ['Oracle'], gaps: [], summary: 'Great fit.' }) }] }),
      { status: 200 },
    ))
    vi.stubGlobal('fetch', fetchSpy)

    await callHandler(profilePut, {
      env: world.env,
      method: 'PUT',
      url: `${base}/api/profile`,
      headers: { ...jsonHeaders, cookie: candidate },
      body: JSON.stringify({ resumeText: 'Ten years of Oracle administration.' }),
    })

    const jobRes = await postJob(world.env, employer, 'DBA')
    const jobBody = (await jobRes.json()) as { job: { id: string } }

    const applyRes = await callHandler(appsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/job-applications`,
      headers: { ...jsonHeaders, cookie: candidate },
      body: JSON.stringify({ action: 'apply', jobId: jobBody.job.id, aiConsent: true }),
    })
    const applyBody = (await applyRes.json()) as { match: { method: string } }
    expect(applyBody.match.method).toBe('ai')
    expect(fetchSpy).toHaveBeenCalled()
  })
})
