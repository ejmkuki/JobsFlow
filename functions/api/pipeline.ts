import type { RequestContext, SessionContext } from '../_shared'
import { getSession, json, missingConfig, safeString, writeAuditEvent } from '../_shared'

type PipelineState =
  | 'applied'
  | 'archived'
  | 'closed'
  | 'discovered'
  | 'employer_review'
  | 'interview'
  | 'offer'
  | 'packet_review'
  | 'recruiter_screen'

type EmployerUpdateStatus = 'current' | 'due_soon' | 'not_required' | 'overdue'
type RiskLevel = 'high' | 'low' | 'medium'
type FollowUpTaskType =
  | 'candidate_reminder'
  | 'employer_status_request'
  | 'fallback_search'
  | 'interview_prep'
  | 'salary_review'

type PipelineRequestBody = {
  action?: unknown
  company?: unknown
  fromState?: unknown
  itemId?: unknown
  notes?: unknown
  roleTitle?: unknown
  salaryRange?: {
    maxCents?: unknown
    minCents?: unknown
  }
  source?: unknown
  state?: unknown
  toState?: unknown
}

type PipelineItemRow = {
  company: string
  createdAt: string
  employerResponseDueAt: string | null
  employerUpdateStatus: EmployerUpdateStatus
  id: string
  lastCandidateActionAt: string | null
  lastEmployerActionAt: string | null
  notesJson: string
  riskLevel: RiskLevel
  roleTitle: string
  salaryMaxCents: number | null
  salaryMinCents: number | null
  source: string
  state: PipelineState
  updatedAt: string
}

type PipelineEventRow = {
  actorType: 'candidate' | 'employer' | 'policy' | 'system'
  createdAt: string
  eventType: string
  fromState: string | null
  id: string
  metadataJson: string
  pipelineItemId: string
  toState: string | null
}

type FollowUpTaskRow = {
  channel: 'calendar' | 'email_draft' | 'in_app' | 'none'
  consentRequired: number
  createdAt: string
  draftText: string
  dueAt: string
  id: string
  pipelineItemId: string
  riskLevel: RiskLevel
  status: 'approved' | 'blocked' | 'dismissed' | 'open' | 'sent'
  taskType: FollowUpTaskType
  updatedAt: string
}

type ResponsePolicyRow = {
  active: number
  candidateFollowUpDays: number
  createdAt: string
  employerSlaDays: number
  fallbackSearchDays: number
  id: string
  policyKey: string
  stage: PipelineState
  updatedAt: string
}

const maxBodyBytes = 64 * 1024
const maxTextLength = 180
const activeStates = new Set<PipelineState>([
  'applied',
  'employer_review',
  'interview',
  'packet_review',
  'recruiter_screen',
])
const finalStates = new Set<PipelineState>(['archived', 'closed', 'offer'])
const pipelineStates: PipelineState[] = [
  'discovered',
  'packet_review',
  'applied',
  'employer_review',
  'recruiter_screen',
  'interview',
  'offer',
  'closed',
  'archived',
]
const defaultPolicies: Array<{
  candidateFollowUpDays: number
  employerSlaDays: number
  fallbackSearchDays: number
  policyKey: string
  stage: PipelineState
}> = [
  { candidateFollowUpDays: 2, employerSlaDays: 4, fallbackSearchDays: 8, policyKey: 'candidate_packet_review', stage: 'packet_review' },
  { candidateFollowUpDays: 3, employerSlaDays: 7, fallbackSearchDays: 12, policyKey: 'post_apply_sla', stage: 'applied' },
  { candidateFollowUpDays: 3, employerSlaDays: 6, fallbackSearchDays: 10, policyKey: 'employer_review_sla', stage: 'employer_review' },
  { candidateFollowUpDays: 2, employerSlaDays: 5, fallbackSearchDays: 9, policyKey: 'recruiter_screen_sla', stage: 'recruiter_screen' },
  { candidateFollowUpDays: 1, employerSlaDays: 4, fallbackSearchDays: 7, policyKey: 'interview_sla', stage: 'interview' },
]

