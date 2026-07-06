import type { RequestContext, SessionContext } from '../_shared'
import { getSession, json, missingConfig, sha256Hex, writeAuditEvent } from '../_shared'

type ResumeIntelligenceBody = {
  company?: unknown
  jobDescription?: unknown
  requiredSkills?: unknown
  resumeArtifactId?: unknown
  resumeText?: unknown
  salaryRange?: {
    currency?: unknown
    maxCents?: unknown
    minCents?: unknown
  }
  targetRole?: unknown
}

type ResumeFactSetRow = {
  achievementsJson: string
  createdAt: string
  factsJson: string
  id: string
  metricsJson: string
  parserVersion: string
  resumeArtifactId: string | null
  skillsJson: string
  sourceHash: string
  sourceKind: 'artifact_metadata' | 'manual_seed' | 'pasted_text'
  sourceLabel: string
  warningsJson: string
}

type JobTargetRow = {
  company: string
  compensationJson: string
  createdAt: string
  descriptionExcerpt: string
  descriptionHash: string
  id: string
  requiredSkillsJson: string
  responsibilitiesJson: string
  senioritySignalsJson: string
  title: string
}

type VectorDocumentRow = {
  createdAt: string
  id: string
  metadataJson: string
  namespace: string
  sourceId: string
  sourceType: 'analysis' | 'job_target' | 'resume_fact_set'
  status: 'embedded' | 'failed' | 'pending' | 'skipped'
  textExcerpt: string
  textHash: string
  updatedAt: string
  vectorKey: string
}

type ResumeTailoringAnalysisRow = {
  coachableGapsJson: string
  createdAt: string
  evidenceJson: string
  id: string
  jobTargetId: string
  matchedSkillsJson: string
  missingSkillsJson: string
  proofStrength: 'light' | 'moderate' | 'strong'
  readinessScore: number
  recommendationsJson: string
  resumeFactSetId: string
  semanticOverlapScore: number
  skillCoverageScore: number
  vectorDocumentsJson: string
  workflowRunId: string | null
}

type ResumeArtifactRow = {
  filename: string
  id: string
  sourceHash: string
}

type SkillDefinition = {
  aliases: string[]
  category: string
  skill: string
}

type Gap = {
  evidenceHint: string
  requiredAction: string
  skill: string
  severity: 'high' | 'medium'
}

type Recommendation = {
  detail: string
  priority: 'high' | 'medium' | 'low'
  title: string
}

const maxBodyBytes = 128 * 1024
const maxLongTextLength = 12000
const maxTextLength = 180
const parserVersion = 'jobsflow-resume-intel-2026-07-04'

const skillTaxonomy: SkillDefinition[] = [
  { skill: 'Product operations', category: 'operations', aliases: ['product ops', 'operating rhythm', 'workflow design'] },
  { skill: 'Healthcare SaaS', category: 'domain', aliases: ['healthcare software', 'health tech', 'healthtech'] },
  { skill: 'Vendor governance', category: 'operations', aliases: ['vendor management', 'vendor ops', 'supplier governance'] },
  { skill: 'Claims operations', category: 'domain', aliases: ['claims ops', 'claims workflow', 'claim operations'] },
  { skill: 'Customer success', category: 'go-to-market', aliases: ['customer experience', 'account management', 'renewal'] },
  { skill: 'Product analytics', category: 'analytics', aliases: ['usage analytics', 'product metrics', 'analytics'] },
  { skill: 'AI rollout', category: 'delivery', aliases: ['ai implementation', 'ai adoption', 'model rollout'] },
  { skill: 'Executive communication', category: 'leadership', aliases: ['stakeholder communication', 'executive stakeholders'] },
  { skill: 'Cross-functional leadership', category: 'leadership', aliases: ['cross functional', 'partnered with', 'matrixed'] },
  { skill: 'Revenue operations', category: 'go-to-market', aliases: ['revops', 'revenue process', 'sales operations'] },
  { skill: 'Implementation operations', category: 'delivery', aliases: ['implementation ops', 'launch operations', 'delivery operations'] },
  { skill: 'Process improvement', category: 'operations', aliases: ['process redesign', 'workflow improvement', 'operational improvement'] },
  { skill: 'Data reporting', category: 'analytics', aliases: ['dashboards', 'reporting', 'metrics reporting'] },
  { skill: 'Program management', category: 'delivery', aliases: ['program coordination', 'project management', 'delivery management'] },
  { skill: 'Change management', category: 'leadership', aliases: ['enablement', 'adoption', 'training'] },
]

