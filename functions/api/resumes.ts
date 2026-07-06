import type { RequestContext } from '../_shared'
import {
  enforceRateLimit,
  getSession,
  json,
  missingConfig,
  sanitizeFilename,
  sha256Hex,
  tooManyRequests,
  writeAuditEvent,
} from '../_shared'

type ResumeRow = {
  approvalStatus: string
  contentType: string
  createdAt: string
  filename: string
  id: string
  sizeBytes: number
  sourceHash: string
}

const allowedContentTypes = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

const maxResumeBytes = 6 * 1024 * 1024

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before reading resumes.' }, 401)
  }

  const resumes = await env.DB
    .prepare(
      `
      SELECT
        id,
        filename,
        content_type AS contentType,
        size_bytes AS sizeBytes,
        source_hash AS sourceHash,
        approval_status AS approvalStatus,
        created_at AS createdAt
      FROM resume_artifacts
      WHERE tenant_id = ?
      ORDER BY created_at DESC
      LIMIT 25
      `,
    )
    .bind(session.tenantId)
    .all<ResumeRow>()

  return json({
    ok: true,
    resumes: resumes.results ?? [],
  })
}

export async function onRequestPost({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  if (!env.RESUME_BUCKET) {
    return missingConfig('RESUME_BUCKET')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before uploading resumes.' }, 401)
  }

  // R2 writes are expensive; cap per tenant to prevent storage-abuse floods.
  const rate = await enforceRateLimit(env, `resume-upload:${session.tenantId}`, 20, 60)
  if (!rate.allowed) {
    return tooManyRequests(rate)
  }

  const formData = await request.formData()
  const resume = formData.get('resume')

  if (!(resume instanceof File)) {
    return json({ ok: false, error: 'missing_resume', message: 'Attach a PDF or DOCX resume.' }, 400)
  }

  if (!allowedContentTypes.has(resume.type)) {
    return json(
      {
        ok: false,
        error: 'unsupported_file_type',
        message: 'Only PDF and DOCX resumes are accepted for secure storage.',
      },
      415,
    )
  }

  if (resume.size > maxResumeBytes) {
    return json(
      {
        ok: false,
        error: 'file_too_large',
        message: 'Resume uploads are limited to 6 MB.',
      },
      413,
    )
  }

  const bytes = await resume.arrayBuffer()
  const sourceHash = await sha256Hex(bytes)
  const artifactId = crypto.randomUUID()
  const filename = sanitizeFilename(resume.name || 'resume')
  const objectKey = `tenants/${session.tenantId}/resumes/${artifactId}-${filename}`

  await env.RESUME_BUCKET.put(objectKey, bytes, {
    httpMetadata: {
      contentType: resume.type,
    },
    customMetadata: {
      artifactId,
      tenantId: session.tenantId,
      userId: session.userId,
      sourceHash,
    },
  })

  await env.DB
    .prepare(
      `
      INSERT INTO resume_artifacts (
        id, tenant_id, user_id, object_key, filename, content_type, size_bytes, source_hash
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      artifactId,
      session.tenantId,
      session.userId,
      objectKey,
      filename,
      resume.type,
      resume.size,
      sourceHash,
    )
    .run()

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'resume.uploaded',
    actorType: 'user',
    action: 'Uploaded resume file to private workspace storage',
    riskLevel: 'medium',
    metadata: {
      artifactId,
      filename,
      contentType: resume.type,
      sizeBytes: resume.size,
    },
  })

  return json(
    {
      ok: true,
      resume: {
        id: artifactId,
        filename,
        contentType: resume.type,
        sizeBytes: resume.size,
        sourceHash,
        approvalStatus: 'uploaded',
      },
    },
    201,
  )
}
