import type { RequestContext, SessionContext } from '../_shared'
import { getSession, json, missingConfig, writeAuditEvent } from '../_shared'

type JobSyndicationBody = {
  action?: unknown
  company?: unknown
  description?: unknown
  employmentType?: unknown
  location?: unknown
  roleTitle?: unknown
  salaryRange?: unknown
}

type JobSyndicationPostRow = {
  company: string
  createdAt: string
  description: string
  employmentType: 'contract' | 'full_time' | 'part_time' | 'temporary'
  googleJobsPayloadJson: string
  id: string
  location: string
  partnerPayloadJson: string
  roleTitle: string
  salaryJson: string
  status: 'blocked' | 'draft' | 'published' | 'queued'
  updatedAt: string
  validationErrorsJson: string
}

type JobSyndicationDeliveryRow = {
  createdAt: string
  destination: 'google_jobs_markup' | 'partner_network' | 'workflowfy_digest'
  id: string
  postId: string
  requestJson: string
  responseJson: string
  status: 'blocked' | 'delivered' | 'failed' | 'queued'
  updatedAt: string
}

const maxBodyBytes = 96 * 1024
const maxTextLength = 220
const maxDescriptionLength = 7000

async function readBody(request: Request): Promise<JobSyndicationBody | null> {
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > maxBodyBytes) {
    return null
  }

  try {
    return (await request.json()) as JobSyndicationBody
  } catch {
    return {}
  }
}

function parseJson(value: string, fallback: unknown) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return fallback
  }
}

function cleanText(value: unknown, fallback = '') {
  if (typeof value !== 'string') {
    return fallback
  }

  return Array.from(value, (character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127 ? ' ' : character
  })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxTextLength)
}

function cleanLongText(value: unknown, fallback = '') {
  if (typeof value !== 'string') {
    return fallback
  }

  return Array.from(value, (character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127 ? ' ' : character
  })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxDescriptionLength)
}

function cleanAction(value: unknown, fallback: string) {
  return cleanText(value, fallback).toLowerCase().replace(/[^a-z0-9_:-]/g, '').slice(0, 80)
}

function cleanEmploymentType(value: unknown) {
  const employmentType = cleanAction(value, 'full_time')
  if (employmentType === 'contract' || employmentType === 'part_time' || employmentType === 'temporary') {
    return employmentType
  }

  return 'full_time'
}

function cleanMoneyCents(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(0, Math.min(100000000, Math.round(value)))
}

function cleanSalaryRange(value: unknown) {
  const record = typeof value === 'object' && value ? (value as Record<string, unknown>) : {}
  const minCents = cleanMoneyCents(record.minCents, 11800000)
  const maxCents = Math.max(minCents, cleanMoneyCents(record.maxCents, 14200000))
  const currency = cleanText(record.currency, 'USD').replace(/[^A-Z]/gi, '').toUpperCase().slice(0, 3) || 'USD'
  return { currency, maxCents, minCents }
}

function addDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

function validateJob(input: { description: string; location: string; maxCents: number; minCents: number; roleTitle: string }) {
  const errors: string[] = []
  if (input.roleTitle.length < 3) {
    errors.push('Role title is required.')
  }

  if (input.location.length < 2) {
    errors.push('Location is required before this job can be prepared for publishing.')
  }

  if (input.description.length < 180) {
    errors.push('Description must be at least 180 characters before publishing review.')
  }

  if (input.maxCents < input.minCents) {
    errors.push('Salary maximum must be greater than or equal to salary minimum.')
  }

  return errors
}

