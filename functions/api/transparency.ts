import type { RequestContext, SessionContext } from '../_shared'
import { getSession, json, missingConfig, safeString, writeAuditEvent } from '../_shared'

type TransparencyBody = {
  action?: unknown
  cultureSignals?: unknown
  location?: unknown
  salaryRange?: unknown
  targetCompany?: unknown
  targetRole?: unknown
}

type SalaryBlueprintRow = {
  company: string
  confidenceScore: number
  createdAt: string
  currency: string
  employmentType: string
  id: string
  location: string
  roleTitle: string
  salaryMaxCents: number
  salaryMinCents: number
  sourceType: string
  verificationStatus: string
  workArrangement: string
}

type CultureBlueprintRow = {
  anonymityFloorMet: number
  company: string
  createdAt: string
  evidenceJson: string
  id: string
  sentiment: 'mixed' | 'negative' | 'positive'
  signalKey: string
  signalLabel: string
  verificationCount: number
}

type TransparencyReportRow = {
  createdAt: string
  cultureSummaryJson: string
  id: string
  location: string
  riskFlagsJson: string
  salaryPercentileJson: string
  targetCompany: string
  targetRole: string
}

type CultureSignalInput = {
  evidence: string[]
  label: string
  sentiment: 'mixed' | 'negative' | 'positive'
  verificationCount: number
}

const maxBodyBytes = 64 * 1024
const maxTextLength = 220

async function readBody(request: Request): Promise<TransparencyBody | null> {
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > maxBodyBytes) {
    return null
  }

  try {
    return (await request.json()) as TransparencyBody
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

function cleanKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80)
}

function cleanMoneyCents(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(0, Math.min(50000000, Math.round(value)))
}

function cleanSalaryRange(value: unknown) {
  const record = typeof value === 'object' && value ? (value as Record<string, unknown>) : {}
  const minCents = cleanMoneyCents(record.minCents, 11800000)
  const maxCents = Math.max(minCents, cleanMoneyCents(record.maxCents, 14200000))
  const currency = cleanText(record.currency, 'USD').replace(/[^A-Z]/gi, '').toUpperCase().slice(0, 3) || 'USD'
  return { currency, maxCents, minCents }
}

function cleanEvidenceList(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  const output: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    const clean = cleanText(item)
    const key = clean.toLowerCase()
    if (clean && !seen.has(key)) {
      seen.add(key)
      output.push(clean)
    }

    if (output.length >= 5) {
      break
    }
  }

  return output
}

function cleanCultureSignals(value: unknown): CultureSignalInput[] {
  if (!Array.isArray(value)) {
    return [
      {
        evidence: ['Interview loop published before onsite scheduling', 'Recruiter response expectation shared at intake'],
        label: 'Process clarity',
        sentiment: 'positive',
        verificationCount: 5,
      },
      {
        evidence: ['Launch calendar has recurring cross-functional risk reviews'],
        label: 'Operating rhythm',
        sentiment: 'positive',
        verificationCount: 4,
      },
      {
        evidence: ['Some delivery pressure reported near enterprise launches'],
        label: 'Workload boundaries',
        sentiment: 'mixed',
        verificationCount: 2,
      },
    ]
  }

  return value.slice(0, 8).map((item) => {
    const record = typeof item === 'object' && item ? (item as Record<string, unknown>) : {}
    const rawSentiment = cleanText(record.sentiment, 'mixed')
    const sentiment = rawSentiment === 'positive' || rawSentiment === 'negative' ? rawSentiment : 'mixed'
    const verificationCount = Math.max(0, Math.min(99, Math.round(Number(record.verificationCount ?? 0))))
    return {
      evidence: cleanEvidenceList(record.evidence),
      label: cleanText(record.label, 'Culture signal'),
      sentiment,
      verificationCount,
    }
  })
}

function salaryFromRow(row: SalaryBlueprintRow) {
  return {
    id: row.id,
    roleTitle: row.roleTitle,
    company: row.company,
    location: row.location,
    employmentType: row.employmentType,
    sourceType: row.sourceType,
    verificationStatus: row.verificationStatus,
    salaryMinCents: row.salaryMinCents,
    salaryMaxCents: row.salaryMaxCents,
    currency: row.currency,
    workArrangement: row.workArrangement,
    confidenceScore: row.confidenceScore,
    createdAt: row.createdAt,
  }
}

