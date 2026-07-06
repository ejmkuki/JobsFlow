// Test helpers for minting real RS256 JWTs and a JWKS endpoint mock, so the
// security suite exercises the production verification path end to end.

function base64url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlJson(value: unknown) {
  return base64url(new TextEncoder().encode(JSON.stringify(value)))
}

export type TestKeyPair = {
  kid: string
  jwk: JsonWebKey & { kid: string }
  sign: (payload: Record<string, unknown>) => Promise<string>
}

export async function createTestKeyPair(kid = 'test-key-1'): Promise<TestKeyPair> {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )

  const exported = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey
  const jwk = { ...exported, kid, alg: 'RS256', use: 'sig' }

  async function sign(payload: Record<string, unknown>) {
    const header = base64urlJson({ alg: 'RS256', kid, typ: 'JWT' })
    const body = base64urlJson(payload)
    const data = new TextEncoder().encode(`${header}.${body}`)
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, data)
    return `${header}.${body}.${base64url(new Uint8Array(signature))}`
  }

  return { kid, jwk, sign }
}

// Returns a fetch mock that serves the supplied JWKS for any certs/jwks URL.
export function jwksFetchMock(jwk: JsonWebKey) {
  return async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('certs') || url.includes('jwks') || url.includes('.well-known')) {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('not found', { status: 404 })
  }
}

// Minimal in-memory D1 stand-in supporting only the rate-limit queries.
export function createRateLimitD1() {
  const rows = new Map<string, { bucket_key: string; window_start: number; count: number }>()

  return {
    prepare(query: string) {
      let args: unknown[] = []
      const statement = {
        bind(...values: unknown[]) {
          args = values
          return statement
        },
        async run() {
          if (query.includes('INSERT INTO rate_limit_hits')) {
            const [key, windowStart] = args as [string, number]
            const id = `${key}|${windowStart}`
            const existing = rows.get(id)
            if (existing) {
              existing.count += 1
            } else {
              rows.set(id, { bucket_key: key, window_start: windowStart, count: 1 })
            }
          } else if (query.includes('DELETE FROM rate_limit_hits')) {
            const [before] = args as [number]
            for (const [id, row] of rows) {
              if (row.window_start < before) {
                rows.delete(id)
              }
            }
          }
          return { success: true }
        },
        async first<T>() {
          if (query.includes('SELECT count FROM rate_limit_hits')) {
            const [key, windowStart] = args as [string, number]
            return (rows.get(`${key}|${windowStart}`) as T) ?? null
          }
          return null
        },
        async all() {
          return { results: [], success: true }
        },
      }
      return statement
    },
  }
}

export function request(url: string, options: { headers?: Record<string, string>; cf?: unknown } = {}) {
  const req = new Request(url, { method: 'POST', headers: options.headers })
  if (options.cf !== undefined) {
    Object.defineProperty(req, 'cf', { value: options.cf, configurable: true })
  }
  return req
}
