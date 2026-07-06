// Shared JWT verification for RS256 tokens (Clerk SSO and Cloudflare Access).
// JWKS responses are cached in-process with a TTL so we do not fetch the key
// set on every verification. Claim validation (iss/aud/exp) is the caller's
// responsibility so each provider can enforce its own policy.

type Jwk = JsonWebKey & { kid?: string }
type JwksPayload = { keys?: Jwk[] }

type JwksCacheEntry = {
  fetchedAt: number
  keys: Jwk[]
}

export type JwtHeader = {
  alg?: string
  kid?: string
  typ?: string
}

export type VerifiedJwt<T> = {
  header: JwtHeader
  payload: T
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const jwksCache = new Map<string, JwksCacheEntry>()
const jwksTtlMs = 10 * 60 * 1000

export function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

export function decodeJwtSegment<T>(value: string): T {
  return JSON.parse(decoder.decode(decodeBase64Url(value))) as T
}

async function fetchJwks(url: string): Promise<Jwk[]> {
  const now = Date.now()
  const cached = jwksCache.get(url)
  if (cached && now - cached.fetchedAt < jwksTtlMs) {
    return cached.keys
  }

  let response: Response
  try {
    response = await fetch(url, { headers: { accept: 'application/json' } })
  } catch {
    if (cached) {
      return cached.keys
    }
    throw new Error('jwks_unavailable')
  }

  if (!response.ok) {
    if (cached) {
      return cached.keys
    }
    throw new Error('jwks_unavailable')
  }

  const body = (await response.json()) as JwksPayload
  const keys = body.keys ?? []
  jwksCache.set(url, { fetchedAt: now, keys })
  return keys
}

// Verifies an RS256 JWT signature against the given JWKS endpoint and returns
// the decoded header + payload. Throws on any structural or signature failure.
// Does NOT validate iss/aud/exp — the caller must check those claims.
export async function verifyRs256Jwt<T>(token: string, jwksUrl: string): Promise<VerifiedJwt<T>> {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error('invalid_token')
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts
  const header = decodeJwtSegment<JwtHeader>(encodedHeader)

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('invalid_token')
  }

  const keys = await fetchJwks(jwksUrl)
  const jwk = keys.find((key) => key.kid === header.kid)
  if (!jwk) {
    throw new Error('invalid_token')
  }

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { hash: 'SHA-256', name: 'RSASSA-PKCS1-v1_5' },
    false,
    ['verify'],
  )

  const signatureBytes = decodeBase64Url(encodedSignature)
  const verified = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    signatureBytes.buffer as ArrayBuffer,
    encoder.encode(`${encodedHeader}.${encodedPayload}`),
  )

  if (!verified) {
    throw new Error('invalid_token')
  }

  return {
    header,
    payload: decodeJwtSegment<T>(encodedPayload),
  }
}

// Test-only hook so the JWKS cache does not leak between test cases.
export function __clearJwksCache() {
  jwksCache.clear()
}
