import type { RequestContext } from '../_shared'
import { enforceRateLimit, getSession, json, missingConfig, safeString, tooManyRequests, writeAuditEvent } from '../_shared'

type ProfileBody = { resumeText?: unknown; headline?: unknown }

const MAX_RESUME_TEXT = 20000
const MAX_HEADLINE = 200

async function readBody(request: Request): Promise<ProfileBody> {
  try {
    return (await request.json()) as ProfileBody
  } catch {
    return {}
  }
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }
  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in first.' }, 401)
  }

  const row = await env.DB
    .prepare('SELECT headline, resume_text AS resumeText, updated_at AS updatedAt FROM candidate_resume_profiles WHERE tenant_id = ? LIMIT 1')
    .bind(session.tenantId)
    .first<{ headline: string; resumeText: string; updatedAt: string }>()

  return json({
    ok: true,
    profile: {
      headline: row?.headline ?? '',
      resumeText: row?.resumeText ?? '',
      updatedAt: row?.updatedAt ?? null,
    },
  })
}

export async function onRequestPut({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }
  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in first.' }, 401)
  }

  const rate = await enforceRateLimit(env, `profile-save:${session.tenantId}`, 60, 60)
  if (!rate.allowed) {
    return tooManyRequests(rate)
  }

  const body = await readBody(request)
  const resumeText = safeString(body.resumeText, '').slice(0, MAX_RESUME_TEXT)
  const headline = safeString(body.headline, '').slice(0, MAX_HEADLINE)

  await env.DB
    .prepare(
      `INSERT INTO candidate_resume_profiles (tenant_id, user_id, headline, resume_text, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(tenant_id) DO UPDATE SET
         user_id = excluded.user_id,
         headline = excluded.headline,
         resume_text = excluded.resume_text,
         updated_at = datetime('now')`,
    )
    .bind(session.tenantId, session.userId, headline, resumeText)
    .run()

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'profile.updated',
    actorType: 'user',
    action: 'Updated candidate profile',
    riskLevel: 'low',
    metadata: { resumeChars: resumeText.length },
  })

  return json({ ok: true, profile: { headline, resumeText } })
}
