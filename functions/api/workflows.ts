import type { RequestContext, SessionContext } from '../_shared'
import { getSession, json, missingConfig, safeString, writeAuditEvent } from '../_shared'

type WorkflowWorkspace = 'candidate' | 'employer' | 'platform'
type WorkflowRunState =
  | 'pending'
  | 'running'
  | 'waiting_for_approval'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'canceled'
type ActorType = 'integration' | 'policy' | 'system' | 'user'
type RiskLevel = 'high' | 'low' | 'medium'
type ConsentStatus = 'approved' | 'expired' | 'pending' | 'revoked'

type WorkflowDefinitionSeed = {
  description: string
  key: string
  name: string
  requiredBindings: string[]
  steps: string[]
  triggerEvent: string
  version: number
  workspace: WorkflowWorkspace
}

type WorkflowDefinitionRow = {
  active: number
  createdAt: string
  description: string
  id: string
  name: string
  requiredBindingsJson: string
  stepsJson: string
  triggerEvent: string
  updatedAt: string
  version: number
  workflowKey: string
  workspace: WorkflowWorkspace
}

type WorkflowRunRow = {
  completedAt: string | null
  createdAt: string
  currentStep: string
  definitionId: string
  errorJson: string
  failedAt: string | null
  id: string
  inputJson: string
  lastEventAt: string
  priority: number
  resultJson: string
  startedAt: string | null
  state: WorkflowRunState
  subjectId: string
  subjectType: string
  updatedAt: string
  userId: string | null
  workflowKey: string
}

type WorkflowEventRow = {
  actorType: ActorType
  createdAt: string
  eventType: string
  id: string
  payloadJson: string
  riskLevel: RiskLevel
  runId: string | null
  userId: string | null
}

type ConsentReceiptRow = {
  action: string
  approvedAt: string | null
  createdAt: string
  expiresAt: string | null
  id: string
  previewJson: string
  revokedAt: string | null
  scopeJson: string
  status: ConsentStatus
  updatedAt: string
  userId: string | null
  workflowRunId: string | null
}

type AutomationPolicyRow = {
  createdAt: string
  dailyLimit: number
  enabled: number
  id: string
  mode: 'copilot' | 'guarded_autopilot' | 'review_only'
  policyKey: string
  requiresConsent: number
  riskLevel: RiskLevel
  rulesJson: string
  updatedAt: string
}

type IntegrationAccountRow = {
  accountLabel: string
  createdAt: string
  expiresAt: string | null
  id: string
  lastSyncAt: string | null
  provider: string
  scopesJson: string
  status: 'connected' | 'disabled' | 'needs_reauth' | 'not_connected'
  tokenReference: string | null
  updatedAt: string
}

type WebhookDeliveryRow = {
  attemptCount: number
  createdAt: string
  destination: string
  eventType: string
  id: string
  lastError: string | null
  nextAttemptAt: string | null
  requestJson: string
  responseJson: string
  status: 'blocked' | 'delivered' | 'failed' | 'queued'
  updatedAt: string
  workflowRunId: string | null
}

type WorkflowRequestBody = {
  action?: unknown
  consentStatus?: unknown
  input?: unknown
  priority?: unknown
  receiptId?: unknown
  subjectId?: unknown
  subjectType?: unknown
  workflowKey?: unknown
}

const maxBodyBytes = 64 * 1024
const maxTextLength = 180
const jsonFallbackObject = {}
const jsonFallbackList: unknown[] = []

