import type { RequestContext, SessionContext } from '../_shared'
import { getSession, json, missingConfig, safeString, sha256Hex, writeAuditEvent } from '../_shared'

type AchievementProfileBody = {
  action?: unknown
  candidateAlias?: unknown
  resumeText?: unknown
  sourceLabel?: unknown
}

type AchievementProfileRow = {
  candidateAlias: string
  createdAt: string
  id: string
  profileScore: number
  sourceLabel: string
  status: 'draft' | 'review_ready' | 'verified'
  summary: string
  updatedAt: string
}

type AchievementCardRow = {
  cardType: 'credential' | 'leadership' | 'metric' | 'project'
  createdAt: string
  evidenceJson: string
  id: string
  metricsJson: string
  profileId: string
  title: string
  verificationStatus: 'pending' | 'rejected' | 'verified'
}

type CredentialVerificationRow = {
  cardId: string | null
  createdAt: string
  credentialLabel: string
  evidenceHash: string
  id: string
  issuer: string
  profileId: string
  status: 'pending' | 'rejected' | 'verified'
  updatedAt: string
}

type AchievementCardInput = {
  cardType: 'credential' | 'leadership' | 'metric' | 'project'
  evidence: string[]
  metrics: string[]
  title: string
  verificationStatus: 'pending' | 'verified'
}

const maxBodyBytes = 128 * 1024
const maxTextLength = 220
const maxResumeLength = 12000

async function readBody(request: Request): Promise<AchievementProfileBody | null> {
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > maxBodyBytes) {
    return null
  }

  try {
    return (await request.json()) as AchievementProfileBody
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
    .slice(0, maxResumeLength)
}

function cleanAction(value: unknown, fallback: string) {
  return cleanText(value, fallback).toLowerCase().replace(/[^a-z0-9_:-]/g, '').slice(0, 80)
}

function splitEvidence(text: string) {
  return text
    .split(/[\n.;]+/)
    .map((item) => cleanText(item))
    .filter(Boolean)
    .slice(0, 18)
}

function extractMetrics(text: string) {
  const matches = text.match(/(\d+%|\$\d+(?:,\d{3})*|\d+x|\d+\+|\b\d{2,}\b)/gi) ?? []
  return [...new Set(matches)].slice(0, 6)
}

function titleFromEvidence(evidence: string) {
  const words = evidence.split(' ').slice(0, 9).join(' ')
  return words.length < evidence.length ? `${words}...` : words
}

function cardTypeForEvidence(evidence: string): AchievementCardInput['cardType'] {
  const normalized = evidence.toLowerCase()
  if (/(certified|certification|degree|license|credential)/.test(normalized)) {
    return 'credential'
  }

  if (/(led|owned|managed|directed|coordinated)/.test(normalized)) {
    return 'leadership'
  }

  if (extractMetrics(evidence).length) {
    return 'metric'
  }

  return 'project'
}

function buildCards(resumeText: string): AchievementCardInput[] {
  const evidenceItems = splitEvidence(resumeText)
  const cards = evidenceItems.map((evidence) => {
    const metrics = extractMetrics(evidence)
    const cardType = cardTypeForEvidence(evidence)
    const verificationStatus: AchievementCardInput['verificationStatus'] = metrics.length || cardType === 'credential' ? 'pending' : 'verified'
    return {
      cardType,
      evidence: [evidence],
      metrics,
      title: titleFromEvidence(evidence),
      verificationStatus,
    }
  })

  return cards.length
    ? cards.slice(0, 10)
    : [
        {
          cardType: 'project',
          evidence: ['No resume evidence was provided. Add quantified project evidence before sharing.'],
          metrics: [],
          title: 'Evidence needed',
          verificationStatus: 'pending',
        },
      ]
}

