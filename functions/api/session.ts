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

const sessionMaxAgeSeconds = 60 * 60 * 24 * 7

function isAllowedRole(value: string): value is SessionRequestBody['role'] {
  return ['candidate', 'recruiter', 'hiring_manager', 'platform_admin'].includes(value)
}

async function readBody(request: Request) {
  try {
    return (await request.json()) as SessionRequestBody
  } catch {
    return {}
  }
}

function hasBootstrapAccess(request: Request, env: RequestContext['env']) {
  const cloudflareAccessEmail = request.headers.get('cf-access-authenticated-user-email')
  if (cloudflareAccessEmail) {
    return true
  }

  const bootstrapToken = request.headers.get('x-jobsflow-bootstrap-token')
  if (env.AUTH_BOOTSTRAP_TOKEN && bootstrapToken === env.AUTH_BOOTSTRAP_TOKEN) {
    return true
  }

  return env.ALLOW_DEV_AUTH === 'true' || isLocalRequest(request)
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

  if (!hasBootstrapAccess(request, env)) {
    return json(
      {
        ok: false,
        error: 'auth_not_configured',
        message:
          'Enable Cloudflare Access, provide x-jobsflow-bootstrap-token, or set ALLOW_DEV_AUTH=true for local development.',
      },
      403,
    )
  }

  const body = await readBody(request)
  const accessEmail = request.headers.get('cf-access-authenticated-user-email')
  const email = normalizeEmail(accessEmail ?? safeString(body.email, 'founder@workflowfy.ai'))
  const displayName = safeString(body.displayName, email.split('@')[0] ?? 'JobsFlow User')
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
      accessMode: accessEmail ? 'cloudflare_access' : isLocalRequest(request) ? 'local_development' : 'bootstrap_token',
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
