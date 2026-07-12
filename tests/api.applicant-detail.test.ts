import { describe, expect, it } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestPost as jobsPost } from '../functions/api/jobs'
import { onRequestGet as appsGet, onRequestPost as appsPost } from '../functions/api/job-applications'
import { onRequestGet as resumesGet, onRequestPost as resumesPost } from '../functions/api/resumes'

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
    body: JSON.stringify({ title, requiredSkills: ['SQL'] }),
  })
  const body = (await res.json()) as { job?: { id: string } }
  return body.job!.id
}

async function uploadResume(env: Env, cookie: string) {
  const form = new FormData()
  form.set('resume', new File([new Uint8Array([1, 2, 3, 4])], 'resume.pdf', { type: 'application/pdf' }))
  const res = await callHandler(resumesPost, { env, method: 'POST', url: `${base}/api/resumes`, headers: { cookie }, body: form })
  const body = (await res.json()) as { resume: { id: string } }
  return body.resume.id
}

async function apply(env: Env, cookie: string, jobId: string, resumeArtifactId?: string) {
  const res = await callHandler(appsPost, {
    env,
    method: 'POST',
    url: `${base}/api/job-applications`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ action: 'apply', aiConsent: true, jobId, coverNote: 'Excited to help.', resumeArtifactId }),
  })
  const body = (await res.json()) as { applicationId: string }
  return body.applicationId
}

describe('application detail + timeline', () => {
  it('lets the employer and the candidate both view full detail with the status timeline', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'emp1@co.com', 'employer')
    const candidate = await createSession(world.env, 'cand1@me.com', 'candidate')
    const jobId = await postJob(world.env, employer, 'DBA')
    const applicationId = await apply(world.env, candidate, jobId)

    await callHandler(appsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/job-applications`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ action: 'advance', applicationId, status: 'interview' }),
    })

    const asEmployer = await callHandler(appsGet, {
      env: world.env,
      url: `${base}/api/job-applications?applicationId=${applicationId}`,
      headers: { cookie: employer },
    })
    expect(asEmployer.status).toBe(200)
    const employerBody = (await asEmployer.json()) as { application: { coverNote: string; status: string }; events: Array<{ toStatus: string }> }
    expect(employerBody.application.coverNote).toBe('Excited to help.')
    expect(employerBody.application.status).toBe('interview')
    expect(employerBody.events.map((e) => e.toStatus)).toEqual(['submitted', 'interview'])

    const asCandidate = await callHandler(appsGet, {
      env: world.env,
      url: `${base}/api/job-applications?applicationId=${applicationId}`,
      headers: { cookie: candidate },
    })
    expect(asCandidate.status).toBe(200)
  })

  it('rejects a tenant with no relationship to the application', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'emp2@co.com', 'employer')
    const candidate = await createSession(world.env, 'cand2@me.com', 'candidate')
    const stranger = await createSession(world.env, 'stranger@else.com', 'employer')
    const jobId = await postJob(world.env, employer, 'DBA')
    const applicationId = await apply(world.env, candidate, jobId)

    const res = await callHandler(appsGet, {
      env: world.env,
      url: `${base}/api/job-applications?applicationId=${applicationId}`,
      headers: { cookie: stranger },
    })
    expect(res.status).toBe(404)
  })
})

describe('resume download authorization', () => {
  it('lets the owning candidate download their own resume', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const candidate = await createSession(world.env, 'cand3@me.com', 'candidate')
    const resumeId = await uploadResume(world.env, candidate)

    const res = await callHandler(resumesGet, { env: world.env, url: `${base}/api/resumes?id=${resumeId}`, headers: { cookie: candidate } })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toContain('attachment')
  })

  it('lets the employer of an application download the attached resume', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'emp3@co.com', 'employer')
    const candidate = await createSession(world.env, 'cand4@me.com', 'candidate')
    const jobId = await postJob(world.env, employer, 'DBA')
    const resumeId = await uploadResume(world.env, candidate)
    await apply(world.env, candidate, jobId, resumeId)

    const res = await callHandler(resumesGet, { env: world.env, url: `${base}/api/resumes?id=${resumeId}`, headers: { cookie: employer } })
    expect(res.status).toBe(200)
  })

  it('blocks an unrelated employer from downloading a candidate resume', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'emp4@co.com', 'employer')
    const stranger = await createSession(world.env, 'emp5@co.com', 'employer')
    const candidate = await createSession(world.env, 'cand5@me.com', 'candidate')
    const jobId = await postJob(world.env, employer, 'DBA')
    const resumeId = await uploadResume(world.env, candidate)
    await apply(world.env, candidate, jobId, resumeId)

    const res = await callHandler(resumesGet, { env: world.env, url: `${base}/api/resumes?id=${resumeId}`, headers: { cookie: stranger } })
    expect(res.status).toBe(404)
  })

  it('blocks an employer from downloading a resume that was never applied to their job', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'emp6@co.com', 'employer')
    const candidate = await createSession(world.env, 'cand6@me.com', 'candidate')
    const resumeId = await uploadResume(world.env, candidate)

    const res = await callHandler(resumesGet, { env: world.env, url: `${base}/api/resumes?id=${resumeId}`, headers: { cookie: employer } })
    expect(res.status).toBe(404)
  })
})
