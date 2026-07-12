import { describe, expect, it } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestPost as webhookPost } from '../functions/api/stripe-webhook'
import { onRequestGet as billingGet } from '../functions/api/billing'

const jsonHeaders = { 'content-type': 'application/json' }
const base = 'https://jobsflowai.ai'
const webhookSecret = 'whsec_test_secret'

async function createSession(env: Env, email: string, accountType: 'candidate' | 'employer') {
  const res = await callHandler(sessionPost, {
    env,
    method: 'POST',
    url: `${base}/api/session`,
    headers: { ...jsonHeaders, 'x-jobsflow-bootstrap-token': 'test-bootstrap' },
    body: JSON.stringify({ email, accountType }),
    cf: {},
  })
  return { cookie: extractSessionCookie(res)!, body: (await res.json()) as { session: { tenantId: string } } }
}

async function signPayload(payload: string, secret: string) {
  const timestamp = Math.floor(Date.now() / 1000)
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signatureBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`))
  const hex = [...new Uint8Array(signatureBytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `t=${timestamp},v1=${hex}`
}

async function sendWebhook(env: Env, event: unknown, signature: string) {
  const payload = JSON.stringify(event)
  return callHandler(webhookPost, {
    env,
    method: 'POST',
    url: `${base}/api/stripe-webhook`,
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    body: payload,
  })
}

describe('Stripe webhook', () => {
  it('rejects a request with no valid signature', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap', STRIPE_WEBHOOK_SECRET: webhookSecret })
    const res = await sendWebhook(world.env, { type: 'checkout.session.completed', data: { object: {} } }, 't=1,v1=deadbeef')
    expect(res.status).toBe(400)
  })

  it('upgrades a tenant to paid on checkout.session.completed with a verified signature', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap', STRIPE_WEBHOOK_SECRET: webhookSecret })
    const { cookie, body } = await createSession(world.env, 'wh-emp1@co.com', 'employer')
    const tenantId = body.session.tenantId

    const event = {
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: tenantId, customer: 'cus_123', subscription: 'sub_123' } },
    }
    const payload = JSON.stringify(event)
    const signature = await signPayload(payload, webhookSecret)

    const res = await sendWebhook(world.env, event, signature)
    expect(res.status).toBe(200)

    const status = await callHandler(billingGet, { env: world.env, url: `${base}/api/billing`, headers: { cookie } })
    const statusBody = (await status.json()) as { planCode: string; isPaid: boolean }
    expect(statusBody.planCode).toBe('hiring_team_pro')
    expect(statusBody.isPaid).toBe(true)
  })

  it('downgrades a tenant on customer.subscription.deleted', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap', STRIPE_WEBHOOK_SECRET: webhookSecret })
    const { cookie, body } = await createSession(world.env, 'wh-emp2@co.com', 'employer')
    const tenantId = body.session.tenantId

    const completedEvent = { type: 'checkout.session.completed', data: { object: { client_reference_id: tenantId, customer: 'cus_456', subscription: 'sub_456' } } }
    await sendWebhook(world.env, completedEvent, await signPayload(JSON.stringify(completedEvent), webhookSecret))

    const deletedEvent = { type: 'customer.subscription.deleted', data: { object: { id: 'sub_456' } } }
    const res = await sendWebhook(world.env, deletedEvent, await signPayload(JSON.stringify(deletedEvent), webhookSecret))
    expect(res.status).toBe(200)

    const status = await callHandler(billingGet, { env: world.env, url: `${base}/api/billing`, headers: { cookie } })
    const statusBody = (await status.json()) as { planCode: string; isPaid: boolean }
    expect(statusBody.planCode).toBe('hiring_team')
    expect(statusBody.isPaid).toBe(false)
  })

  it('ignores an unrelated event type without erroring', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap', STRIPE_WEBHOOK_SECRET: webhookSecret })
    const event = { type: 'invoice.paid', data: { object: {} } }
    const res = await sendWebhook(world.env, event, await signPayload(JSON.stringify(event), webhookSecret))
    expect(res.status).toBe(200)
  })
})