function buildGoogleJobsPayload(input: {
  company: string
  currency: string
  description: string
  employmentType: string
  location: string
  maxCents: number
  minCents: number
  roleTitle: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    baseSalary: {
      '@type': 'MonetaryAmount',
      currency: input.currency,
      value: {
        '@type': 'QuantitativeValue',
        maxValue: Math.round(input.maxCents / 100),
        minValue: Math.round(input.minCents / 100),
        unitText: 'YEAR',
      },
    },
    datePosted: new Date().toISOString(),
    description: input.description,
    employmentType: input.employmentType.toUpperCase(),
    hiringOrganization: {
      '@type': 'Organization',
      name: input.company,
    },
    jobLocation: {
      '@type': 'Place',
      address: input.location,
    },
    title: input.roleTitle,
    validThrough: addDays(30),
  }
}

function buildPartnerPayload(input: {
  company: string
  currency: string
  description: string
  employmentType: string
  location: string
  maxCents: number
  minCents: number
  roleTitle: string
}) {
  return {
    company: input.company,
    controls: {
      externalPublishMode: 'queued_for_review',
      requiresHumanApproval: true,
    },
    description: input.description,
    employmentType: input.employmentType,
    location: input.location,
    roleTitle: input.roleTitle,
    salary: {
      currency: input.currency,
      maxCents: input.maxCents,
      minCents: input.minCents,
    },
  }
}

