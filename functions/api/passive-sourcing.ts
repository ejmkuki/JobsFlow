import type { RequestContext, SessionContext } from '../_shared'
import { getSession, json, missingConfig, safeString, sha256Hex, writeAuditEvent } from '../_shared'

type PassiveSourcingBody = {
  action?: unknown
  achievements?: unknown
  cardId?: unknown
  headline?: unknown
  reason?: unknown
  requesterCompany?: unknown
  requesterEmail?: unknown
  requesterName?: unknown
  skills?: unknown
  targetRoles?: unknown
}

type PassiveCardRow = {
  anonymousHandle: string
  contactReleaseStatus: 'approved' | 'locked' | 'pending'
  createdAt: string
  currentEmployerMasked: number
  expiresAt: string
  headline: string
  id: string
  maskedAchievementsJson: string
  maskedSkillsJson: string
  targetRolesJson: string
  updatedAt: string
  visibility: 'paused' | 'private' | 'recruiter_marketplace'
}

type BroadcastRow = {
  cardId: string
  channel: string
  contactRedactionsJson: string
  createdAt: string
  id: string
  payloadJson: string
  status: 'blocked' | 'queued' | 'reviewed' | 'sent'
}

type ReleaseRequestRow = {
  cardId: string
  createdAt: string
  id: string
  reason: string
  requesterCompany: string
  requesterName: string
  status: 'approved' | 'denied' | 'pending'
  updatedAt: string
}

const maxBodyBytes = 64 * 1024
const maxTextLength = 220

