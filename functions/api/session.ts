import type { RequestContext } from '../_shared'
import {
  clearSessionCookieHeader,
  clientIdentifier,
  createSignedCookieValue,
  enforceRateLimit,
  getSession,
  isTrustedDevRequest,
  json,
  missingConfig,
  normalizeEmail,
  requireDb,
  requireSessionSecret,
  safeString,
  sessionCookieHeader,
  sha256Hex,
  tooManyRequests,
  writeAuditEvent,
} from '../_shared'
import { verifyRs256Jwt } from '../_jwt'

type SessionRequestBody = {
  accountType?: 'candidate' | 'employer'
  displayName?: string
  email?: string
  role?: 'candidate' | 'recruiter' | 'hiring_manager' | 'platform_admin'
  tenantName?: string
}

type SessionAccess =
  | {
      allowed: true
      externalUserId?: string
      identity?: {
        displayName: string
        email: string
      }
      mode: 'bootstrap_token' | 'clerk_sso' | 'cloudflare_access' | 'local_development'
    }
  | {
      allowed: false
      error: string
      message: string
    }

type JwtPayload = {
  azp?: string
  email?: string
  exp?: number
  iss?: string
  nbf?: number
  sub?: string
}

type AccessPayload = {
  aud?: string | string[]
  email?: string
  exp?: number
  iss?: string
  sub?: string
}

type ClerkEmailAddress = {
  email_address?: string
  id?: string
}

type ClerkUser = {
  email_addresses?: ClerkEmailAddress[]
  first_name?: string | null
  last_name?: string | null
  primary_email_address_id?: string | null
  username?: string | null
}

const sessionMaxAgeSeconds = 60 * 60 * 24 * 7
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isAllowedRole(value: string): value is NonNullable<SessionRequestBody['role']> {
  return ['candidate', 'recruiter', 'hiring_manager', 'platform_admin'].includes(value)
}

function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && emailPattern.test(value.trim())
}

async function readBody(request: Request) {
  try {
    return (await request.json()) as SessionRequestBody
  } catch {
    return {}
  }
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') ?? ''
  const [scheme, token] = authorization.split(' ')

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null
  }

  return token
}

function clerkConfigReady(env: RequestContext['env']) {
  return Boolean(env.CLERK_JWKS_URL && env.CLERK_ISSUER && env.CLERK_SECRET_KEY)
}

async function verifyClerkToken(token: string, env: RequestContext['env']) {
  if (!env.CLERK_JWKS_URL || !env.CLERK_ISSUER || !env.CLERK_SECRET_KEY) {
    throw new Error('sso_not_configured')
  }

  let payload: JwtPayload
  try {
    ;({ payload } = await verifyRs256Jwt<JwtPayload>(token, env.CLERK_JWKS_URL))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_sso_token'
    throw new Error(message === 'jwks_unavailable' ? 'sso_provider_unavailable' : 'invalid_sso_token')
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  if (!payload.sub || payload.iss !== env.CLERK_ISSUER) {
    throw new Error('invalid_sso_token')
  }

  if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) {
    throw new Error('expired_sso_token')
  }

  if (typeof payload.nbf === 'number' && payload.nbf > nowSeconds + 60) {
    throw new Error('invalid_sso_token')
  }

  const authorizedParties = (env.CLERK_AUTHORIZED_PARTIES ?? '')
    .split(',')
    .map((party) => party.trim())
    .filter(Boolean)

  if (authorizedParties.length && (!payload.azp || !authorizedParties.includes(payload.azp))) {
    throw new Error('invalid_sso_origin')
  }

  return payload.sub
}

function accessConfigReady(env: RequestContext['env']) {
  return Boolean(env.CF_ACCESS_TEAM_DOMAIN && env.CF_ACCESS_AUD)
}

function normalizeTeamDomain(rawDomain: string) {
  const trimmed = rawDomain.trim().replace(/\/+$/, '')
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return withScheme.replace(/\/$/, '')
}

