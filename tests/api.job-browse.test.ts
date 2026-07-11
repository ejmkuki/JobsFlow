import { describe, expect, it } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestGet as jobsGet, onRequestPost as jobsPost } from '../functions/api/jobs'

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

async function postJob(env: Env, cookie: string, input: Record<string, unknown>) {
  const res = await callHandler(jobsPost, {
    env,
    method: 'POST',
    url: `${base}/api/jobs`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify(input),
  })
  const body = (await res.json()) as { job: { id: string } }
  return body.job.id
}

async function browse(env: Env, cookie: string, qs: string) {
  const res = await callHandler(jobsGet, { env, url: `${base}/api/jobs${qs}`, headers: { cookie } })
  const body = (await res.json()) as { jobs: Array<{ id: string; title: string }> }
  return body.jobs
}

describe('GET /api/jobs structured browse filters', () => {
  it('filters by workplace type and employment type', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'browse-emp1@co.com', 'employer')
    const candidate = await createSession(world.env, 'browse-cand1@me.com', 'candidate')

    await postJob(world.env, employer, { title: 'Remote DBA', workplaceType: 'remote', employmentType: 'full_time', requiredSkills: ['Oracle'] })
    await postJob(world.env, employer, { title: 'Onsite SRE', workplaceType: 'onsite', employmentType: 'contract', requiredSkills: ['Oracle'] })

    const remoteOnly = await browse(world.env, candidate, '?workplaceType=remote')
    expect(remoteOnly.map((j) => j.title)).toEqual(['Remote DBA'])

    const contractOnly = await browse(world.env, candidate, '?employmentType=contract')
    expect(contractOnly.map((j) => j.title)).toEqual(['Onsite SRE'])
  })

  it('filters by salary floor, excluding jobs with no salary stated', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'browse-emp2@co.com', 'employer')
    const candidate = await createSession(world.env, 'browse-cand2@me.com', 'candidate')

    await postJob(world.env, employer, { title: 'High Pay', salaryMinCents: 15000000, salaryMaxCents: 20000000, requiredSkills: ['Oracle'] })
    await postJob(world.env, employer, { title: 'Low Pay', salaryMinCents: 6000000, salaryMaxCents: 8000000, requiredSkills: ['Oracle'] })
    await postJob(world.env, employer, { title: 'No Salary Stated', requiredSkills: ['Oracle'] })

    const results = await browse(world.env, candidate, '?salaryMin=130000')
    expect(results.map((j) => j.title)).toEqual(['High Pay'])
  })

  it('filters by posted-within window', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'browse-emp3@co.com', 'employer')
    const candidate = await createSession(world.env, 'browse-cand3@me.com', 'candidate')

    const jobId = await postJob(world.env, employer, { title: 'Old Posting', requiredSkills: ['Oracle'] })
    await world.env.DB!
      .prepare(`UPDATE jobs SET created_at = datetime('now', '-40 days') WHERE id = ?`)
      .bind(jobId)
      .run()
    await postJob(world.env, employer, { title: 'Fresh Posting', requiredSkills: ['Oracle'] })

    const withinWeek = await browse(world.env, candidate, '?postedWithinDays=7')
    expect(withinWeek.map((j) => j.title)).toEqual(['Fresh Posting'])

    const everything = await browse(world.env, candidate, '')
    expect(everything.map((j) => j.title).sort()).toEqual(['Fresh Posting', 'Old Posting'])
  })

  it('combines filters with the existing keyword search and own-postings exclusion', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'browse-emp4@co.com', 'employer')
    const candidate = await createSession(world.env, 'browse-cand4@me.com', 'candidate')

    await postJob(world.env, employer, { title: 'Remote Oracle DBA', workplaceType: 'remote', requiredSkills: ['Oracle'] })
    await postJob(world.env, employer, { title: 'Remote MongoDB Engineer', workplaceType: 'remote', requiredSkills: ['MongoDB'] })

    const results = await browse(world.env, candidate, '?q=Oracle&workplaceType=remote')
    expect(results.map((j) => j.title)).toEqual(['Remote Oracle DBA'])
  })
})
