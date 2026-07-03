import type { RequestContext } from '../_shared'
import { getSession, json, missingConfig, sha256Hex, writeAuditEvent } from '../_shared'

type PacketReviewBody = {
  company?: unknown
  duplicateFound?: unknown
  evidence?: unknown
  exclusions?: unknown
  jobDescription?: unknown
  requiredSkills?: unknown
  salaryFloorCents?: unknown
  salaryRange?: {
    currency?: unknown
    maxCents?: unknown
    minCents?: unknown
  }
  sensitiveAnswers?: unknown
  targetRole?: unknown
}

type CandidateProfileRow = {
  exclusions: string
  salaryFloorCents: number
}

type PacketRow = {
  createdAt: string
  evidenceJson: string
  externalActionBlockReason: string
  externalActionBlocked: number
  gapsJson: string
  id: string
  proofStrength: ProofStrength
  readinessScore: number
  requiredReviewsJson: string
  safeguardsJson: string
  skillCoverageScore: number
  state: PacketState
  targetCompany: string
  targetRole: string
  updatedAt: string
}

type SensitiveAnswer = {
  approved: boolean
  key: string
  label: string
  value: string
}

type ReviewFinding = {
  detail: string
  key: string
  requiredAction: string
  riskLevel: 'low' | 'medium' | 'high'
  type: string
}

type Safeguard = {
  detail: string
  key: string
  status: 'blocked' | 'passed' | 'review'
}

type ProofStrength = 'light' | 'moderate' | 'strong'
type PacketState = 'approved' | 'blocked' | 'candidate_approval_required'

const maxBodyBytes = 64 * 1024
const maxTextLength = 160
const maxLongTextLength = 5000
const maxListItems = 30

const skillAliases: Record<string, string[]> = {
  'claims operations': ['claims ops', 'claims workflow', 'claim operations'],
  'customer success': ['cs', 'customer experience', 'account management'],
  'healthcare saas': ['health tech', 'healthtech', 'healthcare software'],
  'product analytics': ['analytics', 'product metrics', 'usage analytics'],
  'product operations': ['product ops', 'product workflows', 'program operations'],
  'vendor governance': ['vendor management', 'vendor ops', 'supplier governance'],
}

function parseJson(value: string, fallback: unknown) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return fallback
  }
}

async function readBody(request: Request): Promise<PacketReviewBody | null> {
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > maxBodyBytes) {
    return null
  }

  try {
    return (await request.json()) as PacketReviewBody
  } catch {
    return {}
  }
}

function cleanText(value: unknown, fallback = '') {
  if (typeof value !== 'string') {
    return fallback
  }

  return stripControlCharacters(value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxTextLength)
}

function cleanLongText(value: unknown) {
  if (typeof value !== 'string') {
    return ''
  }

  return stripControlCharacters(value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLongTextLength)
}

function stripControlCharacters(value: string) {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127 ? ' ' : character
  }).join('')
}

function cleanList(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<string>()
  const items: string[] = []

  for (const item of value) {
    const clean = cleanText(item)
    const key = clean.toLowerCase()
    if (clean && !seen.has(key)) {
      seen.add(key)
      items.push(clean)
    }

    if (items.length >= maxListItems) {
      break
    }
  }

  return items
}

function cleanSensitiveAnswers(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.slice(0, 12).flatMap((item): SensitiveAnswer[] => {
    if (!item || typeof item !== 'object') {
      return []
    }

    const record = item as Record<string, unknown>
    const key = cleanText(record.key || record.label, 'answer').toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    const label = cleanText(record.label, key)
    const answerValue = cleanText(record.value)

    if (!label || !answerValue) {
      return []
    }

    return [
      {
        approved: record.approved === true,
        key,
        label,
        value: answerValue,
      },
    ]
  })
}

function cents(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null
}

