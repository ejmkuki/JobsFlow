import { describe, expect, it } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestDelete as searchDelete, onRequestGet as searchGet, onRequestPost as searchPost } from '../functions/api/saved-searches'

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

async function create(env: Env, cookie: string, input: Record<string, unknown>) {
  return callHandler(searchPost, {
    env,
    method: 'POST',
    url: `${base}/api/saved-searches`,
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify(input),
  })
}

async function list(env: Env, cookie: string) {
  const res = await callHandler(searchGet, { env, url: `${base}/api/saved-searches`, headers: { cookie } })
  return (await res.json()) as { savedSearches: Array<{ id: string; label: string }> }
}

describe('saved searches', () => {
  it('creates a saved search with an auto-generated label when none is given', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const candidate = await createSession(world.env, 'sav1@me.com', 'candidate')

    const res = await create(world.env, candidate, { query: 'Oracle DBA', workplaceType: 'remote', salaryMinCents: 13000000 })
    expect(res.status).toBe(201)

    const result = await list(world.env, candidate)
    expect(result.savedSearches).toHaveLength(1)
    expect(result.savedSearches[0].label).toContain('Oracle DBA')
  })

  it('rejects a saved search with no criteria at all', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const candidate = await createSession(world.env, 'sav2@me.com', 'candidate')

    const res = await create(world.env, candidate, {})
    expect(res.status).toBe(400)
  })

  it('deletes a saved search', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const candidate = await createSession(world.env, 'sav3@me.com', 'candidate')
    const createRes = await create(world.env, candidate, { query: 'Oracle' })
    const { savedSearchId } = (await createRes.json()) as { savedSearchId: string }

    await callHandler(searchDelete, {
      env: world.env,
      method: 'DELETE',
      url: `${base}/api/saved-searches?id=${savedSearchId}`,
      headers: { cookie: candidate },
    })

    const result = await list(world.env, candidate)
    expect(result.savedSearches).toHaveLength(0)
  })

  it('enforces the per-tenant saved-search limit', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const candidate = await createSession(world.env, 'sav4@me.com', 'candidate')

    for (let i = 0; i < 20; i += 1) {
      const res = await create(world.env, candidate, { query: `search ${i}` })
      expect(res.status).toBe(201)
    }
    const overLimit = await create(world.env, candidate, { query: 'one too many' })
    expect(overLimit.status).toBe(400)
  })

  it('never leaks or lets one tenant delete another tenant\'s saved search', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const owner = await createSession(world.env, 'sav-owner@me.com', 'candidate')
    const stranger = await createSession(world.env, 'sav-stranger@me.com', 'candidate')
    const createRes = await create(world.env, owner, { query: 'Oracle' })
    const { savedSearchId } = (await createRes.json()) as { savedSearchId: string }

    const strangerList = await list(world.env, stranger)
    expect(strangerList.savedSearches).toHaveLength(0)

    await callHandler(searchDelete, {
      env: world.env,
      method: 'DELETE',
      url: `${base}/api/saved-searches?id=${savedSearchId}`,
      headers: { cookie: stranger },
    })
    const ownerList = await list(world.env, owner)
    expect(ownerList.savedSearches).toHaveLength(1)
  })
})
