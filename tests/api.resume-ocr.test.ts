import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestPost as resumesPost } from '../functions/api/resumes'

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

// Garbage bytes that don't even start with "%PDF-" — extractPdfText bails
// out immediately, which is all that's needed to exercise the OCR
// fallback path; the reason the direct parse failed doesn't matter here.
function unreadablePdf(): File {
  return new File([new Uint8Array([1, 2, 3, 4])], 'scanned.pdf', { type: 'application/pdf' })
}

async function uploadFile(env: Env, cookie: string, file: File) {
  const form = new FormData()
  form.set('resume', file)
  return callHandler(resumesPost, { env, method: 'POST', url: `${base}/api/resumes`, headers: { cookie }, body: form })
}

describe('OCR fallback for unreadable PDFs', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('falls back to OCR and honestly reports textSource when direct parsing fails', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap', ANTHROPIC_API_KEY: 'test-key' })
    const candidate = await createSession(world.env, 'ocr1@me.com', 'candidate')

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ content: [{ type: 'text', text: 'Jane Doe\nOracle DBA with 8 years experience.' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )

    const res = await uploadFile(world.env, candidate, unreadablePdf())
    expect(res.status).toBe(201)
    const body = (await res.json()) as { resume: { hasText: boolean; extractedText: string; textSource: string } }
    expect(body.resume.hasText).toBe(true)
    expect(body.resume.textSource).toBe('ocr')
    expect(body.resume.extractedText).toContain('Oracle DBA')
  })

  it('leaves textSource "none" without fabricating text when no AI key is configured', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const candidate = await createSession(world.env, 'ocr2@me.com', 'candidate')

    const res = await uploadFile(world.env, candidate, unreadablePdf())
    const body = (await res.json()) as { resume: { hasText: boolean; extractedText: string; textSource: string } }
    expect(body.resume.hasText).toBe(false)
    expect(body.resume.textSource).toBe('none')
    expect(body.resume.extractedText).toBe('')
  })

  it('degrades to textSource "none" rather than skipping the OCR rate limit, without blocking the upload itself', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap', ANTHROPIC_API_KEY: 'test-key' })
    const candidate = await createSession(world.env, 'ocr3@me.com', 'candidate')

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ content: [{ type: 'text', text: 'OCR text.' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )

    // The OCR fallback is rate-limited to 5 per 5 minutes per tenant.
    for (let i = 0; i < 5; i += 1) {
      const res = await uploadFile(world.env, candidate, unreadablePdf())
      expect(res.status).toBe(201)
    }

    const sixth = await uploadFile(world.env, candidate, unreadablePdf())
    expect(sixth.status).toBe(201) // upload still succeeds — only OCR is skipped
    const body = (await sixth.json()) as { resume: { hasText: boolean; textSource: string } }
    expect(body.resume.hasText).toBe(false)
    expect(body.resume.textSource).toBe('none')
  })
})