function normalizeSkill(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function skillVariants(value: string) {
  const normalized = normalizeSkill(value)
  const aliases = skillAliases[normalized] ?? []
  return [normalized, ...aliases.map(normalizeSkill)].filter(Boolean)
}

function words(value: string) {
  return normalizeSkill(value).split(' ').filter((word) => word.length >= 4)
}

function isSkillCovered(requiredSkill: string, haystack: string) {
  const variants = skillVariants(requiredSkill)

  if (variants.some((variant) => haystack.includes(variant))) {
    return true
  }

  const requiredWords = words(requiredSkill)
  return requiredWords.length > 0 && requiredWords.every((word) => haystack.includes(word))
}

function quantifiedEvidenceCount(evidence: string[]) {
  return evidence.filter((item) => /(\d+%|\$\d+|\d+x|\d+\+|\b\d{2,}\b)/i.test(item)).length
}

function proofStrength(evidence: string[]): ProofStrength {
  const quantified = quantifiedEvidenceCount(evidence)

  if (evidence.length >= 5 && quantified >= 3) {
    return 'strong'
  }

  if (evidence.length >= 3 || quantified >= 1) {
    return 'moderate'
  }

  return 'light'
}

function scoreProof(strength: ProofStrength) {
  if (strength === 'strong') {
    return 100
  }

  return strength === 'moderate' ? 68 : 34
}

function evaluatePacket(input: {
  duplicateFound: boolean
  evidence: string[]
  exclusions: string[]
  requiredSkills: string[]
  salaryFloorCents: number
  salaryMaxCents: number | null
  sensitiveAnswers: SensitiveAnswer[]
  targetCompany: string
}) {
  const haystack = normalizeSkill(input.evidence.join(' '))
  const missingSkills = input.requiredSkills.filter((skill) => !isSkillCovered(skill, haystack))
  const skillCoverageScore = input.requiredSkills.length
    ? Math.round(((input.requiredSkills.length - missingSkills.length) / input.requiredSkills.length) * 100)
    : 100
  const strength = proofStrength(input.evidence)
  const gaps: ReviewFinding[] = []
  const safeguards: Safeguard[] = []
  const lowerCompany = input.targetCompany.toLowerCase()
  const exclusionHit = input.exclusions.find((exclusion) => lowerCompany.includes(exclusion.toLowerCase()))
  const unapprovedAnswers = input.sensitiveAnswers.filter((answer) => !answer.approved)

  if (missingSkills.length) {
    gaps.push({
      detail: `Missing visible evidence for: ${missingSkills.join(', ')}.`,
      key: 'missing_skill_evidence',
      requiredAction: 'Add role-specific proof before approving the packet.',
      riskLevel: 'medium',
      type: 'evidence',
    })
  }

  if (input.evidence.length < 3) {
    gaps.push({
      detail: 'Packet has fewer than three evidence bullets.',
      key: 'thin_evidence',
      requiredAction: 'Add at least three verified impact or responsibility signals.',
      riskLevel: 'medium',
      type: 'evidence',
    })
  }

  if (input.salaryFloorCents > 0 && input.salaryMaxCents !== null && input.salaryMaxCents < input.salaryFloorCents) {
    gaps.push({
      detail: 'Published compensation is below the candidate salary floor.',
      key: 'salary_floor_conflict',
      requiredAction: 'Candidate must override the salary guardrail before this role can move forward.',
      riskLevel: 'high',
      type: 'guardrail',
    })
  }

  if (exclusionHit) {
    gaps.push({
      detail: `${input.targetCompany} matches active exclusion "${exclusionHit}".`,
      key: 'company_exclusion_conflict',
      requiredAction: 'Remove the exclusion or block the packet.',
      riskLevel: 'high',
      type: 'guardrail',
    })
  }

  if (input.duplicateFound) {
    gaps.push({
      detail: 'A possible duplicate application or prior ATS record was reported.',
      key: 'duplicate_application_risk',
      requiredAction: 'Resolve the duplicate before any outreach or submission.',
      riskLevel: 'high',
      type: 'reputation',
    })
  }

  for (const answer of unapprovedAnswers) {
    gaps.push({
      detail: `${answer.label} has not been approved by the candidate.`,
      key: `answer_review_${answer.key}`,
      requiredAction: 'Candidate must approve or edit the sensitive answer.',
      riskLevel: 'medium',
      type: 'answer_review',
    })
  }

  safeguards.push({
    detail: input.salaryFloorCents > 0 ? 'Salary guardrail was evaluated against the candidate floor.' : 'No salary floor has been set.',
    key: 'salary_floor_checked',
    status:
      input.salaryFloorCents > 0 && input.salaryMaxCents !== null && input.salaryMaxCents < input.salaryFloorCents
        ? 'blocked'
        : 'passed',
  })
  safeguards.push({
    detail: exclusionHit ? 'Company exclusion conflict found.' : 'No company exclusion conflict found.',
    key: 'company_exclusions_checked',
    status: exclusionHit ? 'blocked' : 'passed',
  })
  safeguards.push({
    detail: input.duplicateFound ? 'Duplicate risk needs review.' : 'Duplicate risk check is clear.',
    key: 'duplicate_prevention_checked',
    status: input.duplicateFound ? 'blocked' : 'passed',
  })
  safeguards.push({
    detail: unapprovedAnswers.length ? 'One or more sensitive answers still need approval.' : 'Sensitive answers are approved or absent.',
    key: 'sensitive_answer_review',
    status: unapprovedAnswers.length ? 'review' : 'passed',
  })

  const highRiskGap = gaps.some((gap) => gap.riskLevel === 'high')
  const state: PacketState = highRiskGap ? 'blocked' : gaps.length ? 'candidate_approval_required' : 'approved'
  const passedSafeguards = safeguards.filter((safeguard) => safeguard.status === 'passed').length
  const safeguardScore = Math.round((passedSafeguards / safeguards.length) * 100)
  const readinessScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(skillCoverageScore * 0.45 + scoreProof(strength) * 0.25 + safeguardScore * 0.3) - gaps.length * 3,
    ),
  )

  return {
    gaps,
    proofStrength: strength,
    readinessScore,
    safeguards,
    skillCoverageScore,
    state,
  }
}

