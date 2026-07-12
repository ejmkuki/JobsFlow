import { describe, expect, it } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestPost as jobsPost } from '../functions/api/jobs'
import { onRequestPost as appsPost } from '../functions/api/job-applications'
import { onRequestGet as scorecardsGet, onRequestPost as scorecardsPost } from '../functions/api/scorecards'

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
    body: JSON.stringify({ action: 'apply', jobId }),
  })
  const body = (await res.json()) as { applicationId: string }
  return body.applicationId
}

function createTemplate(env: Env, cookie: string, jobId: string) {
  return callHandler(scorecardsPost, {
    env,
    method: 'POST',
    url: `${base}/api/scorecards`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({
      action: 'create_template',
      jobId,
      name: 'DBA panel',
      criteria: [
        { key: 'sql', label: 'SQL depth', weight: 2 },
        { key: 'comm', label: 'Communication', weight: 1 },
      ],
    }),
  })
}

function submitScorecard(env: Env, cookie: string, applicationId: string, scores: Record<string, number>, recommendation: string) {
  return callHandler(scorecardsPost, {
    env,
    method: 'POST',
    url: `${base}/api/scorecards`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ action: 'submit', applicationId, scores, recommendation }),
  })
}

describe('interview scorecards', () => {
  it('creates a job-specific template and resolves it over the tenant default', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'sc-emp1@co.com', 'employer')
    const jobId = await postJob(world.env, employer)

    const defaultRes = await createTemplate(world.env, employer, '')
    expect(defaultRes.status).toBe(201)
    const jobRes = await createTemplate(world.env, employer, jobId)
    expect(jobRes.status).toBe(201)

    const getRes = await callHandler(scorecardsGet, { env: world.env, url: `${base}/api/scorecards?jobId=${jobId}`, headers: { cookie: employer } })
    const body = (await getRes.json()) as { template: { criteria: Array<{ key: string }> } }
    expect(body.template.criteria.map((c) => c.key)).toEqual(['sql', 'comm'])
  })

  it('submits a weighted scorecard and aggregates across interviewers', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const owner = await createSession(world.env, 'sc-owner@co.com', 'employer')
    const candidate = await createSession(world.env, 'sc-cand1@me.com', 'candidate')
    const jobId = await postJob(world.env, owner)
    const applicationId = await apply(world.env, candidate, jobId)
    await createTemplate(world.env, owner, jobId)

    const res1 = await submitScorecard(world.env, owner, applicationId, { sql: 5, comm: 3 }, 'strong_yes')
    expect(res1.status).toBe(201)

    const submissions = await callHandler(scorecardsGet, {
      env: world.env,
      url: `${base}/api/scorecards?applicationId=${applicationId}`,
      headers: { cookie: owner },
    })
    const body = (await submissions.json()) as { submissions: Array<unknown>; aggregateScore: number; recommendationTally: Record<string, number> }
    expect(body.submissions).toHaveLength(1)
    // weighted: (5*2 + 3*1) / 3 = 4.33
    expect(body.aggregateScore).toBeCloseTo(4.33, 1)
    expect(body.recommendationTally.strong_yes).toBe(1)
  })

  it('re-submitting by the same interviewer updates their submission instead of duplicating it', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const owner = await createSession(world.env, 'sc-owner2@co.com', 'employer')
    const candidate = await createSession(world.env, 'sc-cand2@me.com', 'candidate')
    const jobId = await postJob(world.env, owner)
    const applicationId = await apply(world.env, candidate, jobId)
    await createTemplate(world.env, owner, jobId)

    await submitScorecard(world.env, owner, applicationId, { sql: 2, comm: 2 }, 'no')
    const second = await submitScorecard(world.env, owner, applicationId, { sql: 5, comm: 5 }, 'strong_yes')
    expect(second.status).toBe(200)

    const submissions = await callHandler(scorecardsGet, {
      env: world.env,
      url: `${base}/api/scorecards?applicationId=${applicationId}`,
      headers: { cookie: owner },
    })
    const body = (await submissions.json()) as { submissions: Array<{ recommendation: string }> }
    expect(body.submissions).toHaveLength(1)
    expect(body.submissions[0].recommendation).toBe('strong_yes')
  })

  it('never lets one employer tenant read or file a scorecard on another tenant\'s applicant', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const owner = await createSession(world.env, 'sc-owner3@co.com', 'employer')
    const stranger = await createSession(world.env, 'sc-stranger@co.com', 'employer')
    const candidate = await createSession(world.env, 'sc-cand3@me.com', 'candidate')
    const jobId = await postJob(world.env, owner)
    const applicationId = await apply(world.env, candidate, jobId)
    await createTemplate(world.env, owner, jobId)

    const readRes = await callHandler(scorecardsGet, {
      env: world.env,
      url: `${base}/api/scorecards?applicationId=${applicationId}`,
      headers: { cookie: stranger },
    })
    expect(readRes.status).toBe(404)

    const submitRes = await submitScorecard(world.env, stranger, applicationId, { sql: 5 }, 'yes')
    expect(submitRes.status).toBe(404)
  })

  it('rejects a submission with no recommendation and a template with no criteria', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const owner = await createSession(world.env, 'sc-owner4@co.com', 'employer')
    const candidate = await createSession(world.env, 'sc-cand4@me.com', 'candidate')
    const jobId = await postJob(world.env, owner)
    const applicationId = await apply(world.env, candidate, jobId)

    const badTemplate = await callHandler(scorecardsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/scorecards`,
      headers: { ...jsonHeaders, cookie: owner },
      body: JSON.stringify({ action: 'create_template', jobId, name: 'Empty', criteria: [] }),
    })
    expect(badTemplate.status).toBe(400)

    const badSubmit = await submitScorecard(world.env, owner, applicationId, { sql: 5 }, 'not-a-real-recommendation')
    expect(badSubmit.status).toBe(400)
  })
})
