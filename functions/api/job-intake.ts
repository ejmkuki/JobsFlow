import type { RequestContext } from '../_shared'
import { enforceRateLimit, getSession, json, missingConfig, tooManyRequests } from '../_shared'
import { suggestJobIntake } from '../lib/job-intake'
import { planRateLimit } from '../lib/plans'

const MIN_TEXT_CHARS = 40
const MAX_TEXT_CHARS = 20000

export async function onRequestPost({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before using AI job intake.' }, 401)
  }

  const rate = await enforceRateLimit(env, `job-intake:${session.tenantId}`, planRateLimit(session.planCode, 15), 60)
  if (!rate.allowed) {
    return tooManyRequests(rate)
  }

  const body = (await request.json().catch(() => null)) as { text?: unknown } | null
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (text.length < MIN_TEXT_CHARS) {
    return json(
      { ok: false, error: 'text_too_short', message: 'Paste more of the job description before running AI cleanup.' },
      400,
    )
  }

  const suggestion = await suggestJobIntake(text.slice(0, MAX_TEXT_CHARS), env)
  if (!suggestion) {
    return json(
      {
        ok: false,
        error: 'ai_unavailable',
        message: 'AI suggestions are not available right now — set the skills and description manually.',
      },
      503,
    )
  }

  return json({ ok: true, suggestion })
}
