import { describe, expect, it } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestGet as jobsGet, onRequestPost as jobsPost } from '../functions/api/jobs'
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
    body: JSON.stringify({ title, requiredSkills: ['Product operations'], salaryMinCents: 11500000 }),
  })
  const body = (await res.json()) as { job?: { id: string } }
  return { status: res.status, jobId: body.job?.id }
}

async function apply(env: Env, cookie: string, jobId: string) {
  const res = await callHandler(appsPost, {
    env,
    method: 'POST',
    url: `${base}/api/job-applications`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ action: 'apply', jobId, coverNote: 'Keen to help.', readinessScore: 88 }),
  })
  return res
}

describe('core loop: post job -> browse -> apply -> employer sees -> advance', () => {
  it('runs the full happy path end to end', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'employer@co.com', 'employer')
    const candidate = await createSession(world.env, 'candidate@me.com', 'candidate')

    // Employer posts a job.
    const posted = await postJob(world.env, employer, 'Product Operations Manager')
    expect(posted.status).toBe(201)
    const jobId = posted.jobId!

    // Candidate browses open jobs and sees it.
    const browse = await callHandler(jobsGet, { env: world.env, url: `${base}/api/jobs`, headers: { cookie: candidate } })
    const browseBody = (await browse.json()) as { jobs: Array<{ id: string }> }
    expect(browseBody.jobs.map((j) => j.id)).toContain(jobId)

    // Candidate applies.
    const applied = await apply(world.env, candidate, jobId)
    expect(applied.status).toBe(201)

    // Employer sees the applicant.
    const applicants = await callHandler(appsGet, {
      env: world.env,
      url: `${base}/api/job-applications?jobId=${jobId}`,
      headers: { cookie: employer },
    })
    const applicantsBody = (await applicants.json()) as { applicants: Array<{ id: string; candidateEmail: string; status: string }> }
    expect(applicantsBody.applicants.length).toBe(1)
    expect(applicantsBody.applicants[0].candidateEmail).toBe('candidate@me.com')
    const applicationId = applicantsBody.applicants[0].id

    // Candidate sees their own application.
    const mine = await callHandler(appsGet, { env: world.env, url: `${base}/api/job-applications`, headers: { cookie: candidate } })
    const mineBody = (await mine.json()) as { applications: Array<{ jobTitle: string }> }
    expect(mineBody.applications[0].jobTitle).toBe('Product Operations Manager')

    // Employer advances the applicant.
    const advanced = await callHandler(appsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/job-applications`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ action: 'advance', applicationId, status: 'interview' }),
    })
    expect(advanced.status).toBe(200)
    expect(((await advanced.json()) as { status: string }).status).toBe('interview')
  })

  it('prevents duplicate applications and self-applications', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'e2@co.com', 'employer')
    const candidate = await createSession(world.env, 'c2@me.com', 'candidate')
    const { jobId } = await postJob(world.env, employer, 'Ops Lead')

    expect((await apply(world.env, candidate, jobId!)).status).toBe(201)
    expect((await apply(world.env, candidate, jobId!)).status).toBe(409) // duplicate

    const selfApply = await apply(world.env, employer, jobId!)
    expect(selfApply.status).toBe(400) // own job
  })

  it('rejects non-employer job posting', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const candidate = await createSession(world.env, 'c3@me.com', 'candidate')
    const res = await callHandler(jobsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/jobs`,
      headers: { ...jsonHeaders, cookie: candidate },
      body: JSON.stringify({ title: 'Sneaky job' }),
    })
    expect(res.status).toBe(403)
  })
})

describe('core loop cross-tenant isolation', () => {
  it('an employer cannot read or advance another employer applicants', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employerA = await createSession(world.env, 'a@co.com', 'employer')
    const employerB = await createSession(world.env, 'b@co.com', 'employer')
    const candidate = await createSession(world.env, 'cand@me.com', 'candidate')

    const { jobId } = await postJob(world.env, employerA, 'A role')
    await apply(world.env, candidate, jobId!)

    // Employer B tries to read A's applicants.
    const peek = await callHandler(appsGet, {
      env: world.env,
      url: `${base}/api/job-applications?jobId=${jobId}`,
      headers: { cookie: employerB },
    })
    expect(peek.status).toBe(404)

    // Get the application id via A.
    const asA = await callHandler(appsGet, {
      env: world.env,
      url: `${base}/api/job-applications?jobId=${jobId}`,
      headers: { cookie: employerA },
    })
    const applicationId = ((await asA.json()) as { applicants: Array<{ id: string }> }).applicants[0].id

    // Employer B tries to advance A's applicant.
    const hijack = await callHandler(appsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/job-applications`,
      headers: { ...jsonHeaders, cookie: employerB },
      body: JSON.stringify({ action: 'advance', applicationId, status: 'rejected' }),
    })
    expect(hijack.status).toBe(404)
  })

  it('a candidate only sees their own applications', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'emp@co.com', 'employer')
    const candA = await createSession(world.env, 'canda@me.com', 'candidate')
    const candB = await createSession(world.env, 'candb@me.com', 'candidate')
    const { jobId } = await postJob(world.env, employer, 'Shared role')

    await apply(world.env, candA, jobId!)

    const bList = await callHandler(appsGet, { env: world.env, url: `${base}/api/job-applications`, headers: { cookie: candB } })
    expect(((await bList.json()) as { applications: unknown[] }).applications.length).toBe(0)
  })
})
