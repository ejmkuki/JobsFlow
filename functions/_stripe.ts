// Raw fetch against the Stripe REST API — no stripe-node SDK dependency,
// same pattern as functions/_email.ts's Resend wrapper. Stripe's API takes
// application/x-www-form-urlencoded bodies (bracket notation for nested
// params), not JSON.
import type { Env } from './_shared'
import { timingSafeEqualHex } from './_shared'

const stripeApi = 'https://api.stripe.com/v1'

export function isStripeConfigured(env: Env) {
  return Boolean(env.STRIPE_SECRET_KEY)
}

async function stripeRequest<T>(env: Env, path: string, params: Record<string, string>): Promise<T> {
  const response = await fetch(`${stripeApi}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  })

  const payload = (await response.json().catch(() => null)) as (T & { error?: { message?: string } }) | null
  if (!response.ok || !payload) {
    throw new Error(payload?.error?.message || 'Stripe request did not complete.')
  }
  return payload
}

export async function createCheckoutSession(
  env: Env,
  input: { priceId: string; successUrl: string; cancelUrl: string; clientReferenceId: string; customerId?: string; customerEmail?: string },
) {
  const params: Record<string, string> = {
    mode: 'subscription',
    'line_items[0][price]': input.priceId,
    'line_items[0][quantity]': '1',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.clientReferenceId,
  }
  if (input.customerId) {
    params.customer = input.customerId
  } else if (input.customerEmail) {
    params.customer_email = input.customerEmail
  }

  return stripeRequest<{ id: string; url: string }>(env, '/checkout/sessions', params)
}

export async function createPortalSession(env: Env, input: { customerId: string; returnUrl: string }) {
  return stripeRequest<{ id: string; url: string }>(env, '/billing_portal/sessions', {
    customer: input.customerId,
    return_url: input.returnUrl,
  })
}

// Verifies Stripe's `Stripe-Signature` header per their documented scheme:
// header is `t=<unix seconds>,v1=<hex hmac>`, signed payload is
// `${t}.${rawBody}` under HMAC-SHA256 with the webhook secret. A tolerance
// window guards against replaying an old, valid signature.
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!signatureHeader) return false

  const parts: Record<string, string> = {}
  for (const entry of signatureHeader.split(',')) {
    const [key, value] = entry.split('=')
    if (key && value) parts[key] = value
  }
  const timestamp = parts.t
  const expected = parts.v1
  if (!timestamp || !expected) return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signatureBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`))
  const computedHex = [...new Uint8Array(signatureBytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

  return timingSafeEqualHex(computedHex, expected)
}
