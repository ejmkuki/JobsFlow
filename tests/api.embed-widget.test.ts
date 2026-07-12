import { describe, expect, it } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestPost as jobsPost } from '../functions/api/jobs'
import { onRequestGet as embedGet } from '../functions/embed/[slug]'
import { onRequestGet as embedJsGet } from '../functions/embed.js'

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

describe('embeddable apply widget', () => {
  it('renders a job card iframe page for an open job, linking back to the public permalink', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'embed-emp1@co.com', 'employer')
    const jobRes = await callHandler(jobsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/jobs`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ title: 'SRE', company: 'Acme', requiredSkills: ['Kubernetes'] }),
    })
    const jobBody = (await jobRes.json()) as { job: { slug: string } }

    const res = await callHandler(embedGet, { env: world.env, url: `${base}/embed/${jobBody.job.slug}`, headers: {} })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('SRE')
    expect(html).toContain(`/jobs/${jobBody.job.slug}`)
    expect(html).toContain('target="_top"')
  })

  it('404s for a job that is not open', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'embed-emp2@co.com', 'employer')
    const jobRes = await callHandler(jobsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/jobs`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ title: 'Draft', requiredSkills: [], status: 'draft' }),
    })
    const jobBody = (await jobRes.json()) as { job: { slug: string } }

    const res = await callHandler(embedGet, { env: world.env, url: `${base}/embed/${jobBody.job.slug}`, headers: {} })
    expect(res.status).toBe(404)
  })

  it('serves embed.js with CORS allowed so any employer site can load it', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const res = await callHandler(embedJsGet, { env: world.env, url: `${base}/embed.js`, headers: {} })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('javascript')
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    const js = await res.text()
    expect(js).toContain('data-job')
    expect(js).toContain('/embed/')
  })
})
