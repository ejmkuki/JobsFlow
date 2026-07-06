import type { Env, SessionContext } from './_shared'

type EmailTag = {
  name: string
  value: string
}

export type SendJobsFlowEmailInput = {
  html: string
  idempotencyKey?: string
  replyTo?: string | string[]
  subject: string
  tags?: EmailTag[]
  text: string
  to: string | string[]
}

type ResendResponse = {
  error?: string
  id?: string
  message?: string
  name?: string
}

export const jobsFlowEmailFrom = 'JobsFlow AI <hello@send.jobsflowai.ai>'
export const jobsFlowReplyTo = 'hello@jobsflowai.ai'

const resendEmailEndpoint = 'https://api.resend.com/emails'
const htmlEscapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => htmlEscapes[character] ?? character)
}

function cleanTag(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 256)
  return cleaned || 'unknown'
}

function resendErrorMessage() {
  return 'Email delivery did not complete.'
}

export function isOutboundEmailConfigured(env: Env) {
  return Boolean(env.RESEND_API_KEY)
}

export async function sendJobsFlowEmail(env: Env, input: SendJobsFlowEmailInput) {
  if (!env.RESEND_API_KEY) {
    throw new Error('Email delivery is still being prepared.')
  }

  const headers = new Headers({
    authorization: `Bearer ${env.RESEND_API_KEY}`,
    'content-type': 'application/json',
    'user-agent': 'JobsFlowAI/1.0 (Cloudflare Pages Functions)',
  })

  if (input.idempotencyKey) {
    headers.set('idempotency-key', input.idempotencyKey.slice(0, 256))
  }

  const response = await fetch(resendEmailEndpoint, {
    body: JSON.stringify({
      from: jobsFlowEmailFrom,
      html: input.html,
      reply_to: input.replyTo,
      subject: input.subject,
      tags: input.tags,
      text: input.text,
      to: input.to,
    }),
    headers,
    method: 'POST',
  })

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new Error(resendErrorMessage())
  }

  const emailId = payload && typeof payload === 'object' ? (payload as ResendResponse).id : null
  if (!emailId) {
    throw new Error('Email delivery is taking longer than expected.')
  }

  return { id: emailId }
}

export async function sendWorkspaceTestEmail(env: Env, session: SessionContext) {
  const displayName = escapeHtml(session.displayName || 'there')
  const subject = 'JobsFlow AI outbound email is ready'
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#172033;max-width:620px">
      <h1 style="font-size:22px;margin:0 0 12px">JobsFlow AI outbound email is ready</h1>
      <p>Hi ${displayName},</p>
      <p>This confirms that JobsFlow AI can send workspace email from <strong>send.jobsflowai.ai</strong>.</p>
      <p>Replies come back to <strong>${jobsFlowReplyTo}</strong>.</p>
    </div>
  `.trim()
  const text = [
    'JobsFlow AI outbound email is ready',
    '',
    `Hi ${session.displayName || 'there'},`,
    '',
    'This confirms that JobsFlow AI can send workspace email from send.jobsflowai.ai.',
    `Replies come back to ${jobsFlowReplyTo}.`,
    '',
  ].join('\n')

  return sendJobsFlowEmail(env, {
    html,
    idempotencyKey: `jobsflow-test-${session.sessionHash.slice(0, 24)}-${Math.floor(Date.now() / 60000)}`,
    replyTo: jobsFlowReplyTo,
    subject,
    tags: [
      { name: 'service', value: 'jobsflow' },
      { name: 'template', value: 'workspace_test' },
      { name: 'tenant', value: cleanTag(session.tenantId) },
    ],
    text,
    to: session.email,
  })
}