// Verifies a Cloudflare Access application token (Cf-Access-Jwt-Assertion).
// The signed JWT — not the raw authenticated-email header — is the trust
// anchor: an attacker cannot forge it without the Access team's private key.
export async function verifyAccessToken(token: string, env: RequestContext['env']) {
  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) {
    throw new Error('access_not_configured')
  }

  const issuer = normalizeTeamDomain(env.CF_ACCESS_TEAM_DOMAIN)
  const jwksUrl = `${issuer}/cdn-cgi/access/certs`

  let payload: AccessPayload
  try {
    ;({ payload } = await verifyRs256Jwt<AccessPayload>(token, jwksUrl))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_access_token'
    throw new Error(message === 'jwks_unavailable' ? 'access_provider_unavailable' : 'invalid_access_token')
  }

  if (payload.iss !== issuer) {
    throw new Error('invalid_access_token')
  }

  const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : []
  if (!audiences.includes(env.CF_ACCESS_AUD)) {
    throw new Error('invalid_access_audience')
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) {
    throw new Error('expired_access_token')
  }

  if (!isValidEmail(payload.email)) {
    throw new Error('access_email_missing')
  }

  return normalizeEmail(payload.email)
}

async function getClerkIdentity(subject: string, env: RequestContext['env']) {
  if (!env.CLERK_SECRET_KEY) {
    throw new Error('sso_not_configured')
  }

  const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(subject)}`, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
    },
  })

  if (!response.ok) {
    throw new Error('sso_provider_unavailable')
  }

  const user = (await response.json()) as ClerkUser
  const primaryEmail =
    user.email_addresses?.find((email) => email.id === user.primary_email_address_id)?.email_address ??
    user.email_addresses?.[0]?.email_address
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.username

  if (!primaryEmail) {
    throw new Error('sso_email_missing')
  }

  return {
    displayName: safeString(displayName, primaryEmail.split('@')[0] ?? 'JobsFlow User'),
    email: normalizeEmail(primaryEmail),
  }
}

export async function getSessionAccess(
  request: Request,
  env: RequestContext['env'],
  body: SessionRequestBody,
): Promise<SessionAccess> {
  const bearerToken = readBearerToken(request)
  if (bearerToken) {
    if (!clerkConfigReady(env)) {
      return {
        allowed: false,
        error: 'sso_not_configured',
        message: 'Sign-in is still being prepared. Please try again shortly.',
      }
    }

    try {
      const subject = await verifyClerkToken(bearerToken, env)
      const identity = await getClerkIdentity(subject, env)
      return {
        allowed: true,
        externalUserId: subject,
        identity,
        mode: 'clerk_sso',
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid_sso_token'

      return {
        allowed: false,
        error: message,
        message:
          message === 'sso_provider_unavailable'
            ? 'We could not confirm your sign-in right now. Please try again.'
            : 'We could not confirm your sign-in. Please try again.',
      }
    }
  }

  // Cloudflare Access: trust only the signed application token, never the
  // plaintext cf-access-authenticated-user-email header (which is trivially
  // spoofable if the app is ever reachable outside the Access tunnel).
  const accessAssertion = request.headers.get('cf-access-jwt-assertion')
  if (accessAssertion) {
    if (!accessConfigReady(env)) {
      return {
        allowed: false,
        error: 'access_not_configured',
        message: 'Workspace access is still being prepared. Please try again shortly.',
      }
    }

    try {
      const email = await verifyAccessToken(accessAssertion, env)
      return {
        allowed: true,
        externalUserId: email,
        identity: { displayName: email.split('@')[0] ?? 'JobsFlow User', email },
        mode: 'cloudflare_access',
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid_access_token'
      return {
        allowed: false,
        error: message,
        message: 'We could not confirm your workspace access. Please try again.',
      }
    }
  }

  // Bootstrap token: a privileged operator path. It must still name a real
  // account email so two operators never collapse into one shared tenant.
  const bootstrapToken = request.headers.get('x-jobsflow-bootstrap-token')
  if (env.AUTH_BOOTSTRAP_TOKEN && bootstrapToken === env.AUTH_BOOTSTRAP_TOKEN) {
    if (!isValidEmail(body.email)) {
      return {
        allowed: false,
        error: 'bootstrap_email_required',
        message: 'Provide the account email to start a workspace with this invite code.',
      }
    }

    const email = normalizeEmail(body.email)
    return {
      allowed: true,
      externalUserId: `bootstrap:${email}`,
      identity: { displayName: safeString(body.displayName, email.split('@')[0] ?? 'JobsFlow User'), email },
      mode: 'bootstrap_token',
    }
  }

  // Local development only. Gated on isTrustedDevRequest, which requires the
  // absence of the edge-injected request.cf object — a production request with
  // a spoofed Host header cannot satisfy it.
  if (isTrustedDevRequest(request)) {
    const email = isValidEmail(body.email) ? normalizeEmail(body.email) : 'dev@localhost'
    return {
      allowed: true,
      externalUserId: `dev:${email}`,
      identity: { displayName: safeString(body.displayName, email.split('@')[0] ?? 'JobsFlow Dev'), email },
      mode: 'local_development',
    }
  }

  if (!env.AUTH_BOOTSTRAP_TOKEN) {
    return {
      allowed: false as const,
      error: 'private_beta_not_configured',
      message: 'Workspace access is still being prepared. Please try again shortly.',
    }
  }

  if (bootstrapToken) {
    return {
      allowed: false as const,
      error: 'invalid_private_beta_code',
      message: 'That invite code is invalid or expired. Use the latest invite code.',
    }
  }

  return {
    allowed: false as const,
    error: 'private_beta_code_required',
    message: 'Enter your invite code to start a JobsFlow workspace.',
  }
}

export async function onRequestGet({ request, env }: RequestContext) {
  const session = await getSession(request, env)

  if (!session) {
    return json(
      {
        authenticated: false,
        message: 'No active JobsFlow session.',
      },
      401,
    )
  }

  return json({
    authenticated: true,
    session,
  })
}

export async function onRequestPost({ request, env }: RequestContext) {
  const db = requireDb(env)
  if (!db) {
    return missingConfig('DB')
  }

  const secret = requireSessionSecret(env, request)
  if (!secret) {
    return missingConfig('AUTH_SESSION_SECRET')
  }

  // Unauthenticated, row-creating endpoint: cap attempts per client IP to blunt
  // credential stuffing and tenant-table flooding.
  const rate = await enforceRateLimit(env, `session:${clientIdentifier(request)}`, 10, 60)
  if (!rate.allowed) {
    return tooManyRequests(rate)
  }

  const body = await readBody(request)
  const sessionAccess = await getSessionAccess(request, env, body)
  if (!sessionAccess.allowed) {
    return json(
      {
        ok: false,
        error: sessionAccess.error,
        message: sessionAccess.message,
      },
      403,
    )
  }

  // Every allowed access mode now resolves a verified or explicitly supplied
  // email. There is no shared default identity for anonymous callers.
  if (!sessionAccess.identity || !isValidEmail(sessionAccess.identity.email)) {
    return json(
      {
        ok: false,
        error: 'identity_unresolved',
        message: 'We could not confirm your account identity. Please try again.',
      },
      403,
    )
  }

  const email = normalizeEmail(sessionAccess.identity.email)
  const displayName = safeString(sessionAccess.identity.displayName, email.split('@')[0] ?? 'JobsFlow User')
  const accountType = body.accountType === 'employer' ? 'employer' : 'candidate'
  const requestedRole = safeString(body.role, '')
  const defaultRole = accountType === 'employer' ? 'recruiter' : 'candidate'
  const role = isAllowedRole(requestedRole) ? requestedRole : defaultRole
  const tenantName = safeString(
    body.tenantName,
    accountType === 'employer' ? `${displayName} Hiring Team` : `${displayName} Career Workspace`,
  )

  const existingUser = await db
    .prepare(
      `
      SELECT
        users.id AS userId,
        tenants.id AS tenantId
      FROM users
      INNER JOIN tenants ON tenants.id = users.tenant_id
      WHERE users.email = ?
      LIMIT 1
      `,
    )
    .bind(email)
    .first<{ tenantId: string; userId: string }>()

  const tenantId = existingUser?.tenantId ?? crypto.randomUUID()
  const userId = existingUser?.userId ?? crypto.randomUUID()

  if (!existingUser) {
    await db
      .prepare('INSERT INTO tenants (id, type, name, plan_code) VALUES (?, ?, ?, ?)')
      .bind(tenantId, accountType, tenantName, accountType === 'employer' ? 'hiring_team' : 'candidate_starter')
      .run()

    await db
      .prepare(
        `
        INSERT INTO users (id, tenant_id, email, display_name, role)
        VALUES (?, ?, ?, ?, ?)
        `,
      )
      .bind(userId, tenantId, email, displayName, role)
      .run()

    if (accountType === 'candidate') {
      await db
        .prepare(
          `
          INSERT INTO candidate_profiles (id, tenant_id, user_id, target_roles, profile_health)
          VALUES (?, ?, ?, ?, ?)
          `,
        )
        .bind(crypto.randomUUID(), tenantId, userId, JSON.stringify(['Product operations', 'Customer success']), 42)
        .run()
    }
  } else {
    await db
      .prepare('UPDATE users SET display_name = ?, last_seen_at = datetime(\'now\') WHERE id = ?')
      .bind(displayName, userId)
      .run()
  }

  const sessionId = crypto.randomUUID()
  const sessionHash = await sha256Hex(sessionId)
  const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds * 1000).toISOString()

  await db
    .prepare(
      `
      INSERT INTO sessions (id, tenant_id, user_id, session_hash, expires_at)
      VALUES (?, ?, ?, ?, ?)
      `,
    )
    .bind(crypto.randomUUID(), tenantId, userId, sessionHash, expiresAt)
    .run()

  await writeAuditEvent(env, {
    tenantId,
    userId,
    eventType: existingUser ? 'session.created' : 'tenant.created',
    actorType: 'user',
    action: existingUser ? 'Signed in to JobsFlow workspace' : 'Created JobsFlow tenant and first user',
    riskLevel: 'low',
    metadata: {
      accountType,
      role,
      accessMode: sessionAccess.mode,
      externalUserId: sessionAccess.externalUserId,
    },
  })

  const signedCookie = await createSignedCookieValue(sessionId, secret)

  return json(
    {
      ok: true,
      session: {
        tenantId,
        userId,
        email,
        displayName,
        role,
        expiresAt,
      },
    },
    {
      status: 201,
      headers: {
        'set-cookie': sessionCookieHeader(request, signedCookie, sessionMaxAgeSeconds),
      },
    },
  )
}

export async function onRequestDelete({ request, env }: RequestContext) {
  const db = requireDb(env)
  const session = await getSession(request, env)

  if (db && session) {
    await db
      .prepare('UPDATE sessions SET revoked_at = datetime(\'now\') WHERE session_hash = ?')
      .bind(session.sessionHash)
      .run()

    await writeAuditEvent(env, {
      tenantId: session.tenantId,
      userId: session.userId,
      eventType: 'session.revoked',
      actorType: 'user',
      action: 'Signed out of JobsFlow workspace',
      riskLevel: 'low',
    })
  }

  return json(
    { ok: true },
    {
      headers: {
        'set-cookie': clearSessionCookieHeader(request),
      },
    },
  )
}
