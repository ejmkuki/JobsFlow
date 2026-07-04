import type { RequestContext, SessionContext } from '../_shared'
import { getSession, json, missingConfig, safeString, writeAuditEvent } from '../_shared'

type InterviewStage = 'case_study' | 'final_round' | 'hiring_manager' | 'panel' | 'recruiter_screen'

type InterviewPrepBody = {
  action?: unknown
  answerText?: unknown
  company?: unknown
  evidence?: unknown
  questionKey?: unknown
  requiredSkills?: unknown
  sessionId?: unknown
  stage?: unknown
  targetRole?: unknown
}

type InterviewSessionRow = {
  company: string
  contextJson: string
  createdAt: string
  id: string
  scorecardJson: string
  stage: InterviewStage
  status: 'active' | 'archived' | 'completed'
  targetRole: string
  updatedAt: string
}

type QuestionSetRow = {
  createdAt: string
  generatorVersion: string
  id: string
  questionsJson: string
  rubricJson: string
  sessionId: string
}

type PracticeAnswerRow = {
  answerText: string
  createdAt: string
  id: string
  overallScore: number
  questionKey: string
  recommendationsJson: string
  risksJson: string
  rubricScoresJson: string
  sessionId: string
  strengthsJson: string
}

type Question = {
  category: string
  key: string
  prompt: string
  signal: string
}

type RubricItem = {
  key: string
  label: string
  weight: number
}

const maxBodyBytes = 96 * 1024
const maxTextLength = 220
const maxAnswerLength = 6000
const generatorVersion = 'jobsflow-interview-prep-2026-07-04'
const stages: InterviewStage[] = ['recruiter_screen', 'hiring_manager', 'panel', 'case_study', 'final_round']

const defaultRubric: RubricItem[] = [
  { key: 'specificity', label: 'Specificity and role relevance', weight: 30 },
  { key: 'evidence', label: 'Evidence and metrics', weight: 30 },
  { key: 'structure', label: 'Answer structure', weight: 20 },
  { key: 'risk', label: 'Risk handling', weight: 20 },
]

async function readBody(request: Request): Promise<InterviewPrepBody | null> {
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > maxBodyBytes) {
    return null
  }

  try {
    return (await request.json()) as InterviewPrepBody
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

function cleanLongText(value: unknown) {
  if (typeof value !== 'string') {
    return ''
  }

  return Array.from(value, (character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127 ? ' ' : character
  })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxAnswerLength)
}

function cleanKey(value: unknown, fallback = '') {
  return cleanText(value, fallback).toLowerCase().replace(/[^a-z0-9_.:-]/g, '').slice(0, 80)
}

function cleanStage(value: unknown) {
  const stage = cleanKey(value, 'hiring_manager')
  return stages.includes(stage as InterviewStage) ? (stage as InterviewStage) : 'hiring_manager'
}

