import { describe, expect, it } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestPost as jobsPost } from '../functions/api/jobs'
import { onRequestPost as appsPost } from '../functions/api/job-applications'
import { onRequestGet as interviewsGet, onRequestPost as interviewsPost } from '../functions/api/interviews'

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

function propose(env: Env, cookie: string, applicationId: string, slots: Array<{ start: string; end: string }>) {
  return callHandler(interviewsPost, {
    env,
    method: 'POST',
    url: `${base}/api/interviews`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ action: 'propose', applicationId, slots, location: 'Google Meet' }),
  })
}

function twoFutureSlots() {
  const start1 = new Date(Date.now() + 86400000).toISOString()
  const end1 = new Date(Date.now() + 86400000 + 1800000).toISOString()
  const start2 = new Date(Date.now() + 2 * 86400000).toISOString()
  const end2 = new Date(Date.now() + 2 * 86400000 + 1800000).toISOString()
  return [
    { start: start1, end: end1 },
    { start: start2, end: end2 },
  ]
}

describe('interview scheduling', () => {
  it('employer proposes slots, candidate confirms one, both get notified with an .ics', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap', RESEND_API_KEY: 'test-key' })
    const employer = await createSession(world.env, 'iv-emp1@co.com', 'employer')
    const candidate = await createSession(world.env, 'iv-cand1@me.com', 'candidate')
    const jobId = await postJob(world.env, employer)
    const applicationId = await apply(world.env, candidate, jobId)

    const proposeRes = await propose(world.env, employer, applicationId, twoFutureSlots())
    expect(proposeRes.status).toBe(201)
    const proposeBody = (await proposeRes.json()) as { proposalId: string }

    const confirmRes = await callHandler(interviewsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/interviews`,
      headers: { ...jsonHeaders, cookie: candidate },
      body: JSON.stringify({ action: 'confirm', proposalId: proposeBody.proposalId, slotIndex: 1 }),
    })
    expect(confirmRes.status).toBe(200)

    const listRes = await callHandler(interviewsGet, { env: world.env, url: `${base}/api/interviews?applicationId=${applicationId}`, headers: { cookie: employer } })
    const listBody = (await listRes.json()) as { proposals: Array<{ status: string; confirmedStart: string | null }> }
    expect(listBody.proposals[0].status).toBe('confirmed')
    expect(listBody.proposals[0].confirmedStart).toBeTruthy()
  })

  it('rejects confirming an out-of-range slot index and confirming a proposal twice', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'iv-emp2@co.com', 'employer')
    const candidate = await createSession(world.env, 'iv-cand2@me.com', 'candidate')
    const jobId = await postJob(world.env, employer)
    const applicationId = await apply(world.env, candidate, jobId)
    const proposeRes = await propose(world.env, employer, applicationId, twoFutureSlots())
    const { proposalId } = (await proposeRes.json()) as { proposalId: string }

    const badIndex = await callHandler(interviewsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/interviews`,
      headers: { ...jsonHeaders, cookie: candidate },
      body: JSON.stringify({ action: 'confirm', proposalId, slotIndex: 9 }),
    })
    expect(badIndex.status).toBe(400)

    const firstConfirm = await callHandler(interviewsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/interviews`,
      headers: { ...jsonHeaders, cookie: candidate },
      body: JSON.stringify({ action: 'confirm', proposalId, slotIndex: 0 }),
    })
    expect(firstConfirm.status).toBe(200)

    const secondConfirm = await callHandler(interviewsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/interviews`,
      headers: { ...jsonHeaders, cookie: candidate },
      body: JSON.stringify({ action: 'confirm', proposalId, slotIndex: 1 }),
    })
    expect(secondConfirm.status).toBe(400)
  })

  it('employer can cancel a pending proposal, notifying the candidate', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'iv-emp3@co.com', 'employer')
    const candidate = await createSession(world.env, 'iv-cand3@me.com', 'candidate')
    const jobId = await postJob(world.env, employer)
    const applicationId = await apply(world.env, candidate, jobId)
    const proposeRes = await propose(world.env, employer, applicationId, twoFutureSlots())
    const { proposalId } = (await proposeRes.json()) as { proposalId: string }

    const cancelRes = await callHandler(interviewsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/interviews`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ action: 'cancel', proposalId }),
    })
    expect(cancelRes.status).toBe(200)

    const listRes = await callHandler(interviewsGet, { env: world.env, url: `${base}/api/interviews?applicationId=${applicationId}`, headers: { cookie: candidate } })
    const listBody = (await listRes.json()) as { proposals: Array<{ status: string }> }
    expect(listBody.proposals[0].status).toBe('cancelled')
  })

  it('never lets a stranger tenant propose, confirm, or read another tenant\'s interview scheduling', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const owner = await createSession(world.env, 'iv-owner@co.com', 'employer')
    const strangerEmployer = await createSession(world.env, 'iv-stranger-emp@co.com', 'employer')
    const strangerCandidate = await createSession(world.env, 'iv-stranger-cand@me.com', 'candidate')
    const candidate = await createSession(world.env, 'iv-cand4@me.com', 'candidate')
    const jobId = await postJob(world.env, owner)
    const applicationId = await apply(world.env, candidate, jobId)

    const strangerPropose = await propose(world.env, strangerEmployer, applicationId, twoFutureSlots())
    expect(strangerPropose.status).toBe(404)

    const realPropose = await propose(world.env, owner, applicationId, twoFutureSlots())
    const { proposalId } = (await realPropose.json()) as { proposalId: string }

    const strangerConfirm = await callHandler(interviewsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/interviews`,
      headers: { ...jsonHeaders, cookie: strangerCandidate },
      body: JSON.stringify({ action: 'confirm', proposalId, slotIndex: 0 }),
    })
    expect(strangerConfirm.status).toBe(404)

    const strangerRead = await callHandler(interviewsGet, {
      env: world.env,
      url: `${base}/api/interviews?applicationId=${applicationId}`,
      headers: { cookie: strangerEmployer },
    })
    expect(strangerRead.status).toBe(404)
  })

  it('rejects a proposal with no slots and a slot where end is before start', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'iv-emp5@co.com', 'employer')
    const candidate = await createSession(world.env, 'iv-cand5@me.com', 'candidate')
    const jobId = await postJob(world.env, employer)
    const applicationId = await apply(world.env, candidate, jobId)

    const emptyRes = await propose(world.env, employer, applicationId, [])
    expect(emptyRes.status).toBe(400)

    const backwardsRes = await propose(world.env, employer, applicationId, [
      { start: new Date(Date.now() + 86400000).toISOString(), end: new Date(Date.now()).toISOString() },
    ])
    expect(backwardsRes.status).toBe(400)
  })
})
