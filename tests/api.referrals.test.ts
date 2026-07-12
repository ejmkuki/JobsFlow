import { describe, expect, it } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestPost as jobsPost } from '../functions/api/jobs'
import { onRequestPost as appsPost } from '../functions/api/job-applications'
import { onRequestGet as referralsGet, onRequestPost as referralsPost } from '../functions/api/referrals'

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

function createReferral(env: Env, cookie: string, jobId: string) {
  return callHandler(referralsPost, {
    env,
    method: 'POST',
    url: `${base}/api/referrals`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ jobId }),
  })
}

function apply(env: Env, cookie: string, jobId: string, referralCode?: string) {
  return callHandler(appsPost, {
    env,
    method: 'POST',
    url: `${base}/api/job-applications`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ action: 'apply', jobId, aiConsent: true, referralCode }),
  })
}

describe('referral loop', () => {
  it('creates a stable code per candidate+job and attributes an application made with it', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'ref-emp1@co.com', 'employer')
    const referrer = await createSession(world.env, 'ref-referrer1@me.com', 'candidate')
    const friend = await createSession(world.env, 'ref-friend1@me.com', 'candidate')
    const jobId = await postJob(world.env, employer)

    const first = await createReferral(world.env, referrer, jobId)
    const firstBody = (await first.json()) as { code: string }
    const second = await createReferral(world.env, referrer, jobId)
    const secondBody = (await second.json()) as { code: string }
    expect(secondBody.code).toBe(firstBody.code) // same referrer+job -> same code, no duplicates

    const applyRes = await apply(world.env, friend, jobId, firstBody.code)
    expect(applyRes.status).toBe(201)

    const summary = await callHandler(referralsGet, { env: world.env, url: `${base}/api/referrals`, headers: { cookie: referrer } })
    const summaryBody = (await summary.json()) as { totalReferredApplications: number; referrals: Array<{ referredApplications: number }> }
    expect(summaryBody.totalReferredApplications).toBe(1)
    expect(summaryBody.referrals[0].referredApplications).toBe(1)
  })

  it('never credits a self-referral or a code used for a different job', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'ref-emp2@co.com', 'employer')
    const candidate = await createSession(world.env, 'ref-cand2@me.com', 'candidate')
    const jobId = await postJob(world.env, employer)
    const otherJobId = await postJob(world.env, employer)

    const referral = await createReferral(world.env, candidate, jobId)
    const { code } = (await referral.json()) as { code: string }

    // Self-referral: applying to the same job with your own code should not
    // error, but must not attribute to yourself either.
    const selfApply = await apply(world.env, candidate, jobId, code)
    expect(selfApply.status).toBe(201)

    const summary = await callHandler(referralsGet, { env: world.env, url: `${base}/api/referrals`, headers: { cookie: candidate } })
    const summaryBody = (await summary.json()) as { totalReferredApplications: number }
    expect(summaryBody.totalReferredApplications).toBe(0)

    // Code scoped to jobId — using it for a different job's application must not attribute either.
    const otherCandidate = await createSession(world.env, 'ref-cand3@me.com', 'candidate')
    const wrongJobApply = await apply(world.env, otherCandidate, otherJobId, code)
    expect(wrongJobApply.status).toBe(201)
    const summaryAfter = await callHandler(referralsGet, { env: world.env, url: `${base}/api/referrals`, headers: { cookie: candidate } })
    const summaryAfterBody = (await summaryAfter.json()) as { totalReferredApplications: number }
    expect(summaryAfterBody.totalReferredApplications).toBe(0)
  })

  it('rejects referring your own job posting', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'ref-emp3@co.com', 'employer')
    const jobId = await postJob(world.env, employer)

    const res = await createReferral(world.env, employer, jobId)
    expect(res.status).toBe(400)
  })

  it('never leaks one candidate tenant\'s referral list to another', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'ref-emp4@co.com', 'employer')
    const owner = await createSession(world.env, 'ref-owner4@me.com', 'candidate')
    const stranger = await createSession(world.env, 'ref-stranger4@me.com', 'candidate')
    const jobId = await postJob(world.env, employer)
    await createReferral(world.env, owner, jobId)

    const strangerList = await callHandler(referralsGet, { env: world.env, url: `${base}/api/referrals`, headers: { cookie: stranger } })
    const strangerBody = (await strangerList.json()) as { referrals: unknown[] }
    expect(strangerBody.referrals).toHaveLength(0)
  })
})