const workflowDefinitions: WorkflowDefinitionSeed[] = [
  {
    key: 'platform.workflow_kernel',
    name: 'Cloudflare Production Workflow Kernel',
    version: 1,
    workspace: 'platform',
    triggerEvent: 'tenant.created',
    description:
      'Establishes durable workflow runs, consent receipts, automation policies, integration boundaries, webhook delivery state, and audit events for every tenant.',
    steps: [
      'seed_workflow_definitions',
      'seed_tenant_policies',
      'seed_integration_boundaries',
      'create_consent_receipts',
      'record_audit_event',
      'block_external_actions_until_certified',
    ],
    requiredBindings: ['D1', 'R2', 'Queues', 'Workflows', 'Vectorize', 'AI Gateway'],
  },
  {
    key: 'resume.tailwind_optimization',
    name: 'Resume Tailwind Optimization',
    version: 1,
    workspace: 'candidate',
    triggerEvent: 'resume.uploaded',
    description:
      'Parses a master resume, extracts structured facts, compares against a target job, computes semantic gaps, drafts variants, and requires candidate approval.',
    steps: [
      'store_source_artifact',
      'parse_resume',
      'extract_profile_facts',
      'embed_resume_facts',
      'compare_target_job',
      'create_gap_report',
      'draft_tailored_variant',
      'require_candidate_approval',
    ],
    requiredBindings: ['D1', 'R2', 'Vectorize', 'AI Gateway', 'Queues'],
  },
  {
    key: 'candidate.anti_ghosting_tracker',
    name: 'Anti-Ghosting Pipeline Tracker',
    version: 1,
    workspace: 'candidate',
    triggerEvent: 'application.stage_changed',
    description:
      'Controls candidate application stages, employer response expectations, fallback reminders, follow-up drafts, and stale-stage escalation.',
    steps: [
      'record_stage_change',
      'calculate_response_sla',
      'schedule_follow_up_check',
      'draft_candidate_reminder',
      'require_send_approval',
      'record_outcome',
    ],
    requiredBindings: ['D1', 'Queues', 'Workflows', 'AI Gateway'],
  },
  {
    key: 'candidate.interview_prep_sandbox',
    name: 'Native AI Interview Prep Sandbox',
    version: 1,
    workspace: 'candidate',
    triggerEvent: 'interview.scheduled',
    description:
      'Creates role-specific mock interviews, scorecard prompts, answer rubrics, story-bank recommendations, and evaluation receipts.',
    steps: [
      'load_target_role',
      'load_candidate_evidence',
      'generate_mock_questions',
      'capture_practice_answer',
      'score_against_rubric',
      'recommend_story_revisions',
    ],
    requiredBindings: ['D1', 'R2', 'Durable Objects', 'AI Gateway'],
  },
  {
    key: 'market.transparency_blueprint',
    name: 'Transparency Blueprint Portal',
    version: 1,
    workspace: 'platform',
    triggerEvent: 'company_signal.verified',
    description:
      'Normalizes salary, contract, interview, and culture signals into confidence-scored transparency records with moderation controls.',
    steps: [
      'ingest_verified_signal',
      'deidentify_sensitive_fields',
      'score_confidence',
      'moderate_abuse_risk',
      'publish_transparency_record',
    ],
    requiredBindings: ['D1', 'R2', 'Queues', 'AI Gateway'],
  },
  {
    key: 'candidate.passive_sourcing_cards',
    name: 'Passive Sourcing Cards',
    version: 1,
    workspace: 'candidate',
    triggerEvent: 'candidate.visibility_enabled',
    description:
      'Publishes anonymous candidate skill cards while masking identity, contact data, employer conflicts, and current-company details until consent.',
    steps: [
      'select_approved_signals',
      'mask_sensitive_identity',
      'apply_company_exclusions',
      'publish_anonymous_card',
      'route_recruiter_interest',
      'require_contact_unlock_consent',
    ],
    requiredBindings: ['D1', 'Vectorize', 'Queues', 'AI Gateway'],
  },
  {
    key: 'employer.semantic_skill_matching',
    name: 'Semantic Vector Skill-Matching',
    version: 1,
    workspace: 'employer',
    triggerEvent: 'role.scorecard_locked',
    description:
      'Embeds role criteria and candidate evidence, then ranks related experience by semantic fit, must-have coverage, and coachable gaps.',
    steps: [
      'lock_scorecard_version',
      'embed_role_criteria',
      'query_candidate_vectors',
      'score_must_have_coverage',
      'classify_coachable_gaps',
      'create_explainable_shortlist',
    ],
    requiredBindings: ['D1', 'Vectorize', 'AI Gateway', 'Queues'],
  },
  {
    key: 'employer.job_syndication',
    name: 'One-Click Job Syndication Engine',
    version: 1,
    workspace: 'employer',
    triggerEvent: 'job.publish_requested',
    description:
      'Validates role criteria, compensation visibility, fairness checks, structured data, and delivery state before syndicating a job.',
    steps: [
      'validate_role_readiness',
      'generate_google_jobs_payload',
      'prepare_partner_payloads',
      'require_publisher_approval',
      'queue_syndication_delivery',
      'track_delivery_receipts',
    ],
    requiredBindings: ['D1', 'Queues', 'Workflows'],
  },
  {
    key: 'employer.conversational_prescreening',
    name: 'Conversational Pre-Screening Agents',
    version: 1,
    workspace: 'employer',
    triggerEvent: 'candidate.prescreen_started',
    description:
      'Runs a criteria-bound candidate conversation for visa, timeline, baseline skills, and scheduling readiness with transcript audit.',
    steps: [
      'load_locked_criteria',
      'start_prescreen_session',
      'collect_required_answers',
      'evaluate_minimum_criteria',
      'store_transcript_receipt',
      'handoff_to_scheduler',
    ],
    requiredBindings: ['D1', 'Durable Objects', 'AI Gateway', 'Queues'],
  },
  {
    key: 'profile.dynamic_achievement_cards',
    name: 'Dynamic Achievement Profiles',
    version: 1,
    workspace: 'platform',
    triggerEvent: 'resume.facts_extracted',
    description:
      'Transforms wall-of-text resumes into structured achievement cards with metrics, credentials, evidence provenance, and sharing controls.',
    steps: [
      'extract_achievement_claims',
      'detect_metrics',
      'attach_source_evidence',
      'flag_unverified_claims',
      'generate_profile_cards',
      'require_candidate_review',
    ],
    requiredBindings: ['D1', 'R2', 'AI Gateway'],
  },
  {
    key: 'integration.ats_synchronizer',
    name: 'Two-Way Native ATS Synchronizers',
    version: 1,
    workspace: 'employer',
    triggerEvent: 'ats.sync_requested',
    description:
      'Coordinates OAuth-backed ATS sync with idempotent pushes, webhook ingestion, conflict detection, retries, and tenant-scoped audit history.',
    steps: [
      'verify_oauth_connection',
      'map_provider_fields',
      'pull_remote_changes',
      'detect_conflicts',
      'queue_outbound_updates',
      'record_sync_receipts',
    ],
    requiredBindings: ['D1', 'Queues', 'Workflows', 'AI Gateway'],
  },
]

