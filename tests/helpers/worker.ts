import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Env } from '../../functions/_shared'

// Minimal D1 adapter backed by node:sqlite so tests exercise the real SQL in
// the Pages Function handlers (tenant-scoped WHERE clauses included).
function makeStatement(db: DatabaseSync, sql: string, params: unknown[]) {
  const bound = params as never[]
  return {
    bind(...values: unknown[]) {
      return makeStatement(db, sql, values)
    },
    async first<T = Record<string, unknown>>() {
      const row = db.prepare(sql).get(...bound) as T | undefined
      return row ?? null
    },
    async run() {
      db.prepare(sql).run(...bound)
      return { success: true }
    },
    async all<T = Record<string, unknown>>() {
      const results = db.prepare(sql).all(...bound) as T[]
      return { results, success: true }
    },
  }
}

function makeD1(db: DatabaseSync) {
  return {
    prepare(sql: string) {
      return makeStatement(db, sql, [])
    },
  }
}

// In-memory R2 stand-in exposing only the put() surface the handlers use.
function makeR2() {
  const objects = new Map<string, { value: ArrayBuffer; metadata?: Record<string, string> }>()
  return {
    bucket: {
      async put(key: string, value: ArrayBuffer, options?: { customMetadata?: Record<string, string> }) {
        objects.set(key, { value, metadata: options?.customMetadata })
        return {}
      },
    },
    objects,
  }
}

function applyMigrations(db: DatabaseSync) {
  const dir = join(process.cwd(), 'migrations')
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) {
    db.exec(readFileSync(join(dir, file), 'utf8'))
  }
}

export type TestWorld = {
  env: Env
  r2Objects: Map<string, { value: ArrayBuffer; metadata?: Record<string, string> }>
  db: DatabaseSync
}

export function createTestWorld(overrides: Partial<Env> = {}): TestWorld {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  applyMigrations(db)
  const r2 = makeR2()
  const env = {
    DB: makeD1(db) as unknown as Env['DB'],
    RESUME_BUCKET: r2.bucket as unknown as Env['RESUME_BUCKET'],
    AUTH_SESSION_SECRET: 'integration-test-secret',
    ...overrides,
  } as Env
  return { env, r2Objects: r2.objects, db }
}

// Invokes a Pages Function handler with a constructed request context.
export async function callHandler(
  handler: (ctx: { request: Request; env: Env; waitUntil: (p: Promise<unknown>) => void }) => Promise<Response>,
  options: { env: Env; method?: string; url?: string; headers?: Record<string, string>; body?: BodyInit | null; cf?: unknown },
) {
  const request = new Request(options.url ?? 'https://jobsflowai.ai/api/test', {
    method: options.method ?? 'GET',
    headers: options.headers,
    body: options.body ?? null,
  })
  if (options.cf !== undefined) {
    Object.defineProperty(request, 'cf', { value: options.cf, configurable: true })
  }
  return handler({ request, env: options.env, waitUntil: () => undefined })
}

// Extracts the session cookie value from a Set-Cookie header.
export function extractSessionCookie(response: Response) {
  const setCookie = response.headers.get('set-cookie') ?? ''
  const match = setCookie.match(/jobsflow_session=([^;]+)/)
  return match ? `jobsflow_session=${match[1]}` : null
}
