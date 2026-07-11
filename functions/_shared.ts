type D1Result<T = unknown> = {
  results?: T[]
  success: boolean
}

type D1PreparedStatement = {
  bind: (...values: unknown[]) => D1PreparedStatement
  first: <T = Record<string, unknown>>() => Promise<T | null>
  run: () => Promise<D1Result>
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>
}

type D1Database = {
  prepare: (query: string) => D1PreparedStatement
}

type R2ObjectBody = {
  body: ReadableStream
  httpMetadata?: { contentType?: string }
}

type R2Bucket = {
  put: (
    key: string,
    value: ArrayBuffer | ReadableStream,
    options?: {
      httpMetadata?: { contentType?: string }
      customMetadata?: Record<string, string>
    },
  ) => Promise<unknown>
  get: (key: string) => Promise<R2ObjectBody | null>
  delete: (key: string) => Promise<void>
}

export type Env = {
  DB?: D1Database
  RESUME_BUCKET?: R2Bucket
  AUTH_SESSION_SECRET?: string
  AUTH_BOOTSTRAP_TOKEN?: string
  CF_ACCESS_TEAM_DOMAIN?: string
  CF_ACCESS_AUD?: string
  CLERK_AUTHORIZED_PARTIES?: string
  CLERK_ISSUER?: string
  CLERK_JWKS_URL?: string
  CLERK_SECRET_KEY?: string
  RESEND_API_KEY?: string
  ANTHROPIC_API_KEY?: string
  ANTHROPIC_MODEL?: string
  CRON_SECRET?: string
}

export type RequestContext = {
  request: Request
  env: Env
  waitUntil: (promise: Promise<unknown>) => void
}

export type SessionContext = {
  sessionId: string
  sessionHash: string
  tenantId: string
  tenantName: string
  tenantType: string
  planCode: string
  userId: string
  email: string
  displayName: string
  role: string
  expiresAt: string
}

type SessionRow = {
  sessionId: string
  sessionHash: string
  tenantId: string
  tenantName: string
  tenantType: string
  planCode: string
  userId: string
  email: string
  displayName: string
  role: string
  expiresAt: string
}

const sessionCookie = 'jobsflow_session'
const encoder = new TextEncoder()

export function json(data: unknown, init: ResponseInit | number = 200) {
  const responseInit = typeof init === 'number' ? { status: init } : init

  return new Response(JSON.stringify(data, null, 2), {
    ...responseInit,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...responseInit.headers,
    },
  })
}

export function missingConfig(...bindings: string[]) {
  void bindings

  return json(
    {
      ok: false,
      error: 'missing_configuration',
      message: 'This feature is still being prepared. Please try again shortly.',
    },
    503,
  )
}

export function isLocalRequest(request: Request) {
  const host = new URL(request.url).hostname
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}

// A request is only treated as trusted local development when it both targets a
// loopback host AND lacks the `cf` property that the Cloudflare edge always
// attaches in production. This cannot be forged by spoofing the Host header on
// a production request, because the edge-injected `request.cf` object is still
// present. It is the single source of truth for enabling any dev-only auth path.
export function isTrustedDevRequest(request: Request) {
  const edgeMetadata = (request as Request & { cf?: unknown }).cf
  return isLocalRequest(request) && edgeMetadata === undefined
}

export function requireDb(env: Env) {
  return env.DB
}

export function requireSessionSecret(env: Env, request: Request) {
  if (env.AUTH_SESSION_SECRET) {
    return env.AUTH_SESSION_SECRET
  }

  if (isTrustedDevRequest(request)) {
    return 'jobsflow-local-development-secret'
  }

  return null
}

// Constant-time comparison for equal-purpose hex strings (HMAC signatures,
// tokens). Avoids leaking match position through early-exit timing.
export function timingSafeEqualHex(a: string, b: string) {
  if (a.length !== b.length) {
    return false
  }

  let mismatch = 0
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }

  return mismatch === 0
}

export async function sha256Hex(value: string | ArrayBuffer) {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

export function safeString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

export function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 96)
}

async function sign(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value))
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function createSignedCookieValue(sessionId: string, secret: string) {
  return `${sessionId}.${await sign(secret, sessionId)}`
}

export async function verifySignedCookieValue(value: string, secret: string) {
  const [sessionId, signature] = value.split('.')
  if (!sessionId || !signature) {
    return null
  }

  const expected = await sign(secret, sessionId)
  if (!timingSafeEqualHex(expected, signature)) {
    return null
  }

  return sessionId
}