function packetFromRow(row: PacketRow) {
  return {
    id: row.id,
    targetRole: row.targetRole,
    targetCompany: row.targetCompany,
    state: row.state,
    readinessScore: row.readinessScore,
    skillCoverageScore: row.skillCoverageScore,
    proofStrength: row.proofStrength,
    evidence: parseJson(row.evidenceJson, []),
    gaps: parseJson(row.gapsJson, []),
    safeguards: parseJson(row.safeguardsJson, []),
    requiredReviews: parseJson(row.requiredReviewsJson, []),
    externalActionBlocked: Boolean(row.externalActionBlocked),
    externalActionBlockReason: row.externalActionBlockReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before reading packet reviews.' }, 401)
  }

  const rows = await env.DB
    .prepare(
      `
      SELECT
        id,
        target_role AS targetRole,
        target_company AS targetCompany,
        state,
        readiness_score AS readinessScore,
        skill_coverage_score AS skillCoverageScore,
        proof_strength AS proofStrength,
        evidence_json AS evidenceJson,
        gaps_json AS gapsJson,
        safeguards_json AS safeguardsJson,
        required_reviews_json AS requiredReviewsJson,
        external_action_blocked AS externalActionBlocked,
        external_action_block_reason AS externalActionBlockReason,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM application_packets
      WHERE tenant_id = ?
      ORDER BY created_at DESC
      LIMIT 25
      `,
    )
    .bind(session.tenantId)
    .all<PacketRow>()

  return json({
    ok: true,
    packets: (rows.results ?? []).map(packetFromRow),
  })
}