function postFromRow(row: JobSyndicationPostRow) {
  return {
    id: row.id,
    roleTitle: row.roleTitle,
    company: row.company,
    location: row.location,
    employmentType: row.employmentType,
    description: row.description,
    salary: parseJson(row.salaryJson, {}),
    status: row.status,
    googleJobsPayload: parseJson(row.googleJobsPayloadJson, {}),
    partnerPayload: parseJson(row.partnerPayloadJson, {}),
    validationErrors: parseJson(row.validationErrorsJson, []),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function deliveryFromRow(row: JobSyndicationDeliveryRow) {
  return {
    id: row.id,
    postId: row.postId,
    destination: row.destination,
    status: row.status,
    request: parseJson(row.requestJson, {}),
    response: parseJson(row.responseJson, {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function fetchJobSyndicationState(env: RequestContext['env'], session: SessionContext) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const [postRows, deliveryRows] = await Promise.all([
    env.DB
      .prepare(
        `
        SELECT
          id,
          role_title AS roleTitle,
          company,
          location,
          employment_type AS employmentType,
          description,
          salary_json AS salaryJson,
          status,
          google_jobs_payload_json AS googleJobsPayloadJson,
          partner_payload_json AS partnerPayloadJson,
          validation_errors_json AS validationErrorsJson,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM job_syndication_posts
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 12
        `,
      )
      .bind(session.tenantId)
      .all<JobSyndicationPostRow>(),
    env.DB
      .prepare(
        `
        SELECT
          id,
          post_id AS postId,
          destination,
          status,
          request_json AS requestJson,
          response_json AS responseJson,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM job_syndication_deliveries
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 24
        `,
      )
      .bind(session.tenantId)
      .all<JobSyndicationDeliveryRow>(),
  ])

  const posts = (postRows.results ?? []).map(postFromRow)
  const deliveries = (deliveryRows.results ?? []).map(deliveryFromRow)
  return {
    deliveries,
    posts,
    summary: {
      blockedPosts: posts.filter((post) => post.status === 'blocked').length,
      queuedDeliveries: deliveries.filter((delivery) => delivery.status === 'queued').length,
      queuedPosts: posts.filter((post) => post.status === 'queued').length,
      syndicationPosts: posts.length,
    },
  }
}

async function createSyndicationPost(env: RequestContext['env'], session: SessionContext, body: JobSyndicationBody) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const roleTitle = cleanText(body.roleTitle, 'Product Operations Manager')
  const company = cleanText(body.company, 'Kora Health')
  const location = cleanText(body.location, 'United States remote/hybrid')
  const employmentType = cleanEmploymentType(body.employmentType)
  const description = cleanLongText(
    body.description,
    'Own product operations workflows for healthcare SaaS delivery, vendor governance, launch readiness, claims operations collaboration, executive communication, and cross-functional operating rhythm improvements. This role requires evidence-first communication, product analytics, and measurable implementation quality ownership.',
  )
  const salary = cleanSalaryRange(body.salaryRange)
  const validationErrors = validateJob({
    description,
    location,
    maxCents: salary.maxCents,
    minCents: salary.minCents,
    roleTitle,
  })
  const googleJobsPayload = buildGoogleJobsPayload({
    company,
    currency: salary.currency,
    description,
    employmentType,
    location,
    maxCents: salary.maxCents,
    minCents: salary.minCents,
    roleTitle,
  })
  const partnerPayload = buildPartnerPayload({
    company,
    currency: salary.currency,
    description,
    employmentType,
    location,
    maxCents: salary.maxCents,
    minCents: salary.minCents,
    roleTitle,
  })
  const status = validationErrors.length ? 'blocked' : 'queued'
  const postId = crypto.randomUUID()

  await env.DB
    .prepare(
      `
      INSERT INTO job_syndication_posts (
        id,
        tenant_id,
        user_id,
        role_title,
        company,
        location,
        employment_type,
        description,
        salary_json,
        status,
        google_jobs_payload_json,
        partner_payload_json,
        validation_errors_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      postId,
      session.tenantId,
      session.userId,
      roleTitle,
      company,
      location,
      employmentType,
      description,
      JSON.stringify(salary),
      status,
      JSON.stringify(googleJobsPayload),
      JSON.stringify(partnerPayload),
      JSON.stringify(validationErrors),
    )
    .run()

  const destinations: Array<'google_jobs_markup' | 'partner_network' | 'workflowfy_digest'> = [
    'google_jobs_markup',
    'partner_network',
    'workflowfy_digest',
  ]
  for (const destination of destinations) {
    await env.DB
      .prepare(
        `
        INSERT INTO job_syndication_deliveries (
          id,
          tenant_id,
          post_id,
          destination,
          status,
          request_json,
          response_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        crypto.randomUUID(),
        session.tenantId,
        postId,
        destination,
        validationErrors.length ? 'blocked' : 'queued',
        JSON.stringify(destination === 'google_jobs_markup' ? googleJobsPayload : partnerPayload),
        JSON.stringify({ externalDelivery: false, reason: 'Queued inside JobsFlow until publishing integration is approved.' }),
      )
      .run()
  }

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'job_syndication.post.queued',
    actorType: 'system',
    action: validationErrors.length ? 'Blocked job publishing until required details are fixed' : 'Queued validated job publishing drafts',
    riskLevel: validationErrors.length ? 'medium' : 'low',
    metadata: {
      destinations,
      postId,
      status,
      validationErrors,
    },
  })

  return json({ ok: true, postId, state: await fetchJobSyndicationState(env, session) }, 201)
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before reading job publishing drafts.' }, 401)
  }

  try {
    return json({
      ok: true,
      state: await fetchJobSyndicationState(env, session),
    })
  } catch {
    return json(
      {
        ok: false,
        error: 'job_syndication_unavailable',
        message: 'Job publishing tools are being updated. Please try again shortly.',
      },
      503,
    )
  }
}

export async function onRequestPost({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before changing job publishing drafts.' }, 401)
  }

  if (session.tenantType !== 'employer') {
    return json(
      {
        ok: false,
        error: 'wrong_workspace_type',
        message: 'Job publishing is available in employer workspaces.',
      },
      403,
    )
  }

  const body = await readBody(request)
  if (!body) {
    return json({ ok: false, error: 'payload_too_large', message: 'That job publishing request is too large.' }, 413)
  }

  const action = cleanAction(body.action, 'validate_and_queue')
  try {
    if (action === 'validate_and_queue') {
      return createSyndicationPost(env, session, body)
    }

    return json(
      {
        ok: false,
        error: 'unsupported_job_syndication_action',
        message: 'Choose a supported job publishing action.',
      },
      400,
    )
  } catch {
    return json(
      {
        ok: false,
        error: 'job_syndication_error',
        message: 'JobsFlow could not complete the job publishing action.',
      },
      500,
    )
  }
}
