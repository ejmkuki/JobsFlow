// Shared notification writer: always records an in-app notification (the
// free-tier baseline), and additionally sends email (functions/_email.ts,
// Resend) when RESEND_API_KEY is configured — the always-on channel. Email
// failures never block the calling mutation; the in-app row has already
// landed by the time email is attempted.

import type { Env } from '../_shared'
import { isOutboundEmailConfigured, sendJobsFlowEmail } from '../_email'

export type NotificationEmail = {
  to: string
  subject: string
  html: string
  text: string
  idempotencyKey?: string
  tags?: Array<{ name: string; value: string }>
  attachments?: Array<{ filename: string; content: string }>
}

export type NotificationInput = {
  tenantId: string
  type: string
  title: string
  body: string
  linkPath?: string
  email?: NotificationEmail
}

export async function notify(env: Env, input: NotificationInput): Promise<void> {
  // A notification is always secondary to the mutation that triggered it — a
  // failure here must never surface as a failure of the apply/advance/etc.
  // call itself.
  if (env.DB) {
    try {
      await env.DB
        .prepare('INSERT INTO notifications (id, tenant_id, type, title, body, link_path) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), input.tenantId, input.type, input.title, input.body, input.linkPath ?? null)
        .run()
    } catch (error) {
      console.error(
        `[notify] in-app insert failed for type=${input.type}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  if (input.email && isOutboundEmailConfigured(env)) {
    try {
      await sendJobsFlowEmail(env, input.email)
    } catch (error) {
      console.error(
        `[notify] email send failed for type=${input.type}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

const htmlEscapes: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => htmlEscapes[character] ?? character)
}

// Consistent, minimal inline-styled shell for every lifecycle email —
// matches the look of the existing workspace-test email in _email.ts.
export function renderNotificationEmail(input: { heading: string; lines: string[]; ctaLabel?: string; ctaUrl?: string }) {
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#172033;max-width:620px">
      <h1 style="font-size:20px;margin:0 0 14px">${escapeHtml(input.heading)}</h1>
      ${input.lines.map((line) => `<p style="margin:0 0 10px">${escapeHtml(line)}</p>`).join('')}
      ${
        input.ctaLabel && input.ctaUrl
          ? `<p style="margin:18px 0 0"><a href="${escapeHtml(input.ctaUrl)}" style="background:#0e7490;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${escapeHtml(input.ctaLabel)}</a></p>`
          : ''
      }
    </div>
  `.trim()
  const text = [input.heading, '', ...input.lines, ...(input.ctaLabel && input.ctaUrl ? ['', `${input.ctaLabel}: ${input.ctaUrl}`] : [])].join(
    '\n',
  )
  return { html, text }
}
