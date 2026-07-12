import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestGet as billingGet, onRequestPost as billingPost } from '../functions/api/billing'
import { onRequestPost as teamPost } from '../functions/api/team'

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

function post(env: Env, cookie: string, action: string) {
  return callHandler(billingPost, {
    env,
    method: 'POST',
    url: `${base}/api/billing`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ action }),
  })
}

describe('billing', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('GET reports free-plan status by default, without requiring Stripe to be configured', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'bill-emp1@co.com', 'employer')

    const res = await callHandler(billingGet, { env: world.env, url: `${base}/api/billing`, headers: { cookie: employer } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { planCode: string; isPaid: boolean; isOwner: boolean }
    expect(body.planCode).toBe('hiring_team')
    expect(body.isPaid).toBe(false)
    expect(body.isOwner).toBe(true)
  })

  it('refuses billing actions from a candidate workspace', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const candidate = await createSession(world.env, 'bill-cand1@me.com', 'candidate')

    const getRes = await callHandler(billingGet, { env: world.env, url: `${base}/api/billing`, headers: { cookie: candidate } })
    expect(getRes.status).toBe(400)

    const postRes = await post(world.env, candidate, 'create_checkout')
    expect(postRes.status).toBe(400)
  })

  it('starting checkout without Stripe configured returns a clear "still being prepared" response, not a crash', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'bill-emp2@co.com', 'employer')

    const res = await post(world.env, employer, 'create_checkout')
    expect(res.status).toBe(503)
  })

  it('creates a checkout session with the tenant as client_reference_id, when Stripe is configured', async () => {
    const world = createTestWorld({
      AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap',
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_PRICE_ID_PRO: 'price_123',
    })
    const employerRes = await callHandler(sessionPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/session`,
      headers: { ...jsonHeaders, 'x-jobsflow-bootstrap-token': 'test-bootstrap' },
      body: JSON.stringify({ email: 'bill-emp3@co.com', accountType: 'employer' }),
      cf: {},
    })
    const employer = extractSessionCookie(employerRes)!
    const employerBody = (await employerRes.json()) as { session: { tenantId: string } }

    const fetchSpy = vi.fn(async (url: string) => {
      expect(url).toContain('checkout/sessions')
      return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/pay/cs_test_1' }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchSpy)

    const res = await post(world.env, employer, 'create_checkout')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { url: string }
    expect(body.url).toBe('https://checkout.stripe.com/pay/cs_test_1')

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const sentBody = new URLSearchParams(String(init.body))
    expect(sentBody.get('client_reference_id')).toBe(employerBody.session.tenantId)
    expect(sentBody.get('line_items[0][price]')).toBe('price_123')
  })

  it('rejects checkout for an already-paid tenant, and rejects the billing portal with no Stripe customer on file', async () => {
    const world = createTestWorld({
      AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap',
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_PRICE_ID_PRO: 'price_123',
    })
    const employer = await createSession(world.env, 'bill-emp4@co.com', 'employer')
    world.db.prepare(`UPDATE tenants SET plan_code = 'hiring_team_pro' WHERE id = (SELECT tenant_id FROM users WHERE email = ?)`).run('bill-emp4@co.com')

    const checkoutRes = await post(world.env, employer, 'create_checkout')
    expect(checkoutRes.status).toBe(400)

    const portalRes = await post(world.env, employer, 'create_portal')
    expect(portalRes.status).toBe(400)
  })

  it('only the workspace owner can manage billing', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap', STRIPE_SECRET_KEY: 'sk_test_123', STRIPE_PRICE_ID_PRO: 'price_123' })
    const owner = await createSession(world.env, 'bill-owner5@co.com', 'employer')
    // Invites are themselves paid-gated, so upgrade first just to get a
    // second member into the tenant for this ownership check.
    world.db.prepare(`UPDATE tenants SET plan_code = 'hiring_team_pro' WHERE id = (SELECT tenant_id FROM users WHERE email = ?)`).run('bill-owner5@co.com')
    await callHandler(teamPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/team`,
      headers: { ...jsonHeaders, cookie: owner },
      body: JSON.stringify({ email: 'member5@co.com', role: 'recruiter' }),
    })
    const member = await createSession(world.env, 'member5@co.com', 'employer')

    const res = await post(world.env, member, 'create_checkout')
    expect(res.status).toBe(403)
  })
})
