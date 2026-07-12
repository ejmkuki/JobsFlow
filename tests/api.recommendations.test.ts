import { describe, expect, it } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestPost as jobsPost } from '../functions/api/jobs'
import { onRequestPut as profilePut } from '../functions/api/profile'
import { onRequestPost as appsPost } from '../functions/api/job-applications'
import { onRequestGet as recommendationsGet } from '../functions/api/recommendations'

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
  const body = (await res.json()) as { job: { id: string } }
  return body.job.id
}

async function setResumeText(env: Env, cookie: string, resumeText: string) {
  return callHandler(profilePut, {
    env,
    method: 'PUT',
    url: `${base}/api/profile`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ resumeText }),
  })
}

async function recommendations(env: Env, cookie: string) {
  const res = await callHandler(recommendationsGet, { env, url: `${base}/api/recommendations`, headers: { cookie } })
  return (await res.json()) as { recommendations: Array<{ id: string; title: string; score: number }>; reason?: string }
}

describe('GET /api/recommendations', () => {
  it('honestly returns no recommendations with a reason when the candidate has no resume yet', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'rec-emp1@co.com', 'employer')
    const candidate = await createSession(world.env, 'rec-cand1@me.com', 'candidate')
    await postJob(world.env, employer, 'Oracle DBA', ['Oracle', 'RMAN'])

    const result = await recommendations(world.env, candidate)
    expect(result.recommendations).toEqual([])
    expect(result.reason).toBe('no_resume')
  })

  it('only recommends roles scoring strictly above 70%, ranked highest first', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'rec-emp2@co.com', 'employer')
    const candidate = await createSession(world.env, 'rec-cand2@me.com', 'candidate')

    // 4 of 4 skills -> 100%
    await postJob(world.env, employer, 'Strong Match', ['Oracle', 'RMAN', 'RAC', 'Data Guard'])
    // 1 of 4 skills -> 25%, well under threshold
    await postJob(world.env, employer, 'Weak Match', ['Oracle', 'Kubernetes', 'Golang', 'Terraform'])

    await setResumeText(
      world.env,
      candidate,
      'Ten years of Oracle administration including RMAN backups, RAC clustering, and Data Guard configuration.',
    )

    const result = await recommendations(world.env, candidate)
    expect(result.recommendations.map((r) => r.title)).toEqual(['Strong Match'])
    expect(result.recommendations[0].score).toBeGreaterThan(70)
  })

  it('excludes jobs the candidate already applied to', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'rec-emp3@co.com', 'employer')
    const candidate = await createSession(world.env, 'rec-cand3@me.com', 'candidate')
    const jobId = await postJob(world.env, employer, 'Oracle DBA', ['Oracle', 'RMAN'])
    await setResumeText(world.env, candidate, 'Oracle DBA with RMAN backup expertise.')

    const before = await recommendations(world.env, candidate)
    expect(before.recommendations.map((r) => r.id)).toContain(jobId)

    await callHandler(appsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/job-applications`,
      headers: { ...jsonHeaders, cookie: candidate },
      body: JSON.stringify({ action: 'apply', aiConsent: true, jobId }),
    })

    const after = await recommendations(world.env, candidate)
    expect(after.recommendations.map((r) => r.id)).not.toContain(jobId)
  })

  it('never recommends the candidate\'s own postings', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    // JobsFlow is one login with a Find Work / Hire switch, so the same
    // tenant can both post a job and have resume text — the
    // employer_tenant_id != ? exclusion (shared with the browse endpoint)
    // must still hold here, not just when the poster and viewer differ.
    const dualRoleCookie = await createSession(world.env, 'rec-dual@co.com', 'employer')
    await postJob(world.env, dualRoleCookie, 'Self-Posted Oracle DBA', ['Oracle'])
    await setResumeText(world.env, dualRoleCookie, 'Oracle DBA with years of experience.')

    const result = await recommendations(world.env, dualRoleCookie)
    expect(result.recommendations).toEqual([])
  })
})
