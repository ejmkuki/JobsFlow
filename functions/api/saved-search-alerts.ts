// Periodic saved-search sweep — same rationale and pattern as
// functions/api/sla-check.ts: Cloudflare Pages Functions have no native
// cron trigger, so this is a plain HTTP endpoint guarded by a shared
// secret, meant to be called on a schedule by an external trigger (see
// .github/workflows/saved-search-alerts-cron.yml).
//
// Each saved search only alerts about jobs posted after its own
// last_checked_at, so a candidate is never re-notified about a job they
// already saw in an earlier run.

import type { RequestContext } from '../_shared'
import { json, missingConfig, timingSafeEqualHex } from '../_shared'
import { notify, renderNotificationEmail } from '../lib/notify'

const appUrl = 'https://jobsflowai.ai'
const maxSearchesPerRun = 200
const maxNewJobsPerSearch = 8

type SearchRow = {
  id: string
  tenantId: string
  label: string
  query: string
  workplaceType: string | null
  employmentType: string | null
  salaryMinCents: number | null
  lastCheckedAt: string
  candidateEmail: string
}

type NewJobRow = { id: string; title: string; company: string }

export async function onRequestPost({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }
  if (!env.CRON_SECRET) {
    return json({ ok: false, error: 'not_configured', message: 'Saved-search alerts are not configured.' }, 503)
  }

  const provided = request.headers.get('x-cron-secret') ?? ''
  const secret = env.CRON_SECRET
  if (provided.length !== secret.length || !timingSafeEqualHex(provided, secret)) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }

  const searches = await env.DB
    .prepare(
      `SELECT s.id AS id, s.tenant_id AS tenantId, s.label AS label, s.query AS query,
              s.workplace_type AS workplaceType, s.employment_type AS employmentType,
              s.salary_min_cents AS salaryMinCents, s.last_checked_at AS lastCheckedAt,
              u.email AS candidateEmail
       FROM saved_searches s
       INNER JOIN users u ON u.id = s.user_id
       ORDER BY s.last_checked_at ASC
       LIMIT ?`,
    )
    .bind(maxSearchesPerRun)
    .all<SearchRow>()

  let notified = 0
  for (const search of searches.results ?? []) {
    const conditions: string[] = [`status = 'open'`, 'employer_tenant_id != ?', 'created_at > ?']
    const binds: unknown[] = [search.tenantId, search.lastCheckedAt]

    if (search.query) {
      const like = `%${search.query.replace(/[%_]/g, '')}%`
      conditions.push('(title LIKE ? OR company LIKE ? OR required_skills LIKE ? OR nice_to_have_skills LIKE ?)')
      binds.push(like, like, like, like)
    }
    if (search.workplaceType) {
      conditions.push('workplace_type = ?')
      binds.push(search.workplaceType)
    }
    if (search.employmentType) {
      conditions.push('employment_type = ?')
      binds.push(search.employmentType)
    }
    if (search.salaryMinCents) {
      conditions.push('salary_max_cents IS NOT NULL AND salary_max_cents >= ?')
      binds.push(search.salaryMinCents)
    }

    const newJobs = await env.DB
      .prepare(`SELECT id, title, company FROM jobs WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ?`)
      .bind(...binds, maxNewJobsPerSearch)
      .all<NewJobRow>()

    const jobs = newJobs.results ?? []
    if (jobs.length > 0) {
      const jobsUrl = `${appUrl}/candidate/jobs${search.query ? `?q=${encodeURIComponent(search.query)}` : ''}`
      const title = `${jobs.length} new role${jobs.length === 1 ? '' : 's'} matching "${search.label}"`
      const lines = jobs.map((job) => `${job.title} at ${job.company}`)
      const email = renderNotificationEmail({ heading: title, lines, ctaLabel: 'View jobs', ctaUrl: jobsUrl })

      await notify(env, {
        tenantId: search.tenantId,
        type: 'saved_search_alert',
        title,
        body: lines.join('; '),
        linkPath: '/candidate/jobs',
        email: {
          to: search.candidateEmail,
          subject: title,
          html: email.html,
          text: email.text,
          idempotencyKey: `saved-search-${search.id}-${Math.floor(Date.now() / 3_600_000)}`,
          tags: [{ name: 'template', value: 'saved_search_alert' }],
        },
      })
      notified += 1
    }

    await env.DB.prepare(`UPDATE saved_searches SET last_checked_at = datetime('now') WHERE id = ?`).bind(search.id).run()
  }

  return json({ ok: true, searchesChecked: (searches.results ?? []).length, notified })
}
