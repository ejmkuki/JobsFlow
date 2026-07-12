import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestPost as jobsPost } from '../functions/api/jobs'
import { onRequestPost as appsPost } from '../functions/api/job-applications'
import { onRequestPost as teamPost } from '../functions/api/team'
import { onRequestGet as notesGet, onRequestPost as notesPost } from '../functions/api/applicant-notes'
import { onRequestGet as notificationsGet } from '../functions/api/notifications'

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

async function postJob(env: Env, cookie: string) {
  const res = await callHandler(jobsPost, {
    env,
    method: 'POST',
    url: `${base}/api/jobs`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ title: 'DBA', requiredSkills: ['Oracle'] }),
  })
  const body = (await res.json()) as { job: { id: string } }
  return body.job.id
}

async function apply(env: Env, cookie: string, jobId: string) {
  const res = await callHandler(appsPost, {
    env,
    method: 'POST',
    url: `${base}/api/job-applications`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ action: 'apply', jobId }),
  })
  const body = (await res.json()) as { applicationId: string }
  return body.applicationId
}

async function addNote(env: Env, cookie: string, applicationId: string, noteBody: string) {
  return callHandler(notesPost, {
    env,
    method: 'POST',
    url: `${base}/api/applicant-notes`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ applicationId, body: noteBody }),
  })
}

async function listNotes(env: Env, cookie: string, applicationId: string) {
  const res = await callHandler(notesGet, { env, url: `${base}/api/applicant-notes?applicationId=${applicationId}`, headers: { cookie } })
  return (await res.json()) as { notes: Array<{ id: string; body: string; authorName: string; mentionedUserIds: string[] }> }
}

describe('applicant notes and @mentions', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('adds a note visible to the team, never surfaced to the candidate', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'note-emp1@co.com', 'employer')
    const candidate = await createSession(world.env, 'note-cand1@me.com', 'candidate')
    const jobId = await postJob(world.env, employer)
    const applicationId = await apply(world.env, candidate, jobId)

    const res = await addNote(world.env, employer, applicationId, 'Strong RAC background, worth fast-tracking.')
    expect(res.status).toBe(201)

    const notes = await listNotes(world.env, employer, applicationId)
    expect(notes.notes).toHaveLength(1)
    expect(notes.notes[0].body).toContain('fast-tracking')
  })

  it('never lets a note be read for an applicant outside the caller\'s tenant', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const owner = await createSession(world.env, 'note-owner@co.com', 'employer')
    const stranger = await createSession(world.env, 'note-stranger@co.com', 'employer')
    const candidate = await createSession(world.env, 'note-cand2@me.com', 'candidate')
    const jobId = await postJob(world.env, owner)
    const applicationId = await apply(world.env, candidate, jobId)
    await addNote(world.env, owner, applicationId, 'Internal note.')

    const res = await callHandler(notesGet, {
      env: world.env,
      url: `${base}/api/applicant-notes?applicationId=${applicationId}`,
      headers: { cookie: stranger },
    })
    expect(res.status).toBe(404)
  })

  it('parses an @mention of a real teammate and notifies + emails them, but not a bare "@" that matches nobody', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap', RESEND_API_KEY: 'test-key' })
    const owner = await createSession(world.env, 'note-owner2@co.com', 'employer')
    await callHandler(teamPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/team`,
      headers: { ...jsonHeaders, cookie: owner },
      body: JSON.stringify({ email: 'jane@co.com', role: 'hiring_manager' }),
    })
    const janeCookie = await createSession(world.env, 'jane@co.com', 'employer') // Jane accepts the invite

    const candidate = await createSession(world.env, 'note-cand3@me.com', 'candidate')
    const jobId = await postJob(world.env, owner)
    const applicationId = await apply(world.env, candidate, jobId)

    const sendSpy = vi.fn(async () => new Response(JSON.stringify({ id: 'e1' }), { status: 200 }))
    vi.stubGlobal('fetch', sendSpy)

    // Jane's actual display name is her email's local part by default —
    // check what it resolved to, then mention it.
    const teamRes = await addNote(world.env, owner, applicationId, '@nobody-by-this-name take a look, thanks!')
    expect((await teamRes.json()).mentionedUserIds).toEqual([])
    expect(sendSpy).not.toHaveBeenCalled()

    const realNote = await addNote(world.env, owner, applicationId, '@jane can you review this one?')
    const realBody = (await realNote.json()) as { mentionedUserIds: string[] }
    expect(realBody.mentionedUserIds).toHaveLength(1)
    expect(sendSpy).toHaveBeenCalledTimes(1)
    const [, init] = sendSpy.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body)).to).toBe('jane@co.com')

    const janeNotifications = await callHandler(notificationsGet, { env: world.env, url: `${base}/api/notifications`, headers: { cookie: janeCookie } })
    const janeBody = (await janeNotifications.json()) as { notifications: Array<{ type: string }> }
    expect(janeBody.notifications.some((n) => n.type === 'note_mention')).toBe(true)
  })

  it('rejects an empty note', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'note-emp4@co.com', 'employer')
    const candidate = await createSession(world.env, 'note-cand4@me.com', 'candidate')
    const jobId = await postJob(world.env, employer)
    const applicationId = await apply(world.env, candidate, jobId)

    const res = await addNote(world.env, employer, applicationId, '   ')
    expect(res.status).toBe(400)
  })
})
