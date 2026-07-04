import type { RequestContext, SessionContext } from '../_shared'
import { getSession, json, missingConfig, safeString, writeAuditEvent } from '../_shared'

type PrescreeningBody = {
  action?: unknown
  baselineSkills?: unknown
  candidateAlias?: unknown
  candidateSkills?: unknown
  company?: unknown
  knockoutCriteria?: unknown
  roleTitle?: unknown
  timelineDays?: unknown
  visaStatus?: unknown
}

type PrescreeningAgentRow = {
  company: string
  createdAt: string
  criteriaJson: string
  id: string
  knockoutJson: string
  roleTitle: string
  status: 'active' | 'archived' | 'paused'
  updatedAt: string
}

type PrescreeningSessionRow = {
  agentId: string
  candidateAlias: string
  createdAt: string
  decisionJson: string
  id: string
  score: number
  status: 'disqualified' | 'needs_review' | 'qualified'
  updatedAt: string
}

type PrescreeningMessageRow = {
  createdAt: string
  id: string
  messageText: string
  sender: 'agent' | 'candidate' | 'system'
  sessionId: string
}

type PrescreeningDecisionRow = {
  createdAt: string
  id: string
  minimumCriteriaJson: string
  recommendation: string
  risksJson: string
  sessionId: string
}

const maxBodyBytes = 64 * 1024
const maxTextLength = 220