const policySeeds = [
  {
    dailyLimit: 0,
    enabled: true,
    mode: 'review_only',
    policyKey: 'review_only_drafts',
    requiresConsent: true,
    riskLevel: 'low',
    rules: {
      externalActions: false,
      storesDraftHistory: true,
      requiresHumanReview: true,
    },
  },
  {
    dailyLimit: 12,
    enabled: true,
    mode: 'copilot',
    policyKey: 'candidate_packet_queue',
    requiresConsent: true,
    riskLevel: 'medium',
    rules: {
      allowPacketQueue: true,
      externalActions: false,
      requireSalaryAndExclusionChecks: true,
    },
  },
  {
    dailyLimit: 0,
    enabled: false,
    mode: 'guarded_autopilot',
    policyKey: 'external_submission',
    requiresConsent: true,
    riskLevel: 'high',
    rules: {
      certifiedIntegrationsOnly: true,
      externalActions: false,
      perActionConsentRequired: true,
    },
  },
  {
    dailyLimit: 0,
    enabled: false,
    mode: 'guarded_autopilot',
    policyKey: 'employer_visibility',
    requiresConsent: true,
    riskLevel: 'high',
    rules: {
      candidateConsentRequired: true,
      employerDataUseTermsRequired: true,
      maskCurrentEmployer: true,
    },
  },
] as const

const integrationSeeds = [
  ['greenhouse', 'Greenhouse ATS'],
  ['lever', 'Lever ATS'],
  ['workday', 'Workday guarded beta'],
  ['google_jobs', 'Google for Jobs'],
  ['google_calendar', 'Google Calendar'],
  ['gmail', 'Gmail drafts'],
  ['outlook', 'Outlook drafts'],
  ['stripe', 'Stripe Billing'],
  ['slack', 'Slack team alerts'],
] as const

async function readBody(request: Request): Promise<WorkflowRequestBody | null> {
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > maxBodyBytes) {
    return null
  }

  try {
    return (await request.json()) as WorkflowRequestBody
  } catch {
    return {}
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
  const cleaned = cleanText(value, fallback).toLowerCase()
  return cleaned.replace(/[^a-z0-9_.:-]/g, '').slice(0, 96)
}

function cleanSubjectType(value: unknown) {
  const cleaned = cleanKey(value, 'tenant')
  return cleaned || 'tenant'
}

function cleanSubjectId(value: unknown, fallback: string) {
  const cleaned = cleanText(value, fallback).replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 128)
  return cleaned || fallback
}

function cleanPriority(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 9 ? Number(value) : 5
}

function asJsonObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return jsonFallbackObject
  }

  return value as Record<string, unknown>
}

function parseJson(value: string, fallback: unknown) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return fallback
  }
}