function cleanList(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<string>()
  const output: string[] = []
  for (const item of value) {
    const clean = cleanText(item)
    const key = clean.toLowerCase()
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

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function generateQuestions(input: {
  company: string
  evidence: string[]
  requiredSkills: string[]
  stage: InterviewStage
  targetRole: string
}) {
  const skills = input.requiredSkills.length
    ? input.requiredSkills
    : ['role fit', 'cross-functional execution', 'measurable impact']
  const leadSkill = skills[0] ?? 'role fit'
  const secondSkill = skills[1] ?? 'stakeholder management'
  const evidencePrompt = input.evidence[0] ?? 'your strongest relevant project'
  const stagePrefix = input.stage.replaceAll('_', ' ')
  const questions: Question[] = [
    {
      category: 'role_fit',
      key: 'role-fit',
      prompt: `For the ${input.targetRole} role at ${input.company}, walk me through the evidence that best proves ${leadSkill}.`,
      signal: `Clear fit for ${leadSkill}`,
    },
    {
      category: 'impact',
      key: 'impact-story',
      prompt: `Tell me about ${evidencePrompt}. What changed, what did you own, and what measurable result followed?`,
      signal: 'Ownership, metrics, and causal clarity',
    },
    {
      category: 'gap_handling',
      key: 'gap-handling',
      prompt: `If the team probes your depth in ${secondSkill}, how would you show the gap is covered or coachable?`,
      signal: 'Honest risk handling',
    },
    {
      category: 'stage_specific',
      key: 'stage-specific',
      prompt: `This is a ${stagePrefix} conversation. What would you ask or emphasize to move the process forward without over-talking?`,
      signal: 'Stage awareness and concise communication',
    },
  ]

  if (input.stage === 'case_study') {
    questions.push({
      category: 'case',
      key: 'case-approach',
      prompt: `Design a 30-day operating plan for improving ${leadSkill} at ${input.company}. What would you inspect first?`,
      signal: 'Structured operating plan',
    })
  }

  return questions
}

function scoreAnswer(answer: string, questionKey: string) {
  const normalized = normalize(answer)
  const wordCount = normalized ? normalized.split(' ').length : 0
  const hasMetric = /(\d+%|\$\d+|\d+x|\d+\+|\b\d{2,}\b)/i.test(answer)
  const hasStructure = ['situation', 'task', 'action', 'result', 'first', 'then', 'finally'].some((word) => normalized.includes(word))
  const hasRisk = ['risk', 'tradeoff', 'learned', 'gap', 'constraint', 'would improve'].some((word) => normalized.includes(word))
  const hasSpecificity = wordCount >= 55 && !['stuff', 'things', 'various'].some((word) => normalized.includes(word))
  const rubricScores = [
    { key: 'specificity', label: 'Specificity and role relevance', score: hasSpecificity ? 84 : Math.max(35, Math.min(70, wordCount)) },
    { key: 'evidence', label: 'Evidence and metrics', score: hasMetric ? 90 : 48 },
    { key: 'structure', label: 'Answer structure', score: hasStructure ? 86 : 56 },
    { key: 'risk', label: 'Risk handling', score: hasRisk || questionKey.includes('gap') ? 82 : 58 },
  ]
  const overallScore = Math.round(
    rubricScores.reduce((sum, item) => {
      const rubric = defaultRubric.find((entry) => entry.key === item.key)
      return sum + item.score * ((rubric?.weight ?? 25) / 100)
    }, 0),
  )
  const strengths = [
    hasSpecificity ? 'Answer has enough detail for interviewer follow-up.' : '',
    hasMetric ? 'Answer includes quantified impact.' : '',
    hasStructure ? 'Answer has a recognizable structure.' : '',
  ].filter(Boolean)
  const risks = [
    wordCount < 45 ? 'Answer may be too thin for a senior role.' : '',
    !hasMetric ? 'Add a metric, scale, timeline, or business result.' : '',
    !hasRisk && questionKey.includes('gap') ? 'Name the gap honestly and show the adjacent proof.' : '',
  ].filter(Boolean)
  const recommendations = [
    !hasStructure ? 'Use situation, action, result, and next lesson in that order.' : '',
    !hasMetric ? 'Attach one measurable outcome to the story.' : '',
    wordCount > 180 ? 'Tighten the answer so the strongest evidence lands in under two minutes.' : '',
  ].filter(Boolean)

  return {
    overallScore,
    recommendations: recommendations.length ? recommendations : ['Keep this answer and rehearse it once out loud.'],
    risks,
    rubricScores,
    strengths: strengths.length ? strengths : ['Answer is recorded and ready for revision.'],
  }
}

function sessionFromRow(row: InterviewSessionRow) {
  return {
    id: row.id,
    targetRole: row.targetRole,
    company: row.company,
    stage: row.stage,
    status: row.status,
    context: parseJson(row.contextJson, {}),
    scorecard: parseJson(row.scorecardJson, []),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function questionSetFromRow(row: QuestionSetRow) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    generatorVersion: row.generatorVersion,
    questions: parseJson(row.questionsJson, []),
    rubric: parseJson(row.rubricJson, []),
    createdAt: row.createdAt,
  }
}

function answerFromRow(row: PracticeAnswerRow) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    questionKey: row.questionKey,
    answerText: row.answerText,
    overallScore: row.overallScore,
    rubricScores: parseJson(row.rubricScoresJson, []),
    strengths: parseJson(row.strengthsJson, []),
    risks: parseJson(row.risksJson, []),
    recommendations: parseJson(row.recommendationsJson, []),
    createdAt: row.createdAt,
  }
}