async function readBody(request: Request): Promise<PassiveSourcingBody | null> {
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > maxBodyBytes) {
    return null
  }

  try {
    return (await request.json()) as PassiveSourcingBody
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

function cleanKey(value: unknown, fallback = '') {
  return cleanText(value, fallback).toLowerCase().replace(/[^a-z0-9_.:-]/g, '').slice(0, 80)
}

function cleanList(value: unknown, fallback: string[]) {
  const source = Array.isArray(value) ? value : fallback
  const output: string[] = []
  const seen = new Set<string>()
  for (const item of source) {
    const clean = cleanText(item)
    const key = clean.toLowerCase()
    if (clean && !seen.has(key)) {
      seen.add(key)
      output.push(clean)
    }

    if (output.length >= 12) {
      break
    }
  }

  return output
}

async function anonymousHandle(session: SessionContext) {
  const digest = await sha256Hex(`${session.tenantId}:${session.userId}:passive-sourcing`)
  return `JFC-${digest.slice(0, 8).toUpperCase()}`
}

function cardFromRow(row: PassiveCardRow) {
  return {
    id: row.id,
    anonymousHandle: row.anonymousHandle,
    headline: row.headline,
    targetRoles: parseJson(row.targetRolesJson, []),
    maskedSkills: parseJson(row.maskedSkillsJson, []),
    maskedAchievements: parseJson(row.maskedAchievementsJson, []),
    visibility: row.visibility,
    contactReleaseStatus: row.contactReleaseStatus,
    currentEmployerMasked: Boolean(row.currentEmployerMasked),
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function broadcastFromRow(row: BroadcastRow) {
  return {
    id: row.id,
    cardId: row.cardId,
    channel: row.channel,
    status: row.status,
    payload: parseJson(row.payloadJson, {}),
    contactRedactions: parseJson(row.contactRedactionsJson, []),
    createdAt: row.createdAt,
  }
}

function requestFromRow(row: ReleaseRequestRow) {
  return {
    id: row.id,
    cardId: row.cardId,
    requesterName: row.requesterName,
    requesterCompany: row.requesterCompany,
    reason: row.reason,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function fetchPassiveSourcingState(env: RequestContext['env'], session: SessionContext) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const [cardRows, broadcastRows, requestRows] = await Promise.all([
    env.DB
      .prepare(
        `
        SELECT
          id,
          anonymous_handle AS anonymousHandle,
          headline,
          target_roles_json AS targetRolesJson,
          masked_skills_json AS maskedSkillsJson,
          masked_achievements_json AS maskedAchievementsJson,
          visibility,
          contact_release_status AS contactReleaseStatus,
          current_employer_masked AS currentEmployerMasked,
          expires_at AS expiresAt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM passive_sourcing_cards
        WHERE tenant_id = ?
        ORDER BY updated_at DESC
        LIMIT 12
        `,
      )
      .bind(session.tenantId)
      .all<PassiveCardRow>(),
    env.DB
      .prepare(
        `
        SELECT
          id,
          card_id AS cardId,
          channel,
          status,
          payload_json AS payloadJson,
          contact_redactions_json AS contactRedactionsJson,
          created_at AS createdAt
        FROM recruiter_card_broadcasts
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 20
        `,
      )
      .bind(session.tenantId)
      .all<BroadcastRow>(),
    env.DB
      .prepare(
        `
        SELECT
          id,
          card_id AS cardId,
          requester_name AS requesterName,
          requester_company AS requesterCompany,
          reason,
          status,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM contact_release_requests
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 20
        `,
      )
      .bind(session.tenantId)
      .all<ReleaseRequestRow>(),
  ])

  const cards = (cardRows.results ?? []).map(cardFromRow)
  const broadcasts = (broadcastRows.results ?? []).map(broadcastFromRow)
  const releaseRequests = (requestRows.results ?? []).map(requestFromRow)
  return {
    broadcasts,
    cards,
    releaseRequests,
    summary: {
      activeCards: cards.filter((card) => card.visibility === 'recruiter_marketplace').length,
      broadcasts: broadcasts.length,
      lockedCards: cards.filter((card) => card.contactReleaseStatus === 'locked').length,
      pendingReleaseRequests: releaseRequests.filter((request) => request.status === 'pending').length,
      privateCards: cards.filter((card) => card.visibility === 'private').length,
    },
  }
}

async function createPassiveCard(env: RequestContext['env'], session: SessionContext, body: PassiveSourcingBody) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const headline = cleanText(body.headline, 'Anonymous product operations leader open to vetted healthcare SaaS roles')
  const targetRoles = cleanList(body.targetRoles, ['Product Operations Manager', 'Implementation Operations Lead'])
  const skills = cleanList(body.skills, ['Product operations', 'Healthcare SaaS', 'Vendor governance', 'Executive communication'])
  const achievements = cleanList(body.achievements, [
    'Reduced launch handoff time by 28%',
    'Built readiness reporting across 18 active projects',
    'Owned vendor governance without exposing current employer details',
  ])

  if (!headline) {
    return json({ ok: false, error: 'missing_passive_card_headline', message: 'Provide a headline for the sourcing card.' }, 400)
  }

  const cardId = crypto.randomUUID()
  await env.DB
    .prepare(
      `
      INSERT INTO passive_sourcing_cards (
        id,
        tenant_id,
        user_id,
        anonymous_handle,
        headline,
        target_roles_json,
        masked_skills_json,
        masked_achievements_json,
        expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+45 days'))
      `,
    )
    .bind(
      cardId,
      session.tenantId,
      session.userId,
      await anonymousHandle(session),
      headline,
      JSON.stringify(targetRoles),
      JSON.stringify(skills),
      JSON.stringify(achievements),
    )
    .run()

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'passive_sourcing.card.created',
    actorType: 'system',
    action: 'Created anonymous passive sourcing card with contact details locked',
    riskLevel: 'low',
    metadata: {
      cardId,
      redactions: ['name', 'email', 'phone', 'current_employer'],
    },
  })

  return json({ cardId, ok: true, state: await fetchPassiveSourcingState(env, session) }, 201)
}

async function latestCardId(env: RequestContext['env'], session: SessionContext, inputCardId: unknown) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const explicitCardId = cleanText(inputCardId)
  if (explicitCardId) {
    return explicitCardId
  }

  const row = await env.DB
    .prepare(
      `
      SELECT id
      FROM passive_sourcing_cards
      WHERE tenant_id = ?
      ORDER BY updated_at DESC
      LIMIT 1
      `,
    )
    .bind(session.tenantId)
    .first<{ id: string }>()

  return row?.id ?? ''
}

async function broadcastCard(env: RequestContext['env'], session: SessionContext, body: PassiveSourcingBody) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const cardId = await latestCardId(env, session, body.cardId)
  if (!cardId) {
    return json({ ok: false, error: 'passive_card_not_found', message: 'Create a passive sourcing card before broadcasting it.' }, 404)
  }

  const card = await env.DB
    .prepare(
      `
      SELECT
        id,
        anonymous_handle AS anonymousHandle,
        headline,
        target_roles_json AS targetRolesJson,
        masked_skills_json AS maskedSkillsJson,
        masked_achievements_json AS maskedAchievementsJson
      FROM passive_sourcing_cards
      WHERE id = ?
        AND tenant_id = ?
      LIMIT 1
      `,
    )
    .bind(cardId, session.tenantId)
    .first<Pick<PassiveCardRow, 'anonymousHandle' | 'headline' | 'id' | 'maskedAchievementsJson' | 'maskedSkillsJson' | 'targetRolesJson'>>()

  if (!card) {
    return json({ ok: false, error: 'passive_card_not_found', message: 'JobsFlow could not find that tenant-scoped sourcing card.' }, 404)
  }

  const payload = {
    anonymousHandle: card.anonymousHandle,
    headline: card.headline,
    targetRoles: parseJson(card.targetRolesJson, []),
    skills: parseJson(card.maskedSkillsJson, []),
    achievements: parseJson(card.maskedAchievementsJson, []),
  }
  const redactions = ['candidate_name', 'email', 'phone', 'current_employer', 'linkedin_url', 'resume_file']
  const broadcastId = crypto.randomUUID()
  await env.DB
    .prepare(
      `
      INSERT INTO recruiter_card_broadcasts (
        id,
        tenant_id,
        user_id,
        card_id,
        channel,
        status,
        payload_json,
        contact_redactions_json
      )
      VALUES (?, ?, ?, ?, 'internal_marketplace', 'queued', ?, ?)
      `,
    )
    .bind(broadcastId, session.tenantId, session.userId, cardId, JSON.stringify(payload), JSON.stringify(redactions))
    .run()

  await env.DB
    .prepare(
      `
      UPDATE passive_sourcing_cards
      SET visibility = 'recruiter_marketplace',
          updated_at = datetime('now')
      WHERE id = ?
        AND tenant_id = ?
      `,
    )
    .bind(cardId, session.tenantId)
    .run()

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'passive_sourcing.card.broadcast_queued',
    actorType: 'system',
    action: 'Queued anonymous passive sourcing card for recruiter marketplace review',
    riskLevel: 'medium',
    metadata: {
      broadcastId,
      cardId,
      redactions,
    },
  })

  return json({ broadcastId, ok: true, state: await fetchPassiveSourcingState(env, session) }, 201)
}