function profileFromRow(row: AchievementProfileRow) {
  return {
    id: row.id,
    candidateAlias: row.candidateAlias,
    sourceLabel: row.sourceLabel,
    summary: row.summary,
    profileScore: row.profileScore,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function cardFromRow(row: AchievementCardRow) {
  return {
    id: row.id,
    profileId: row.profileId,
    cardType: row.cardType,
    title: row.title,
    evidence: parseJson(row.evidenceJson, []),
    metrics: parseJson(row.metricsJson, []),
    verificationStatus: row.verificationStatus,
    createdAt: row.createdAt,
  }
}

function verificationFromRow(row: CredentialVerificationRow) {
  return {
    id: row.id,
    profileId: row.profileId,
    cardId: row.cardId,
    credentialLabel: row.credentialLabel,
    issuer: row.issuer,
    status: row.status,
    evidenceHash: row.evidenceHash,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function fetchAchievementProfileState(env: RequestContext['env'], session: SessionContext) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const [profileRows, cardRows, verificationRows] = await Promise.all([
    env.DB
      .prepare(
        `
        SELECT
          id,
          candidate_alias AS candidateAlias,
          source_label AS sourceLabel,
          summary,
          profile_score AS profileScore,
          status,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM achievement_profiles
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 12
        `,
      )
      .bind(session.tenantId)
      .all<AchievementProfileRow>(),
    env.DB
      .prepare(
        `
        SELECT
          id,
          profile_id AS profileId,
          card_type AS cardType,
          title,
          evidence_json AS evidenceJson,
          metrics_json AS metricsJson,
          verification_status AS verificationStatus,
          created_at AS createdAt
        FROM achievement_profile_cards
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 30
        `,
      )
      .bind(session.tenantId)
      .all<AchievementCardRow>(),
    env.DB
      .prepare(
        `
        SELECT
          id,
          profile_id AS profileId,
          card_id AS cardId,
          credential_label AS credentialLabel,
          issuer,
          status,
          evidence_hash AS evidenceHash,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM credential_verifications
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 20
        `,
      )
      .bind(session.tenantId)
      .all<CredentialVerificationRow>(),
  ])

  const profiles = (profileRows.results ?? []).map(profileFromRow)
  const cards = (cardRows.results ?? []).map(cardFromRow)
  const verifications = (verificationRows.results ?? []).map(verificationFromRow)
  return {
    cards,
    profiles,
    summary: {
      latestProfileScore: profiles[0]?.profileScore ?? null,
      metricCards: cards.filter((card) => card.cardType === 'metric').length,
      pendingVerifications: verifications.filter((verification) => verification.status === 'pending').length,
      profiles: profiles.length,
      verifiedCards: cards.filter((card) => card.verificationStatus === 'verified').length,
    },
    verifications,
  }
}

async function createAchievementProfile(env: RequestContext['env'], session: SessionContext, body: AchievementProfileBody) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const candidateAlias = cleanText(body.candidateAlias, 'Candidate JFC-1428')
  const sourceLabel = cleanText(body.sourceLabel, 'Master resume evidence')
  const resumeText = cleanLongText(
    body.resumeText,
    [
      'Scaled intake workflow across 4 healthcare SaaS implementation teams and reduced launch handoff time by 28%',
      'Owned vendor governance process for product operations handoffs, executive stakeholder updates, and launch quality reviews',
      'Built reporting dashboards for launch readiness and delivery quality across 18 active projects',
      'Certified Scrum Product Owner credential under review',
    ].join('. '),
  )
  const cards = buildCards(resumeText)
  const metricCards = cards.filter((card) => card.metrics.length).length
  const verifiedCards = cards.filter((card) => card.verificationStatus === 'verified').length
  const profileScore = Math.min(100, 45 + metricCards * 10 + verifiedCards * 6)
  const summary = `${cards.length} structured achievement cards generated from ${sourceLabel}. ${metricCards} include quantified metrics.`
  const profileId = crypto.randomUUID()

  await env.DB
    .prepare(
      `
      INSERT INTO achievement_profiles (
        id,
        tenant_id,
        user_id,
        candidate_alias,
        source_label,
        summary,
        profile_score,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      profileId,
      session.tenantId,
      session.userId,
      candidateAlias,
      sourceLabel,
      summary,
      profileScore,
      profileScore >= 70 ? 'review_ready' : 'draft',
    )
    .run()

  for (const card of cards) {
    const cardId = crypto.randomUUID()
    await env.DB
      .prepare(
        `
        INSERT INTO achievement_profile_cards (
          id,
          tenant_id,
          profile_id,
          card_type,
          title,
          evidence_json,
          metrics_json,
          verification_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        cardId,
        session.tenantId,
        profileId,
        card.cardType,
        card.title,
        JSON.stringify(card.evidence),
        JSON.stringify(card.metrics),
        card.verificationStatus,
      )
      .run()

    if (card.cardType === 'credential' || card.metrics.length) {
      await env.DB
        .prepare(
          `
          INSERT INTO credential_verifications (
            id,
            tenant_id,
            profile_id,
            card_id,
            credential_label,
            issuer,
            status,
            evidence_hash
          )
          VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
          `,
        )
        .bind(
          crypto.randomUUID(),
          session.tenantId,
          profileId,
          cardId,
          card.title,
          card.cardType === 'credential' ? 'Candidate provided credential source' : 'Resume metric evidence',
          await sha256Hex(card.evidence.join('|')),
        )
        .run()
    }
  }

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'achievement_profile.created',
    actorType: 'system',
    action: 'Created dynamic achievement profile cards from resume evidence',
    riskLevel: cards.some((card) => card.verificationStatus === 'pending') ? 'medium' : 'low',
    metadata: {
      cards: cards.length,
      metricCards,
      profileId,
      profileScore,
    },
  })

  return json({ ok: true, profileId, state: await fetchAchievementProfileState(env, session) }, 201)
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before reading achievement profiles.' }, 401)
  }

  try {
    return json({
      ok: true,
      state: await fetchAchievementProfileState(env, session),
    })
  } catch (error) {
    return json(
      {
        ok: false,
        error: 'achievement_profiles_unavailable',
        message: 'Achievement profile tables are not ready yet. Apply the latest D1 migration.',
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
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before changing achievement profiles.' }, 401)
  }

  if (session.tenantType !== 'candidate') {
    return json(
      {
        ok: false,
        error: 'wrong_workspace_type',
        message: 'Achievement profiles are scoped to candidate workspaces.',
      },
      403,
    )
  }

  const body = await readBody(request)
  if (!body) {
    return json({ ok: false, error: 'payload_too_large', message: 'Achievement profile payload is limited to 128 KB.' }, 413)
  }

  const action = cleanAction(body.action, 'create_profile')
  try {
    if (action === 'create_profile') {
      return createAchievementProfile(env, session, body)
    }

    return json(
      {
        ok: false,
        error: 'unsupported_achievement_profile_action',
        message: 'Achievement profile action must be create_profile.',
      },
      400,
    )
  } catch (error) {
    return json(
      {
        ok: false,
        error: 'achievement_profile_error',
        message: 'JobsFlow could not complete the achievement profile action.',
        detail: error instanceof Error ? safeString(error.message, 'unknown_error') : 'unknown_error',
      },
      500,
    )
  }
}
