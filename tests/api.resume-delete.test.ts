import { describe, expect, it } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestPost as jobsPost } from '../functions/api/jobs'
import { onRequestGet as appsGet, onRequestPost as appsPost } from '../functions/api/job-applications'
import { onRequestDelete as resumesDelete, onRequestGet as resumesGet, onRequestPost as resumesPost } from '../functions/api/resumes'

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

async function buildDocxFile(text: string): Promise<File> {
  const xml = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`
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

async function uploadFile(env: Env, cookie: string, file: File) {
  const form = new FormData()
  form.set('resume', file)
  const res = await callHandler(resumesPost, { env, method: 'POST', url: `${base}/api/resumes`, headers: { cookie }, body: form })
  return (await res.json()) as { resume: { id: string } }
}

describe('resume file deletion', () => {
  it('lets the owning candidate delete their own resume file', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const candidate = await createSession(world.env, 'owner@me.com', 'candidate')
    const upload = await uploadFile(world.env, candidate, await buildDocxFile('Oracle expert.'))

    const del = await callHandler(resumesDelete, {
      env: world.env,
      method: 'DELETE',
      url: `${base}/api/resumes?id=${upload.resume.id}`,
      headers: { cookie: candidate },
    })
    expect(del.status).toBe(200)

    const list = await callHandler(resumesGet, { env: world.env, url: `${base}/api/resumes`, headers: { cookie: candidate } })
    const listBody = (await list.json()) as { resumes: Array<{ id: string }> }
    expect(listBody.resumes.map((r) => r.id)).not.toContain(upload.resume.id)
  })

  it('rejects deleting a resume that belongs to a different tenant', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const owner = await createSession(world.env, 'owner2@me.com', 'candidate')
    const stranger = await createSession(world.env, 'stranger2@me.com', 'candidate')
    const upload = await uploadFile(world.env, owner, await buildDocxFile('Oracle expert.'))

    const del = await callHandler(resumesDelete, {
      env: world.env,
      method: 'DELETE',
      url: `${base}/api/resumes?id=${upload.resume.id}`,
      headers: { cookie: stranger },
    })
    expect(del.status).toBe(404)

    const list = await callHandler(resumesGet, { env: world.env, url: `${base}/api/resumes`, headers: { cookie: owner } })
    const listBody = (await list.json()) as { resumes: Array<{ id: string }> }
    expect(listBody.resumes.map((r) => r.id)).toContain(upload.resume.id)
  })

  it('deleting a resume keeps the application it was attached to (FK set null, not cascaded)', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'delemp@co.com', 'employer')
    const candidate = await createSession(world.env, 'delcand@me.com', 'candidate')

    const jobRes = await callHandler(jobsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/jobs`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ title: 'DBA', requiredSkills: ['Oracle'], description: 'Need Oracle.' }),
    })
    const jobBody = (await jobRes.json()) as { job: { id: string } }

    const upload = await uploadFile(world.env, candidate, await buildDocxFile('Ten years of Oracle administration.'))
    const applyRes = await callHandler(appsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/job-applications`,
      headers: { ...jsonHeaders, cookie: candidate },
      body: JSON.stringify({ action: 'apply', jobId: jobBody.job.id, resumeArtifactId: upload.resume.id }),
    })
    expect(applyRes.status).toBe(201)

    const del = await callHandler(resumesDelete, {
      env: world.env,
      method: 'DELETE',
      url: `${base}/api/resumes?id=${upload.resume.id}`,
      headers: { cookie: candidate },
    })
    expect(del.status).toBe(200)

    // The employer can still see the applicant's record (score wasn't erased).
    const applicants = await callHandler(appsGet, {
      env: world.env,
      url: `${base}/api/job-applications?jobId=${jobBody.job.id}`,
      headers: { cookie: employer },
    })
    const applicantsBody = (await applicants.json()) as { applicants: unknown[] }
    expect(applicantsBody.applicants.length).toBe(1)
  })
})
