import { describe, expect, it } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestPost as jobsPost } from '../functions/api/jobs'
import { onRequestDelete as savedDelete, onRequestGet as savedGet, onRequestPost as savedPost } from '../functions/api/saved-jobs'

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

async function listSaved(env: Env, cookie: string) {
  const res = await callHandler(savedGet, { env, url: `${base}/api/saved-jobs`, headers: { cookie } })
  return (await res.json()) as { savedJobs: Array<{ jobId: string; title: string }> }
}

describe('saved jobs (bookmarks)', () => {
  it('saves a job without applying, and lists it back with job details', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'save-emp1@co.com', 'employer')
    const candidate = await createSession(world.env, 'save-cand1@me.com', 'candidate')
    const jobId = await postJob(world.env, employer, 'DBA')

    const save = await callHandler(savedPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/saved-jobs`,
      headers: { ...jsonHeaders, cookie: candidate },
      body: JSON.stringify({ jobId }),
    })
    expect(save.status).toBe(201)

    const list = await listSaved(world.env, candidate)
    expect(list.savedJobs).toHaveLength(1)
    expect(list.savedJobs[0].title).toBe('DBA')

    // No application was created — saving is not applying.
    expect(list.savedJobs[0].jobId).toBe(jobId)
  })

  it('is idempotent — saving the same job twice does not duplicate it', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'save-emp2@co.com', 'employer')
    const candidate = await createSession(world.env, 'save-cand2@me.com', 'candidate')
    const jobId = await postJob(world.env, employer, 'DBA')

    for (let i = 0; i < 2; i += 1) {
      await callHandler(savedPost, {
        env: world.env,
        method: 'POST',
        url: `${base}/api/saved-jobs`,
        headers: { ...jsonHeaders, cookie: candidate },
        body: JSON.stringify({ jobId }),
      })
    }

    const list = await listSaved(world.env, candidate)
    expect(list.savedJobs).toHaveLength(1)
  })

  it('unsaves a job', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'save-emp3@co.com', 'employer')
    const candidate = await createSession(world.env, 'save-cand3@me.com', 'candidate')
    const jobId = await postJob(world.env, employer, 'DBA')

    await callHandler(savedPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/saved-jobs`,
      headers: { ...jsonHeaders, cookie: candidate },
      body: JSON.stringify({ jobId }),
    })
    await callHandler(savedDelete, {
      env: world.env,
      method: 'DELETE',
      url: `${base}/api/saved-jobs?jobId=${jobId}`,
      headers: { cookie: candidate },
    })

    const list = await listSaved(world.env, candidate)
    expect(list.savedJobs).toHaveLength(0)
  })

  it('never leaks or lets one tenant unsave another tenant\'s saved job', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'save-emp4@co.com', 'employer')
    const owner = await createSession(world.env, 'save-owner@me.com', 'candidate')
    const stranger = await createSession(world.env, 'save-stranger@me.com', 'candidate')
    const jobId = await postJob(world.env, employer, 'DBA')

    await callHandler(savedPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/saved-jobs`,
      headers: { ...jsonHeaders, cookie: owner },
      body: JSON.stringify({ jobId }),
    })

    const strangerList = await listSaved(world.env, stranger)
    expect(strangerList.savedJobs).toHaveLength(0)

    // A DELETE scoped to the wrong tenant_id in its WHERE clause simply
    // matches nothing — the owner's saved job must survive.
    await callHandler(savedDelete, {
      env: world.env,
      method: 'DELETE',
      url: `${base}/api/saved-jobs?jobId=${jobId}`,
      headers: { cookie: stranger },
    })
    const ownerList = await listSaved(world.env, owner)
    expect(ownerList.savedJobs).toHaveLength(1)
  })
})
