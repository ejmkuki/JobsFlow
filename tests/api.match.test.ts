import { describe, expect, it } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestPost as jobsPost } from '../functions/api/jobs'
import { onRequestGet as appsGet, onRequestPost as appsPost } from '../functions/api/job-applications'
import { onRequestGet as profileGet, onRequestPut as profilePut } from '../functions/api/profile'
import { onRequestPost as previewPost } from '../functions/api/match-preview'

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

async function postJob(env: Env, cookie: string, title: string, requiredSkills: string[]) {
  const res = await callHandler(jobsPost, {
    env,
    method: 'POST',
    url: `${base}/api/jobs`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ title, requiredSkills, description: `We need ${requiredSkills.join(', ')}.` }),
  })
  const body = (await res.json()) as { job?: { id: string } }
  return body.job!.id
}

async function saveResume(env: Env, cookie: string, resumeText: string) {
  return callHandler(profilePut, {
    env,
    method: 'PUT',
    url: `${base}/api/profile`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ resumeText }),
  })
}

async function apply(env: Env, cookie: string, jobId: string, readinessScore?: number) {
  return callHandler(appsPost, {
    env,
    method: 'POST',
    url: `${base}/api/job-applications`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ action: 'apply', jobId, coverNote: 'Keen.', readinessScore }),
  })
}

describe('honest matching', () => {
  it('ignores a client-supplied score and computes it server-side (no resume -> unscored)', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'emp@co.com', 'employer')
    const candidate = await createSession(world.env, 'cand@me.com', 'candidate')
    const jobId = await postJob(world.env, employer, 'DBA', ['MongoDB', 'Oracle'])

    // Candidate tries to inject a perfect score with an empty profile.
    const res = await apply(world.env, candidate, jobId, 100)
    expect(res.status).toBe(201)
    const body = (await res.json()) as { match: { score: number; method: string } }
    expect(body.match.method).toBe('unscored')
    expect(body.match.score).toBe(0)

    // Employer sees the honest score, not the injected 100.
    const applicants = await callHandler(appsGet, {
      env: world.env,
      url: `${base}/api/job-applications?jobId=${jobId}`,
      headers: { cookie: employer },
    })
    const list = (await applicants.json()) as { applicants: Array<{ readinessScore: number; matchMethod: string }> }
    expect(list.applicants[0].readinessScore).toBe(0)
    expect(list.applicants[0].matchMethod).toBe('unscored')
  })

  it('keyword-scores a real resume against required skills', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'e2@co.com', 'employer')
    const candidate = await createSession(world.env, 'c2@me.com', 'candidate')
    const jobId = await postJob(world.env, employer, 'DBA', ['MongoDB', 'Oracle', 'Kubernetes'])

    await saveResume(world.env, candidate, 'Ten years administering MongoDB replica sets and Oracle RAC in production.')
    const res = await apply(world.env, candidate, jobId)
    const body = (await res.json()) as { match: { score: number; method: string; gaps: string[] } }
    expect(body.match.method).toBe('keyword')
    // Matches MongoDB + Oracle (2 of 3), missing Kubernetes.
    expect(body.match.score).toBe(67)
    expect(body.match.gaps).toContain('Kubernetes')
  })

  it('profile GET/PUT round-trips and is tenant-scoped', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const a = await createSession(world.env, 'pa@me.com', 'candidate')
    const b = await createSession(world.env, 'pb@me.com', 'candidate')

    await saveResume(world.env, a, 'Resume for A')
    const getA = await callHandler(profileGet, { env: world.env, url: `${base}/api/profile`, headers: { cookie: a } })
    expect(((await getA.json()) as { profile: { resumeText: string } }).profile.resumeText).toBe('Resume for A')

    // B never saved — sees an empty profile, not A's.
    const getB = await callHandler(profileGet, { env: world.env, url: `${base}/api/profile`, headers: { cookie: b } })
    expect(((await getB.json()) as { profile: { resumeText: string } }).profile.resumeText).toBe('')
  })

  it('match preview scores the caller and rejects previewing your own job', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'e3@co.com', 'employer')
    const candidate = await createSession(world.env, 'c3@me.com', 'candidate')
    const jobId = await postJob(world.env, employer, 'DBA', ['PostgreSQL'])
    await saveResume(world.env, candidate, 'Expert in PostgreSQL tuning and replication.')

    const preview = await callHandler(previewPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/match-preview`,
      headers: { ...jsonHeaders, cookie: candidate },
      body: JSON.stringify({ jobId }),
    })
    expect(preview.status).toBe(200)
    const body = (await preview.json()) as { match: { score: number; method: string } }
    expect(body.match.method).toBe('keyword')
    expect(body.match.score).toBe(100)

    // Employer previewing their own job is rejected.
    const own = await callHandler(previewPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/match-preview`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ jobId }),
    })
    expect(own.status).toBe(400)
  })

  it('requires a signed-in session to preview', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const res = await callHandler(previewPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/match-preview`,
      headers: { ...jsonHeaders },
      body: JSON.stringify({ jobId: 'x' }),
    })
    expect(res.status).toBe(401)
  })
})
