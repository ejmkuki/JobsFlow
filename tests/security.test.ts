import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../functions/_shared'
import {
  createSignedCookieValue,
  enforceRateLimit,
  isTrustedDevRequest,
  timingSafeEqualHex,
  verifySignedCookieValue,
} from '../functions/_shared'
import { __clearJwksCache, verifyRs256Jwt } from '../functions/_jwt'
import { getSessionAccess, verifyAccessToken } from '../functions/api/session'
import { createRateLimitD1, createTestKeyPair, jwksFetchMock, request } from './helpers/jwt'

const nowSeconds = () => Math.floor(Date.now() / 1000)

afterEach(() => {
  __clearJwksCache()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('timingSafeEqualHex', () => {
  it('matches identical strings and rejects differences and length mismatches', () => {
    expect(timingSafeEqualHex('abc123', 'abc123')).toBe(true)
    expect(timingSafeEqualHex('abc123', 'abc124')).toBe(false)
    expect(timingSafeEqualHex('abc', 'abc123')).toBe(false)
  })
})

describe('session cookie signing', () => {
  const secret = 'unit-test-secret'

  it('round-trips a valid signed cookie', async () => {
    const cookie = await createSignedCookieValue('session-123', secret)
    expect(await verifySignedCookieValue(cookie, secret)).toBe('session-123')
  })

  it('rejects a tampered signature', async () => {
    const cookie = await createSignedCookieValue('session-123', secret)
    const [id] = cookie.split('.')
    expect(await verifySignedCookieValue(`${id}.deadbeef`, secret)).toBeNull()
  })

  it('rejects a swapped session id', async () => {
    const cookie = await createSignedCookieValue('session-123', secret)
    const [, sig] = cookie.split('.')
    expect(await verifySignedCookieValue(`attacker-session.${sig}`, secret)).toBeNull()
  })
})

describe('verifyRs256Jwt', () => {
  it('accepts a correctly signed token and rejects tampering', async () => {
    const keyPair = await createTestKeyPair()
    vi.stubGlobal('fetch', vi.fn(jwksFetchMock(keyPair.jwk)))
    const token = await keyPair.sign({ sub: 'user-1', exp: nowSeconds() + 600 })

    const { payload } = await verifyRs256Jwt<{ sub: string }>(token, 'https://issuer/.well-known/jwks.json')
    expect(payload.sub).toBe('user-1')

    const [h, p, s] = token.split('.')
    const tampered = `${h}.${p}.${s.slice(0, -4)}AAAA`
    await expect(verifyRs256Jwt(tampered, 'https://issuer/.well-known/jwks.json')).rejects.toThrow('invalid_token')
  })

  it('rejects a token whose kid is not in the JWKS', async () => {
    const signer = await createTestKeyPair('signer')
    const other = await createTestKeyPair('published')
    vi.stubGlobal('fetch', vi.fn(jwksFetchMock(other.jwk)))
    const token = await signer.sign({ sub: 'user-1', exp: nowSeconds() + 600 })
    await expect(verifyRs256Jwt(token, 'https://issuer/jwks')).rejects.toThrow('invalid_token')
  })
})

describe('verifyAccessToken (Cloudflare Access JWT)', () => {
  const env: Env = {
    CF_ACCESS_TEAM_DOMAIN: 'https://team.cloudflareaccess.com',
    CF_ACCESS_AUD: 'aud-tag-123',
  }

  it('accepts a valid Access token and returns the verified email', async () => {
    const keyPair = await createTestKeyPair()
    vi.stubGlobal('fetch', vi.fn(jwksFetchMock(keyPair.jwk)))
    const token = await keyPair.sign({
      iss: 'https://team.cloudflareaccess.com',
      aud: ['aud-tag-123'],
      email: 'User@Example.com',
      exp: nowSeconds() + 600,
    })
    expect(await verifyAccessToken(token, env)).toBe('user@example.com')
  })

  it('rejects wrong issuer, wrong audience, expiry, and missing email', async () => {
    const keyPair = await createTestKeyPair()
    vi.stubGlobal('fetch', vi.fn(jwksFetchMock(keyPair.jwk)))

    const wrongIss = await keyPair.sign({ iss: 'https://evil', aud: ['aud-tag-123'], email: 'a@b.com', exp: nowSeconds() + 600 })
    await expect(verifyAccessToken(wrongIss, env)).rejects.toThrow('invalid_access_token')

    const wrongAud = await keyPair.sign({ iss: 'https://team.cloudflareaccess.com', aud: ['other'], email: 'a@b.com', exp: nowSeconds() + 600 })
    await expect(verifyAccessToken(wrongAud, env)).rejects.toThrow('invalid_access_audience')

    const expired = await keyPair.sign({ iss: 'https://team.cloudflareaccess.com', aud: ['aud-tag-123'], email: 'a@b.com', exp: nowSeconds() - 10 })
    await expect(verifyAccessToken(expired, env)).rejects.toThrow('expired_access_token')

    const noEmail = await keyPair.sign({ iss: 'https://team.cloudflareaccess.com', aud: ['aud-tag-123'], exp: nowSeconds() + 600 })
    await expect(verifyAccessToken(noEmail, env)).rejects.toThrow('access_email_missing')
  })
})

describe('getSessionAccess authorization decisions', () => {
  const prodUrl = 'https://jobsflowai.ai/api/session'

  it('IGNORES the raw cf-access-authenticated-user-email header (forged-header attack)', async () => {
    const env: Env = { DB: createRateLimitD1() as unknown as Env['DB'] }
    const forged = request(prodUrl, {
      headers: { 'cf-access-authenticated-user-email': 'victim@example.com' },
      cf: {},
    })
    const result = await getSessionAccess(forged, env, {})
    expect(result.allowed).toBe(false)
  })

  it('rejects a garbage Cf-Access-Jwt-Assertion token', async () => {
    const env: Env = { CF_ACCESS_TEAM_DOMAIN: 'https://team.cloudflareaccess.com', CF_ACCESS_AUD: 'aud-tag-123' }
    const req = request(prodUrl, { headers: { 'cf-access-jwt-assertion': 'not.a.jwt' }, cf: {} })
    const result = await getSessionAccess(req, env, {})
    expect(result.allowed).toBe(false)
  })

  it('accepts a valid Access JWT and resolves the verified identity', async () => {
    const keyPair = await createTestKeyPair()
    vi.stubGlobal('fetch', vi.fn(jwksFetchMock(keyPair.jwk)))
    const env: Env = { CF_ACCESS_TEAM_DOMAIN: 'https://team.cloudflareaccess.com', CF_ACCESS_AUD: 'aud-tag-123' }
    const token = await keyPair.sign({
      iss: 'https://team.cloudflareaccess.com',
      aud: ['aud-tag-123'],
      email: 'real@example.com',
      exp: nowSeconds() + 600,
    })
    const req = request(prodUrl, { headers: { 'cf-access-jwt-assertion': token }, cf: {} })
    const result = await getSessionAccess(req, env, {})
    expect(result.allowed).toBe(true)
    if (result.allowed) {
      expect(result.mode).toBe('cloudflare_access')
      expect(result.identity?.email).toBe('real@example.com')
    }
  })

  it('rejects a bootstrap token with no account email', async () => {
    const env: Env = { AUTH_BOOTSTRAP_TOKEN: 'secret-token', DB: createRateLimitD1() as unknown as Env['DB'] }
    const req = request(prodUrl, { headers: { 'x-jobsflow-bootstrap-token': 'secret-token' }, cf: {} })
    const result = await getSessionAccess(req, env, {})
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.error).toBe('bootstrap_email_required')
    }
  })

  it('accepts a bootstrap token with a valid email', async () => {
    const env: Env = { AUTH_BOOTSTRAP_TOKEN: 'secret-token' }
    const req = request(prodUrl, { headers: { 'x-jobsflow-bootstrap-token': 'secret-token' }, cf: {} })
    const result = await getSessionAccess(req, env, { email: 'founder@company.com' })
    expect(result.allowed).toBe(true)
    if (result.allowed) {
      expect(result.identity?.email).toBe('founder@company.com')
    }
  })

  it('denies a production request with no credentials', async () => {
    const env: Env = { AUTH_BOOTSTRAP_TOKEN: 'secret-token' }
    const req = request(prodUrl, { cf: {} })
    const result = await getSessionAccess(req, env, {})
    expect(result.allowed).toBe(false)
  })
})

