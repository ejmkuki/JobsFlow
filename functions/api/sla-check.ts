// Periodic SLA-breach sweep. Cloudflare Pages Functions have no native
// scheduled/cron trigger (that's a Workers-only primitive) — this is a
// plain HTTP endpoint instead, guarded by a shared secret, meant to be
// called on a schedule by an external trigger (see
// .github/workflows/sla-check-cron.yml for the one this project ships).
//
// Idempotent: each breached application is notified at most once — marked
// via sla_breach_notified_at, cleared whenever the SLA clock resets
// (advance, reapply) so a later re-breach can notify again.

import type { RequestContext } from '../_shared'
import { json, missingConfig, timingSafeEqualHex } from '../_shared'
import { notify, renderNotificationEmail } from '../lib/notify'

const appUrl = 'https://jobsflowai.ai'
const maxPerRun = 200

type BreachRow = {
  id: string
  employerTenantId: string
  jobId: string
  jobTitle: string
  company: string
  candidateName: string
  employerEmail: string | null
}

export async function onRequestPost({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }
  if (!env.CRON_SECRET) {
    return json({ ok: false, error: 'not_configured', message: 'SLA checks are not configured.' }, 503)
  }

  const provided = request.headers.get('x-cron-secret') ?? ''
  const secret = env.CRON_SECRET
  if (provided.length !== secret.length || !timingSafeEqualHex(provided, secret)) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }

  const rows = await env.DB
    .prepare(
      `SELECT
        a.id AS id,
        a.employer_tenant_id AS employerTenantId,
        a.job_id AS jobId,
        j.title AS jobTitle,
        j.company AS company,
        a.candidate_name AS candidateName,
        u.email AS employerEmail
       FROM job_applications a
       INNER JOIN jobs j ON j.id = a.job_id
       LEFT JOIN users u ON u.id = j.created_by_user_id
       WHERE a.employer_sla_due_at IS NOT NULL
         AND a.employer_sla_due_at < datetime('now')
         AND a.sla_breach_notified_at IS NULL
       LIMIT ?`,
    )
    .bind(maxPerRun)
    .all<BreachRow>()

  const breaches = rows.results ?? []
  let notified = 0

  for (const breach of breaches) {
    const pipelineUrl = `${appUrl}/employer/candidates?job=${breach.jobId}`
    const title = `Overdue: ${breach.candidateName} is waiting on a reply`
    const line = `${breach.candidateName}'s application for ${breach.jobTitle} has passed your response window — reply soon to avoid ghosting them.`
    const email = renderNotificationEmail({ heading: title, lines: [line], ctaLabel: 'Review applicant', ctaUrl: pipelineUrl })

    await notify(env, {
      tenantId: breach.employerTenantId,
      type: 'sla_breach',
      title,
      body: line,
      linkPath: `/employer/candidates?job=${breach.jobId}`,
      email: breach.employerEmail
        ? {
            to: breach.employerEmail,
            subject: title,
            html: email.html,
            text: email.text,
            idempotencyKey: `sla-breach-${breach.id}-${Math.floor(Date.now() / 3_600_000)}`,
            tags: [{ name: 'template', value: 'sla_breach' }],
          }
        : undefined,
    })

    await env.DB.prepare(`UPDATE job_applications SET sla_breach_notified_at = datetime('now') WHERE id = ?`).bind(breach.id).run()
    notified += 1
  }

  return json({ ok: true, checked: breaches.length, notified })
}
