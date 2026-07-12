import { describe, expect, it } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost, onRequestGet as sessionGet } from '../functions/api/session'
import { onRequestPost as jobsPost } from '../functions/api/jobs'
import { onRequestPost as appsPost } from '../functions/api/job-applications'
import { onRequestGet as exportGet, onRequestPost as accountPost } from '../functions/api/account-data'

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

describe('candidate data export + delete', () => {
  it('exports the candidate\'s own applications, never another tenant\'s', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'acct-emp1@co.com', 'employer')
    const candidate = await createSession(world.env, 'acct-cand1@me.com', 'candidate')
    const stranger = await createSession(world.env, 'acct-cand2@me.com', 'candidate')

    const jobRes = await callHandler(jobsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/jobs`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ title: 'DBA', requiredSkills: ['Oracle'] }),
    })
    const jobBody = (await jobRes.json()) as { job: { id: string } }
    await callHandler(appsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/job-applications`,
      headers: { ...jsonHeaders, cookie: candidate },
      body: JSON.stringify({ action: 'apply', aiConsent: true, jobId: jobBody.job.id }),
    })

    const exportRes = await callHandler(exportGet, { env: world.env, url: `${base}/api/account-data`, headers: { cookie: candidate } })
    expect(exportRes.status).toBe(200)
    const exportBody = (await exportRes.json()) as { data: { applications: Array<{ jobTitle: string }> } }
    expect(exportBody.data.applications).toHaveLength(1)
    expect(exportBody.data.applications[0].jobTitle).toBe('DBA')

    const strangerExport = await callHandler(exportGet, { env: world.env, url: `${base}/api/account-data`, headers: { cookie: stranger } })
    const strangerBody = (await strangerExport.json()) as { data: { applications: unknown[] } }
    expect(strangerBody.data.applications).toHaveLength(0)
  })

  it('refuses export/delete from an employer workspace', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'acct-emp2@co.com', 'employer')

    const exportRes = await callHandler(exportGet, { env: world.env, url: `${base}/api/account-data`, headers: { cookie: employer } })
    expect(exportRes.status).toBe(400)

    const deleteRes = await callHandler(accountPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/account-data`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ action: 'delete', confirmEmail: 'acct-emp2@co.com' }),
    })
    expect(deleteRes.status).toBe(400)
  })

  it('requires the account email typed exactly to confirm deletion', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const candidate = await createSession(world.env, 'acct-cand3@me.com', 'candidate')

    const wrongConfirm = await callHandler(accountPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/account-data`,
      headers: { ...jsonHeaders, cookie: candidate },
      body: JSON.stringify({ action: 'delete', confirmEmail: 'not-my-email@me.com' }),
    })
    expect(wrongConfirm.status).toBe(400)

    const stillThere = await callHandler(sessionGet, { env: world.env, url: `${base}/api/session`, headers: { cookie: candidate } })
    const stillBody = (await stillThere.json()) as { authenticated: boolean }
    expect(stillBody.authenticated).toBe(true)
  })

  it('deletes the account, clears the session cookie, and every trace disappears', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'acct-emp3@co.com', 'employer')
    const candidate = await createSession(world.env, 'acct-cand4@me.com', 'candidate')

    const jobRes = await callHandler(jobsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/jobs`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ title: 'DBA', requiredSkills: ['Oracle'] }),
    })
    const jobBody = (await jobRes.json()) as { job: { id: string } }
    await callHandler(appsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/job-applications`,
      headers: { ...jsonHeaders, cookie: candidate },
      body: JSON.stringify({ action: 'apply', aiConsent: true, jobId: jobBody.job.id }),
    })

    const del = await callHandler(accountPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/account-data`,
      headers: { ...jsonHeaders, cookie: candidate },
      body: JSON.stringify({ action: 'delete', confirmEmail: 'acct-cand4@me.com' }),
    })
    expect(del.status).toBe(200)
    expect(del.headers.get('set-cookie') ?? '').toContain('jobsflow_session=;')

    const afterDelete = await callHandler(sessionGet, { env: world.env, url: `${base}/api/session`, headers: { cookie: candidate } })
    const afterBody = (await afterDelete.json()) as { authenticated: boolean }
    expect(afterBody.authenticated).toBe(false)

    // The old session cookie no longer resolves to any tenant — a fresh
    // export attempt with it is simply unauthorized, not a leak.
    const exportAfter = await callHandler(exportGet, { env: world.env, url: `${base}/api/account-data`, headers: { cookie: candidate } })
    expect(exportAfter.status).toBe(401)
  })
})
