import type { RequestContext, SessionContext } from '../_shared'
import { getSession, json, missingConfig, safeString, sha256Hex, writeAuditEvent } from '../_shared'

type SkillMatchBody = {
  action?: unknown
  adjacentSkills?: unknown
  achievements?: unknown
  candidateAlias?: unknown
  candidateSkills?: unknown
  company?: unknown
  minimumSignals?: unknown
  requiredSkills?: unknown
  roleTitle?: unknown
}

type RoleRequirementRow = {
  adjacentSkillsJson: string
  company: string
  createdAt: string
  id: string
  minimumSignalsJson: string
  requiredSkillsJson: string
  roleTitle: string
}

type CandidateSkillProfileRow = {
  achievementsJson: string
  candidateAlias: string
  createdAt: string
  id: string
  skillsJson: string
  vectorDocumentsJson: string
  visibility: 'archived' | 'internal_review' | 'shortlist_ready'
}

type SkillTaxonomyRow = {
  createdAt: string
  id: string
  label: string
  parentKey: string | null
  relatedSkillsJson: string
  skillKey: string
  vectorKey: string
}

type SemanticMatchRunRow = {
  adjacentMatchesJson: string
  candidateProfileId: string
  createdAt: string
  explanationJson: string
  gapsJson: string
  id: string
  matchScore: number
  matchedSkillsJson: string
  roleRequirementId: string
}

const maxBodyBytes = 96 * 1024
const maxTextLength = 220

const relatedSkillMap: Record<string, string[]> = {
  'claims operations': ['healthcare operations', 'workflow operations', 'implementation operations'],
  'executive communication': ['stakeholder management', 'customer communication', 'leadership communication'],
  'healthcare saas': ['healthtech', 'healthcare technology', 'enterprise saas'],
  'product analytics': ['readiness dashboards', 'operational reporting', 'metrics'],
  'product operations': ['implementation operations', 'launch operations', 'workflow governance'],
  'vendor governance': ['partner operations', 'third-party governance', 'implementation governance'],
}

async function readBody(request: Request): Promise<SkillMatchBody | null> {
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > maxBodyBytes) {
    return null
  }

  try {
    return (await request.json()) as SkillMatchBody
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

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function skillKey(value: string) {
  return normalize(value).replace(/\s+/g, '_').slice(0, 80)
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

    if (output.length >= 16) {
      break
    }
  }

  return output
}

function roleFromRow(row: RoleRequirementRow) {
  return {
    id: row.id,
    roleTitle: row.roleTitle,
    company: row.company,
    requiredSkills: parseJson(row.requiredSkillsJson, []),
    adjacentSkills: parseJson(row.adjacentSkillsJson, []),
    minimumSignals: parseJson(row.minimumSignalsJson, []),
    createdAt: row.createdAt,
  }
}

function candidateFromRow(row: CandidateSkillProfileRow) {
  return {
    id: row.id,
    candidateAlias: row.candidateAlias,
    skills: parseJson(row.skillsJson, []),
    achievements: parseJson(row.achievementsJson, []),
    vectorDocuments: parseJson(row.vectorDocumentsJson, []),
    visibility: row.visibility,
    createdAt: row.createdAt,
  }
}

function taxonomyFromRow(row: SkillTaxonomyRow) {
  return {
    id: row.id,
    skillKey: row.skillKey,
    label: row.label,
    parentKey: row.parentKey,
    relatedSkills: parseJson(row.relatedSkillsJson, []),
    vectorKey: row.vectorKey,
    createdAt: row.createdAt,
  }
}

function matchRunFromRow(row: SemanticMatchRunRow) {
  return {
    id: row.id,
    roleRequirementId: row.roleRequirementId,
    candidateProfileId: row.candidateProfileId,
    matchScore: row.matchScore,
    matchedSkills: parseJson(row.matchedSkillsJson, []),
    adjacentMatches: parseJson(row.adjacentMatchesJson, []),
    gaps: parseJson(row.gapsJson, []),
    explanation: parseJson(row.explanationJson, []),
    createdAt: row.createdAt,
  }
}

function buildVectorDocuments(input: { achievements: string[]; candidateAlias: string; skills: string[] }) {
  return [
    {
      namespace: 'candidate_skill_profile',
      sourceId: input.candidateAlias,
      sourceType: 'skill_profile',
      text: [...input.skills, ...input.achievements].join(' | '),
      vectorKey: `candidate_skill_profile:${skillKey(input.candidateAlias)}`,
    },
  ]
}

