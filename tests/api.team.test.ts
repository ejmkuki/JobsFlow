import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestDelete as teamDelete, onRequestGet as teamGet, onRequestPost as teamPost } from '../functions/api/team'

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
  return res
}

async function createSessionCookie(env: Env, email: string, accountType: 'candidate' | 'employer') {
  return extractSessionCookie(await createSession(env, email, accountType))!
}

async function invite(env: Env, cookie: string, email: string, role = 'recruiter') {
  return callHandler(teamPost, {
    env,
    method: 'POST',
    url: `${base}/api/team`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ email, role }),
  })
}

async function getTeam(env: Env, cookie: string) {
  const res = await callHandler(teamGet, { env, url: `${base}/api/team`, headers: { cookie } })
  return (await res.json()) as {
    members: Array<{ userId: string; email: string; role: string; isOwner: boolean }>
    invites: Array<{ id: string; invitedEmail: string; role: string }>
    isOwner: boolean
  }
}

describe('team invites and multi-seat tenants', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lets the workspace owner invite a teammate, sending an email', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap', RESEND_API_KEY: 'test-key' })
    const owner = await createSessionCookie(world.env, 'owner1@co.com', 'employer')

    const sendSpy = vi.fn(async () => new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }))
    vi.stubGlobal('fetch', sendSpy)

    const res = await invite(world.env, owner, 'teammate1@co.com', 'hiring_manager')
    expect(res.status).toBe(201)
    expect(sendSpy).toHaveBeenCalledTimes(1)
    const [, init] = sendSpy.mock.calls[0] as [string, RequestInit]
    const sentBody = JSON.parse(String(init.body)) as { to: string }
    expect(sentBody.to).toBe('teammate1@co.com')

    const team = await getTeam(world.env, owner)
    expect(team.invites).toHaveLength(1)
    expect(team.invites[0].invitedEmail).toBe('teammate1@co.com')
    expect(team.invites[0].role).toBe('hiring_manager')
    expect(team.isOwner).toBe(true)
  })

  it('rejects inviting an email that already has a JobsFlow account', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const owner = await createSessionCookie(world.env, 'owner2@co.com', 'employer')
    await createSessionCookie(world.env, 'existing@me.com', 'candidate')

    const res = await invite(world.env, owner, 'existing@me.com')
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('already_has_account')
  })

  it('only the workspace owner can invite — a regular member cannot', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const owner = await createSessionCookie(world.env, 'owner3@co.com', 'employer')
    await invite(world.env, owner, 'member3@co.com')
    const memberCookie = await createSessionCookie(world.env, 'member3@co.com', 'employer')

    const res = await invite(world.env, memberCookie, 'someoneelse@co.com')
    expect(res.status).toBe(403)
  })

  it('an invited email joins the SAME tenant with the invited role, not a new tenant', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const ownerRes = await createSession(world.env, 'owner4@co.com', 'employer')
    const ownerCookie = extractSessionCookie(ownerRes)!
    const ownerBody = (await ownerRes.json()) as { session: { tenantId: string } }

    await invite(world.env, ownerCookie, 'member4@co.com', 'hiring_manager')

    const joinRes = await createSession(world.env, 'member4@co.com', 'employer')
    const joinBody = (await joinRes.json()) as { session: { tenantId: string; role: string } }
    expect(joinBody.session.tenantId).toBe(ownerBody.session.tenantId)
    expect(joinBody.session.role).toBe('hiring_manager')

    const team = await getTeam(world.env, ownerCookie)
    expect(team.members).toHaveLength(2)
    expect(team.members.find((m) => m.email === 'member4@co.com')?.isOwner).toBe(false)
  })

  it('keeps team membership scoped to its own tenant', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const ownerA = await createSessionCookie(world.env, 'ownerA@co.com', 'employer')
    const ownerB = await createSessionCookie(world.env, 'ownerB@co.com', 'employer')
    await invite(world.env, ownerA, 'teammateA@co.com')

    const teamB = await getTeam(world.env, ownerB)
    expect(teamB.members).toHaveLength(1) // only ownerB themselves
    expect(teamB.invites).toHaveLength(0)
  })

  it('revoking an invite means that email starts a fresh tenant instead of joining', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const ownerRes = await createSession(world.env, 'owner5@co.com', 'employer')
    const ownerCookie = extractSessionCookie(ownerRes)!
    const ownerBody = (await ownerRes.json()) as { session: { tenantId: string } }

    const inviteRes = await invite(world.env, ownerCookie, 'revoked5@co.com')
    const { inviteId } = (await inviteRes.json()) as { inviteId: string }

    await callHandler(teamDelete, {
      env: world.env,
      method: 'DELETE',
      url: `${base}/api/team?inviteId=${inviteId}`,
      headers: { cookie: ownerCookie },
    })

    const joinRes = await createSession(world.env, 'revoked5@co.com', 'employer')
    const joinBody = (await joinRes.json()) as { session: { tenantId: string } }
    expect(joinBody.session.tenantId).not.toBe(ownerBody.session.tenantId)
  })

  it('removes a team member, and prevents the owner from removing themselves', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const owner = await createSessionCookie(world.env, 'owner6@co.com', 'employer')
    await invite(world.env, owner, 'member6@co.com')
    const ownerTenant = (await getTeam(world.env, owner)).members.find((m) => m.isOwner)!
    await createSessionCookie(world.env, 'member6@co.com', 'employer')
    const memberUserId = (await getTeam(world.env, owner)).members.find((m) => m.email === 'member6@co.com')!.userId

    const selfRemove = await callHandler(teamDelete, {
      env: world.env,
      method: 'DELETE',
      url: `${base}/api/team?userId=${ownerTenant.userId}`,
      headers: { cookie: owner },
    })
    expect(selfRemove.status).toBe(400)

    await callHandler(teamDelete, {
      env: world.env,
      method: 'DELETE',
      url: `${base}/api/team?userId=${memberUserId}`,
      headers: { cookie: owner },
    })
    const after = await getTeam(world.env, owner)
    expect(after.members).toHaveLength(1)
  })
})