export function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get('cookie') ?? ''
  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))

  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null
}

export function sessionCookieHeader(request: Request, value: string, maxAgeSeconds: number) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `${sessionCookie}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure}`
}

export function clearSessionCookieHeader(request: Request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `${sessionCookie}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`
}

export async function getSession(request: Request, env: Env): Promise<SessionContext | null> {
  const db = requireDb(env)
  const secret = requireSessionSecret(env, request)
  if (!db || !secret) {
    return null
  }

  const cookieValue = readCookie(request, sessionCookie)
  if (!cookieValue) {
    return null
  }

  const sessionId = await verifySignedCookieValue(cookieValue, secret)
  if (!sessionId) {
    return null
  }

  const sessionHash = await sha256Hex(sessionId)
  const row = await db
    .prepare(
      `
      SELECT
        sessions.id AS sessionId,
        sessions.session_hash AS sessionHash,
        sessions.expires_at AS expiresAt,
        tenants.id AS tenantId,
        tenants.name AS tenantName,
        tenants.type AS tenantType,
        tenants.plan_code AS planCode,
        users.id AS userId,
        users.email AS email,
        users.display_name AS displayName,
        users.role AS role
      FROM sessions
      INNER JOIN tenants ON tenants.id = sessions.tenant_id
      INNER JOIN users ON users.id = sessions.user_id
      WHERE sessions.session_hash = ?
        AND sessions.revoked_at IS NULL
        AND sessions.expires_at > datetime('now')
      LIMIT 1
      `,
    )
    .bind(sessionHash)
    .first<SessionRow>()

  return row
}

export function clientIdentifier(request: Request) {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  )
}

export type RateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  retryAfterSeconds: number
}

// D1-backed fixed-window rate limiter. Returns allowed=false once `limit`
// requests have been recorded for `key` within the current window. Fails open
// only when no database is bound (local scaffolding), never on a real request
// path in production where DB is always present.
export async function enforceRateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const db = requireDb(env)
  if (!db) {
    return { allowed: true, limit, remaining: limit, retryAfterSeconds: 0 }
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  const windowStart = nowSeconds - (nowSeconds % windowSeconds)
  const bucketKey = `${key}:${windowSeconds}`

  await db
    .prepare(
      `
      INSERT INTO rate_limit_hits (bucket_key, window_start, count)
      VALUES (?, ?, 1)
      ON CONFLICT(bucket_key, window_start)
      DO UPDATE SET count = count + 1
      `,
    )
    .bind(bucketKey, windowStart)
    .run()

  const row = await db
    .prepare('SELECT count FROM rate_limit_hits WHERE bucket_key = ? AND window_start = ?')
    .bind(bucketKey, windowStart)
    .first<{ count: number }>()

  // Opportunistic prune of expired windows to keep the table bounded.
  if (Math.random() < 0.02) {
    await db
      .prepare('DELETE FROM rate_limit_hits WHERE window_start < ?')
      .bind(windowStart - windowSeconds)
      .run()
  }

  const count = row?.count ?? 0
  const remaining = Math.max(0, limit - count)
  return {
    allowed: count <= limit,
    limit,
    remaining,
    retryAfterSeconds: windowStart + windowSeconds - nowSeconds,
  }
}

export function tooManyRequests(result: RateLimitResult) {
  return json(
    {
      ok: false,
      error: 'rate_limited',
      message: 'Too many requests. Please wait a moment and try again.',
    },
    {
      status: 429,
      headers: {
        'retry-after': String(Math.max(1, result.retryAfterSeconds)),
      },
    },
  )
}

export async function writeAuditEvent(
  env: Env,
  input: {
    tenantId: string
    userId?: string
    eventType: string
    actorType: string
    action: string
    riskLevel: 'low' | 'medium' | 'high'
    metadata?: Record<string, unknown>
  },
) {
  const db = requireDb(env)
  if (!db) {
    return
  }

  await db
    .prepare(
      `
      INSERT INTO audit_events (
        id, tenant_id, user_id, event_type, actor_type, action, risk_level, metadata
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      crypto.randomUUID(),
      input.tenantId,
      input.userId ?? null,
      input.eventType,
      input.actorType,
      input.action,
      input.riskLevel,
      JSON.stringify(input.metadata ?? {}),
    )
    .run()
}