export async function onRequestPost({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before reviewing a packet.' }, 401)
  }

  if (session.tenantType !== 'candidate') {
    return json(
      {
        ok: false,
        error: 'wrong_workspace_type',
        message: 'Application packet review is currently scoped to candidate workspaces.',
      },
      403,
    )
  }

  const body = await readBody(request)
  if (!body) {
    return json({ ok: false, error: 'payload_too_large', message: 'Packet review payload is limited to 64 KB.' }, 413)
  }

  const targetRole = cleanText(body.targetRole)
  const targetCompany = cleanText(body.company)
  if (!targetRole || !targetCompany) {
    return json(
      {
        ok: false,
        error: 'missing_target',
        message: 'Provide both targetRole and company before packet review.',
      },
      400,
    )
  }

  const profile = await env.DB
    .prepare(
      `
      SELECT salary_floor_cents AS salaryFloorCents, exclusions
      FROM candidate_profiles
      WHERE tenant_id = ? AND user_id = ?
      LIMIT 1
      `,
    )
    .bind(session.tenantId, session.userId)
    .first<CandidateProfileRow>()

  const requestSalaryFloor = cents(body.salaryFloorCents)
  const profileSalaryFloor = typeof profile?.salaryFloorCents === 'number' ? profile.salaryFloorCents : 0
  const salaryFloorCents = requestSalaryFloor ?? profileSalaryFloor
  const salaryMinCents = cents(body.salaryRange?.minCents)
  const salaryMaxCents = cents(body.salaryRange?.maxCents)
  if (salaryMinCents !== null && salaryMaxCents !== null && salaryMinCents > salaryMaxCents) {
    return json(
      {
        ok: false,
        error: 'invalid_salary_range',
        message: 'salaryRange.minCents cannot be greater than salaryRange.maxCents.',
      },
      400,
    )
  }

  const profileExclusions = Array.isArray(parseJson(profile?.exclusions ?? '[]', []))
    ? (parseJson(profile?.exclusions ?? '[]', []) as unknown[])
    : []
  const exclusions = [...cleanList(profileExclusions), ...cleanList(body.exclusions)]
  const evidence = cleanList(body.evidence)
  const requiredSkills = cleanList(body.requiredSkills)
  const jobDescription = cleanLongText(body.jobDescription)
  const sensitiveAnswers = cleanSensitiveAnswers(body.sensitiveAnswers)
  const duplicateFound = body.duplicateFound === true

  const evaluation = evaluatePacket({
    duplicateFound,
    evidence,
    exclusions,
    requiredSkills,
    salaryFloorCents,
    salaryMaxCents,
    sensitiveAnswers,
    targetCompany,
  })
  const packetId = crypto.randomUUID()
  const jobDescriptionHash = jobDescription ? await sha256Hex(jobDescription) : null
  const externalActionBlockReason = 'prototype_external_actions_disabled'

  await env.DB
    .prepare(
      `
      INSERT INTO application_packets (
        id,
        tenant_id,
        user_id,
        target_role,
        target_company,
        state,
        readiness_score,
        skill_coverage_score,
        proof_strength,
        salary_floor_cents,
        salary_min_cents,
        salary_max_cents,
        evidence_json,
        gaps_json,
        safeguards_json,
        required_reviews_json,
        external_action_blocked,
        external_action_block_reason
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      packetId,
      session.tenantId,
      session.userId,
      targetRole,
      targetCompany,
      evaluation.state,
      evaluation.readinessScore,
      evaluation.skillCoverageScore,
      evaluation.proofStrength,
      salaryFloorCents,
      salaryMinCents,
      salaryMaxCents,
      JSON.stringify(evidence),
      JSON.stringify(evaluation.gaps),
      JSON.stringify(evaluation.safeguards),
      JSON.stringify(evaluation.gaps),
      1,
      externalActionBlockReason,
    )
    .run()

  for (const gap of evaluation.gaps) {
    await env.DB
      .prepare(
        `
        INSERT INTO review_gates (
          id, tenant_id, user_id, packet_id, gate_type, reason, required_action, risk_level
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        crypto.randomUUID(),
        session.tenantId,
        session.userId,
        packetId,
        gap.type,
        gap.detail,
        gap.requiredAction,
        gap.riskLevel,
      )
      .run()
  }

  await env.DB
    .prepare(
      `
      INSERT INTO state_transitions (
        id, tenant_id, user_id, subject_type, subject_id, from_state, to_state, reason, metadata
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      crypto.randomUUID(),
      session.tenantId,
      session.userId,
      'application_packet',
      packetId,
      'draft',
      evaluation.state,
      evaluation.gaps.length ? 'Packet requires review before external action.' : 'Packet passed evidence review.',
      JSON.stringify({
        jobDescriptionHash,
        readinessScore: evaluation.readinessScore,
        skillCoverageScore: evaluation.skillCoverageScore,
        externalActionBlocked: true,
      }),
    )
    .run()

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'packet.reviewed',
    actorType: 'system',
    action: 'Reviewed candidate application packet evidence and guardrails',
    riskLevel: evaluation.state === 'blocked' ? 'high' : evaluation.state === 'candidate_approval_required' ? 'medium' : 'low',
    metadata: {
      packetId,
      targetRole,
      targetCompany,
      state: evaluation.state,
      readinessScore: evaluation.readinessScore,
      skillCoverageScore: evaluation.skillCoverageScore,
      reviewGateCount: evaluation.gaps.length,
      externalActionBlocked: true,
    },
  })

  return json(
    {
      ok: true,
      packet: {
        id: packetId,
        targetRole,
        targetCompany,
        state: evaluation.state,
        readinessScore: evaluation.readinessScore,
        skillCoverageScore: evaluation.skillCoverageScore,
        proofStrength: evaluation.proofStrength,
        evidence,
        gaps: evaluation.gaps,
        safeguards: evaluation.safeguards,
        requiredReviews: evaluation.gaps,
        externalActionBlocked: true,
        externalActionBlockReason,
      },
    },
    201,
  )
}