function evaluateSkillMatch(input: {
  achievements: string[]
  adjacentSkills: string[]
  candidateSkills: string[]
  requiredSkills: string[]
}) {
  const candidateSkillSet = new Set(input.candidateSkills.map(normalize))
  const achievementCorpus = normalize(input.achievements.join(' '))
  const matchedSkills: string[] = []
  const adjacentMatches: Array<{ candidateSkill: string; requiredSkill: string; relationship: string }> = []
  const gaps: string[] = []
  const explanation: string[] = []

  for (const requiredSkill of input.requiredSkills) {
    const normalizedRequired = normalize(requiredSkill)
    const related = new Set([...(relatedSkillMap[normalizedRequired] ?? []), ...input.adjacentSkills].map(normalize))
    const exactMatch = candidateSkillSet.has(normalizedRequired) || achievementCorpus.includes(normalizedRequired)

    if (exactMatch) {
      matchedSkills.push(requiredSkill)
      explanation.push(`Direct evidence covers ${requiredSkill}.`)
      continue
    }

    const adjacent = input.candidateSkills.find((skill) => related.has(normalize(skill)) || normalize(skill).includes(normalizedRequired))
    if (adjacent) {
      adjacentMatches.push({ candidateSkill: adjacent, relationship: 'taxonomy_related', requiredSkill })
      explanation.push(`${adjacent} is treated as adjacent evidence for ${requiredSkill}.`)
      continue
    }

    gaps.push(requiredSkill)
  }

  const requiredCount = Math.max(1, input.requiredSkills.length)
  const exactScore = Math.round((matchedSkills.length / requiredCount) * 70)
  const adjacentScore = Math.round((adjacentMatches.length / requiredCount) * 20)
  const proofScore = input.achievements.some((achievement) => /\d/.test(achievement)) ? 10 : 4
  const matchScore = Math.min(100, exactScore + adjacentScore + proofScore)

  return {
    adjacentMatches,
    explanation: explanation.length ? explanation : ['No semantic evidence was available for this role yet.'],
    gaps,
    matchedSkills,
    matchScore,
  }
}

async function fetchSkillMatchingState(env: RequestContext['env'], session: SessionContext) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const [roleRows, candidateRows, taxonomyRows, runRows] = await Promise.all([
    env.DB
      .prepare(
        `
        SELECT
          id,
          role_title AS roleTitle,
          company,
          required_skills_json AS requiredSkillsJson,
          adjacent_skills_json AS adjacentSkillsJson,
          minimum_signals_json AS minimumSignalsJson,
          created_at AS createdAt
        FROM employer_role_requirements
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 12
        `,
      )
      .bind(session.tenantId)
      .all<RoleRequirementRow>(),
    env.DB
      .prepare(
        `
        SELECT
          id,
          candidate_alias AS candidateAlias,
          skills_json AS skillsJson,
          achievements_json AS achievementsJson,
          vector_documents_json AS vectorDocumentsJson,
          visibility,
          created_at AS createdAt
        FROM candidate_skill_profiles
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 12
        `,
      )
      .bind(session.tenantId)
      .all<CandidateSkillProfileRow>(),
    env.DB
      .prepare(
        `
        SELECT
          id,
          skill_key AS skillKey,
          label,
          parent_key AS parentKey,
          related_skills_json AS relatedSkillsJson,
          vector_key AS vectorKey,
          created_at AS createdAt
        FROM skill_taxonomy_nodes
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 30
        `,
      )
      .bind(session.tenantId)
      .all<SkillTaxonomyRow>(),
    env.DB
      .prepare(
        `
        SELECT
          id,
          role_requirement_id AS roleRequirementId,
          candidate_profile_id AS candidateProfileId,
          match_score AS matchScore,
          matched_skills_json AS matchedSkillsJson,
          adjacent_matches_json AS adjacentMatchesJson,
          gaps_json AS gapsJson,
          explanation_json AS explanationJson,
          created_at AS createdAt
        FROM semantic_match_runs
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 12
        `,
      )
      .bind(session.tenantId)
      .all<SemanticMatchRunRow>(),
  ])

  const runs = (runRows.results ?? []).map(matchRunFromRow)
  return {
    candidateProfiles: (candidateRows.results ?? []).map(candidateFromRow),
    matchRuns: runs,
    roleRequirements: (roleRows.results ?? []).map(roleFromRow),
    taxonomyNodes: (taxonomyRows.results ?? []).map(taxonomyFromRow),
    summary: {
      candidateProfiles: candidateRows.results?.length ?? 0,
      latestMatchScore: runs[0]?.matchScore ?? null,
      matchRuns: runs.length,
      roleRequirements: roleRows.results?.length ?? 0,
      taxonomyNodes: taxonomyRows.results?.length ?? 0,
    },
  }
}

async function upsertTaxonomyNodes(env: RequestContext['env'], session: SessionContext, skills: string[]) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  for (const skill of skills) {
    const key = skillKey(skill)
    const relatedSkills = relatedSkillMap[normalize(skill)] ?? []
    const vectorHash = await sha256Hex(`${session.tenantId}:${key}`)
    await env.DB
      .prepare(
        `
        INSERT INTO skill_taxonomy_nodes (
          id,
          tenant_id,
          skill_key,
          label,
          parent_key,
          related_skills_json,
          vector_key
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (tenant_id, skill_key) DO UPDATE SET
          label = excluded.label,
          related_skills_json = excluded.related_skills_json,
          vector_key = excluded.vector_key
        `,
      )
      .bind(crypto.randomUUID(), session.tenantId, key, skill, null, JSON.stringify(relatedSkills), `skill_taxonomy:${vectorHash.slice(0, 24)}`)
      .run()
  }
}

