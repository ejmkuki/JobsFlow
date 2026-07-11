import type { RequestContext } from '../_shared'
import { enforceRateLimit, getSession, json, missingConfig, safeString, tooManyRequests } from '../_shared'

const employmentTypes = new Set(['full_time', 'part_time', 'contract', 'internship'])
const workplaceTypes = new Set(['remote', 'hybrid', 'onsite'])
const maxSavedSearches = 20

type SavedSearchRow = {
  id: string
  label: string
  query: string
  workplaceType: string | null
  employmentType: string | null
  salaryMinCents: number | null
  createdAt: string
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to view saved searches.' }, 401)
  }

  const rows = await env.DB
    .prepare(
      `SELECT id, label, query, workplace_type AS workplaceType, employment_type AS employmentType,
              salary_min_cents AS salaryMinCents, created_at AS createdAt
       FROM saved_searches WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(session.tenantId, maxSavedSearches)
    .all<SavedSearchRow>()

  return json({ ok: true, savedSearches: rows.results ?? [] })
}

export async function onRequestPost({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to save a search.' }, 401)
  }

  // Rate limit is deliberately above maxSavedSearches so the request-volume
  // guard and the "you already have N saved searches" guard don't collide —
  // hitting the cap should read as a 400 (fix your search list), not a 429.
  const rate = await enforceRateLimit(env, `saved-search:${session.tenantId}`, 40, 60)
  if (!rate.allowed) {
    return tooManyRequests(rate)
  }

  const count = await env.DB
    .prepare('SELECT COUNT(*) AS n FROM saved_searches WHERE tenant_id = ?')
    .bind(session.tenantId)
    .first<{ n: number }>()
  if ((count?.n ?? 0) >= maxSavedSearches) {
    return json({ ok: false, error: 'limit_reached', message: `You can save up to ${maxSavedSearches} searches.` }, 400)
  }

  const body = (await request.json().catch(() => ({}))) as {
    label?: unknown
    query?: unknown
    workplaceType?: unknown
    employmentType?: unknown
    salaryMinCents?: unknown
  }

  const query = safeString(body.query, '').slice(0, 200)
  const workplaceType = workplaceTypes.has(String(body.workplaceType)) ? String(body.workplaceType) : null
  const employmentType = employmentTypes.has(String(body.employmentType)) ? String(body.employmentType) : null
  const salaryMinCents =
    typeof body.salaryMinCents === 'number' && Number.isFinite(body.salaryMinCents) && body.salaryMinCents > 0
      ? Math.round(body.salaryMinCents)
      : null
  const label =
    safeString(body.label, '').slice(0, 80) ||
    [query, workplaceType, employmentType].filter(Boolean).join(' · ') ||
    'Saved search'

  if (!query && !workplaceType && !employmentType && !salaryMinCents) {
    return json({ ok: false, error: 'criteria_required', message: 'Add at least one search filter before saving it.' }, 400)
  }

  const id = crypto.randomUUID()
  await env.DB
    .prepare(
      `INSERT INTO saved_searches (id, tenant_id, user_id, label, query, workplace_type, employment_type, salary_min_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, session.tenantId, session.userId, label, query, workplaceType, employmentType, salaryMinCents)
    .run()

  return json({ ok: true, savedSearchId: id }, 201)
}

export async function onRequestDelete({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to delete a saved search.' }, 401)
  }

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) {
    return json({ ok: false, error: 'id_required', message: 'Missing the saved search to delete.' }, 400)
  }

  await env.DB.prepare('DELETE FROM saved_searches WHERE id = ? AND tenant_id = ?').bind(id, session.tenantId).run()

  return json({ ok: true })
}