async function readBody(request: Request): Promise<PipelineRequestBody | null> {
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > maxBodyBytes) {
    return null
  }

  try {
    return (await request.json()) as PipelineRequestBody
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

function cleanState(value: unknown, fallback: PipelineState): PipelineState {
  const state = cleanKey(value)
  return pipelineStates.includes(state as PipelineState) ? (state as PipelineState) : fallback
}

function cents(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null
}

function addDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

function daysUntil(iso: string | null) {
  if (!iso) {
    return null
  }

  return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
}

function statusForDueDate(state: PipelineState, dueAt: string | null): EmployerUpdateStatus {
  if (!activeStates.has(state) || !dueAt) {
    return 'not_required'
  }

  const remainingDays = daysUntil(dueAt)
  if (remainingDays === null) {
    return 'not_required'
  }

  if (remainingDays < 0) {
    return 'overdue'
  }

  return remainingDays <= 2 ? 'due_soon' : 'current'
}

function riskForStatus(status: EmployerUpdateStatus, salaryMinCents: number | null, salaryMaxCents: number | null) {
  if (status === 'overdue') {
    return 'high' as const
  }

  if (status === 'due_soon') {
    return 'medium' as const
  }

  if (salaryMinCents !== null && salaryMaxCents !== null && salaryMinCents > salaryMaxCents) {
    return 'medium' as const
  }

  return 'low' as const
}

function itemFromRow(row: PipelineItemRow) {
  return {
    id: row.id,
    company: row.company,
    roleTitle: row.roleTitle,
    source: row.source,
    state: row.state,
    employerUpdateStatus: row.employerUpdateStatus,
    employerResponseDueAt: row.employerResponseDueAt,
    daysUntilEmployerResponse: daysUntil(row.employerResponseDueAt),
    lastCandidateActionAt: row.lastCandidateActionAt,
    lastEmployerActionAt: row.lastEmployerActionAt,
    salaryMinCents: row.salaryMinCents,
    salaryMaxCents: row.salaryMaxCents,
    riskLevel: row.riskLevel,
    notes: parseJson(row.notesJson, {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function eventFromRow(row: PipelineEventRow) {
  return {
    id: row.id,
    pipelineItemId: row.pipelineItemId,
    eventType: row.eventType,
    actorType: row.actorType,
    fromState: row.fromState,
    toState: row.toState,
    metadata: parseJson(row.metadataJson, {}),
    createdAt: row.createdAt,
  }
}

function taskFromRow(row: FollowUpTaskRow) {
  return {
    id: row.id,
    pipelineItemId: row.pipelineItemId,
    taskType: row.taskType,
    status: row.status,
    dueAt: row.dueAt,
    channel: row.channel,
    draftText: row.draftText,
    consentRequired: Boolean(row.consentRequired),
    riskLevel: row.riskLevel,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function policyFromRow(row: ResponsePolicyRow) {
  return {
    id: row.id,
    policyKey: row.policyKey,
    stage: row.stage,
    employerSlaDays: row.employerSlaDays,
    candidateFollowUpDays: row.candidateFollowUpDays,
    fallbackSearchDays: row.fallbackSearchDays,
    active: Boolean(row.active),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function ensurePolicies(env: RequestContext['env'], session: SessionContext) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  for (const policy of defaultPolicies) {
    await env.DB
      .prepare(
        `
        INSERT INTO pipeline_response_policies (
          id,
          tenant_id,
          policy_key,
          stage,
          employer_sla_days,
          candidate_follow_up_days,
          fallback_search_days
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, policy_key, stage)
        DO UPDATE SET
          employer_sla_days = excluded.employer_sla_days,
          candidate_follow_up_days = excluded.candidate_follow_up_days,
          fallback_search_days = excluded.fallback_search_days,
          active = 1,
          updated_at = datetime('now')
        `,
      )
      .bind(
        crypto.randomUUID(),
        session.tenantId,
        policy.policyKey,
        policy.stage,
        policy.employerSlaDays,
        policy.candidateFollowUpDays,
        policy.fallbackSearchDays,
      )
      .run()
  }
}

async function getPolicyForStage(env: RequestContext['env'], session: SessionContext, stage: PipelineState) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  return env.DB
    .prepare(
      `
      SELECT
        id,
        policy_key AS policyKey,
        stage,
        employer_sla_days AS employerSlaDays,
        candidate_follow_up_days AS candidateFollowUpDays,
        fallback_search_days AS fallbackSearchDays,
        active,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM pipeline_response_policies
      WHERE tenant_id = ?
        AND stage = ?
        AND active = 1
      LIMIT 1
      `,
    )
    .bind(session.tenantId, stage)
    .first<ResponsePolicyRow>()
}

async function createEvent(
  env: RequestContext['env'],
  session: SessionContext,
  input: {
    actorType: 'candidate' | 'employer' | 'policy' | 'system'
    eventType: string
    fromState?: string | null
    metadata?: Record<string, unknown>
    pipelineItemId: string
    toState?: string | null
  },
) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  await env.DB
    .prepare(
      `
      INSERT INTO pipeline_stage_events (
        id,
        tenant_id,
        user_id,
        pipeline_item_id,
        event_type,
        actor_type,
        from_state,
        to_state,
        metadata_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      crypto.randomUUID(),
      session.tenantId,
      session.userId,
      input.pipelineItemId,
      input.eventType,
      input.actorType,
      input.fromState ?? null,
      input.toState ?? null,
      JSON.stringify(input.metadata ?? {}),
    )
    .run()
}

function followUpDraft(company: string, roleTitle: string, status: EmployerUpdateStatus) {
  if (status === 'overdue') {
    return `Hi ${company} team, I wanted to check in on the ${roleTitle} process. I remain interested and would appreciate any update on timeline or next steps.`
  }

  return `Hi ${company} team, I am checking in on the ${roleTitle} process and wanted to confirm whether there is anything else you need from me.`
}

async function upsertFollowUps(
  env: RequestContext['env'],
  session: SessionContext,
  item: {
    company: string
    employerResponseDueAt: string | null
    employerUpdateStatus: EmployerUpdateStatus
    id: string
    riskLevel: RiskLevel
    roleTitle: string
    state: PipelineState
  },
  policy: ResponsePolicyRow | null,
) {
  if (!env.DB || !activeStates.has(item.state) || item.employerUpdateStatus === 'current') {
    return
  }

  const dueAt = item.employerResponseDueAt ?? addDays(policy?.candidateFollowUpDays ?? 3)
  const taskType: FollowUpTaskType = item.employerUpdateStatus === 'overdue' ? 'fallback_search' : 'employer_status_request'
  const existing = await env.DB
    .prepare(
      `
      SELECT id
      FROM pipeline_follow_up_tasks
      WHERE tenant_id = ?
        AND pipeline_item_id = ?
        AND task_type = ?
        AND status = 'open'
      LIMIT 1
      `,
    )
    .bind(session.tenantId, item.id, taskType)
    .first<{ id: string }>()

  if (existing) {
    await env.DB
      .prepare(
        `
        UPDATE pipeline_follow_up_tasks
        SET
          due_at = ?,
          draft_text = ?,
          risk_level = ?,
          updated_at = datetime('now')
        WHERE id = ?
          AND tenant_id = ?
        `,
      )
      .bind(dueAt, followUpDraft(item.company, item.roleTitle, item.employerUpdateStatus), item.riskLevel, existing.id, session.tenantId)
      .run()
    return
  }

  await env.DB
    .prepare(
      `
      INSERT INTO pipeline_follow_up_tasks (
        id,
        tenant_id,
        user_id,
        pipeline_item_id,
        task_type,
        due_at,
        channel,
        draft_text,
        consent_required,
        risk_level
      )
      VALUES (?, ?, ?, ?, ?, ?, 'email_draft', ?, 1, ?)
      `,
    )
    .bind(
      crypto.randomUUID(),
      session.tenantId,
      session.userId,
      item.id,
      taskType,
      dueAt,
      followUpDraft(item.company, item.roleTitle, item.employerUpdateStatus),
      item.riskLevel,
    )
    .run()
}

async function fetchPipelineState(env: RequestContext['env'], session: SessionContext) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  await ensurePolicies(env, session)

  const [itemRows, eventRows, taskRows, policyRows] = await Promise.all([
    env.DB
      .prepare(
        `
        SELECT
          id,
          company,
          role_title AS roleTitle,
          source,
          state,
          employer_update_status AS employerUpdateStatus,
          employer_response_due_at AS employerResponseDueAt,
          last_candidate_action_at AS lastCandidateActionAt,
          last_employer_action_at AS lastEmployerActionAt,
          salary_min_cents AS salaryMinCents,
          salary_max_cents AS salaryMaxCents,
          risk_level AS riskLevel,
          notes_json AS notesJson,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM application_pipeline_items
        WHERE tenant_id = ?
        ORDER BY updated_at DESC
        LIMIT 40
        `,
      )
      .bind(session.tenantId)
      .all<PipelineItemRow>(),
    env.DB
      .prepare(
        `
        SELECT
          id,
          pipeline_item_id AS pipelineItemId,
          event_type AS eventType,
          actor_type AS actorType,
          from_state AS fromState,
          to_state AS toState,
          metadata_json AS metadataJson,
          created_at AS createdAt
        FROM pipeline_stage_events
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 40
        `,
      )
      .bind(session.tenantId)
      .all<PipelineEventRow>(),
    env.DB
      .prepare(
        `
        SELECT
          id,
          pipeline_item_id AS pipelineItemId,
          task_type AS taskType,
          status,
          due_at AS dueAt,
          channel,
          draft_text AS draftText,
          consent_required AS consentRequired,
          risk_level AS riskLevel,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM pipeline_follow_up_tasks
        WHERE tenant_id = ?
        ORDER BY due_at ASC
        LIMIT 40
        `,
      )
      .bind(session.tenantId)
      .all<FollowUpTaskRow>(),
    env.DB
      .prepare(
        `
        SELECT
          id,
          policy_key AS policyKey,
          stage,
          employer_sla_days AS employerSlaDays,
          candidate_follow_up_days AS candidateFollowUpDays,
          fallback_search_days AS fallbackSearchDays,
          active,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM pipeline_response_policies
        WHERE tenant_id = ?
        ORDER BY stage
        `,
      )
      .bind(session.tenantId)
      .all<ResponsePolicyRow>(),
  ])

  const items = (itemRows.results ?? []).map(itemFromRow)
  const tasks = (taskRows.results ?? []).map(taskFromRow)

  return {
    events: (eventRows.results ?? []).map(eventFromRow),
    items,
    policies: (policyRows.results ?? []).map(policyFromRow),
    summary: {
      activeApplications: items.filter((item) => activeStates.has(item.state)).length,
      overdueApplications: items.filter((item) => item.employerUpdateStatus === 'overdue').length,
      dueSoonApplications: items.filter((item) => item.employerUpdateStatus === 'due_soon').length,
      openFollowUps: tasks.filter((task) => task.status === 'open').length,
      protectedFinalStates: items.filter((item) => finalStates.has(item.state)).length,
    },
    tasks,
  }
}

async function createPipelineItem(env: RequestContext['env'], session: SessionContext, body: PipelineRequestBody) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const company = cleanText(body.company)
  const roleTitle = cleanText(body.roleTitle)
  const state = cleanState(body.state, 'applied')
  const source = cleanText(body.source, 'manual')
  const salaryMinCents = cents(body.salaryRange?.minCents)
  const salaryMaxCents = cents(body.salaryRange?.maxCents)
  const policy = await getPolicyForStage(env, session, state)
  const employerResponseDueAt = activeStates.has(state) ? addDays(policy?.employerSlaDays ?? 7) : null
  const employerUpdateStatus = statusForDueDate(state, employerResponseDueAt)
  const riskLevel = riskForStatus(employerUpdateStatus, salaryMinCents, salaryMaxCents)

  if (!company || !roleTitle) {
    return json(
      {
        ok: false,
        error: 'missing_pipeline_target',
        message: 'Provide company and roleTitle before tracking an application.',
      },
      400,
    )
  }

  const itemId = crypto.randomUUID()
  await env.DB
    .prepare(
      `
      INSERT INTO application_pipeline_items (
        id,
        tenant_id,
        user_id,
        company,
        role_title,
        source,
        state,
        employer_update_status,
        employer_response_due_at,
        last_candidate_action_at,
        salary_min_cents,
        salary_max_cents,
        risk_level,
        notes_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?)
      `,
    )
    .bind(
      itemId,
      session.tenantId,
      session.userId,
      company,
      roleTitle,
      source,
      state,
      employerUpdateStatus,
      employerResponseDueAt,
      salaryMinCents,
      salaryMaxCents,
      riskLevel,
      JSON.stringify({
        createdFrom: 'jobsflow_pipeline_api',
        notes: cleanText(body.notes),
      }),
    )
    .run()

  await createEvent(env, session, {
    actorType: 'candidate',
    eventType: 'pipeline.item.created',
    metadata: {
      company,
      employerResponseDueAt,
      roleTitle,
      source,
    },
    pipelineItemId: itemId,
    toState: state,
  })

  await upsertFollowUps(
    env,
    session,
    {
      company,
      employerResponseDueAt,
      employerUpdateStatus,
      id: itemId,
      riskLevel,
      roleTitle,
      state,
    },
    policy,
  )

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'pipeline.item.created',
    actorType: 'user',
    action: 'Created anti-ghosting pipeline item with employer response SLA',
    riskLevel,
    metadata: {
      company,
      employerResponseDueAt,
      itemId,
      roleTitle,
      state,
    },
  })

  return json(
    {
      ok: true,
      itemId,
      state: await fetchPipelineState(env, session),
    },
    201,
  )
}

async function advancePipelineItem(env: RequestContext['env'], session: SessionContext, body: PipelineRequestBody) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const itemId = cleanText(body.itemId)
  const toState = cleanState(body.toState, 'employer_review')
  const existing = await env.DB
    .prepare(
      `
      SELECT id, company, role_title AS roleTitle, state
      FROM application_pipeline_items
      WHERE id = ?
        AND tenant_id = ?
      LIMIT 1
      `,
    )
    .bind(itemId, session.tenantId)
    .first<{ company: string; id: string; roleTitle: string; state: PipelineState }>()

  if (!existing) {
    return json(
      {
        ok: false,
        error: 'pipeline_item_not_found',
        message: 'JobsFlow could not find that tenant-scoped pipeline item.',
      },
      404,
    )
  }

  const policy = await getPolicyForStage(env, session, toState)
  const employerResponseDueAt = activeStates.has(toState) ? addDays(policy?.employerSlaDays ?? 7) : null
  const employerUpdateStatus = statusForDueDate(toState, employerResponseDueAt)
  const riskLevel = riskForStatus(employerUpdateStatus, null, null)

  await env.DB
    .prepare(
      `
      UPDATE application_pipeline_items
      SET
        state = ?,
        employer_update_status = ?,
        employer_response_due_at = ?,
        last_candidate_action_at = datetime('now'),
        risk_level = ?,
        updated_at = datetime('now')
      WHERE id = ?
        AND tenant_id = ?
      `,
    )
    .bind(toState, employerUpdateStatus, employerResponseDueAt, riskLevel, existing.id, session.tenantId)
    .run()

  await createEvent(env, session, {
    actorType: 'candidate',
    eventType: 'pipeline.stage.changed',
    fromState: existing.state,
    metadata: {
      employerResponseDueAt,
    },
    pipelineItemId: existing.id,
    toState,
  })

  await upsertFollowUps(
    env,
    session,
    {
      company: existing.company,
      employerResponseDueAt,
      employerUpdateStatus,
      id: existing.id,
      riskLevel,
      roleTitle: existing.roleTitle,
      state: toState,
    },
    policy,
  )

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'pipeline.stage.changed',
    actorType: 'user',
    action: 'Advanced anti-ghosting pipeline stage and recalculated response SLA',
    riskLevel,
    metadata: {
      fromState: existing.state,
      itemId: existing.id,
      toState,
    },
  })

  return json({
    ok: true,
    state: await fetchPipelineState(env, session),
  })
}

async function runStaleCheck(env: RequestContext['env'], session: SessionContext) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  await ensurePolicies(env, session)
  const rows = await env.DB
    .prepare(
      `
      SELECT
        id,
        company,
        role_title AS roleTitle,
        state,
        employer_response_due_at AS employerResponseDueAt,
        employer_update_status AS employerUpdateStatus,
        risk_level AS riskLevel
      FROM application_pipeline_items
      WHERE tenant_id = ?
        AND state IN ('packet_review', 'applied', 'employer_review', 'recruiter_screen', 'interview')
      ORDER BY updated_at DESC
      LIMIT 50
      `,
    )
    .bind(session.tenantId)
    .all<{
      company: string
      employerResponseDueAt: string | null
      employerUpdateStatus: EmployerUpdateStatus
      id: string
      riskLevel: RiskLevel
      roleTitle: string
      state: PipelineState
    }>()

  let updatedCount = 0
  for (const row of rows.results ?? []) {
    const nextStatus = statusForDueDate(row.state, row.employerResponseDueAt)
    const nextRisk = riskForStatus(nextStatus, null, null)
    if (nextStatus !== row.employerUpdateStatus || nextRisk !== row.riskLevel) {
      updatedCount += 1
      await env.DB
        .prepare(
          `
          UPDATE application_pipeline_items
          SET
            employer_update_status = ?,
            risk_level = ?,
            updated_at = datetime('now')
          WHERE id = ?
            AND tenant_id = ?
          `,
        )
        .bind(nextStatus, nextRisk, row.id, session.tenantId)
        .run()
    }

    const policy = await getPolicyForStage(env, session, row.state)
    await upsertFollowUps(
      env,
      session,
      {
        company: row.company,
        employerResponseDueAt: row.employerResponseDueAt,
        employerUpdateStatus: nextStatus,
        id: row.id,
        riskLevel: nextRisk,
        roleTitle: row.roleTitle,
        state: row.state,
      },
      policy,
    )
  }

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'pipeline.stale_check.completed',
    actorType: 'system',
    action: 'Checked anti-ghosting pipeline response SLAs and drafted follow-up tasks',
    riskLevel: updatedCount ? 'medium' : 'low',
    metadata: {
      checkedCount: rows.results?.length ?? 0,
      updatedCount,
    },
  })

  return json({
    ok: true,
    state: await fetchPipelineState(env, session),
  })
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before reading pipeline state.' }, 401)
  }

  try {
    return json({
      ok: true,
      state: await fetchPipelineState(env, session),
    })
  } catch (error) {
    return json(
      {
        ok: false,
        error: 'pipeline_unavailable',
        message: 'Anti-ghosting pipeline tables are not ready yet. Apply the latest D1 migration.',
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
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before changing pipeline state.' }, 401)
  }

  if (session.tenantType !== 'candidate') {
    return json(
      {
        ok: false,
        error: 'wrong_workspace_type',
        message: 'Anti-ghosting pipeline tracking is scoped to candidate workspaces.',
      },
      403,
    )
  }

  const body = await readBody(request)
  if (!body) {
    return json({ ok: false, error: 'payload_too_large', message: 'Pipeline payload is limited to 64 KB.' }, 413)
  }

  const action = cleanKey(body.action, 'create_item')
  try {
    await ensurePolicies(env, session)

    if (action === 'create_item') {
      return createPipelineItem(env, session, body)
    }

    if (action === 'advance_stage') {
      return advancePipelineItem(env, session, body)
    }

    if (action === 'run_stale_check') {
      return runStaleCheck(env, session)
    }

    return json(
      {
        ok: false,
        error: 'unsupported_pipeline_action',
        message: 'Pipeline action must be create_item, advance_stage, or run_stale_check.',
      },
      400,
    )
  } catch (error) {
    return json(
      {
        ok: false,
        error: 'pipeline_error',
        message: 'JobsFlow could not complete the anti-ghosting pipeline action.',
        detail: error instanceof Error ? safeString(error.message, 'unknown_error') : 'unknown_error',
      },
      500,
    )
  }
}