async function fetchInterviewPrepState(env: RequestContext['env'], session: SessionContext) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const [sessionRows, questionRows, answerRows] = await Promise.all([
    env.DB
      .prepare(
        `
        SELECT
          id,
          target_role AS targetRole,
          company,
          stage,
          status,
          context_json AS contextJson,
          scorecard_json AS scorecardJson,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM interview_prep_sessions
        WHERE tenant_id = ?
        ORDER BY updated_at DESC
        LIMIT 12
        `,
      )
      .bind(session.tenantId)
      .all<InterviewSessionRow>(),
    env.DB
      .prepare(
        `
        SELECT
          id,
          session_id AS sessionId,
          generator_version AS generatorVersion,
          questions_json AS questionsJson,
          rubric_json AS rubricJson,
          created_at AS createdAt
        FROM interview_question_sets
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 12
        `,
      )
      .bind(session.tenantId)
      .all<QuestionSetRow>(),
    env.DB
      .prepare(
        `
        SELECT
          id,
          session_id AS sessionId,
          question_key AS questionKey,
          answer_text AS answerText,
          overall_score AS overallScore,
          rubric_scores_json AS rubricScoresJson,
          strengths_json AS strengthsJson,
          risks_json AS risksJson,
          recommendations_json AS recommendationsJson,
          created_at AS createdAt
        FROM interview_practice_answers
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 20
        `,
      )
      .bind(session.tenantId)
      .all<PracticeAnswerRow>(),
  ])

  const sessions = (sessionRows.results ?? []).map(sessionFromRow)
  const answers = (answerRows.results ?? []).map(answerFromRow)
  return {
    answers,
    questionSets: (questionRows.results ?? []).map(questionSetFromRow),
    sessions,
    summary: {
      activeSessions: sessions.filter((item) => item.status === 'active').length,
      latestScore: answers[0]?.overallScore ?? null,
      questionSets: questionRows.results?.length ?? 0,
      recordedAnswers: answers.length,
    },
  }
}

async function createSession(env: RequestContext['env'], session: SessionContext, body: InterviewPrepBody) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const targetRole = cleanText(body.targetRole)
  const company = cleanText(body.company)
  const stage = cleanStage(body.stage)
  const requiredSkills = cleanList(body.requiredSkills)
  const evidence = cleanList(body.evidence)

  if (!targetRole || !company) {
    return json(
      {
        ok: false,
        error: 'missing_interview_target',
        message: 'Provide targetRole and company before creating interview prep.',
      },
      400,
    )
  }

  const sessionId = crypto.randomUUID()
  const questionSetId = crypto.randomUUID()
  const questions = generateQuestions({ company, evidence, requiredSkills, stage, targetRole })

  await env.DB
    .prepare(
      `
      INSERT INTO interview_prep_sessions (
        id,
        tenant_id,
        user_id,
        target_role,
        company,
        stage,
        context_json,
        scorecard_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      sessionId,
      session.tenantId,
      session.userId,
      targetRole,
      company,
      stage,
      JSON.stringify({ evidence, requiredSkills }),
      JSON.stringify(defaultRubric),
    )
    .run()

  await env.DB
    .prepare(
      `
      INSERT INTO interview_question_sets (
        id,
        tenant_id,
        user_id,
        session_id,
        generator_version,
        questions_json,
        rubric_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(questionSetId, session.tenantId, session.userId, sessionId, generatorVersion, JSON.stringify(questions), JSON.stringify(defaultRubric))
    .run()

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'interview.prep.created',
    actorType: 'system',
    action: 'Created role-specific interview prep session and question set',
    riskLevel: 'low',
    metadata: {
      company,
      questionSetId,
      sessionId,
      stage,
      targetRole,
    },
  })

  return json(
    {
      ok: true,
      sessionId,
      state: await fetchInterviewPrepState(env, session),
    },
    201,
  )
}

