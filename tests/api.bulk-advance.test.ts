import { describe, expect, it } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestPost as jobsPost } from '../functions/api/jobs'
import { onRequestGet as appsGet, onRequestPost as appsPost } from '../functions/api/job-applications'

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
    body: JSON.stringify({ action: 'apply', aiConsent: true, jobId }),
  })
  const body = (await res.json()) as { applicationId: string }
  return body.applicationId
}

function bulkAdvance(env: Env, cookie: string, applicationIds: string[], status: string) {
  return callHandler(appsPost, {
    env,
    method: 'POST',
    url: `${base}/api/job-applications`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ action: 'bulk_advance', applicationIds, status }),
  })
}

describe('bulk advance', () => {
  it('advances multiple applicants in one call', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'bulk-emp1@co.com', 'employer')
    const candidateA = await createSession(world.env, 'bulk-candA@me.com', 'candidate')
    const candidateB = await createSession(world.env, 'bulk-candB@me.com', 'candidate')
    const jobId = await postJob(world.env, employer, 'DBA')
    const appA = await apply(world.env, candidateA, jobId)
    const appB = await apply(world.env, candidateB, jobId)

    const res = await bulkAdvance(world.env, employer, [appA, appB], 'screen')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { succeeded: number; failed: number }
    expect(body.succeeded).toBe(2)
    expect(body.failed).toBe(0)

    const applicants = await callHandler(appsGet, { env: world.env, url: `${base}/api/job-applications?jobId=${jobId}`, headers: { cookie: employer } })
    const applicantsBody = (await applicants.json()) as { applicants: Array<{ status: string }> }
    expect(applicantsBody.applicants.every((a) => a.status === 'screen')).toBe(true)
  })

  it('reports per-item failures without failing the whole batch', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'bulk-emp2@co.com', 'employer')
    const candidate = await createSession(world.env, 'bulk-cand2@me.com', 'candidate')
    const jobId = await postJob(world.env, employer, 'DBA')
    const validAppId = await apply(world.env, candidate, jobId)

    const res = await bulkAdvance(world.env, employer, [validAppId, 'does-not-exist'], 'interview')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { succeeded: number; failed: number; results: Array<{ ok: boolean; applicationId: string }> }
    expect(body.succeeded).toBe(1)
    expect(body.failed).toBe(1)
    expect(body.results.find((r) => r.applicationId === 'does-not-exist')?.ok).toBe(false)
  })

  it('never lets one employer tenant bulk-advance another tenant\'s applicant', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const ownerEmployer = await createSession(world.env, 'bulk-owner@co.com', 'employer')
    const strangerEmployer = await createSession(world.env, 'bulk-stranger@co.com', 'employer')
    const candidate = await createSession(world.env, 'bulk-cand3@me.com', 'candidate')
    const jobId = await postJob(world.env, ownerEmployer, 'DBA')
    const appId = await apply(world.env, candidate, jobId)

    const res = await bulkAdvance(world.env, strangerEmployer, [appId], 'offer')
    const body = (await res.json()) as { succeeded: number; results: Array<{ ok: boolean; error?: string }> }
    expect(body.succeeded).toBe(0)
    expect(body.results[0].error).toBe('not_found')

    // Unaffected — still in the owner's pipeline at its original status.
    const applicants = await callHandler(appsGet, {
      env: world.env,
      url: `${base}/api/job-applications?jobId=${jobId}`,
      headers: { cookie: ownerEmployer },
    })
    const applicantsBody = (await applicants.json()) as { applicants: Array<{ status: string }> }
    expect(applicantsBody.applicants[0].status).toBe('submitted')
  })

  it('rejects an empty selection and an invalid target status', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'bulk-emp4@co.com', 'employer')

    const emptyRes = await bulkAdvance(world.env, employer, [], 'interview')
    expect(emptyRes.status).toBe(400)

    const badStatusRes = await bulkAdvance(world.env, employer, ['some-id'], 'not-a-real-status')
    expect(badStatusRes.status).toBe(400)
  })
})
