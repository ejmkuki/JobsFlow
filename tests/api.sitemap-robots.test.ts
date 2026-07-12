import { describe, expect, it } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestPost as jobsPost } from '../functions/api/jobs'
import { onRequestGet as sitemapGet } from '../functions/sitemap.xml'
import { onRequestGet as robotsGet } from '../functions/robots.txt'

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

describe('sitemap.xml + robots.txt', () => {
  it('lists open job permalinks in the sitemap, never draft ones', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'sm-emp1@co.com', 'employer')
    const openJob = await callHandler(jobsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/jobs`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ title: 'Open Role', requiredSkills: [] }),
    })
    const openBody = (await openJob.json()) as { job: { slug: string } }
    await callHandler(jobsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/jobs`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ title: 'Draft Role', requiredSkills: [], status: 'draft' }),
    })

    const res = await callHandler(sitemapGet, { env: world.env, url: `${base}/sitemap.xml`, headers: {} })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/xml')
    const xml = await res.text()
    expect(xml).toContain(`/jobs/${openBody.job.slug}`)
    expect(xml).not.toContain('Draft Role')
    expect(xml).toContain('<urlset')
  })

  it('serves robots.txt pointing at the sitemap and disallowing authenticated areas', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const res = await callHandler(robotsGet, { env: world.env, url: `${base}/robots.txt`, headers: {} })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('Sitemap: https://jobsflowai.ai/sitemap.xml')
    expect(text).toContain('Disallow: /employer/')
    expect(text).toContain('Allow: /jobs/')
  })
})