const actionVerbs = [
  'accelerated',
  'built',
  'created',
  'decreased',
  'delivered',
  'designed',
  'drove',
  'improved',
  'increased',
  'launched',
  'led',
  'managed',
  'owned',
  'partnered',
  'reduced',
  'scaled',
  'shipped',
  'standardized',
]

const responsibilityVerbs = ['build', 'coordinate', 'define', 'drive', 'lead', 'manage', 'own', 'partner', 'scale', 'translate']

function parseJson(value: string, fallback: unknown) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return fallback
  }
}

async function readBody(request: Request): Promise<ResumeIntelligenceBody | null> {
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > maxBodyBytes) {
    return null
  }

  try {
    return (await request.json()) as ResumeIntelligenceBody
  } catch {
    return {}
  }
}

function stripControlCharacters(value: string) {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127 ? ' ' : character
  }).join('')
}

function cleanText(value: unknown, fallback = '') {
  if (typeof value !== 'string') {
    return fallback
  }

  return stripControlCharacters(value).replace(/\s+/g, ' ').trim().slice(0, maxTextLength)
}

function cleanLongText(value: unknown) {
  if (typeof value !== 'string') {
    return ''
  }

  return stripControlCharacters(value).replace(/\s+/g, ' ').trim().slice(0, maxLongTextLength)
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function uniqueStrings(values: string[], limit = 40) {
  const seen = new Set<string>()
  const clean: string[] = []

  for (const value of values) {
    const normalized = normalize(value)
    const display = value.replace(/\s+/g, ' ').trim()
    if (display && !seen.has(normalized)) {
      seen.add(normalized)
      clean.push(display)
    }

    if (clean.length >= limit) {
      break
    }
  }

  return clean
}

function sentenceSplit(value: string) {
  return value
    .split(/(?<=[.!?])\s+|[\n\r;•]+/u)
    .map((sentence) => sentence.replace(/^-+\s*/, '').trim())
    .filter((sentence) => sentence.length >= 18)
    .slice(0, 80)
}

function cleanList(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return uniqueStrings(value.flatMap((item) => {
    const clean = cleanText(item)
    return clean ? [clean] : []
  }), 30)
}

function cents(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null
}

function skillVariants(definition: SkillDefinition) {
  return [definition.skill, ...definition.aliases].map(normalize)
}

function textHasSkill(text: string, definition: SkillDefinition) {
  const normalizedText = normalize(text)
  return skillVariants(definition).some((variant) => normalizedText.includes(variant))
}

function extractSkills(text: string) {
  return skillTaxonomy
    .filter((definition) => textHasSkill(text, definition))
    .map((definition) => definition.skill)
}

function inferRequiredSkills(jobText: string, providedSkills: string[]) {
  const inferred = extractSkills(jobText)
  return uniqueStrings([...providedSkills, ...inferred], 30)
}

function extractMetrics(text: string) {
  const metricPattern = /(?:\$[\d,.]+[kKmM]?|\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?x\b|\b\d+\+|\b\d{2,}(?:\s?(?:days|weeks|months|years|hrs|hours|users|customers|accounts|teams|workflows|launches|projects|stakeholders|tickets))\b)/g
  return uniqueStrings(text.match(metricPattern) ?? [], 24)
}

function extractAchievements(text: string) {
  const sentences = sentenceSplit(text)
  return uniqueStrings(
    sentences.filter((sentence) => {
      const normalized = normalize(sentence)
      return actionVerbs.some((verb) => normalized.includes(verb)) || extractMetrics(sentence).length > 0
    }),
    14,
  )
}

function extractResponsibilities(text: string) {
  return uniqueStrings(
    sentenceSplit(text).filter((sentence) => {
      const normalized = normalize(sentence)
      return responsibilityVerbs.some((verb) => normalized.includes(verb))
    }),
    14,
  )
}

function inferSenioritySignals(text: string) {
  const normalized = normalize(text)
  const signals: string[] = []

  if (/\b(lead|senior|principal|head|director|manager)\b/.test(normalized)) {
    signals.push('Leadership scope')
  }

  if (/\b\d+\+?\s+years\b/.test(normalized)) {
    signals.push('Years-of-experience signal')
  }

  if (normalized.includes('executive') || normalized.includes('stakeholder')) {
    signals.push('Executive stakeholder exposure')
  }

  if (normalized.includes('strategy') || normalized.includes('roadmap')) {
    signals.push('Strategic planning signal')
  }

  return uniqueStrings(signals, 8)
}

function proofStrength(achievements: string[], metrics: string[]) {
  if (achievements.length >= 5 && metrics.length >= 3) {
    return 'strong' as const
  }

  if (achievements.length >= 3 || metrics.length >= 1) {
    return 'moderate' as const
  }

  return 'light' as const
}

function proofScore(strength: 'light' | 'moderate' | 'strong') {
  if (strength === 'strong') {
    return 100
  }

  return strength === 'moderate' ? 70 : 35
}

function tokenSet(value: string) {
  return new Set(
    normalize(value)
      .split(' ')
      .filter((token) => token.length >= 4 && !['that', 'with', 'from', 'this', 'will', 'your', 'role'].includes(token)),
  )
}

function semanticOverlap(resumeText: string, jobText: string, skillCoverageScore: number) {
  const resumeTokens = tokenSet(resumeText)
  const jobTokens = tokenSet(jobText)
  let shared = 0

  for (const token of jobTokens) {
    if (resumeTokens.has(token)) {
      shared += 1
    }
  }

  const lexicalScore = jobTokens.size ? Math.round((shared / jobTokens.size) * 100) : 0
  return Math.max(0, Math.min(100, Math.round(lexicalScore * 0.45 + skillCoverageScore * 0.55)))
}

function findSkillDefinition(skill: string) {
  const normalized = normalize(skill)
  return skillTaxonomy.find((definition) => normalize(definition.skill) === normalized)
}

function isSkillCovered(skill: string, resumeText: string, resumeSkills: string[]) {
  const definition = findSkillDefinition(skill)
  if (definition && textHasSkill(resumeText, definition)) {
    return true
  }

  const normalizedSkill = normalize(skill)
  return resumeSkills.some((resumeSkill) => normalize(resumeSkill) === normalizedSkill) || normalize(resumeText).includes(normalizedSkill)
}

function coachableGaps(missingSkills: string[], resumeSkills: string[]) {
  return missingSkills.map((skill): Gap => {
    const missingDefinition = findSkillDefinition(skill)
    const relatedSkill = resumeSkills.find((resumeSkill) => {
      const resumeDefinition = findSkillDefinition(resumeSkill)
      return resumeDefinition && missingDefinition && resumeDefinition.category === missingDefinition.category
    })

    return {
      skill,
      severity: relatedSkill ? 'medium' : 'high',
      evidenceHint: relatedSkill
        ? `${relatedSkill} is related, but ${skill} needs explicit evidence.`
        : `No adjacent evidence was detected for ${skill}.`,
      requiredAction: `Add a verified achievement bullet that proves ${skill}.`,
    }
  })
}

function buildRecommendations(input: {
  achievements: string[]
  missingSkills: string[]
  proof: 'light' | 'moderate' | 'strong'
}) {
  const recommendations: Recommendation[] = []

  for (const skill of input.missingSkills.slice(0, 4)) {
    recommendations.push({
      title: `Add ${skill} proof`,
      detail: `Tie ${skill} to a concrete project, metric, stakeholder, or operating outcome before approving the tailored resume.`,
      priority: 'high',
    })
  }

  if (input.proof !== 'strong') {
    recommendations.push({
      title: 'Quantify impact',
      detail: 'Add measurable outcomes such as cycle-time reduction, revenue protection, customer count, launch volume, or SLA improvement.',
      priority: 'medium',
    })
  }

  if (input.achievements.length < 5) {
    recommendations.push({
      title: 'Expand achievement coverage',
      detail: 'Add more evidence bullets so JobsFlow can support a stronger tailored packet and interview narrative.',
      priority: 'medium',
    })
  }

  return recommendations.slice(0, 8)
}

function analysisFromRow(row: ResumeTailoringAnalysisRow) {
  return {
    id: row.id,
    resumeFactSetId: row.resumeFactSetId,
    jobTargetId: row.jobTargetId,
    workflowRunId: row.workflowRunId,
    readinessScore: row.readinessScore,
    skillCoverageScore: row.skillCoverageScore,
    semanticOverlapScore: row.semanticOverlapScore,
    proofStrength: row.proofStrength,
    matchedSkills: parseJson(row.matchedSkillsJson, []),
    missingSkills: parseJson(row.missingSkillsJson, []),
    coachableGaps: parseJson(row.coachableGapsJson, []),
    evidence: parseJson(row.evidenceJson, []),
    recommendations: parseJson(row.recommendationsJson, []),
    vectorDocuments: parseJson(row.vectorDocumentsJson, []),
    createdAt: row.createdAt,
  }
}

function factSetFromRow(row: ResumeFactSetRow) {
  return {
    id: row.id,
    resumeArtifactId: row.resumeArtifactId,
    sourceKind: row.sourceKind,
    sourceLabel: row.sourceLabel,
    parserVersion: row.parserVersion,
    sourceHash: row.sourceHash,
    facts: parseJson(row.factsJson, {}),
    skills: parseJson(row.skillsJson, []),
    achievements: parseJson(row.achievementsJson, []),
    metrics: parseJson(row.metricsJson, []),
    warnings: parseJson(row.warningsJson, []),
    createdAt: row.createdAt,
  }
}

function jobTargetFromRow(row: JobTargetRow) {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    descriptionHash: row.descriptionHash,
    descriptionExcerpt: row.descriptionExcerpt,
    requiredSkills: parseJson(row.requiredSkillsJson, []),
    responsibilities: parseJson(row.responsibilitiesJson, []),
    senioritySignals: parseJson(row.senioritySignalsJson, []),
    compensation: parseJson(row.compensationJson, {}),
    createdAt: row.createdAt,
  }
}

