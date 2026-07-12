import type { RequestContext } from '../_shared'
import { json, missingConfig } from '../_shared'
import { verifyStripeSignature } from '../_stripe'
import { freeEmployerPlan, paidEmployerPlan } from '../lib/plans'

const activeSubscriptionStatuses = new Set(['active', 'trialing'])

type StripeEvent = {
  type: string
  data: { object: Record<string, unknown> }
}

// No session auth here — Stripe calls this directly. Authenticity comes
// entirely from the Stripe-Signature header (functions/_stripe.ts's
// verifyStripeSignature), computed over the exact raw request body, which is
// why we read text() before touching JSON at all.
export async function onRequestPost({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return missingConfig('STRIPE_WEBHOOK_SECRET')
  }

  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')
  const verified = await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET)
  if (!verified) {
    return json({ ok: false, error: 'invalid_signature' }, 400)
  }

  let event: StripeEvent
  try {
    event = JSON.parse(rawBody) as StripeEvent
  } catch {
    return json({ ok: false, error: 'invalid_payload' }, 400)
  }

  if (event.type === 'checkout.session.completed') {
    const object = event.data.object
    const tenantId = typeof object.client_reference_id === 'string' ? object.client_reference_id : ''
    const customerId = typeof object.customer === 'string' ? object.customer : null
    const subscriptionId = typeof object.subscription === 'string' ? object.subscription : null
    if (tenantId) {
      await env.DB
        .prepare('UPDATE tenants SET plan_code = ?, stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?')
        .bind(paidEmployerPlan, customerId, subscriptionId, tenantId)
        .run()
    }
  } else if (event.type === 'customer.subscription.deleted') {
    const subscriptionId = typeof event.data.object.id === 'string' ? event.data.object.id : ''
    if (subscriptionId) {
      await env.DB
        .prepare('UPDATE tenants SET plan_code = ? WHERE stripe_subscription_id = ?')
        .bind(freeEmployerPlan, subscriptionId)
        .run()
    }
  } else if (event.type === 'customer.subscription.updated') {
    const subscriptionId = typeof event.data.object.id === 'string' ? event.data.object.id : ''
    const status = typeof event.data.object.status === 'string' ? event.data.object.status : ''
    if (subscriptionId) {
      const nextPlan = activeSubscriptionStatuses.has(status) ? paidEmployerPlan : freeEmployerPlan
      await env.DB
        .prepare('UPDATE tenants SET plan_code = ? WHERE stripe_subscription_id = ?')
        .bind(nextPlan, subscriptionId)
        .run()
    }
  }

  // Any event type we don't act on is still acknowledged with 200 so Stripe
  // doesn't keep retrying it.
  return json({ ok: true })
}
