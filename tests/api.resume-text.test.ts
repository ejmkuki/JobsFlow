import { describe, expect, it } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestPost as jobsPost } from '../functions/api/jobs'
import { onRequestPost as previewPost } from '../functions/api/match-preview'
import { onRequestPost as appsPost } from '../functions/api/job-applications'
import { onRequestGet as resumesGet, onRequestPost as resumesPost } from '../functions/api/resumes'

const jsonHeaders = { 'content-type': 'application/json' }
const base = 'https://jobsflowai.ai'

async function createSession(env: Env, email: string, accountType: 'candidate' | 'employer') {
  const res = await callHandler(sessionPost, {
    env,
    method: 'POST',
    url: `${base}/api/session`,
    headers: { ...jsonHeaders, 'x-jobsflow-bootstrap-token': 'test-bootstrap' },
    body: JSON.stringify({ email, accountType }),
    cf: {},
  })
  return extractSessionCookie(res)!
}

async function postJob(env: Env, cookie: string, title: string, requiredSkills: string[]) {
  const res = await callHandler(jobsPost, {
    env,
    method: 'POST',
    url: `${base}/api/jobs`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ title, requiredSkills, description: `We need ${requiredSkills.join(', ')}.` }),
  })
  const body = (await res.json()) as { job?: { id: string } }
  return body.job!.id
}

