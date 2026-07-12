import type { RequestContext } from '../_shared'
import { enforceRateLimit, getSession, json, missingConfig, safeString, tooManyRequests } from '../_shared'
import { createCheckoutSession, createPortalSession, isStripeConfigured } from '../_stripe'
import { freeEmployerPlan, isPaidEmployerPlan } from '../lib/plans'

const appUrl = 'https://jobsflowai.ai'

async function requireOwner(env: RequestContext['env'], tenantId: string, userId: string) {
  const tenant = await env.DB!.prepare('SELECT owner_user_id AS ownerUserId FROM tenants WHERE id = ? LIMIT 1').bind(tenantId).first<{ ownerUserId: string | null }>()
  return tenant?.ownerUserId === userId
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }
  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to view billing.' }, 401)
  }
  if (session.tenantType !== 'employer') {
    return json({ ok: false, error: 'wrong_workspace_type', message: 'Billing is managed from an employer workspace.' }, 400)
  }

  const tenant = await env.DB
    .prepare('SELECT plan_code AS planCode, owner_user_id AS ownerUserId, stripe_customer_id AS stripeCustomerId FROM tenants WHERE id = ? LIMIT 1')
    .bind(session.tenantId)
    .first<{ planCode: string; ownerUserId: string | null; stripeCustomerId: string | null }>()

  return json({
    ok: true,
    planCode: tenant?.planCode ?? freeEmployerPlan,
    isPaid: isPaidEmployerPlan(tenant?.planCode ?? freeEmployerPlan),
    isOwner: tenant?.ownerUserId === session.userId,
    hasBillingAccount: Boolean(tenant?.stripeCustomerId),
  })
}

export async function onRequestPost({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }
  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to manage billing.' }, 401)
  }
  if (session.tenantType !== 'employer') {
    return json({ ok: false, error: 'wrong_workspace_type', message: 'Billing is managed from an employer workspace.' }, 400)
  }

  const rate = await enforceRateLimit(env, `billing:${session.tenantId}`, 10, 60)
  if (!rate.allowed) {
    return tooManyRequests(rate)
  }

  if (!(await requireOwner(env, session.tenantId, session.userId))) {
    return json({ ok: false, error: 'owner_required', message: 'Only the workspace owner can manage billing.' }, 403)
  }

  if (!isStripeConfigured(env)) {
    return missingConfig('STRIPE_SECRET_KEY')
  }

  const body = (await request.json().catch(() => ({}))) as { action?: unknown }
  const action = safeString(body.action, '')

  const tenant = await env.DB
    .prepare('SELECT plan_code AS planCode, stripe_customer_id AS stripeCustomerId FROM tenants WHERE id = ? LIMIT 1')
    .bind(session.tenantId)
    .first<{ planCode: string; stripeCustomerId: string | null }>()

  if (action === 'create_checkout') {
    if (isPaidEmployerPlan(tenant?.planCode ?? freeEmployerPlan)) {
      return json({ ok: false, error: 'already_paid', message: 'This workspace is already on the paid plan.' }, 400)
    }
    if (!env.STRIPE_PRICE_ID_PRO) {
      return missingConfig('STRIPE_PRICE_ID_PRO')
    }
    try {
      const checkout = await createCheckoutSession(env, {
        priceId: env.STRIPE_PRICE_ID_PRO,
        successUrl: `${appUrl}/employer/team?upgraded=1`,
        cancelUrl: `${appUrl}/employer/team`,
        clientReferenceId: session.tenantId,
        customerId: tenant?.stripeCustomerId ?? undefined,
        customerEmail: tenant?.stripeCustomerId ? undefined : session.email,
      })
      return json({ ok: true, url: checkout.url })
    } catch (error) {
      console.error(`[billing] checkout session failed: ${error instanceof Error ? error.message : String(error)}`)
      return json({ ok: false, error: 'stripe_error', message: 'Could not start checkout. Please try again shortly.' }, 502)
    }
  }

  if (action === 'create_portal') {
    if (!tenant?.stripeCustomerId) {
      return json({ ok: false, error: 'no_billing_account', message: 'No billing account on file yet — upgrade first.' }, 400)
    }
    try {
      const portal = await createPortalSession(env, { customerId: tenant.stripeCustomerId, returnUrl: `${appUrl}/employer/team` })
      return json({ ok: true, url: portal.url })
    } catch (error) {
      console.error(`[billing] portal session failed: ${error instanceof Error ? error.message : String(error)}`)
      return json({ ok: false, error: 'stripe_error', message: 'Could not open the billing portal. Please try again shortly.' }, 502)
    }
  }

  return json({ ok: false, error: 'action_required', message: 'Specify action: create_checkout or create_portal.' }, 400)
}