function vectorDocumentFromRow(row: VectorDocumentRow) {
  return {
    id: row.id,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    namespace: row.namespace,
    vectorKey: row.vectorKey,
    textHash: row.textHash,
    textExcerpt: row.textExcerpt,
    metadata: parseJson(row.metadataJson, {}),
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function createVectorDocument(
  env: RequestContext['env'],
  session: SessionContext,
  input: {
    metadata: Record<string, unknown>
    sourceId: string
    sourceType: 'analysis' | 'job_target' | 'resume_fact_set'
    text: string
  },
) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const id = crypto.randomUUID()
  const textHash = await sha256Hex(input.text)
  const namespace = `tenant-${session.tenantId}`
  const vectorKey = `${namespace}/${input.sourceType}/${input.sourceId}/${id}`
  const excerpt = input.text.slice(0, 500)

  await env.DB
    .prepare(
      `
      INSERT INTO vector_documents (
        id,
        tenant_id,
        user_id,
        source_type,
        source_id,
        namespace,
        vector_key,
        text_hash,
        text_excerpt,
        metadata_json,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `,
    )
    .bind(
      id,
      session.tenantId,
      session.userId,
      input.sourceType,
      input.sourceId,
      namespace,
      vectorKey,
      textHash,
      excerpt,
      JSON.stringify(input.metadata),
    )
    .run()

  return {
    id,
    namespace,
    sourceId: input.sourceId,
    sourceType: input.sourceType,
    status: 'pending',
    textHash,
    vectorKey,
  }
}

async function createWorkflowRunIfAvailable(
  env: RequestContext['env'],
  session: SessionContext,
  input: {
    analysisId: string
    jobTargetId: string
    resumeFactSetId: string
    readinessScore: number
  },
) {
  if (!env.DB) {
    return null
  }

  const definition = await env.DB
    .prepare(
      `
      SELECT id
      FROM workflow_definitions
      WHERE workflow_key = 'resume.tailwind_optimization'
        AND active = 1
      ORDER BY version DESC
      LIMIT 1
      `,
    )
    .first<{ id: string }>()

  if (!definition) {
    return null
  }

  const runId = crypto.randomUUID()
  await env.DB
    .prepare(
      `
      INSERT INTO workflow_runs (
        id,
        tenant_id,
        user_id,
        definition_id,
        workflow_key,
        state,
        current_step,
        subject_type,
        subject_id,
        priority,
        input_json,
        result_json,
        started_at,
        completed_at
      )
      VALUES (?, ?, ?, ?, 'resume.tailwind_optimization', 'completed', 'analysis_recorded', 'resume_tailoring_analysis', ?, 4, ?, ?, datetime('now'), datetime('now'))
      `,
    )
    .bind(
      runId,
      session.tenantId,
      session.userId,
      definition.id,
      input.analysisId,
      JSON.stringify({
        resumeFactSetId: input.resumeFactSetId,
        jobTargetId: input.jobTargetId,
      }),
      JSON.stringify({
        readinessScore: input.readinessScore,
        externalActionBlocked: true,
      }),
    )
    .run()

  await env.DB
    .prepare(
      `
      INSERT INTO workflow_events (
        id,
        tenant_id,
        user_id,
        run_id,
        event_type,
        actor_type,
        risk_level,
        payload_json
      )
      VALUES (?, ?, ?, ?, 'resume.tailwind.completed', 'system', 'low', ?)
      `,
    )
    .bind(
      crypto.randomUUID(),
      session.tenantId,
      session.userId,
      runId,
      JSON.stringify({
        analysisId: input.analysisId,
        readinessScore: input.readinessScore,
      }),
    )
    .run()

  return runId
}

async function getResumeArtifact(
  env: RequestContext['env'],
  session: SessionContext,
  resumeArtifactId: string,
) {
  if (!resumeArtifactId || !env.DB) {
    return null
  }

  return env.DB
    .prepare(
      `
      SELECT id, filename, source_hash AS sourceHash
      FROM resume_artifacts
      WHERE id = ?
        AND tenant_id = ?
      LIMIT 1
      `,
    )
    .bind(resumeArtifactId, session.tenantId)
    .first<ResumeArtifactRow>()
}

async function fetchResumeIntelligenceState(env: RequestContext['env'], session: SessionContext) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const [analysisRows, factRows, jobRows, vectorRows] = await Promise.all([
    env.DB
      .prepare(
        `
        SELECT
          id,
          resume_fact_set_id AS resumeFactSetId,
          job_target_id AS jobTargetId,
          workflow_run_id AS workflowRunId,
          readiness_score AS readinessScore,
          skill_coverage_score AS skillCoverageScore,
          semantic_overlap_score AS semanticOverlapScore,
          proof_strength AS proofStrength,
          matched_skills_json AS matchedSkillsJson,
          missing_skills_json AS missingSkillsJson,
          coachable_gaps_json AS coachableGapsJson,
          evidence_json AS evidenceJson,
          recommendations_json AS recommendationsJson,
          vector_documents_json AS vectorDocumentsJson,
          created_at AS createdAt
        FROM resume_tailoring_analyses
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 10
        `,
      )
      .bind(session.tenantId)
      .all<ResumeTailoringAnalysisRow>(),
    env.DB
      .prepare(
        `
        SELECT
          id,
          resume_artifact_id AS resumeArtifactId,
          source_kind AS sourceKind,
          source_label AS sourceLabel,
          parser_version AS parserVersion,
          source_hash AS sourceHash,
          facts_json AS factsJson,
          skills_json AS skillsJson,
          achievements_json AS achievementsJson,
          metrics_json AS metricsJson,
          warnings_json AS warningsJson,
          created_at AS createdAt
        FROM resume_fact_sets
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 10
        `,
      )
      .bind(session.tenantId)
      .all<ResumeFactSetRow>(),
    env.DB
      .prepare(
        `
        SELECT
          id,
          title,
          company,
          description_hash AS descriptionHash,
          description_excerpt AS descriptionExcerpt,
          required_skills_json AS requiredSkillsJson,
          responsibilities_json AS responsibilitiesJson,
          seniority_signals_json AS senioritySignalsJson,
          compensation_json AS compensationJson,
          created_at AS createdAt
        FROM job_targets
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 10
        `,
      )
      .bind(session.tenantId)
      .all<JobTargetRow>(),
    env.DB
      .prepare(
        `
        SELECT
          id,
          source_type AS sourceType,
          source_id AS sourceId,
          namespace,
          vector_key AS vectorKey,
          text_hash AS textHash,
          text_excerpt AS textExcerpt,
          metadata_json AS metadataJson,
          status,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM vector_documents
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 20
        `,
      )
      .bind(session.tenantId)
      .all<VectorDocumentRow>(),
  ])

  const analyses = (analysisRows.results ?? []).map(analysisFromRow)
  const vectorDocuments = (vectorRows.results ?? []).map(vectorDocumentFromRow)

  return {
    analyses,
    factSets: (factRows.results ?? []).map(factSetFromRow),
    jobTargets: (jobRows.results ?? []).map(jobTargetFromRow),
    vectorDocuments,
    summary: {
      analyses: analyses.length,
      latestReadinessScore: analyses[0]?.readinessScore ?? null,
      pendingVectorDocuments: vectorDocuments.filter((document) => document.status === 'pending').length,
      parsedFactSets: factRows.results?.length ?? 0,
      targetJobs: jobRows.results?.length ?? 0,
    },
  }
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before reading resume optimization results.' }, 401)
  }

  try {
    return json({
      ok: true,
      state: await fetchResumeIntelligenceState(env, session),
    })
  } catch {
    return json(
      {
        ok: false,
        error: 'resume_intelligence_unavailable',
        message: 'Resume optimization is being updated. Please try again shortly.',
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
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before running resume optimization.' }, 401)
  }

  if (session.tenantType !== 'candidate') {
    return json(
      {
        ok: false,
        error: 'wrong_workspace_type',
        message: 'Resume optimization is available in candidate workspaces.',
      },
      403,
    )
  }

  const body = await readBody(request)
  if (!body) {
    return json({ ok: false, error: 'payload_too_large', message: 'That resume optimization request is too large.' }, 413)
  }

  const targetRole = cleanText(body.targetRole)
  const company = cleanText(body.company)
  const jobDescription = cleanLongText(body.jobDescription)
  const resumeText = cleanLongText(body.resumeText)
  const resumeArtifactId = cleanText(body.resumeArtifactId)

  if (!targetRole || !company || !jobDescription) {
    return json(
      {
        ok: false,
        error: 'missing_target_job',
        message: 'Add the role, company, and job description before running resume optimization.',
      },
      400,
    )
  }

  if (!resumeText && !resumeArtifactId) {
    return json(
      {
        ok: false,
        error: 'missing_resume_source',
        message: 'Add resume text or choose an uploaded resume before running optimization.',
      },
      400,
    )
  }

  const artifact = await getResumeArtifact(env, session, resumeArtifactId)
  if (resumeArtifactId && !artifact) {
    return json(
      {
        ok: false,
        error: 'resume_artifact_not_found',
        message: 'JobsFlow could not find that resume file.',
      },
      404,
    )
  }

  const sourceText = resumeText || `${artifact?.filename ?? 'Uploaded resume'} ${artifact?.sourceHash ?? ''}`
  const sourceKind = resumeText ? 'pasted_text' : 'artifact_metadata'
  const sourceHash = await sha256Hex(sourceText)
  const resumeSkills = uniqueStrings(extractSkills(sourceText), 30)
  const achievements = extractAchievements(sourceText)
  const metrics = extractMetrics(sourceText)
  const warnings = resumeText
    ? []
    : ['Full text review is still being prepared. This review used uploaded resume details only.']
  const requiredSkills = inferRequiredSkills(`${targetRole} ${jobDescription}`, cleanList(body.requiredSkills))
  const responsibilities = extractResponsibilities(jobDescription)
  const senioritySignals = inferSenioritySignals(`${targetRole} ${jobDescription}`)
  const matchedSkills = requiredSkills.filter((skill) => isSkillCovered(skill, sourceText, resumeSkills))
  const missingSkills = requiredSkills.filter((skill) => !isSkillCovered(skill, sourceText, resumeSkills))
  const skillCoverageScore = requiredSkills.length
    ? Math.round((matchedSkills.length / requiredSkills.length) * 100)
    : 100
  const semanticOverlapScore = semanticOverlap(sourceText, `${targetRole} ${company} ${jobDescription}`, skillCoverageScore)
  const proof = proofStrength(achievements, metrics)
  const gaps = coachableGaps(missingSkills, resumeSkills)
  const recommendations = buildRecommendations({ achievements, missingSkills, proof })
  const readinessScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(skillCoverageScore * 0.5 + semanticOverlapScore * 0.25 + proofScore(proof) * 0.25) -
        gaps.filter((gap) => gap.severity === 'high').length * 4,
    ),
  )
  const descriptionHash = await sha256Hex(jobDescription)
  const resumeFactSetId = crypto.randomUUID()
  const jobTargetId = crypto.randomUUID()
  const analysisId = crypto.randomUUID()
  const salaryMinCents = cents(body.salaryRange?.minCents)
  const salaryMaxCents = cents(body.salaryRange?.maxCents)
  const compensation = {
    currency: cleanText(body.salaryRange?.currency, 'USD'),
    maxCents: salaryMaxCents,
    minCents: salaryMinCents,
  }

  await env.DB
    .prepare(
      `
      INSERT INTO resume_fact_sets (
        id,
        tenant_id,
        user_id,
        resume_artifact_id,
        source_kind,
        source_label,
        parser_version,
        source_hash,
        facts_json,
        skills_json,
        achievements_json,
        metrics_json,
        warnings_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      resumeFactSetId,
      session.tenantId,
      session.userId,
      artifact?.id ?? null,
      sourceKind,
      artifact?.filename ?? `${targetRole} master resume text`,
      parserVersion,
      sourceHash,
      JSON.stringify({
        detectedSkillCount: resumeSkills.length,
        detectedAchievementCount: achievements.length,
        detectedMetricCount: metrics.length,
      }),
      JSON.stringify(resumeSkills),
      JSON.stringify(achievements),
      JSON.stringify(metrics),
      JSON.stringify(warnings),
    )
    .run()

  await env.DB
    .prepare(
      `
      INSERT INTO job_targets (
        id,
        tenant_id,
        user_id,
        title,
        company,
        description_hash,
        description_excerpt,
        required_skills_json,
        responsibilities_json,
        seniority_signals_json,
        compensation_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      jobTargetId,
      session.tenantId,
      session.userId,
      targetRole,
      company,
      descriptionHash,
      jobDescription.slice(0, 700),
      JSON.stringify(requiredSkills),
      JSON.stringify(responsibilities),
      JSON.stringify(senioritySignals),
      JSON.stringify(compensation),
    )
    .run()

  const vectorDocuments = [
    await createVectorDocument(env, session, {
      sourceId: resumeFactSetId,
      sourceType: 'resume_fact_set',
      text: `${resumeSkills.join(', ')} ${achievements.join(' ')}`,
      metadata: {
        parserVersion,
        sourceKind,
      },
    }),
    await createVectorDocument(env, session, {
      sourceId: jobTargetId,
      sourceType: 'job_target',
      text: `${targetRole} ${company} ${requiredSkills.join(', ')} ${responsibilities.join(' ')}`,
      metadata: {
        descriptionHash,
        targetRole,
        company,
      },
    }),
  ]

  await env.DB
    .prepare(
      `
      INSERT INTO resume_tailoring_analyses (
        id,
        tenant_id,
        user_id,
        resume_fact_set_id,
        job_target_id,
        readiness_score,
        skill_coverage_score,
        semantic_overlap_score,
        proof_strength,
        matched_skills_json,
        missing_skills_json,
        coachable_gaps_json,
        evidence_json,
        recommendations_json,
        vector_documents_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      analysisId,
      session.tenantId,
      session.userId,
      resumeFactSetId,
      jobTargetId,
      readinessScore,
      skillCoverageScore,
      semanticOverlapScore,
      proof,
      JSON.stringify(matchedSkills),
      JSON.stringify(missingSkills),
      JSON.stringify(gaps),
      JSON.stringify(achievements.slice(0, 8)),
      JSON.stringify(recommendations),
      JSON.stringify(vectorDocuments),
    )
    .run()

  const analysisVector = await createVectorDocument(env, session, {
    sourceId: analysisId,
    sourceType: 'analysis',
    text: `${matchedSkills.join(', ')} ${missingSkills.join(', ')} ${recommendations.map((item) => item.detail).join(' ')}`,
    metadata: {
      readinessScore,
      skillCoverageScore,
      semanticOverlapScore,
    },
  })

  vectorDocuments.push(analysisVector)

  const workflowRunId = await createWorkflowRunIfAvailable(env, session, {
    analysisId,
    jobTargetId,
    readinessScore,
    resumeFactSetId,
  })

  if (workflowRunId) {
    await env.DB
      .prepare(
        `
        UPDATE resume_tailoring_analyses
        SET workflow_run_id = ?,
          vector_documents_json = ?
        WHERE id = ?
          AND tenant_id = ?
        `,
      )
      .bind(workflowRunId, JSON.stringify(vectorDocuments), analysisId, session.tenantId)
      .run()
  } else {
    await env.DB
      .prepare(
        `
        UPDATE resume_tailoring_analyses
        SET vector_documents_json = ?
        WHERE id = ?
          AND tenant_id = ?
        `,
      )
      .bind(JSON.stringify(vectorDocuments), analysisId, session.tenantId)
      .run()
  }

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'resume.tailwind.reviewed',
    actorType: 'system',
    action: 'Prepared resume facts, compared the target job, and saved optimization guidance',
    riskLevel: missingSkills.length ? 'medium' : 'low',
    metadata: {
      analysisId,
      company,
      jobTargetId,
      readinessScore,
      resumeFactSetId,
      skillCoverageScore,
      targetRole,
      vectorDocumentCount: vectorDocuments.length,
      workflowRunId,
    },
  })

  const state = await fetchResumeIntelligenceState(env, session)
  return json(
    {
      ok: true,
      analysis: state.analyses.find((analysis) => analysis.id === analysisId),
      state,
    },
    201,
  )
}
