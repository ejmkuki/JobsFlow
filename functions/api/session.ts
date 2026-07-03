import type { RequestContext } from '../_shared'
import {
  clearSessionCookieHeader,
  createSignedCookieValue,
  getSession,
  isLocalRequest,
  json,
  missingConfig,
  normalizeEmail,
  requireDb,
  requireSessionSecret,
  safeString,
  sessionCookieHeader,
  sha256Hex,
  writeAuditEvent,
} from '../_shared'

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

type JwtHeader = {
  alg?: string
  kid?: string
  typ?: string
}

type JwtPayload = {
  azp?: string
  email?: string
  exp?: number
  iss?: string
  nbf?: number
  sub?: string
}

type JwksPayload = {
  keys?: ClerkJwk[]
}

type ClerkJwk = JsonWebKey & {
  kid?: string
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
const tokenEncoder = new TextEncoder()

function isAllowedRole(value: string): value is NonNullable<SessionRequestBody['role']> {
  return ['candidate', 'recruiter', 'hiring_manager', 'platform_admin'].includes(value)
}

async function readBody(request: Request) {
  try {
    return (await request.json()) as SessionRequestBody
  } catch {
    return {}
  }
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function decodeJwtPart<T>(value: string) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T
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

  const parts = token.split('.')
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error('invalid_sso_token')
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts
  const header = decodeJwtPart<JwtHeader>(encodedHeader)
  const payload = decodeJwtPart<JwtPayload>(encodedPayload)

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('invalid_sso_token')
  }

  const jwksResponse = await fetch(env.CLERK_JWKS_URL, {
    headers: {
      accept: 'application/json',
    },
  })

  if (!jwksResponse.ok) {
    throw new Error('sso_provider_unavailable')
  }

  const jwks = (await jwksResponse.json()) as JwksPayload
  const jwk = jwks.keys?.find((key) => key.kid === header.kid)
  if (!jwk) {
    throw new Error('invalid_sso_token')
  }

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { hash: 'SHA-256', name: 'RSASSA-PKCS1-v1_5' },
    false,
    ['verify'],
  )
  const verified = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    decodeBase64Url(encodedSignature),
    tokenEncoder.encode(`${encodedHeader}.${encodedPayload}`),
  )

  if (!verified) {
    throw new Error('invalid_sso_token')
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

async function getSessionAccess(request: Request, env: RequestContext['env']): Promise<SessionAccess> {
  const bearerToken = readBearerToken(request)
  if (bearerToken) {
    if (!clerkConfigReady(env)) {
      return {
        allowed: false,
        error: 'sso_not_configured',
        message: 'SSO is not connected to JobsFlow yet. Private beta access is still active.',
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
            ? 'SSO provider is temporarily unavailable. Try again in a moment.'
            : 'SSO could not verify this sign-in. Please try again.',
      }
    }
  }

  const cloudflareAccessEmail = request.headers.get('cf-access-authenticated-user-email')
  if (cloudflareAccessEmail) {
    return { allowed: true as const, mode: 'cloudflare_access' }
  }

  const bootstrapToken = request.headers.get('x-jobsflow-bootstrap-token')
  if (env.AUTH_BOOTSTRAP_TOKEN && bootstrapToken === env.AUTH_BOOTSTRAP_TOKEN) {
    return { allowed: true as const, mode: 'bootstrap_token' }
  }

  if (env.ALLOW_DEV_AUTH === 'true' || isLocalRequest(request)) {
    return { allowed: true as const, mode: 'local_development' }
  }

  if (!env.AUTH_BOOTSTRAP_TOKEN) {
    return {
      allowed: false as const,
      error: 'private_beta_not_configured',
      message: 'Private beta access is not configured yet. Check the Cloudflare Pages bootstrap secret.',
    }
  }

  if (bootstrapToken) {
    return {
      allowed: false as const,
      error: 'invalid_private_beta_code',
      message: 'Private beta code is invalid or expired. Use the latest private beta code.',
    }
  }

  return {
    allowed: false as const,
    error: 'private_beta_code_required',
    message: 'Enter a private beta code to start a JobsFlow workspace.',
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

  const body = await readBody(request)
  const sessionAccess = await getSessionAccess(request, env)
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

  const accessEmail = request.headers.get('cf-access-authenticated-user-email')
  const email = sessionAccess.identity?.email ?? normalizeEmail(accessEmail ?? safeString(body.email, 'founder@workflowfy.ai'))
  const displayName = sessionAccess.identity?.displayName ?? safeString(body.displayName, email.split('@')[0] ?? 'JobsFlow User')
  const accountType = body.accountType === 'employer' ? 'employer' : 'candidate'
  const role = isAllowedRole(safeString(body.role, accountType)) ? safeString(body.role, accountType) : accountType
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
