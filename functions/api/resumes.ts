import type { RequestContext, SessionContext } from '../_shared'
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
import { extractDocxText } from '../lib/docx'
import { extractPdfText } from '../lib/pdf'
import { ocrPdfText } from '../lib/pdf-ocr'

type ResumeRow = {
  approvalStatus: string
  contentType: string
  createdAt: string
  filename: string
  id: string
  sizeBytes: number
  sourceHash: string
  hasText: number
}

type ResumeArtifactRow = {
  tenantId: string
  objectKey: string
  filename: string
  contentType: string
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

  const url = new URL(request.url)
  const id = url.searchParams.get('id')

  if (id) {
    return downloadResume({ id, env, session })
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
        created_at AS createdAt,
        LENGTH(extracted_text) > 0 AS hasText
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
    resumes: (resumes.results ?? []).map((row) => ({ ...row, hasText: Boolean(row.hasText) })),
  })
}

// Streams a stored resume file. Two callers are authorized: the owning
// tenant (a candidate's own file), or an employer tenant that has an
// application referencing this resume for one of their own jobs — never
// anyone else, and never by guessing an object key.
async function downloadResume({
  id,
  env,
  session,
}: {
  id: string
  env: RequestContext['env']
  session: SessionContext
}) {
  if (!env.RESUME_BUCKET) {
    return missingConfig('RESUME_BUCKET')
  }

  const artifact = await env.DB!
    .prepare(
      `SELECT tenant_id AS tenantId, object_key AS objectKey, filename, content_type AS contentType
       FROM resume_artifacts WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<ResumeArtifactRow>()

  if (!artifact) {
    return json({ ok: false, error: 'not_found', message: 'That resume is not available.' }, 404)
  }

  const isOwner = artifact.tenantId === session.tenantId
  if (!isOwner) {
    const linkedToOwnJob = await env.DB!
      .prepare('SELECT 1 FROM job_applications WHERE resume_artifact_id = ? AND employer_tenant_id = ? LIMIT 1')
      .bind(id, session.tenantId)
      .first<{ 1: number }>()
    if (!linkedToOwnJob) {
      return json({ ok: false, error: 'not_found', message: 'That resume is not available.' }, 404)
    }
  }

  const object = await env.RESUME_BUCKET.get(artifact.objectKey)
  if (!object) {
    return json({ ok: false, error: 'not_found', message: 'That resume is not available.' }, 404)
  }

  return new Response(object.body, {
    headers: {
      'content-type': artifact.contentType || object.httpMetadata?.contentType || 'application/octet-stream',
      'content-disposition': `attachment; filename="${artifact.filename.replace(/"/g, '')}"`,
      'cache-control': 'private, max-age=0, no-store',
    },
  })
}

export async function onRequestDelete({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }
  if (!env.RESUME_BUCKET) {
    return missingConfig('RESUME_BUCKET')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to delete a resume.' }, 401)
  }

  const rate = await enforceRateLimit(env, `resume-delete:${session.tenantId}`, 30, 60)
  if (!rate.allowed) {
    return tooManyRequests(rate)
  }

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) {
    return json({ ok: false, error: 'id_required', message: 'Missing the resume to delete.' }, 400)
  }

  const owned = await env.DB
    .prepare('SELECT object_key AS objectKey, filename FROM resume_artifacts WHERE id = ? AND tenant_id = ? LIMIT 1')
    .bind(id, session.tenantId)
    .first<{ objectKey: string; filename: string }>()
  if (!owned) {
    return json({ ok: false, error: 'not_found', message: 'That resume is not available.' }, 404)
  }

  await env.RESUME_BUCKET.delete(owned.objectKey)
  // Applications that were submitted with this resume keep their own record
  // of the match/score; resume_artifact_id on job_applications is ON DELETE
  // SET NULL, so removing the artifact doesn't touch application history.
  await env.DB.prepare('DELETE FROM resume_artifacts WHERE id = ? AND tenant_id = ?').bind(id, session.tenantId).run()

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'resume.deleted',
    actorType: 'user',
    action: 'Deleted resume file from private workspace storage',
    riskLevel: 'low',
    metadata: { artifactId: id, filename: owned.filename },
  })

  return json({ ok: true })
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

  // Extract text now so this specific file can be scored on its own via
  // Check Fit, independent of the candidate's single profile resume text.
  // PDF extraction is best-effort (see lib/pdf.ts) and honestly returns
  // nothing rather than garbled text for files it can't confidently read.
  let extractedText = ''
  let textSource: 'parsed' | 'ocr' | 'none' = 'none'
  if (resume.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    extractedText = (await extractDocxText(new Uint8Array(bytes))) ?? ''
    if (extractedText) textSource = 'parsed'
  } else if (resume.type === 'application/pdf') {
    extractedText = (await extractPdfText(new Uint8Array(bytes))) ?? ''
    if (extractedText) {
      textSource = 'parsed'
    } else {
      // The deterministic scanner couldn't read this one (scanned/image PDF,
      // or an embedded font with no usable ToUnicode map) — fall back to a
      // paid OCR tier via Claude's native document understanding, rather
      // than leaving the candidate stuck with an unscored resume. Rate
      // limited separately and more tightly since this costs real tokens.
      const ocrRate = await enforceRateLimit(env, `resume-ocr:${session.tenantId}`, 5, 300)
      if (ocrRate.allowed) {
        extractedText = (await ocrPdfText(new Uint8Array(bytes), env)) ?? ''
        if (extractedText) textSource = 'ocr'
      }
    }
  }

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
        id, tenant_id, user_id, object_key, filename, content_type, size_bytes, source_hash, extracted_text
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      extractedText,
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
        hasText: extractedText.length > 0,
        // Full text + how it was obtained, so the client can populate the
        // profile textarea from the one extraction that already ran server
        // side instead of blindly re-running its own — and so it can tell
        // the candidate honestly when OCR was needed, rather than silently
        // succeeding or failing.
        extractedText,
        textSource,
      },
    },
    201,
  )
}
