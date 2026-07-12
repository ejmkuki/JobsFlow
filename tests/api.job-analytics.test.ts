import { describe, expect, it } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestPost as jobsPost } from '../functions/api/jobs'
import { onRequestPost as appsPost } from '../functions/api/job-applications'
import { onRequestGet as publicJobGet } from '../functions/jobs/[slug]'
import { onRequestGet as embedGet } from '../functions/embed/[slug]'
import { onRequestGet as analyticsGet } from '../functions/api/job-analytics'

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
  const body = (await res.json()) as { job: { id: string; slug: string } }
  return body.job
}

function apply(env: Env, cookie: string, jobId: string) {
  return callHandler(appsPost, {
    env,
    method: 'POST',
    url: `${base}/api/job-applications`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ action: 'apply', jobId, aiConsent: true }),
  })
}

function advance(env: Env, cookie: string, applicationId: string, status: string) {
  return callHandler(appsPost, {
    env,
    method: 'POST',
    url: `${base}/api/job-applications`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ action: 'advance', applicationId, status }),
  })
}

describe('funnel analytics', () => {
  it('counts views from the public permalink and embed widget, applies, advances, and hires — per job', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'fa-emp1@co.com', 'employer')
    const candidate = await createSession(world.env, 'fa-cand1@me.com', 'candidate')
    const job = await postJob(world.env, employer, 'DBA')

    await callHandler(publicJobGet, { env: world.env, url: `${base}/jobs/${job.slug}`, headers: {} })
    await callHandler(publicJobGet, { env: world.env, url: `${base}/jobs/${job.slug}`, headers: {} })
    await callHandler(embedGet, { env: world.env, url: `${base}/embed/${job.slug}`, headers: {} })

    const applyRes = await apply(world.env, candidate, job.id)
    const { applicationId } = (await applyRes.json()) as { applicationId: string }
    await advance(world.env, employer, applicationId, 'employer_review')
    await advance(world.env, employer, applicationId, 'offer')

    const res = await callHandler(analyticsGet, { env: world.env, url: `${base}/api/job-analytics?jobId=${job.id}`, headers: { cookie: employer } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { funnel: { posted: number; views: number; applies: number; advanced: number; hired: number } }
    expect(body.funnel).toEqual({ posted: 1, views: 3, applies: 1, advanced: 1, hired: 1 })
  })

  it('rolls up a workspace-wide funnel across every job the employer owns', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'fa-emp2@co.com', 'employer')
    const candidate = await createSession(world.env, 'fa-cand2@me.com', 'candidate')
    const jobA = await postJob(world.env, employer, 'DBA')
    const jobB = await postJob(world.env, employer, 'SRE')

    await callHandler(publicJobGet, { env: world.env, url: `${base}/jobs/${jobA.slug}`, headers: {} })
    await callHandler(publicJobGet, { env: world.env, url: `${base}/jobs/${jobB.slug}`, headers: {} })
    await apply(world.env, candidate, jobA.id)

    const res = await callHandler(analyticsGet, { env: world.env, url: `${base}/api/job-analytics`, headers: { cookie: employer } })
    const body = (await res.json()) as { funnel: { posted: number; views: number; applies: number } }
    expect(body.funnel.posted).toBe(2)
    expect(body.funnel.views).toBe(2)
    expect(body.funnel.applies).toBe(1)
  })

  it('never lets one employer tenant read another\'s per-job funnel, and refuses candidate workspaces entirely', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const owner = await createSession(world.env, 'fa-owner3@co.com', 'employer')
    const stranger = await createSession(world.env, 'fa-stranger3@co.com', 'employer')
    const candidate = await createSession(world.env, 'fa-cand3@me.com', 'candidate')
    const job = await postJob(world.env, owner, 'DBA')

    const strangerRes = await callHandler(analyticsGet, { env: world.env, url: `${base}/api/job-analytics?jobId=${job.id}`, headers: { cookie: stranger } })
    expect(strangerRes.status).toBe(404)

    const candidateRes = await callHandler(analyticsGet, { env: world.env, url: `${base}/api/job-analytics`, headers: { cookie: candidate } })
    expect(candidateRes.status).toBe(400)
  })
})