describe('isTrustedDevRequest', () => {
  it('is true only for loopback requests without the edge cf object', () => {
    expect(isTrustedDevRequest(request('http://localhost:8788/api/session'))).toBe(true)
    expect(isTrustedDevRequest(request('http://localhost:8788/api/session', { cf: {} }))).toBe(false)
    expect(isTrustedDevRequest(request('https://jobsflowai.ai/api/session'))).toBe(false)
  })
})

describe('enforceRateLimit', () => {
  it('blocks once the limit is exceeded within the window', async () => {
    const env: Env = { DB: createRateLimitD1() as unknown as Env['DB'] }
    let lastAllowed = true
    for (let i = 0; i < 10; i += 1) {
      const result = await enforceRateLimit(env, 'client-a', 10, 60)
      lastAllowed = result.allowed
    }
    expect(lastAllowed).toBe(true)
    const overflow = await enforceRateLimit(env, 'client-a', 10, 60)
    expect(overflow.allowed).toBe(false)
    expect(overflow.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('keys are isolated per client', async () => {
    const env: Env = { DB: createRateLimitD1() as unknown as Env['DB'] }
    for (let i = 0; i < 11; i += 1) {
      await enforceRateLimit(env, 'client-a', 10, 60)
    }
    const other = await enforceRateLimit(env, 'client-b', 10, 60)
    expect(other.allowed).toBe(true)
  })
})
