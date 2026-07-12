import { describe, expect, it } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie, type TestWorld } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestPost as jobsPost } from '../functions/api/jobs'
import { planRateLimit } from '../functions/lib/plans'

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

function upgradeToPaid(world: TestWorld, email: string) {
  world.db.prepare(`UPDATE tenants SET plan_code = 'hiring_team_pro' WHERE id = (SELECT tenant_id FROM users WHERE email = ?)`).run(email)
}

// Posted as drafts throughout — drafts don't count against the G1 open-job
// cap, so this isolates the rate limiter itself from that separate gate.
function postDraft(env: Env, cookie: string, title: string) {
  return callHandler(jobsPost, {
    env,
    method: 'POST',
    url: `${base}/api/jobs`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ title, requiredSkills: [], status: 'draft' }),
  })
}

describe('plan-aligned rate limits', () => {
  it('planRateLimit multiplies the free limit for a paid plan, and leaves free untouched', () => {
    expect(planRateLimit('hiring_team', 30)).toBe(30)
    expect(planRateLimit('hiring_team_pro', 30)).toBe(90)
  })

  it('a free-plan employer hits the job-post rate limit at the base 30/min', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'ratelimit-free@co.com', 'employer')

    let lastStatus = 0
    for (let i = 0; i < 31; i += 1) {
      const res = await postDraft(world.env, employer, `Draft ${i}`)
      lastStatus = res.status
    }
    expect(lastStatus).toBe(429)
  })

  it('a paid-plan employer is not rate-limited at the free plan\'s 30/min ceiling', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'ratelimit-paid@co.com', 'employer')
    upgradeToPaid(world, 'ratelimit-paid@co.com')

    let sawRateLimited = false
    for (let i = 0; i < 31; i += 1) {
      const res = await postDraft(world.env, employer, `Draft ${i}`)
      if (res.status === 429) sawRateLimited = true
    }
    expect(sawRateLimited).toBe(false)
  })
})