async function requestContactRelease(env: RequestContext['env'], session: SessionContext, body: PassiveSourcingBody) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const cardId = await latestCardId(env, session, body.cardId)
  const requesterName = cleanText(body.requesterName, 'Verified recruiter')
  const requesterCompany = cleanText(body.requesterCompany, 'Healthcare SaaS employer')
  const requesterEmail = cleanText(body.requesterEmail, 'recruiter@example.com').toLowerCase()
  const reason = cleanText(body.reason, 'Role aligns with the anonymous card target roles and salary floor.')

  if (!cardId) {
    return json({ ok: false, error: 'passive_card_not_found', message: 'Create a passive sourcing card before requesting contact release.' }, 404)
  }

  const requestId = crypto.randomUUID()
  await env.DB
    .prepare(
      `
      INSERT INTO contact_release_requests (
        id,
        tenant_id,
        card_id,
        requester_name,
        requester_company,
        requester_email_hash,
        reason
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(requestId, session.tenantId, cardId, requesterName, requesterCompany, await sha256Hex(requesterEmail), reason)
    .run()

  await env.DB
    .prepare(
      `
      UPDATE passive_sourcing_cards
      SET contact_release_status = 'pending',
          updated_at = datetime('now')
      WHERE id = ?
        AND tenant_id = ?
      `,
    )
    .bind(cardId, session.tenantId)
    .run()

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'passive_sourcing.contact_release.requested',
    actorType: 'system',
    action: 'Recorded recruiter contact release request for candidate approval',
    riskLevel: 'medium',
    metadata: {
      cardId,
      requestId,
      requesterCompany,
    },
  })

  return json({ ok: true, requestId, state: await fetchPassiveSourcingState(env, session) }, 201)
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before reading passive sourcing cards.' }, 401)
  }

  try {
    return json({
      ok: true,
      state: await fetchPassiveSourcingState(env, session),
    })
  } catch (error) {
    return json(
      {
        ok: false,
        error: 'passive_sourcing_unavailable',
        message: 'Passive sourcing tables are not ready yet. Apply the latest D1 migration.',
        detail: error instanceof Error ? safeString(error.message, 'unknown_error') : 'unknown_error',
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
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before changing passive sourcing cards.' }, 401)
  }

  if (session.tenantType !== 'candidate') {
    return json(
      {
        ok: false,
        error: 'wrong_workspace_type',
        message: 'Passive sourcing cards are scoped to candidate workspaces.',
      },
      403,
    )
  }

  const body = await readBody(request)
  if (!body) {
    return json({ ok: false, error: 'payload_too_large', message: 'Passive sourcing payload is limited to 64 KB.' }, 413)
  }

  const action = cleanKey(body.action, 'create_card')
  try {
    if (action === 'create_card') {
      return createPassiveCard(env, session, body)
    }

    if (action === 'broadcast_card') {
      return broadcastCard(env, session, body)
    }

    if (action === 'request_contact_release') {
      return requestContactRelease(env, session, body)
    }

    return json(
      {
        ok: false,
        error: 'unsupported_passive_sourcing_action',
        message: 'Passive sourcing action must be create_card, broadcast_card, or request_contact_release.',
      },
      400,
    )
  } catch (error) {
    return json(
      {
        ok: false,
        error: 'passive_sourcing_error',
        message: 'JobsFlow could not complete the passive sourcing action.',
        detail: error instanceof Error ? safeString(error.message, 'unknown_error') : 'unknown_error',
      },
      500,
    )
  }
}
