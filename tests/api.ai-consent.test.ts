import { describe, expect, it } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestPost as jobsPost } from '../functions/api/jobs'
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

function apply(env: Env, cookie: string, jobId: string, aiConsent?: boolean) {
  return callHandler(appsPost, {
    env,
    method: 'POST',
    url: `${base}/api/job-applications`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ action: 'apply', jobId, aiConsent }),
  })
}

describe('AI-assisted match consent', () => {
  it('blocks the first apply without consent, and accepts it once consent is given', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'consent-emp1@co.com', 'employer')
    const candidate = await createSession(world.env, 'consent-cand1@me.com', 'candidate')
    const jobId = await postJob(world.env, employer, 'DBA')

    const withoutConsent = await apply(world.env, candidate, jobId)
    expect(withoutConsent.status).toBe(400)
    const withoutBody = (await withoutConsent.json()) as { error: string }
    expect(withoutBody.error).toBe('consent_required')

    const withConsent = await apply(world.env, candidate, jobId, true)
    expect(withConsent.status).toBe(201)
  })

  it('does not ask again on a second application once consent is on record', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'consent-emp2@co.com', 'employer')
    const candidate = await createSession(world.env, 'consent-cand2@me.com', 'candidate')
    const jobA = await postJob(world.env, employer, 'DBA')
    const jobB = await postJob(world.env, employer, 'SRE')

    await apply(world.env, candidate, jobA, true)
    const secondApply = await apply(world.env, candidate, jobB)
    expect(secondApply.status).toBe(201)
  })

  it('never lets one candidate tenant\'s consent apply to another\'s application', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'consent-emp3@co.com', 'employer')
    const consented = await createSession(world.env, 'consent-cand3@me.com', 'candidate')
    const fresh = await createSession(world.env, 'consent-cand4@me.com', 'candidate')
    const jobId = await postJob(world.env, employer, 'DBA')

    await apply(world.env, consented, jobId, true)

    const freshJob = await postJob(world.env, employer, 'SRE')
    const freshApply = await apply(world.env, fresh, freshJob)
    expect(freshApply.status).toBe(400)
  })
})