function cultureFromRow(row: CultureBlueprintRow) {
  const anonymityFloorMet = Boolean(row.anonymityFloorMet)
  return {
    id: row.id,
    company: row.company,
    signalKey: row.signalKey,
    signalLabel: row.signalLabel,
    sentiment: row.sentiment,
    evidence: anonymityFloorMet ? parseJson(row.evidenceJson, []) : ['Evidence hidden until the anonymity floor is met.'],
    verificationCount: row.verificationCount,
    anonymityFloorMet,
    createdAt: row.createdAt,
  }
}

function reportFromRow(row: TransparencyReportRow) {
  return {
    id: row.id,
    targetRole: row.targetRole,
    targetCompany: row.targetCompany,
    location: row.location,
    salaryPercentiles: parseJson(row.salaryPercentileJson, {}),
    cultureSummary: parseJson(row.cultureSummaryJson, []),
    riskFlags: parseJson(row.riskFlagsJson, []),
    createdAt: row.createdAt,
  }
}

async function fetchTransparencyState(env: RequestContext['env'], session: SessionContext) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const [salaryRows, cultureRows, reportRows] = await Promise.all([
    env.DB
      .prepare(
        `
        SELECT
          id,
          role_title AS roleTitle,
          company,
          location,
          employment_type AS employmentType,
          source_type AS sourceType,
          verification_status AS verificationStatus,
          salary_min_cents AS salaryMinCents,
          salary_max_cents AS salaryMaxCents,
          currency,
          work_arrangement AS workArrangement,
          confidence_score AS confidenceScore,
          created_at AS createdAt
        FROM salary_blueprints
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 20
        `,
      )
      .bind(session.tenantId)
      .all<SalaryBlueprintRow>(),
    env.DB
      .prepare(
        `
        SELECT
          id,
          company,
          signal_key AS signalKey,
          signal_label AS signalLabel,
          sentiment,
          evidence_json AS evidenceJson,
          verification_count AS verificationCount,
          anonymity_floor_met AS anonymityFloorMet,
          created_at AS createdAt
        FROM culture_blueprints
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 20
        `,
      )
      .bind(session.tenantId)
      .all<CultureBlueprintRow>(),
    env.DB
      .prepare(
        `
        SELECT
          id,
          target_role AS targetRole,
          target_company AS targetCompany,
          location,
          salary_percentile_json AS salaryPercentileJson,
          culture_summary_json AS cultureSummaryJson,
          risk_flags_json AS riskFlagsJson,
          created_at AS createdAt
        FROM transparency_reports
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 12
        `,
      )
      .bind(session.tenantId)
      .all<TransparencyReportRow>(),
  ])

  const salaries = (salaryRows.results ?? []).map(salaryFromRow)
  const cultureSignals = (cultureRows.results ?? []).map(cultureFromRow)
  const reports = (reportRows.results ?? []).map(reportFromRow)
  return {
    cultureSignals,
    reports,
    salaries,
    summary: {
      cultureSignals: cultureSignals.length,
      latestConfidenceScore: salaries[0]?.confidenceScore ?? null,
      reports: reports.length,
      salaryBlueprints: salaries.length,
      verifiedSalaryBlueprints: salaries.filter((item) => item.verificationStatus === 'verified').length,
    },
  }
}

function buildRiskFlags(input: { maxCents: number; minCents: number; signals: CultureSignalInput[] }) {
  const flags: string[] = []
  if (input.maxCents - input.minCents > 4000000) {
    flags.push('Salary range is wide. Confirm level, bonus, and contract terms before accepting.')
  }

  if (input.signals.some((signal) => signal.sentiment === 'mixed' && signal.verificationCount < 3)) {
    flags.push('Some culture evidence is below anonymity floor and should not be treated as verified.')
  }

  if (!flags.length) {
    flags.push('No critical transparency risk found from tenant-scoped evidence.')
  }

  return flags
}