async function readBody(request: Request): Promise<PrescreeningBody | null> {
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > maxBodyBytes) {
    return null
  }

  try {
    return (await request.json()) as PrescreeningBody
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

function cleanAction(value: unknown, fallback: string) {
  return cleanText(value, fallback).toLowerCase().replace(/[^a-z0-9_:-]/g, '').slice(0, 80)
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function cleanList(value: unknown, fallback: string[]) {
  const source = Array.isArray(value) ? value : fallback
  const output: string[] = []
  const seen = new Set<string>()
  for (const item of source) {
    const clean = cleanText(item)
    const key = normalize(clean)
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

function cleanTimelineDays(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 21
  }

  return Math.max(0, Math.min(365, Math.round(value)))
}

function agentFromRow(row: PrescreeningAgentRow) {
  return {
    id: row.id,
    roleTitle: row.roleTitle,
    company: row.company,
    criteria: parseJson(row.criteriaJson, {}),
    knockoutCriteria: parseJson(row.knockoutJson, []),
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function sessionFromRow(row: PrescreeningSessionRow) {
  return {
    id: row.id,
    agentId: row.agentId,
    candidateAlias: row.candidateAlias,
    status: row.status,
    score: row.score,
    decision: parseJson(row.decisionJson, {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function messageFromRow(row: PrescreeningMessageRow) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    sender: row.sender,
    messageText: row.messageText,
    createdAt: row.createdAt,
  }
}

function decisionFromRow(row: PrescreeningDecisionRow) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    minimumCriteria: parseJson(row.minimumCriteriaJson, []),
    risks: parseJson(row.risksJson, []),
    recommendation: row.recommendation,
    createdAt: row.createdAt,
  }
}

function evaluatePrescreen(input: {
  baselineSkills: string[]
  candidateSkills: string[]
  timelineDays: number
  visaStatus: string
}) {
  const candidateSkillSet = new Set(input.candidateSkills.map(normalize))
  const matchedSkills = input.baselineSkills.filter((skill) => candidateSkillSet.has(normalize(skill)))
  const missingSkills = input.baselineSkills.filter((skill) => !candidateSkillSet.has(normalize(skill)))
  const visaAllowed = !['needs sponsorship immediately', 'unknown'].includes(normalize(input.visaStatus))
  const timelineReady = input.timelineDays <= 45
  const skillScore = Math.round((matchedSkills.length / Math.max(1, input.baselineSkills.length)) * 65)
  const visaScore = visaAllowed ? 20 : 0
  const timelineScore = timelineReady ? 15 : Math.max(0, 15 - Math.round((input.timelineDays - 45) / 10))
  const score = Math.max(0, Math.min(100, skillScore + visaScore + timelineScore))
  const risks = [
    !visaAllowed ? 'Visa status needs recruiter review before scheduling.' : '',
    !timelineReady ? 'Candidate timeline may be too slow for the current hiring plan.' : '',
    ...missingSkills.map((skill) => `Missing baseline skill: ${skill}`),
  ].filter(Boolean)
  const status = !visaAllowed || score < 55 ? 'disqualified' : score >= 78 ? 'qualified' : 'needs_review'
  const recommendation =
    status === 'qualified'
      ? 'Advance to recruiter scheduling after human transcript review.'
      : status === 'needs_review'
        ? 'Hold for recruiter review before scheduling.'
        : 'Do not schedule until knockout risk is resolved.'

  return {
    matchedSkills,
    missingSkills,
    recommendation,
    risks,
    score,
    status,
  }
}

async function fetchPrescreeningState(env: RequestContext['env'], session: SessionContext) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const [agentRows, sessionRows, messageRows, decisionRows] = await Promise.all([
    env.DB
      .prepare(
        `
        SELECT
          id,
          role_title AS roleTitle,
          company,
          criteria_json AS criteriaJson,
          knockout_json AS knockoutJson,
          status,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM prescreening_agents
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 12
        `,
      )
      .bind(session.tenantId)
      .all<PrescreeningAgentRow>(),
    env.DB
      .prepare(
        `
        SELECT
          id,
          agent_id AS agentId,
          candidate_alias AS candidateAlias,
          status,
          score,
          decision_json AS decisionJson,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM prescreening_sessions
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 12
        `,
      )
      .bind(session.tenantId)
      .all<PrescreeningSessionRow>(),
    env.DB
      .prepare(
        `
        SELECT
          id,
          session_id AS sessionId,
          sender,
          message_text AS messageText,
          created_at AS createdAt
        FROM prescreening_messages
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 30
        `,
      )
      .bind(session.tenantId)
      .all<PrescreeningMessageRow>(),
    env.DB
      .prepare(
        `
        SELECT
          id,
          session_id AS sessionId,
          minimum_criteria_json AS minimumCriteriaJson,
          risks_json AS risksJson,
          recommendation,
          created_at AS createdAt
        FROM prescreening_decisions
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 12
        `,
      )
      .bind(session.tenantId)
      .all<PrescreeningDecisionRow>(),
  ])

  const sessions = (sessionRows.results ?? []).map(sessionFromRow)
  return {
    agents: (agentRows.results ?? []).map(agentFromRow),
    decisions: (decisionRows.results ?? []).map(decisionFromRow),
    messages: (messageRows.results ?? []).map(messageFromRow),
    sessions,
    summary: {
      activeAgents: (agentRows.results ?? []).filter((agent) => agent.status === 'active').length,
      latestScore: sessions[0]?.score ?? null,
      needsReview: sessions.filter((item) => item.status === 'needs_review').length,
      qualified: sessions.filter((item) => item.status === 'qualified').length,
      sessions: sessions.length,
    },
  }
}

async function runPrescreen(env: RequestContext['env'], session: SessionContext, body: PrescreeningBody) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const roleTitle = cleanText(body.roleTitle, 'Product Operations Manager')
  const company = cleanText(body.company, 'Kora Health')
  const baselineSkills = cleanList(body.baselineSkills, ['Product operations', 'Healthcare SaaS', 'Vendor governance'])
  const candidateAlias = cleanText(body.candidateAlias, 'Candidate JFC-1428')
  const candidateSkills = cleanList(body.candidateSkills, ['Product operations', 'Healthcare SaaS', 'Operational reporting'])
  const visaStatus = cleanText(body.visaStatus, 'authorized')
  const timelineDays = cleanTimelineDays(body.timelineDays)
  const knockoutCriteria = cleanList(body.knockoutCriteria, ['Needs sponsorship immediately', 'Cannot start within 90 days'])
  const evaluation = evaluatePrescreen({ baselineSkills, candidateSkills, timelineDays, visaStatus })
  const criteria = {
    baselineSkills,
    maxTimelineDays: 45,
    visaPolicy: 'Must be authorized or approved for recruiter review before scheduling.',
  }

  const agentId = crypto.randomUUID()
  const sessionId = crypto.randomUUID()
  await env.DB
    .prepare(
      `
      INSERT INTO prescreening_agents (
        id,
        tenant_id,
        user_id,
        role_title,
        company,
        criteria_json,
        knockout_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(agentId, session.tenantId, session.userId, roleTitle, company, JSON.stringify(criteria), JSON.stringify(knockoutCriteria))
    .run()

  await env.DB
    .prepare(
      `
      INSERT INTO prescreening_sessions (
        id,
        tenant_id,
        user_id,
        agent_id,
        candidate_alias,
        status,
        score,
        decision_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      sessionId,
      session.tenantId,
      session.userId,
      agentId,
      candidateAlias,
      evaluation.status,
      evaluation.score,
      JSON.stringify(evaluation),
    )
    .run()

  const transcript = [
    { sender: 'agent', text: `I will verify minimum fit for ${roleTitle}: work authorization, timeline, and baseline skills.` },
    { sender: 'candidate', text: `Visa status: ${visaStatus}. Available in ${timelineDays} days. Skills: ${candidateSkills.join(', ')}.` },
    { sender: 'system', text: evaluation.recommendation },
  ] as const

  for (const message of transcript) {
    await env.DB
      .prepare(
        `
        INSERT INTO prescreening_messages (
          id,
          tenant_id,
          session_id,
          sender,
          message_text
        )
        VALUES (?, ?, ?, ?, ?)
        `,
      )
      .bind(crypto.randomUUID(), session.tenantId, sessionId, message.sender, message.text)
      .run()
  }

  const decisionId = crypto.randomUUID()
  await env.DB
    .prepare(
      `
      INSERT INTO prescreening_decisions (
        id,
        tenant_id,
        session_id,
        minimum_criteria_json,
        risks_json,
        recommendation
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(decisionId, session.tenantId, sessionId, JSON.stringify(evaluation.matchedSkills), JSON.stringify(evaluation.risks), evaluation.recommendation)
    .run()

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'prescreening.session.completed',
    actorType: 'system',
    action: 'Completed conversational pre-screening session before scheduling',
    riskLevel: evaluation.status === 'disqualified' ? 'medium' : 'low',
    metadata: {
      agentId,
      decisionId,
      score: evaluation.score,
      sessionId,
      status: evaluation.status,
    },
  })

  return json({ ok: true, sessionId, state: await fetchPrescreeningState(env, session) }, 201)
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before reading pre-screening agents.' }, 401)
  }

  try {
    return json({
      ok: true,
      state: await fetchPrescreeningState(env, session),
    })
  } catch (error) {
    return json(
      {
        ok: false,
        error: 'prescreening_unavailable',
        message: 'Pre-screening tables are not ready yet. Apply the latest D1 migration.',
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
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before changing pre-screening agents.' }, 401)
  }

  if (session.tenantType !== 'employer') {
    return json(
      {
        ok: false,
        error: 'wrong_workspace_type',
        message: 'Conversational pre-screening is scoped to employer workspaces.',
      },
      403,
    )
  }

  const body = await readBody(request)
  if (!body) {
    return json({ ok: false, error: 'payload_too_large', message: 'Pre-screening payload is limited to 64 KB.' }, 413)
  }

  const action = cleanAction(body.action, 'run_prescreen')
  try {
    if (action === 'run_prescreen') {
      return runPrescreen(env, session, body)
    }

    return json(
      {
        ok: false,
        error: 'unsupported_prescreening_action',
        message: 'Pre-screening action must be run_prescreen.',
      },
      400,
    )
  } catch (error) {
    return json(
      {
        ok: false,
        error: 'prescreening_error',
        message: 'JobsFlow could not complete the pre-screening action.',
        detail: error instanceof Error ? safeString(error.message, 'unknown_error') : 'unknown_error',
      },
      500,
    )
  }
}
