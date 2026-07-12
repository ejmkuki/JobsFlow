import { describe, expect, it } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestPost as jobsPost } from '../functions/api/jobs'
import { onRequestGet as publicJobGet } from '../functions/jobs/[slug]'

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

describe('public job permalink page', () => {
  it('renders open-graph tags and JobPosting JSON-LD for an open job', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'pub-emp1@co.com', 'employer')
    const jobRes = await callHandler(jobsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/jobs`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ title: 'Senior DBA', company: 'Acme Corp', requiredSkills: ['Oracle'], description: 'Own our Oracle fleet.' }),
    })
    const jobBody = (await jobRes.json()) as { job: { slug: string; id: string } }
    expect(jobBody.job.slug).toContain('senior-dba')

    const pageRes = await callHandler(publicJobGet, { env: world.env, url: `${base}/jobs/${jobBody.job.slug}`, headers: {} })
    expect(pageRes.status).toBe(200)
    expect(pageRes.headers.get('content-type')).toContain('text/html')
    const html = await pageRes.text()
    expect(html).toContain('Senior DBA at Acme Corp')
    expect(html).toContain('"@type":"JobPosting"')
    expect(html).toContain('og:title')
    expect(html).not.toContain('undefined')
  })

  it('never exposes a draft, paused, or another tenant\'s closed job — 404 with noindex', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'pub-emp2@co.com', 'employer')
    const jobRes = await callHandler(jobsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/jobs`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ title: 'Draft Role', requiredSkills: [], status: 'draft' }),
    })
    const jobBody = (await jobRes.json()) as { job: { slug: string } }

    const pageRes = await callHandler(publicJobGet, { env: world.env, url: `${base}/jobs/${jobBody.job.slug}`, headers: {} })
    expect(pageRes.status).toBe(404)
    const html = await pageRes.text()
    expect(html).toContain('noindex')
  })

  it('404s for an unknown slug', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const pageRes = await callHandler(publicJobGet, { env: world.env, url: `${base}/jobs/not-a-real-slug`, headers: {} })
    expect(pageRes.status).toBe(404)
  })
})