async function createTransparencyReport(env: RequestContext['env'], session: SessionContext, body: TransparencyBody) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const targetRole = cleanText(body.targetRole)
  const targetCompany = cleanText(body.targetCompany)
  const location = cleanText(body.location, 'United States')
  const salaryRange = cleanSalaryRange(body.salaryRange)
  const cultureSignals = cleanCultureSignals(body.cultureSignals)

  if (!targetRole || !targetCompany) {
    return json(
      {
        ok: false,
        error: 'missing_transparency_target',
        message: 'Provide targetRole and targetCompany before creating a transparency blueprint.',
      },
      400,
    )
  }

  const salaryId = crypto.randomUUID()
  await env.DB
    .prepare(
      `
      INSERT INTO salary_blueprints (
        id,
        tenant_id,
        user_id,
        role_title,
        company,
        location,
        employment_type,
        source_type,
        verification_status,
        salary_min_cents,
        salary_max_cents,
        currency,
        work_arrangement,
        confidence_score
      )
      VALUES (?, ?, ?, ?, ?, ?, 'full_time', 'platform_estimate', 'anonymized', ?, ?, ?, 'hybrid', ?)
      `,
    )
    .bind(
      salaryId,
      session.tenantId,
      session.userId,
      targetRole,
      targetCompany,
      location,
      salaryRange.minCents,
      salaryRange.maxCents,
      salaryRange.currency,
      cultureSignals.some((signal) => signal.verificationCount >= 3) ? 78 : 64,
    )
    .run()

  const cultureSummary = []
  for (const signal of cultureSignals) {
    const cultureId = crypto.randomUUID()
    const anonymityFloorMet = signal.verificationCount >= 3
    const signalKey = cleanKey(signal.label)
    await env.DB
      .prepare(
        `
        INSERT INTO culture_blueprints (
          id,
          tenant_id,
          user_id,
          company,
          signal_key,
          signal_label,
          sentiment,
          evidence_json,
          verification_count,
          anonymity_floor_met
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        cultureId,
        session.tenantId,
        session.userId,
        targetCompany,
        signalKey,
        signal.label,
        signal.sentiment,
        JSON.stringify(signal.evidence),
        signal.verificationCount,
        anonymityFloorMet ? 1 : 0,
      )
      .run()

    cultureSummary.push({
      evidence: anonymityFloorMet ? signal.evidence : ['Evidence hidden until at least three independent confirmations exist.'],
      label: signal.label,
      sentiment: signal.sentiment,
      verificationCount: signal.verificationCount,
    })
  }

  const p25 = salaryRange.minCents
  const p75 = salaryRange.maxCents
  const p50 = Math.round((p25 + p75) / 2)
  const riskFlags = buildRiskFlags({ maxCents: p75, minCents: p25, signals: cultureSignals })
  const reportId = crypto.randomUUID()
  await env.DB
    .prepare(
      `
      INSERT INTO transparency_reports (
        id,
        tenant_id,
        user_id,
        target_role,
        target_company,
        location,
        salary_percentile_json,
        culture_summary_json,
        risk_flags_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      reportId,
      session.tenantId,
      session.userId,
      targetRole,
      targetCompany,
      location,
      JSON.stringify({ currency: salaryRange.currency, p25, p50, p75 }),
      JSON.stringify(cultureSummary),
      JSON.stringify(riskFlags),
    )
    .run()

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'transparency.report.created',
    actorType: 'system',
    action: 'Created salary and culture transparency blueprint',
    riskLevel: cultureSignals.some((signal) => signal.verificationCount < 3) ? 'medium' : 'low',
    metadata: {
      reportId,
      salaryId,
      targetCompany,
      targetRole,
    },
  })

  return json(
    {
      ok: true,
      reportId,
      state: await fetchTransparencyState(env, session),
    },
    201,
  )
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before reading transparency blueprints.' }, 401)
  }

  try {
    return json({
      ok: true,
      state: await fetchTransparencyState(env, session),
    })
  } catch (error) {
    return json(
      {
        ok: false,
        error: 'transparency_unavailable',
        message: 'Transparency blueprint tables are not ready yet. Apply the latest D1 migration.',
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
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before changing transparency blueprints.' }, 401)
  }

  const body = await readBody(request)
  if (!body) {
    return json({ ok: false, error: 'payload_too_large', message: 'Transparency payload is limited to 64 KB.' }, 413)
  }

  const action = cleanText(body.action, 'create_report')
  try {
    if (action === 'create_report') {
      return createTransparencyReport(env, session, body)
    }

    return json(
      {
        ok: false,
        error: 'unsupported_transparency_action',
        message: 'Transparency action must be create_report.',
      },
      400,
    )
  } catch (error) {
    return json(
      {
        ok: false,
        error: 'transparency_error',
        message: 'JobsFlow could not complete the transparency blueprint action.',
        detail: error instanceof Error ? safeString(error.message, 'unknown_error') : 'unknown_error',
      },
      500,
    )
  }
}
