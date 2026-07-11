// OCR fallback for PDFs the deterministic content-stream scanner in
// lib/pdf.ts can't read — scanned/image-only pages, or embedded fonts with
// no usable ToUnicode map. Uses Claude's native PDF/document understanding
// (real OCR under the hood, not just text-layer extraction), gated by the
// same ANTHROPIC_API_KEY as the AI match and job-intake tiers. This is a
// paid, opt-in-by-availability tier: it only runs when a parse already
// failed, and any failure here returns null — never garbled or fabricated
// text — same honesty rule as lib/pdf.ts itself.

import type { Env } from '../_shared'

const TIMEOUT_MS = 25000
const MAX_OUTPUT_CHARS = 20000
const DEFAULT_MODEL = 'claude-haiku-4-5'

function base64Encode(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export async function ocrPdfText(bytes: Uint8Array, env: Env): Promise<string | null> {
  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const model = env.ANTHROPIC_MODEL || DEFAULT_MODEL
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Encode(bytes) } },
              {
                type: 'text',
                text:
                  'Transcribe every line of readable text from this resume PDF, verbatim. Preserve section breaks as ' +
                  'newlines. Output plain text only — no markdown, no commentary, no added formatting.',
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const errorBody = await res.text().catch(() => '')
      console.error(`[pdf-ocr] anthropic ${res.status} ${res.statusText}: ${errorBody.slice(0, 500)}`)
      return null
    }
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }>; stop_reason?: string }
    if (data.stop_reason === 'refusal') {
      console.error('[pdf-ocr] anthropic refused the request')
      return null
    }
    const text = (data.content ?? []).find((b) => b.type === 'text')?.text?.trim()
    if (!text) return null
    return text.slice(0, MAX_OUTPUT_CHARS)
  } catch (error) {
    console.error(`[pdf-ocr] threw: ${error instanceof Error ? error.message : String(error)}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}
