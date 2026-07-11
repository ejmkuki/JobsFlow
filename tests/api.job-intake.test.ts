import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestPost as intakePost } from '../functions/api/job-intake'

const jsonHeaders = { 'content-type': 'application/json' }
const base = 'https://jobsflowai.ai'

async function createSession(env: Env, email: string, accountType: 'candidate' | 'employer') {
  const res = await callHandler(sessionPost, {
    env,
    method: 'POST',
    url: `${base}/api/session`,
    headers: { ...jsonHeaders, 'x-jobsflow-bootstrap-token': 'test-bootstrap' },
    body: JSON.stringify({ email, accountType }),
    cf: {},
  })
  return extractSessionCookie(res)!
}

const longJobText =
  'We are looking for a Senior Database Administrator to own our Oracle and MongoDB fleet. ' +
  'Requisition ID 88213. Must have 8+ years of experience with Oracle RAC, RMAN backups, and MongoDB replica sets. ' +
  'Equal Opportunity Employer. Benefits include health insurance and 401k.'

describe('POST /api/job-intake', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requires a signed-in session', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const res = await callHandler(intakePost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/job-intake`,
      headers: jsonHeaders,
      body: JSON.stringify({ text: longJobText }),
    })
    expect(res.status).toBe(401)
  })

  it('rejects text that is too short to be worth cleaning up', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'short@co.com', 'employer')
    const res = await callHandler(intakePost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/job-intake`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ text: 'DBA needed' }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('text_too_short')
  })

  it('honestly reports unavailability rather than fabricating a suggestion when no AI key is configured', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'noai@co.com', 'employer')
    const res = await callHandler(intakePost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/job-intake`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ text: longJobText }),
    })
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe('ai_unavailable')
    expect(body.message).toMatch(/manually/)
  })

  it('returns a deduplicated skill list and summary parsed from the AI response', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap', ANTHROPIC_API_KEY: 'test-key' })
    const employer = await createSession(world.env, 'ai@co.com', 'employer')

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('api.anthropic.com')) {
          return new Response(
            JSON.stringify({
              content: [
                {
                  type: 'text',
                  text:
                    'Here you go:\n{"skills": ["Oracle RAC", "RMAN", "Oracle RAC", "MongoDB"], ' +
                    '"summary": "Own our Oracle and MongoDB fleet, 8+ years required.", ' +
                    '"title": "Senior Database Administrator", "location": "Remote", ' +
                    '"salaryMinUsd": 93816, "salaryMaxUsd": 162875}',
                },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        throw new Error(`Unexpected fetch to ${url}`)
      }),
    )

    const res = await callHandler(intakePost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/job-intake`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ text: longJobText }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      suggestion: {
        skills: string[]
        summary: string
        title: string | null
        location: string | null
        salaryMinUsd: number | null
        salaryMaxUsd: number | null
      }
    }
    expect(body.ok).toBe(true)
    // Deduplicated: "Oracle RAC" only appears once despite the model repeating it.
    expect(body.suggestion.skills).toEqual(['Oracle RAC', 'RMAN', 'MongoDB'])
    expect(body.suggestion.summary).toContain('Oracle and MongoDB fleet')
    expect(body.suggestion.title).toBe('Senior Database Administrator')
    expect(body.suggestion.location).toBe('Remote')
    expect(body.suggestion.salaryMinUsd).toBe(93816)
    expect(body.suggestion.salaryMaxUsd).toBe(162875)
  })

  it('leaves title/location/salary null when the model omits them, without fabricating values', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap', ANTHROPIC_API_KEY: 'test-key' })
    const employer = await createSession(world.env, 'ai2@co.com', 'employer')

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            content: [{ type: 'text', text: '{"skills": ["Oracle"], "summary": "DBA role."}' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )

    const res = await callHandler(intakePost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/job-intake`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ text: longJobText }),
    })
    const body = (await res.json()) as {
      suggestion: { title: string | null; location: string | null; salaryMinUsd: number | null; salaryMaxUsd: number | null }
    }
    expect(body.suggestion.title).toBeNull()
    expect(body.suggestion.location).toBeNull()
    expect(body.suggestion.salaryMinUsd).toBeNull()
    expect(body.suggestion.salaryMaxUsd).toBeNull()
  })
})