// Hand-builds a minimal single-entry ZIP (the .docx container), stored
// (uncompressed) so the test needs no zip library.
async function buildDocxFile(xml: string): Promise<File> {
  const content = new TextEncoder().encode(xml)
  const filename = new TextEncoder().encode('word/document.xml')

  const local = new DataView(new ArrayBuffer(30))
  local.setUint32(0, 0x04034b50, true)
  local.setUint16(8, 0, true)
  local.setUint32(18, content.length, true)
  local.setUint32(22, content.length, true)
  local.setUint16(26, filename.length, true)

  const central = new DataView(new ArrayBuffer(46))
  central.setUint32(0, 0x02014b50, true)
  central.setUint16(4, 20, true)
  central.setUint16(6, 20, true)
  central.setUint32(20, content.length, true)
  central.setUint32(24, content.length, true)
  central.setUint16(28, filename.length, true)

  const centralDirOffset = 30 + filename.length + content.length
  const centralDirSize = 46 + filename.length

  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054b50, true)
  eocd.setUint16(8, 1, true)
  eocd.setUint16(10, 1, true)
  eocd.setUint32(12, centralDirSize, true)
  eocd.setUint32(16, centralDirOffset, true)

  const blob = new Blob([
    new Uint8Array(local.buffer),
    filename,
    content,
    new Uint8Array(central.buffer),
    filename,
    new Uint8Array(eocd.buffer),
  ])
  return new File([blob], 'resume.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}

function docxXml(...paragraphs: string[]) {
  const body = paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('')
  return `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`
}

async function uploadFile(env: Env, cookie: string, file: File) {
  const form = new FormData()
  form.set('resume', file)
  const res = await callHandler(resumesPost, { env, method: 'POST', url: `${base}/api/resumes`, headers: { cookie }, body: form })
  return res
}

// Hand-builds a minimal PDF with one FlateDecode content-stream object.
// No xref/trailer/page-tree — the extractor scans for `N G obj ... stream
// ... endstream` blocks directly, so this loose file exercises it exactly
// like a real one would.
async function buildPdfFile(...lines: string[]): Promise<File> {
  const content = lines.map((line, i) => (i === 0 ? `BT 72 720 Td (${line}) Tj` : `0 -14 Td (${line}) Tj`)).join(' ') + ' ET'
  const compressedStream = new Blob([new TextEncoder().encode(content)]).stream().pipeThrough(new CompressionStream('deflate'))
  const compressed = new Uint8Array(await new Response(compressedStream).arrayBuffer())
  const prefix = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Length 1 /Filter /FlateDecode >>\nstream\n')
  const suffix = new TextEncoder().encode('\nendstream\nendobj\n')
  const bytes = new Uint8Array(prefix.length + compressed.length + suffix.length)
  bytes.set(prefix, 0)
  bytes.set(compressed, prefix.length)
  bytes.set(suffix, prefix.length + compressed.length)
  return new File([bytes], 'resume.pdf', { type: 'application/pdf' })
}

describe('per-file resume text extraction and selection', () => {
  it('extracts text from an uploaded docx at upload time and exposes hasText', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const candidate = await createSession(world.env, 'docx1@me.com', 'candidate')
    const file = await buildDocxFile(docxXml('Oracle RAC and Data Guard expert.'))

    const uploadRes = await uploadFile(world.env, candidate, file)
    expect(uploadRes.status).toBe(201)
    const uploadBody = (await uploadRes.json()) as { resume: { hasText: boolean } }
    expect(uploadBody.resume.hasText).toBe(true)

    const listRes = await callHandler(resumesGet, { env: world.env, url: `${base}/api/resumes`, headers: { cookie: candidate } })
    const listBody = (await listRes.json()) as { resumes: Array<{ hasText: boolean }> }
    expect(listBody.resumes[0].hasText).toBe(true)
  })

  it('leaves hasText false for a file that is not actually a readable PDF', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const candidate = await createSession(world.env, 'pdf1@me.com', 'candidate')
    const pdf = new File([new Uint8Array([1, 2, 3, 4])], 'resume.pdf', { type: 'application/pdf' })

    const uploadRes = await uploadFile(world.env, candidate, pdf)
    const uploadBody = (await uploadRes.json()) as { resume: { hasText: boolean } }
    expect(uploadBody.resume.hasText).toBe(false)
  })

  it('extracts text from a real PDF at upload time and scores it via Check Fit', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'pdfemp1@co.com', 'employer')
    const candidate = await createSession(world.env, 'pdf2@me.com', 'candidate')
    const jobId = await postJob(world.env, employer, 'DBA', ['Oracle', 'RMAN'])
    const pdf = await buildPdfFile('Ten years of Oracle administration and RMAN backups.')

    const uploadRes = await uploadFile(world.env, candidate, pdf)
    const uploadBody = (await uploadRes.json()) as { resume: { id: string; hasText: boolean } }
    expect(uploadBody.resume.hasText).toBe(true)

    const fit = await callHandler(previewPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/match-preview`,
      headers: { ...jsonHeaders, cookie: candidate },
      body: JSON.stringify({ jobId, resumeArtifactId: uploadBody.resume.id }),
    })
    const fitBody = (await fit.json()) as { match: { score: number; method: string } }
    expect(fitBody.match.method).toBe('keyword')
    expect(fitBody.match.score).toBe(100)
  })

  it('Check Fit scores against the selected resume file, not always the profile text', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'emp1@co.com', 'employer')
    const candidate = await createSession(world.env, 'multi1@me.com', 'candidate')
    const jobId = await postJob(world.env, employer, 'DBA', ['MongoDB', 'Oracle'])

    const oracleFile = await buildDocxFile(docxXml('Ten years of Oracle administration.'))
    const mongoFile = await buildDocxFile(docxXml('Deep MongoDB replica set and Oracle experience.'))
    const oracleUpload = (await (await uploadFile(world.env, candidate, oracleFile)).json()) as { resume: { id: string } }
    const mongoUpload = (await (await uploadFile(world.env, candidate, mongoFile)).json()) as { resume: { id: string } }

    // No resumeArtifactId -> falls back to the (empty) profile text -> unscored.
    const noFile = await callHandler(previewPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/match-preview`,
      headers: { ...jsonHeaders, cookie: candidate },
      body: JSON.stringify({ jobId }),
    })
    const noFileBody = (await noFile.json()) as { match: { method: string; score: number } }
    expect(noFileBody.match.method).toBe('unscored')

    // Oracle-only resume matches 1 of 2 required skills.
    const oracleFit = await callHandler(previewPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/match-preview`,
      headers: { ...jsonHeaders, cookie: candidate },
      body: JSON.stringify({ jobId, resumeArtifactId: oracleUpload.resume.id }),
    })
    const oracleFitBody = (await oracleFit.json()) as { match: { score: number; gaps: string[] } }
    expect(oracleFitBody.match.score).toBe(50)
    expect(oracleFitBody.match.gaps).toContain('MongoDB')

    // The MongoDB+Oracle resume matches both.
    const mongoFit = await callHandler(previewPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/match-preview`,
      headers: { ...jsonHeaders, cookie: candidate },
      body: JSON.stringify({ jobId, resumeArtifactId: mongoUpload.resume.id }),
    })
    const mongoFitBody = (await mongoFit.json()) as { match: { score: number } }
    expect(mongoFitBody.match.score).toBe(100)
  })

  it('rejects a resumeArtifactId that belongs to a different tenant', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'emp2@co.com', 'employer')
    const owner = await createSession(world.env, 'owner1@me.com', 'candidate')
    const stranger = await createSession(world.env, 'stranger1@me.com', 'candidate')
    const jobId = await postJob(world.env, employer, 'DBA', ['SQL'])
    const file = await buildDocxFile(docxXml('SQL expert.'))
    const upload = (await (await uploadFile(world.env, owner, file)).json()) as { resume: { id: string } }

    const res = await callHandler(previewPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/match-preview`,
      headers: { ...jsonHeaders, cookie: stranger },
      body: JSON.stringify({ jobId, resumeArtifactId: upload.resume.id }),
    })
    expect(res.status).toBe(400)
  })

  it('apply stores a score computed from the specific resume file that was attached', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'emp3@co.com', 'employer')
    const candidate = await createSession(world.env, 'multi2@me.com', 'candidate')
    const jobId = await postJob(world.env, employer, 'DBA', ['MongoDB', 'Oracle'])
    const file = await buildDocxFile(docxXml('Ten years of Oracle administration.'))
    const upload = (await (await uploadFile(world.env, candidate, file)).json()) as { resume: { id: string } }

    const res = await callHandler(appsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/job-applications`,
      headers: { ...jsonHeaders, cookie: candidate },
      body: JSON.stringify({ action: 'apply', aiConsent: true, jobId, resumeArtifactId: upload.resume.id }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { match: { score: number; gaps: string[] } }
    expect(body.match.score).toBe(50)
    expect(body.match.gaps).toContain('MongoDB')
  })
})