function definitionFromRow(row: WorkflowDefinitionRow) {
  return {
    id: row.id,
    key: row.workflowKey,
    name: row.name,
    version: row.version,
    workspace: row.workspace,
    description: row.description,
    triggerEvent: row.triggerEvent,
    steps: parseJson(row.stepsJson, jsonFallbackList),
    requiredBindings: parseJson(row.requiredBindingsJson, jsonFallbackList),
    active: Boolean(row.active),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function runFromRow(row: WorkflowRunRow) {
  return {
    id: row.id,
    definitionId: row.definitionId,
    workflowKey: row.workflowKey,
    state: row.state,
    currentStep: row.currentStep,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    priority: row.priority,
    input: parseJson(row.inputJson, jsonFallbackObject),
    result: parseJson(row.resultJson, jsonFallbackObject),
    error: parseJson(row.errorJson, jsonFallbackObject),
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    failedAt: row.failedAt,
    lastEventAt: row.lastEventAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function eventFromRow(row: WorkflowEventRow) {
  return {
    id: row.id,
    runId: row.runId,
    userId: row.userId,
    eventType: row.eventType,
    actorType: row.actorType,
    riskLevel: row.riskLevel,
    payload: parseJson(row.payloadJson, jsonFallbackObject),
    createdAt: row.createdAt,
  }
}

function receiptFromRow(row: ConsentReceiptRow) {
  return {
    id: row.id,
    userId: row.userId,
    workflowRunId: row.workflowRunId,
    action: row.action,
    scope: parseJson(row.scopeJson, jsonFallbackObject),
    preview: parseJson(row.previewJson, jsonFallbackObject),
    status: row.status,
    expiresAt: row.expiresAt,
    approvedAt: row.approvedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function policyFromRow(row: AutomationPolicyRow) {
  return {
    id: row.id,
    policyKey: row.policyKey,
    mode: row.mode,
    enabled: Boolean(row.enabled),
    dailyLimit: row.dailyLimit,
    requiresConsent: Boolean(row.requiresConsent),
    riskLevel: row.riskLevel,
    rules: parseJson(row.rulesJson, jsonFallbackObject),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function integrationFromRow(row: IntegrationAccountRow) {
  return {
    id: row.id,
    provider: row.provider,
    accountLabel: row.accountLabel,
    status: row.status,
    scopes: parseJson(row.scopesJson, jsonFallbackList),
    tokenReference: row.tokenReference,
    expiresAt: row.expiresAt,
    lastSyncAt: row.lastSyncAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function deliveryFromRow(row: WebhookDeliveryRow) {
  return {
    id: row.id,
    workflowRunId: row.workflowRunId,
    destination: row.destination,
    eventType: row.eventType,
    status: row.status,
    attemptCount: row.attemptCount,
    nextAttemptAt: row.nextAttemptAt,
    lastError: row.lastError,
    request: parseJson(row.requestJson, jsonFallbackObject),
    response: parseJson(row.responseJson, jsonFallbackObject),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function fetchKernelState(env: RequestContext['env'], session: SessionContext) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const [definitionRows, runRows, eventRows, receiptRows, policyRows, integrationRows, deliveryRows] =
    await Promise.all([
      env.DB
        .prepare(
          `
          SELECT
            id,
            workflow_key AS workflowKey,
            name,
            version,
            workspace,
            description,
            trigger_event AS triggerEvent,
            steps_json AS stepsJson,
            required_bindings_json AS requiredBindingsJson,
            active,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM workflow_definitions
          WHERE active = 1
          ORDER BY workspace, workflow_key
          `,
        )
        .all<WorkflowDefinitionRow>(),
      env.DB
        .prepare(
          `
          SELECT
            id,
            user_id AS userId,
            definition_id AS definitionId,
            workflow_key AS workflowKey,
            state,
            current_step AS currentStep,
            subject_type AS subjectType,
            subject_id AS subjectId,
            priority,
            input_json AS inputJson,
            result_json AS resultJson,
            error_json AS errorJson,
            started_at AS startedAt,
            completed_at AS completedAt,
            failed_at AS failedAt,
            last_event_at AS lastEventAt,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM workflow_runs
          WHERE tenant_id = ?
          ORDER BY updated_at DESC
          LIMIT 25
          `,
        )
        .bind(session.tenantId)
        .all<WorkflowRunRow>(),
      env.DB
        .prepare(
          `
          SELECT
            id,
            user_id AS userId,
            run_id AS runId,
            event_type AS eventType,
            actor_type AS actorType,
            risk_level AS riskLevel,
            payload_json AS payloadJson,
            created_at AS createdAt
          FROM workflow_events
          WHERE tenant_id = ?
          ORDER BY created_at DESC
          LIMIT 30
          `,
        )
        .bind(session.tenantId)
        .all<WorkflowEventRow>(),
      env.DB
        .prepare(
          `
          SELECT
            id,
            user_id AS userId,
            workflow_run_id AS workflowRunId,
            action,
            scope_json AS scopeJson,
            preview_json AS previewJson,
            status,
            expires_at AS expiresAt,
            approved_at AS approvedAt,
            revoked_at AS revokedAt,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM consent_receipts
          WHERE tenant_id = ?
          ORDER BY created_at DESC
          LIMIT 25
          `,
        )
        .bind(session.tenantId)
        .all<ConsentReceiptRow>(),
      env.DB
        .prepare(
          `
          SELECT
            id,
            policy_key AS policyKey,
            mode,
            enabled,
            daily_limit AS dailyLimit,
            requires_consent AS requiresConsent,
            risk_level AS riskLevel,
            rules_json AS rulesJson,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM automation_policies
          WHERE tenant_id = ?
          ORDER BY policy_key
          `,
        )
        .bind(session.tenantId)
        .all<AutomationPolicyRow>(),
      env.DB
        .prepare(
          `
          SELECT
            id,
            provider,
            account_label AS accountLabel,
            status,
            scopes_json AS scopesJson,
            token_reference AS tokenReference,
            expires_at AS expiresAt,
            last_sync_at AS lastSyncAt,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM integration_accounts
          WHERE tenant_id = ?
          ORDER BY provider
          `,
        )
        .bind(session.tenantId)
        .all<IntegrationAccountRow>(),
      env.DB
        .prepare(
          `
          SELECT
            id,
            workflow_run_id AS workflowRunId,
            destination,
            event_type AS eventType,
            status,
            attempt_count AS attemptCount,
            next_attempt_at AS nextAttemptAt,
            last_error AS lastError,
            request_json AS requestJson,
            response_json AS responseJson,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM webhook_deliveries
          WHERE tenant_id = ?
          ORDER BY created_at DESC
          LIMIT 20
          `,
        )
        .bind(session.tenantId)
        .all<WebhookDeliveryRow>(),
    ])

  const runs = (runRows.results ?? []).map(runFromRow)
  const receipts = (receiptRows.results ?? []).map(receiptFromRow)
  const policies = (policyRows.results ?? []).map(policyFromRow)
  const integrations = (integrationRows.results ?? []).map(integrationFromRow)

  return {
    definitions: (definitionRows.results ?? []).map(definitionFromRow),
    runs,
    events: (eventRows.results ?? []).map(eventFromRow),
    receipts,
    policies,
    integrations,
    deliveries: (deliveryRows.results ?? []).map(deliveryFromRow),
    summary: {
      activeDefinitions: definitionRows.results?.length ?? 0,
      activeRuns: runs.filter((run) => !['canceled', 'completed', 'failed'].includes(run.state)).length,
      pendingReceipts: receipts.filter((receipt) => receipt.status === 'pending').length,
      enabledPolicies: policies.filter((policy) => policy.enabled).length,
      connectedIntegrations: integrations.filter((integration) => integration.status === 'connected').length,
      externalActionsEnabled: false,
    },
  }
}

async function ensureWorkflowDefinitions(env: RequestContext['env']) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  for (const definition of workflowDefinitions) {
    await env.DB
      .prepare(
        `
        INSERT INTO workflow_definitions (
          id,
          workflow_key,
          name,
          version,
          workspace,
          description,
          trigger_event,
          steps_json,
          required_bindings_json,
          active
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(workflow_key, version)
        DO UPDATE SET
          name = excluded.name,
          workspace = excluded.workspace,
          description = excluded.description,
          trigger_event = excluded.trigger_event,
          steps_json = excluded.steps_json,
          required_bindings_json = excluded.required_bindings_json,
          active = 1,
          updated_at = datetime('now')
        `,
      )
      .bind(
        crypto.randomUUID(),
        definition.key,
        definition.name,
        definition.version,
        definition.workspace,
        definition.description,
        definition.triggerEvent,
        JSON.stringify(definition.steps),
        JSON.stringify(definition.requiredBindings),
      )
      .run()
  }
}

async function ensureTenantPolicies(env: RequestContext['env'], session: SessionContext) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  for (const policy of policySeeds) {
    await env.DB
      .prepare(
        `
        INSERT INTO automation_policies (
          id,
          tenant_id,
          policy_key,
          mode,
          enabled,
          daily_limit,
          requires_consent,
          risk_level,
          rules_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, policy_key)
        DO UPDATE SET
          mode = excluded.mode,
          daily_limit = excluded.daily_limit,
          requires_consent = excluded.requires_consent,
          risk_level = excluded.risk_level,
          rules_json = excluded.rules_json,
          updated_at = datetime('now')
        `,
      )
      .bind(
        crypto.randomUUID(),
        session.tenantId,
        policy.policyKey,
        policy.mode,
        policy.enabled ? 1 : 0,
        policy.dailyLimit,
        policy.requiresConsent ? 1 : 0,
        policy.riskLevel,
        JSON.stringify(policy.rules),
      )
      .run()
  }
}

async function ensureIntegrationBoundaries(env: RequestContext['env'], session: SessionContext) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  for (const [provider, label] of integrationSeeds) {
    await env.DB
      .prepare(
        `
        INSERT INTO integration_accounts (
          id,
          tenant_id,
          provider,
          account_label,
          status,
          scopes_json,
          token_reference
        )
        VALUES (?, ?, ?, ?, 'not_connected', '[]', NULL)
        ON CONFLICT(tenant_id, provider, account_label)
        DO UPDATE SET
          updated_at = datetime('now')
        `,
      )
      .bind(crypto.randomUUID(), session.tenantId, provider, label)
      .run()
  }
}

async function getDefinitionByKey(env: RequestContext['env'], workflowKey: string) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  return env.DB
    .prepare(
      `
      SELECT
        id,
        workflow_key AS workflowKey,
        name,
        version,
        workspace,
        description,
        trigger_event AS triggerEvent,
        steps_json AS stepsJson,
        required_bindings_json AS requiredBindingsJson,
        active,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM workflow_definitions
      WHERE workflow_key = ? AND active = 1
      ORDER BY version DESC
      LIMIT 1
      `,
    )
    .bind(workflowKey)
    .first<WorkflowDefinitionRow>()
}

async function createWorkflowEvent(
  env: RequestContext['env'],
  session: SessionContext,
  input: {
    actorType: ActorType
    eventType: string
    payload?: Record<string, unknown>
    riskLevel: RiskLevel
    runId?: string | null
  },
) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      crypto.randomUUID(),
      session.tenantId,
      session.userId,
      input.runId ?? null,
      input.eventType,
      input.actorType,
      input.riskLevel,
      JSON.stringify(input.payload ?? {}),
    )
    .run()
}

async function bootstrapCore(env: RequestContext['env'], session: SessionContext) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  await ensureWorkflowDefinitions(env)
  await ensureTenantPolicies(env, session)
  await ensureIntegrationBoundaries(env, session)

  const definition = await getDefinitionByKey(env, 'platform.workflow_kernel')
  if (!definition) {
    throw new Error('workflow_definition_missing')
  }

  const existingRun = await env.DB
    .prepare(
      `
      SELECT id
      FROM workflow_runs
      WHERE tenant_id = ?
        AND workflow_key = 'platform.workflow_kernel'
        AND subject_type = 'tenant'
        AND subject_id = ?
      ORDER BY created_at DESC
      LIMIT 1
      `,
    )
    .bind(session.tenantId, session.tenantId)
    .first<{ id: string }>()

  const runId = existingRun?.id ?? crypto.randomUUID()
  let createdRun = false

  if (!existingRun) {
    createdRun = true
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
          started_at
        )
        VALUES (?, ?, ?, ?, ?, 'waiting_for_approval', 'consent_receipts_required', 'tenant', ?, 4, ?, ?, datetime('now'))
        `,
      )
      .bind(
        runId,
        session.tenantId,
        session.userId,
        definition.id,
        definition.workflowKey,
        session.tenantId,
        JSON.stringify({
          stack: 'cloudflare',
          pillars: workflowDefinitions.filter((item) => item.key !== 'platform.workflow_kernel').length,
          externalSubmissionsEnabled: false,
        }),
        JSON.stringify({
          definitionsSeeded: workflowDefinitions.length,
          policiesSeeded: policySeeds.length,
          integrationBoundariesSeeded: integrationSeeds.length,
        }),
      )
      .run()

    await env.DB
      .prepare(
        `
        INSERT INTO consent_receipts (
          id,
          tenant_id,
          user_id,
          workflow_run_id,
          action,
          scope_json,
          preview_json,
          status,
          expires_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now', '+30 days'))
        `,
      )
      .bind(
        crypto.randomUUID(),
        session.tenantId,
        session.userId,
        runId,
        'external_action.requested',
        JSON.stringify({
          providers: [],
          allowedDestinations: [],
          externalSubmissionsEnabled: false,
        }),
        JSON.stringify({
          title: 'External actions remain blocked',
          detail:
            'JobsFlow will not submit applications, send outreach, syndicate jobs, or sync ATS records until the provider is certified and a per-action consent receipt exists.',
        }),
      )
      .run()

    await env.DB
      .prepare(
        `
        INSERT INTO webhook_deliveries (
          id,
          tenant_id,
          workflow_run_id,
          destination,
          event_type,
          status,
          attempt_count,
          last_error,
          request_json,
          response_json
        )
        VALUES (?, ?, ?, 'internal_audit_stream', 'workflow.kernel.bootstrapped', 'blocked', 0, ?, ?, '{}')
        `,
      )
      .bind(
        crypto.randomUUID(),
        session.tenantId,
        runId,
        'External delivery is blocked until a certified integration and consent receipt exist.',
        JSON.stringify({
          reason: 'production_safety_gate',
        }),
      )
      .run()
  } else {
    await env.DB
      .prepare(
        `
        UPDATE workflow_runs
        SET
          last_event_at = datetime('now'),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
        `,
      )
      .bind(runId, session.tenantId)
      .run()
  }

  await createWorkflowEvent(env, session, {
    actorType: 'system',
    eventType: createdRun ? 'workflow.kernel.bootstrapped' : 'workflow.kernel.checked',
    riskLevel: 'low',
    runId,
    payload: {
      definitions: workflowDefinitions.length,
      policies: policySeeds.length,
      integrations: integrationSeeds.length,
      externalSubmissionsEnabled: false,
    },
  })

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: createdRun ? 'workflow.kernel.bootstrapped' : 'workflow.kernel.checked',
    actorType: 'system',
    action: createdRun
      ? 'Bootstrapped Cloudflare production workflow kernel'
      : 'Verified Cloudflare production workflow kernel',
    riskLevel: 'low',
    metadata: {
      runId,
      definitions: workflowDefinitions.length,
      policies: policySeeds.length,
      integrations: integrationSeeds.length,
      externalSubmissionsEnabled: false,
    },
  })

  return {
    createdRun,
    runId,
    state: await fetchKernelState(env, session),
  }
}

async function startWorkflowRun(env: RequestContext['env'], session: SessionContext, body: WorkflowRequestBody) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  await ensureWorkflowDefinitions(env)

  const workflowKey = cleanKey(body.workflowKey)
  if (!workflowKey) {
    return json(
      {
        ok: false,
        error: 'missing_workflow_key',
        message: 'Provide workflowKey before starting a workflow run.',
      },
      400,
    )
  }

  const definition = await getDefinitionByKey(env, workflowKey)
  if (!definition) {
    return json(
      {
        ok: false,
        error: 'workflow_not_found',
        message: 'JobsFlow does not have an active workflow definition for that key.',
      },
      404,
    )
  }

  const runId = crypto.randomUUID()
  const subjectType = cleanSubjectType(body.subjectType)
  const subjectId = cleanSubjectId(body.subjectId, session.tenantId)
  const priority = cleanPriority(body.priority)

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
        started_at
      )
      VALUES (?, ?, ?, ?, ?, 'waiting_for_approval', 'review_gate', ?, ?, ?, ?, datetime('now'))
      `,
    )
    .bind(
      runId,
      session.tenantId,
      session.userId,
      definition.id,
      definition.workflowKey,
      subjectType,
      subjectId,
      priority,
      JSON.stringify(asJsonObject(body.input)),
    )
    .run()

  await env.DB
    .prepare(
      `
      INSERT INTO consent_receipts (
        id,
        tenant_id,
        user_id,
        workflow_run_id,
        action,
        scope_json,
        preview_json,
        status,
        expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now', '+14 days'))
      `,
    )
    .bind(
      crypto.randomUUID(),
      session.tenantId,
      session.userId,
      runId,
      `${definition.workflowKey}.start`,
      JSON.stringify({
        workflowKey: definition.workflowKey,
        subjectType,
        subjectId,
      }),
      JSON.stringify({
        title: definition.name,
        detail: definition.description,
        nextStep: 'Human approval is required before JobsFlow performs any external action.',
      }),
    )
    .run()

  await createWorkflowEvent(env, session, {
    actorType: 'user',
    eventType: 'workflow.run.started',
    riskLevel: 'medium',
    runId,
    payload: {
      workflowKey: definition.workflowKey,
      state: 'waiting_for_approval',
      subjectType,
      subjectId,
    },
  })

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: 'workflow.run.started',
    actorType: 'user',
    action: `Started ${definition.name} workflow run behind a review gate`,
    riskLevel: 'medium',
    metadata: {
      runId,
      workflowKey: definition.workflowKey,
      subjectType,
      subjectId,
    },
  })

  return json(
    {
      ok: true,
      runId,
      state: await fetchKernelState(env, session),
    },
    201,
  )
}

async function recordConsent(env: RequestContext['env'], session: SessionContext, body: WorkflowRequestBody) {
  if (!env.DB) {
    throw new Error('missing_db')
  }

  const receiptId = cleanSubjectId(body.receiptId, '')
  if (!receiptId) {
    return json(
      {
        ok: false,
        error: 'missing_receipt_id',
        message: 'Provide receiptId before recording a consent decision.',
      },
      400,
    )
  }

  const status = cleanKey(body.consentStatus)
  if (status !== 'approved' && status !== 'revoked') {
    return json(
      {
        ok: false,
        error: 'invalid_consent_status',
        message: 'Consent status must be approved or revoked.',
      },
      400,
    )
  }

  const receipt = await env.DB
    .prepare(
      `
      SELECT id, workflow_run_id AS workflowRunId, action
      FROM consent_receipts
      WHERE id = ? AND tenant_id = ?
      LIMIT 1
      `,
    )
    .bind(receiptId, session.tenantId)
    .first<{ action: string; id: string; workflowRunId: string | null }>()

  if (!receipt) {
    return json(
      {
        ok: false,
        error: 'receipt_not_found',
        message: 'JobsFlow could not find that tenant-scoped consent receipt.',
      },
      404,
    )
  }

  await env.DB
    .prepare(
      `
      UPDATE consent_receipts
      SET
        status = ?,
        approved_at = CASE WHEN ? = 'approved' THEN datetime('now') ELSE approved_at END,
        revoked_at = CASE WHEN ? = 'revoked' THEN datetime('now') ELSE revoked_at END,
        updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
      `,
    )
    .bind(status, status, status, receipt.id, session.tenantId)
    .run()

  if (receipt.workflowRunId && status === 'approved') {
    await env.DB
      .prepare(
        `
        UPDATE workflow_runs
        SET
          state = 'running',
          current_step = 'consent_recorded',
          last_event_at = datetime('now'),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ? AND state = 'waiting_for_approval'
        `,
      )
      .bind(receipt.workflowRunId, session.tenantId)
      .run()
  }

  if (receipt.workflowRunId && status === 'revoked') {
    await env.DB
      .prepare(
        `
        UPDATE workflow_runs
        SET
          state = 'blocked',
          current_step = 'consent_revoked',
          last_event_at = datetime('now'),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
        `,
      )
      .bind(receipt.workflowRunId, session.tenantId)
      .run()
  }

  await createWorkflowEvent(env, session, {
    actorType: 'user',
    eventType: status === 'approved' ? 'consent.approved' : 'consent.revoked',
    riskLevel: status === 'approved' ? 'medium' : 'low',
    runId: receipt.workflowRunId,
    payload: {
      receiptId: receipt.id,
      action: receipt.action,
      status,
    },
  })

  await writeAuditEvent(env, {
    tenantId: session.tenantId,
    userId: session.userId,
    eventType: status === 'approved' ? 'consent.approved' : 'consent.revoked',
    actorType: 'user',
    action: `${status === 'approved' ? 'Approved' : 'Revoked'} consent receipt for ${receipt.action}`,
    riskLevel: status === 'approved' ? 'medium' : 'low',
    metadata: {
      receiptId: receipt.id,
      runId: receipt.workflowRunId,
      consentStatus: status,
    },
  })

  return json({
    ok: true,
    state: await fetchKernelState(env, session),
  })
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before reading workflow state.' }, 401)
  }

  try {
    return json({
      ok: true,
      state: await fetchKernelState(env, session),
    })
  } catch (error) {
    return json(
      {
        ok: false,
        error: 'workflow_kernel_unavailable',
        message: 'Workflow kernel tables are not ready yet. Apply the latest D1 migration.',
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
    return json({ ok: false, error: 'unauthorized', message: 'Sign in before changing workflow state.' }, 401)
  }

  const body = await readBody(request)
  if (!body) {
    return json({ ok: false, error: 'payload_too_large', message: 'Workflow payload is limited to 64 KB.' }, 413)
  }

  const action = cleanKey(body.action, 'bootstrap_core')

  try {
    if (action === 'bootstrap_core') {
      const result = await bootstrapCore(env, session)
      return json(
        {
          ok: true,
          createdRun: result.createdRun,
          runId: result.runId,
          state: result.state,
        },
        result.createdRun ? 201 : 200,
      )
    }

    if (action === 'start_run') {
      return startWorkflowRun(env, session, body)
    }

    if (action === 'record_consent') {
      return recordConsent(env, session, body)
    }

    return json(
      {
        ok: false,
        error: 'unsupported_workflow_action',
        message: 'Workflow action must be bootstrap_core, start_run, or record_consent.',
      },
      400,
    )
  } catch (error) {
    return json(
      {
        ok: false,
        error: 'workflow_kernel_error',
        message: 'JobsFlow could not complete the workflow kernel action.',
        detail: error instanceof Error ? safeString(error.message, 'unknown_error') : 'unknown_error',
      },
      500,
    )
  }
}
