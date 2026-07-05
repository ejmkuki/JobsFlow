import { isOutboundEmailConfigured, jobsFlowEmailFrom, jobsFlowReplyTo, sendWorkspaceTestEmail } from '../_email'
import type { RequestContext } from '../_shared'
import { getSession, json, missingConfig, sha256Hex, writeAuditEvent } from '../_shared'

type EmailRequestBody = {
  action?: unknown
}

const maxBodyBytes = 16 * 1024

async function readBody(request: Request): Promise<EmailRequestBody | null> {
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > maxBodyBytes) {
    return null
  }

  try {
    return (await request.json()) as EmailRequestBody
  } catch {
    return {}
  }
}

export async function onRequestGet({ request, env }: RequestContext) {
  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before reading email provider status.' }, 401)
  }

  return json({
    ok: true,
    availableActions: ['send_test'],
    configured: isOutboundEmailConfigured(env),
    from: jobsFlowEmailFrom,
    recipient: session.email,
    replyTo: jobsFlowReplyTo,
  })
}

export async function onRequestPost({ request, env }: RequestContext) {
  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before sending JobsFlow email.' }, 401)
  }

  if (!env.RESEND_API_KEY) {
    return missingConfig('RESEND_API_KEY')
  }

  const body = await readBody(request)
  if (!body) {
    return json({ ok: false, error: 'payload_too_large', message: 'Email request payload is too large.' }, 413)
  }

  if (body.action !== 'send_test') {
    return json({ ok: false, error: 'invalid_email_action', message: 'Choose a supported JobsFlow email action.' }, 400)
  }

  try {
    const result = await sendWorkspaceTestEmail(env, session)
    await writeAuditEvent(env, {
      tenantId: session.tenantId,
      userId: session.userId,
      eventType: 'email.sent',
      actorType: 'user',
      action: 'Sent JobsFlow outbound email test',
      riskLevel: 'low',
      metadata: {
        provider: 'resend',
        recipientHash: await sha256Hex(session.email),
        resendEmailId: result.id,
        template: 'workspace_test',
      },
    })

    return json({
      ok: true,
      emailId: result.id,
      recipient: session.email,
    })
  } catch (error) {
    return json(
      {
        ok: false,
        error: 'resend_unavailable',
        message: error instanceof Error ? error.message : 'Resend could not send the JobsFlow email.',
      },
      502,
    )
  }
}