async function evaluateAnswer(env: RequestContext['env'], session: SessionContext, body: InterviewPrepBody) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const sessionId = cleanText(body.sessionId)
  const questionKey = cleanKey(body.questionKey, 'role-fit')
  const answerText = cleanLongText(body.answerText)

  if (!sessionId || !answerText) {
    return json(
      {
        ok: false,
        error: 'missing_practice_answer',
        message: 'Provide sessionId and answerText before evaluating practice.',
      },
      400,
    )
  }

  const sessionRow = await env.DB
    .prepare(
      `
      SELECT id
      FROM interview_prep_sessions
      WHERE id = ?
        AND tenant_id = ?
      LIMIT 1
      `,
    )
    .bind(sessionId, session.tenantId)
    .first<{ id: string }>()

  if (!sessionRow) {
    return json(
      {
        ok: false,
        error: 'interview_session_not_found',
        message: 'JobsFlow could not find that tenant-scoped interview session.',
      },
      404,
    )
  }

  const evaluation = scoreAnswer(answerText, questionKey)
  const answerId = crypto.randomUUID()
  await env.DB
    .prepare(
      `
      INSERT INTO interview_practice_answers (
        id,
        tenant_id,
        user_id,
        session_id,
        question_key,
        answer_text,
        overall_score,
        rubric_scores_json,
        strengths_json,
        risks_json,
        recommendations_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      answerId,
      session.tenantId,
      session.userId,
      sessionRow.id,
      questionKey,
      answerText,
      evaluation.overallScore,
      JSON.stringify(evaluation.rubricScores),
      JSON.stringify(evaluation.strengths),
      JSON.stringify(evaluation.risks),
      JSON.stringify(evaluation.recommendations),
    )
    .run()

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'interview.answer.evaluated',
    actorType: 'system',
    action: 'Evaluated interview practice answer against role rubric',
    riskLevel: evaluation.overallScore < 60 ? 'medium' : 'low',
    metadata: {
      answerId,
      overallScore: evaluation.overallScore,
      questionKey,
      sessionId,
    },
  })

  return json(
    {
      answerId,
      ok: true,
      state: await fetchInterviewPrepState(env, session),
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
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before reading interview prep.' }, 401)
  }

  try {
    return json({
      ok: true,
      state: await fetchInterviewPrepState(env, session),
    })
  } catch (error) {
    return json(
      {
        ok: false,
        error: 'interview_prep_unavailable',
        message: 'Interview prep tables are not ready yet. Apply the latest D1 migration.',
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
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before changing interview prep.' }, 401)
  }

  if (session.tenantType !== 'candidate') {
    return json(
      {
        ok: false,
        error: 'wrong_workspace_type',
        message: 'Interview prep is scoped to candidate workspaces.',
      },
      403,
    )
  }

  const body = await readBody(request)
  if (!body) {
    return json({ ok: false, error: 'payload_too_large', message: 'Interview prep payload is limited to 96 KB.' }, 413)
  }

  const action = cleanKey(body.action, 'create_session')
  try {
    if (action === 'create_session') {
      return createSession(env, session, body)
    }

    if (action === 'evaluate_answer') {
      return evaluateAnswer(env, session, body)
    }

    return json(
      {
        ok: false,
        error: 'unsupported_interview_action',
        message: 'Interview action must be create_session or evaluate_answer.',
      },
      400,
    )
  } catch (error) {
    return json(
      {
        ok: false,
        error: 'interview_prep_error',
        message: 'JobsFlow could not complete the interview prep action.',
        detail: error instanceof Error ? safeString(error.message, 'unknown_error') : 'unknown_error',
      },
      500,
    )
  }
}
