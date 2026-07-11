import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../functions/_shared'
import { callHandler, createTestWorld, extractSessionCookie } from './helpers/worker'
import { onRequestPost as sessionPost } from '../functions/api/session'
import { onRequestGet as jobsGet, onRequestPost as jobsPost, onRequestPut as jobsPut } from '../functions/api/jobs'
import { onRequestPost as intakePost } from '../functions/api/job-intake'

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

describe('nice-to-have skills on job postings', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips must-have and nice-to-have skills separately through create, get, and update', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'nth1@co.com', 'employer')

    const created = await callHandler(jobsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/jobs`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({
        title: 'DBA',
        requiredSkills: ['Oracle', 'RMAN'],
        niceToHaveSkills: ['Terraform', 'Kubernetes'],
      }),
    })
    expect(created.status).toBe(201)
    const createdBody = (await created.json()) as { job: { id: string; requiredSkills: string[]; niceToHaveSkills: string[] } }
    expect(createdBody.job.requiredSkills).toEqual(['Oracle', 'RMAN'])
    expect(createdBody.job.niceToHaveSkills).toEqual(['Terraform', 'Kubernetes'])
    const jobId = createdBody.job.id

    const fetched = await callHandler(jobsGet, { env: world.env, url: `${base}/api/jobs?id=${jobId}`, headers: { cookie: employer } })
    const fetchedBody = (await fetched.json()) as { job: { niceToHaveSkills: string[] } }
    expect(fetchedBody.job.niceToHaveSkills).toEqual(['Terraform', 'Kubernetes'])

    const updated = await callHandler(jobsPut, {
      env: world.env,
      method: 'PUT',
      url: `${base}/api/jobs`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({
        id: jobId,
        title: 'DBA',
        requiredSkills: ['Oracle', 'RMAN'],
        niceToHaveSkills: ['AWS'],
      }),
    })
    const updatedBody = (await updated.json()) as { job: { niceToHaveSkills: string[] } }
    expect(updatedBody.job.niceToHaveSkills).toEqual(['AWS'])
  })

  it('defaults nice-to-have skills to an empty list when omitted', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap' })
    const employer = await createSession(world.env, 'nth2@co.com', 'employer')

    const created = await callHandler(jobsPost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/jobs`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ title: 'DBA', requiredSkills: ['Oracle'] }),
    })
    const body = (await created.json()) as { job: { niceToHaveSkills: string[] } }
    expect(body.job.niceToHaveSkills).toEqual([])
  })

  it('AI intake splits must-have from nice-to-have and never double-lists a skill in both', async () => {
    const world = createTestWorld({ AUTH_BOOTSTRAP_TOKEN: 'test-bootstrap', ANTHROPIC_API_KEY: 'test-key' })
    const employer = await createSession(world.env, 'nth3@co.com', 'employer')

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            content: [
              {
                type: 'text',
                text:
                  '{"skills": ["Oracle", "RMAN"], "niceToHaveSkills": ["Terraform", "Oracle"], ' +
                  '"description": "Own our Oracle fleet. Required: Oracle, RMAN. Preferred: Terraform experience."}',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )

    const res = await callHandler(intakePost, {
      env: world.env,
      method: 'POST',
      url: `${base}/api/job-intake`,
      headers: { ...jsonHeaders, cookie: employer },
      body: JSON.stringify({ text: 'Own our Oracle fleet. Required: Oracle, RMAN. Preferred: Terraform experience.'.repeat(2) }),
    })
    const body = (await res.json()) as { suggestion: { skills: string[]; niceToHaveSkills: string[] } }
    expect(body.suggestion.skills).toEqual(['Oracle', 'RMAN'])
    // "Oracle" was echoed back in both lists by the model — must-have wins, no duplicate.
    expect(body.suggestion.niceToHaveSkills).toEqual(['Terraform'])
  })
})