async function runSemanticSkillMatch(env: RequestContext['env'], session: SessionContext, body: SkillMatchBody) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const roleTitle = cleanText(body.roleTitle, 'Product Operations Manager')
  const company = cleanText(body.company, 'Kora Health')
  const requiredSkills = cleanList(body.requiredSkills, [
    'Product operations',
    'Healthcare SaaS',
    'Vendor governance',
    'Claims operations',
    'Executive communication',
  ])
  const adjacentSkills = cleanList(body.adjacentSkills, ['Implementation operations', 'Healthtech', 'Workflow governance'])
  const minimumSignals = cleanList(body.minimumSignals, ['Quantified impact', 'Cross-functional launch ownership'])
  const candidateAlias = cleanText(body.candidateAlias, 'Candidate JFC-1428')
  const candidateSkills = cleanList(body.candidateSkills, [
    'Product operations',
    'Healthcare technology',
    'Vendor governance',
    'Operational reporting',
    'Stakeholder management',
  ])
  const achievements = cleanList(body.achievements, [
    'Reduced launch handoff time by 28%',
    'Built readiness dashboards for 18 active projects',
    'Owned executive customer communication during workflow rollout',
  ])

  await upsertTaxonomyNodes(env, session, [...requiredSkills, ...adjacentSkills, ...candidateSkills])

  const roleRequirementId = crypto.randomUUID()
  await env.DB
    .prepare(
      `
      INSERT INTO employer_role_requirements (
        id,
        tenant_id,
        user_id,
        role_title,
        company,
        required_skills_json,
        adjacent_skills_json,
        minimum_signals_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      roleRequirementId,
      session.tenantId,
      session.userId,
      roleTitle,
      company,
      JSON.stringify(requiredSkills),
      JSON.stringify(adjacentSkills),
      JSON.stringify(minimumSignals),
    )
    .run()

  const candidateProfileId = crypto.randomUUID()
  await env.DB
    .prepare(
      `
      INSERT INTO candidate_skill_profiles (
        id,
        tenant_id,
        user_id,
        candidate_alias,
        skills_json,
        achievements_json,
        vector_documents_json,
        visibility
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'shortlist_ready')
      `,
    )
    .bind(
      candidateProfileId,
      session.tenantId,
      session.userId,
      candidateAlias,
      JSON.stringify(candidateSkills),
      JSON.stringify(achievements),
      JSON.stringify(buildVectorDocuments({ achievements, candidateAlias, skills: candidateSkills })),
    )
    .run()

  const evaluation = evaluateSkillMatch({ achievements, adjacentSkills, candidateSkills, requiredSkills })
  const runId = crypto.randomUUID()
  await env.DB
    .prepare(
      `
      INSERT INTO semantic_match_runs (
        id,
        tenant_id,
        user_id,
        role_requirement_id,
        candidate_profile_id,
        match_score,
        matched_skills_json,
        adjacent_matches_json,
        gaps_json,
        explanation_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      runId,
      session.tenantId,
      session.userId,
      roleRequirementId,
      candidateProfileId,
      evaluation.matchScore,
      JSON.stringify(evaluation.matchedSkills),
      JSON.stringify(evaluation.adjacentMatches),
      JSON.stringify(evaluation.gaps),
      JSON.stringify(evaluation.explanation),
    )
    .run()

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'skill_matching.run.created',
    actorType: 'system',
    action: 'Created semantic skill match run with taxonomy-adjacent evidence',
    riskLevel: evaluation.matchScore < 60 ? 'medium' : 'low',
    metadata: {
      candidateProfileId,
      matchScore: evaluation.matchScore,
      roleRequirementId,
      runId,
    },
  })

  return json({ ok: true, runId, state: await fetchSkillMatchingState(env, session) }, 201)
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before reading semantic skill matching.' }, 401)
  }

  try {
    return json({
      ok: true,
      state: await fetchSkillMatchingState(env, session),
    })
  } catch (error) {
    return json(
      {
        ok: false,
        error: 'skill_matching_unavailable',
        message: 'Semantic skill matching tables are not ready yet. Apply the latest D1 migration.',
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
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before changing semantic skill matching.' }, 401)
  }

  if (session.tenantType !== 'employer') {
    return json(
      {
        ok: false,
        error: 'wrong_workspace_type',
        message: 'Semantic skill matching is scoped to employer workspaces.',
      },
      403,
    )
  }

  const body = await readBody(request)
  if (!body) {
    return json({ ok: false, error: 'payload_too_large', message: 'Skill matching payload is limited to 96 KB.' }, 413)
  }

  const action = skillKey(cleanText(body.action, 'run_match'))
  try {
    if (action === 'run_match') {
      return runSemanticSkillMatch(env, session, body)
    }

    return json(
      {
        ok: false,
        error: 'unsupported_skill_matching_action',
        message: 'Skill matching action must be run_match.',
      },
      400,
    )
  } catch (error) {
    return json(
      {
        ok: false,
        error: 'skill_matching_error',
        message: 'JobsFlow could not complete the semantic skill matching action.',
        detail: error instanceof Error ? safeString(error.message, 'unknown_error') : 'unknown_error',
      },
      500,
    )
  }
}
