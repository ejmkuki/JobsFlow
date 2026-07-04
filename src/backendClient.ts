export type BackendHealth = {
  bindings: {
    bootstrapToken: boolean
    db: boolean
    resumeBucket: boolean
    sessionSecret: boolean
  }
  databaseReady: boolean
  externalSubmissionsEnabled: boolean
  features?: {
    antiGhostingPipeline?: boolean
    interviewPrep?: boolean
    packetReviewEngine: boolean
    resumeIntelligence?: boolean
    ssoProvider?: boolean
    workflowKernel?: boolean
  }
  ok: boolean
  runtime: string
  service: string
}

export type BackendSession = {
  displayName: string
  email: string
  expiresAt: string
  role: string
  tenantId: string
  userId: string
}

export type SessionRequest = {
  accountType: 'candidate' | 'employer'
  bootstrapToken?: string
  displayName: string
  email: string
  role: 'candidate' | 'recruiter' | 'hiring_manager' | 'platform_admin'
  ssoToken?: string
  tenantName: string
}

export type AuditEvent = {
  action: string
  actorType: string
  createdAt: string
  eventType: string
  id: string
  metadata: Record<string, unknown>
  riskLevel: string
}

export type ResumeArtifact = {
  approvalStatus: string
  contentType: string
  filename: string
  id: string
  sizeBytes: number
  sourceHash: string
}

export type PacketReviewState = 'approved' | 'blocked' | 'candidate_approval_required'

export type PacketReviewFinding = {
  detail: string
  key: string
  requiredAction: string
  riskLevel: 'low' | 'medium' | 'high'
  type: string
}

export type PacketReviewSafeguard = {
  detail: string
  key: string
  status: 'blocked' | 'passed' | 'review'
}

export type ApplicationPacketReview = {
  createdAt?: string
  evidence: string[]
  externalActionBlockReason: string
  externalActionBlocked: boolean
  gaps: PacketReviewFinding[]
  id: string
  proofStrength: 'light' | 'moderate' | 'strong'
  readinessScore: number
  requiredReviews: PacketReviewFinding[]
  safeguards: PacketReviewSafeguard[]
  skillCoverageScore: number
  state: PacketReviewState
  targetCompany: string
  targetRole: string
  updatedAt?: string
}

export type ApplicationPacketReviewRequest = {
  company: string
  duplicateFound?: boolean
  evidence: string[]
  exclusions?: string[]
  jobDescription?: string
  requiredSkills: string[]
  salaryFloorCents?: number
  salaryRange?: {
    currency?: string
    maxCents?: number
    minCents?: number
  }
  sensitiveAnswers?: Array<{
    approved: boolean
    key: string
    label: string
    value: string
  }>
  targetRole: string
}

export type WorkflowRunState =
  | 'blocked'
  | 'canceled'
  | 'completed'
  | 'failed'
  | 'pending'
  | 'running'
  | 'waiting_for_approval'

export type WorkflowDefinition = {
  active: boolean
  createdAt: string
  description: string
  id: string
  key: string
  name: string
  requiredBindings: string[]
  steps: string[]
  triggerEvent: string
  updatedAt: string
  version: number
  workspace: 'candidate' | 'employer' | 'platform'
}

export type WorkflowRun = {
  completedAt: string | null
  createdAt: string
  currentStep: string
  definitionId: string
  error: Record<string, unknown>
  failedAt: string | null
  id: string
  input: Record<string, unknown>
  lastEventAt: string
  priority: number
  result: Record<string, unknown>
  startedAt: string | null
  state: WorkflowRunState
  subjectId: string
  subjectType: string
  updatedAt: string
  workflowKey: string
}

export type WorkflowEvent = {
  actorType: 'integration' | 'policy' | 'system' | 'user'
  createdAt: string
  eventType: string
  id: string
  payload: Record<string, unknown>
  riskLevel: 'high' | 'low' | 'medium'
  runId: string | null
  userId: string | null
}

export type ConsentReceipt = {
  action: string
  approvedAt: string | null
  createdAt: string
  expiresAt: string | null
  id: string
  preview: Record<string, unknown>
  revokedAt: string | null
  scope: Record<string, unknown>
  status: 'approved' | 'expired' | 'pending' | 'revoked'
  updatedAt: string
  userId: string | null
  workflowRunId: string | null
}

export type AutomationPolicy = {
  createdAt: string
  dailyLimit: number
  enabled: boolean
  id: string
  mode: 'copilot' | 'guarded_autopilot' | 'review_only'
  policyKey: string
  requiresConsent: boolean
  riskLevel: 'high' | 'low' | 'medium'
  rules: Record<string, unknown>
  updatedAt: string
}

export type IntegrationAccount = {
  accountLabel: string
  createdAt: string
  expiresAt: string | null
  id: string
  lastSyncAt: string | null
  provider: string
  scopes: string[]
  status: 'connected' | 'disabled' | 'needs_reauth' | 'not_connected'
  tokenReference: string | null
  updatedAt: string
}

export type WebhookDelivery = {
  attemptCount: number
  createdAt: string
  destination: string
  eventType: string
  id: string
  lastError: string | null
  nextAttemptAt: string | null
  request: Record<string, unknown>
  response: Record<string, unknown>
  status: 'blocked' | 'delivered' | 'failed' | 'queued'
  updatedAt: string
  workflowRunId: string | null
}

export type WorkflowKernelState = {
  definitions: WorkflowDefinition[]
  deliveries: WebhookDelivery[]
  events: WorkflowEvent[]
  integrations: IntegrationAccount[]
  policies: AutomationPolicy[]
  receipts: ConsentReceipt[]
  runs: WorkflowRun[]
  summary: {
    activeDefinitions: number
    activeRuns: number
    connectedIntegrations: number
    enabledPolicies: number
    externalActionsEnabled: boolean
    pendingReceipts: number
  }
}

export type StartWorkflowRunRequest = {
  input?: Record<string, unknown>
  priority?: number
  subjectId?: string
  subjectType?: string
  workflowKey: string
}

export type ResumeTailwindGap = {
  evidenceHint: string
  requiredAction: string
  severity: 'high' | 'medium'
  skill: string
}

export type ResumeTailwindRecommendation = {
  detail: string
  priority: 'high' | 'low' | 'medium'
  title: string
}

export type ResumeTailwindAnalysis = {
  coachableGaps: ResumeTailwindGap[]
  createdAt: string
  evidence: string[]
  id: string
  jobTargetId: string
  matchedSkills: string[]
  missingSkills: string[]
  proofStrength: 'light' | 'moderate' | 'strong'
  readinessScore: number
  recommendations: ResumeTailwindRecommendation[]
  resumeFactSetId: string
  semanticOverlapScore: number
  skillCoverageScore: number
  vectorDocuments: Array<{
    id: string
    namespace: string
    sourceId: string
    sourceType: string
    status: string
    textHash: string
    vectorKey: string
  }>
  workflowRunId: string | null
}

export type ResumeIntelligenceState = {
  analyses: ResumeTailwindAnalysis[]
  factSets: Array<{
    achievements: string[]
    createdAt: string
    id: string
    metrics: string[]
    parserVersion: string
    resumeArtifactId: string | null
    skills: string[]
    sourceKind: string
    sourceLabel: string
    warnings: string[]
  }>
  jobTargets: Array<{
    company: string
    createdAt: string
    descriptionExcerpt: string
    id: string
    requiredSkills: string[]
    responsibilities: string[]
    senioritySignals: string[]
    title: string
  }>
  summary: {
    analyses: number
    latestReadinessScore: number | null
    parsedFactSets: number
    pendingVectorDocuments: number
    targetJobs: number
  }
  vectorDocuments: Array<{
    createdAt: string
    id: string
    namespace: string
    sourceId: string
    sourceType: string
    status: string
    textExcerpt: string
    vectorKey: string
  }>
}

export type ResumeTailwindRequest = {
  company: string
  jobDescription: string
  requiredSkills?: string[]
  resumeArtifactId?: string
  resumeText?: string
  salaryRange?: {
    currency?: string
    maxCents?: number
    minCents?: number
  }
  targetRole: string
}

export type PipelineState =
  | 'applied'
  | 'archived'
  | 'closed'
  | 'discovered'
  | 'employer_review'
  | 'interview'
  | 'offer'
  | 'packet_review'
  | 'recruiter_screen'

export type PipelineItem = {
  company: string
  createdAt: string
  daysUntilEmployerResponse: number | null
  employerResponseDueAt: string | null
  employerUpdateStatus: 'current' | 'due_soon' | 'not_required' | 'overdue'
  id: string
  lastCandidateActionAt: string | null
  lastEmployerActionAt: string | null
  notes: Record<string, unknown>
  riskLevel: 'high' | 'low' | 'medium'
  roleTitle: string
  salaryMaxCents: number | null
  salaryMinCents: number | null
  source: string
  state: PipelineState
  updatedAt: string
}

export type PipelineEvent = {
  actorType: 'candidate' | 'employer' | 'policy' | 'system'
  createdAt: string
  eventType: string
  fromState: string | null
  id: string
  metadata: Record<string, unknown>
  pipelineItemId: string
  toState: string | null
}

export type PipelineFollowUpTask = {
  channel: 'calendar' | 'email_draft' | 'in_app' | 'none'
  consentRequired: boolean
  createdAt: string
  draftText: string
  dueAt: string
  id: string
  pipelineItemId: string
  riskLevel: 'high' | 'low' | 'medium'
  status: 'approved' | 'blocked' | 'dismissed' | 'open' | 'sent'
  taskType: 'candidate_reminder' | 'employer_status_request' | 'fallback_search' | 'interview_prep' | 'salary_review'
  updatedAt: string
}

export type PipelineResponsePolicy = {
  active: boolean
  candidateFollowUpDays: number
  employerSlaDays: number
  fallbackSearchDays: number
  id: string
  policyKey: string
  stage: PipelineState
}

export type AntiGhostingPipelineState = {
  events: PipelineEvent[]
  items: PipelineItem[]
  policies: PipelineResponsePolicy[]
  summary: {
    activeApplications: number
    dueSoonApplications: number
    openFollowUps: number
    overdueApplications: number
    protectedFinalStates: number
  }
  tasks: PipelineFollowUpTask[]
}

export type CreatePipelineItemRequest = {
  company: string
  notes?: string
  roleTitle: string
  salaryRange?: {
    maxCents?: number
    minCents?: number
  }
  source?: string
  state?: PipelineState
}

export type InterviewStage = 'case_study' | 'final_round' | 'hiring_manager' | 'panel' | 'recruiter_screen'

export type InterviewQuestion = {
  category: string
  key: string
  prompt: string
  signal: string
}

export type InterviewRubricItem = {
  key: string
  label: string
  weight: number
}

export type InterviewRubricScore = {
  key: string
  label: string
  score: number
}

export type InterviewPrepSession = {
  company: string
  context: {
    evidence?: string[]
    requiredSkills?: string[]
  }
  createdAt: string
  id: string
  scorecard: InterviewRubricItem[]
  stage: InterviewStage
  status: 'active' | 'archived' | 'completed'
  targetRole: string
  updatedAt: string
}

export type InterviewQuestionSet = {
  createdAt: string
  generatorVersion: string
  id: string
  questions: InterviewQuestion[]
  rubric: InterviewRubricItem[]
  sessionId: string
}

export type InterviewPracticeAnswer = {
  answerText: string
  createdAt: string
  id: string
  overallScore: number
  questionKey: string
  recommendations: string[]
  risks: string[]
  rubricScores: InterviewRubricScore[]
  sessionId: string
  strengths: string[]
}

export type InterviewPrepState = {
  answers: InterviewPracticeAnswer[]
  questionSets: InterviewQuestionSet[]
  sessions: InterviewPrepSession[]
  summary: {
    activeSessions: number
    latestScore: number | null
    questionSets: number
    recordedAnswers: number
  }
}

export type CreateInterviewPrepSessionRequest = {
  company: string
  evidence?: string[]
  requiredSkills?: string[]
  stage?: InterviewStage
  targetRole: string
}

export type EvaluateInterviewAnswerRequest = {
  answerText: string
  questionKey: string
  sessionId: string
}

type JobsFlowErrorContext =
  | 'audit'
  | 'auth'
  | 'backend'
  | 'interview-prep'
  | 'packet'
  | 'pipeline'
  | 'resume'
  | 'resume-intelligence'
  | 'workflow'

export class JobsFlowApiError extends Error {
  code?: string
  status: number

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'JobsFlowApiError'
    this.status = status
    this.code = code
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new JobsFlowApiError(
      'JobsFlow needs its secure runtime for this action. Open the deployed app or the Cloudflare Pages dev server.',
      response.status,
      'runtime_unavailable',
    )
  }

  const payload = (await response.json()) as T & { error?: string; message?: string }
  if (!response.ok) {
    throw new JobsFlowApiError(
      payload.message ?? `JobsFlow could not complete that request. Status ${response.status}.`,
      response.status,
      payload.error,
    )
  }

  return payload
}

export function humanizeJobsFlowError(error: unknown, context: JobsFlowErrorContext) {
  if (error instanceof JobsFlowApiError) {
    if (error.code === 'invalid_private_beta_code') {
      return 'That private beta code is no longer active. Nothing is broken; access was rotated after the last production check.'
    }

    if (error.code === 'private_beta_code_required') {
      return 'Enter a private beta code to open a secure JobsFlow workspace.'
    }

    if (error.code === 'private_beta_not_configured') {
      return 'JobsFlow is protecting access because private beta access is not configured yet.'
    }

    if (error.code === 'unauthorized') {
      if (context === 'workflow') {
        return 'Start a workspace first, then JobsFlow can activate the workflow kernel for this tenant.'
      }

      if (context === 'packet') {
        return 'Start a workspace first, then JobsFlow can review the packet and record the decision.'
      }

      if (context === 'pipeline') {
        return 'Start a candidate workspace first, then JobsFlow can track applications and draft follow-ups.'
      }

      if (context === 'interview-prep') {
        return 'Start a candidate workspace first, then JobsFlow can generate and evaluate interview practice.'
      }

      if (context === 'resume') {
        return 'Start a workspace first, then resume storage will unlock for this tenant.'
      }

      if (context === 'resume-intelligence') {
        return 'Start a candidate workspace first, then JobsFlow can run Resume Tailwind Optimization.'
      }

      if (context === 'audit') {
        return 'Start a workspace first, then the audit trail will show tenant-scoped activity.'
      }

      return 'No active workspace yet. Enter your email and private beta code to begin.'
    }

    if (error.code === 'wrong_workspace_type') {
      return 'This action belongs in a candidate workspace. Switch to candidate mode before running it.'
    }

    if (error.code === 'missing_configuration') {
      return 'JobsFlow is holding this action because a production setting is missing.'
    }

    if (error.code === 'workflow_kernel_unavailable') {
      return 'Apply the latest D1 migration before activating the workflow kernel.'
    }

    if (error.code === 'resume_intelligence_unavailable') {
      return 'Apply the latest D1 migration before running Resume Tailwind Optimization.'
    }

    if (error.code === 'pipeline_unavailable') {
      return 'Apply the latest D1 migration before using the anti-ghosting pipeline.'
    }

    if (error.code === 'interview_prep_unavailable') {
      return 'Apply the latest D1 migration before using the interview prep sandbox.'
    }

    return error.message
  }

  return error instanceof Error ? error.message : 'JobsFlow could not complete that action.'
}

export async function getBackendHealth() {
  return readJson<BackendHealth>(await fetch('/api/health'))
}

export async function getBackendSession() {
  return readJson<{ authenticated: boolean; session: BackendSession }>(await fetch('/api/session'))
}

export async function createJobsFlowSession(input: SessionRequest) {
  const headers = new Headers({
    'content-type': 'application/json',
  })

  if (input.bootstrapToken) {
    headers.set('x-jobsflow-bootstrap-token', input.bootstrapToken)
  }

  if (input.ssoToken) {
    headers.set('authorization', `Bearer ${input.ssoToken}`)
  }

  return readJson<{ ok: boolean; session: BackendSession }>(
    await fetch('/api/session', {
      body: JSON.stringify({
        accountType: input.accountType,
        displayName: input.displayName,
        email: input.email,
        role: input.role,
        tenantName: input.tenantName,
      }),
      headers,
      method: 'POST',
    }),
  )
}

export async function createDevelopmentSession() {
  return createJobsFlowSession({
    accountType: 'candidate',
    displayName: 'JobsFlow Founder',
    email: 'founder@workflowfy.ai',
    role: 'candidate',
    tenantName: 'JobsFlow Founder Workspace',
  })
}

export async function deleteBackendSession() {
  return readJson<{ ok: boolean }>(
    await fetch('/api/session', {
      method: 'DELETE',
    }),
  )
}

export async function listAuditEvents() {
  return readJson<{ events: AuditEvent[]; ok: boolean }>(await fetch('/api/audit'))
}

export async function listResumes() {
  return readJson<{ ok: boolean; resumes: ResumeArtifact[] }>(await fetch('/api/resumes'))
}

export async function uploadResume(file: File) {
  const formData = new FormData()
  formData.set('resume', file)

  return readJson<{ ok: boolean; resume: ResumeArtifact }>(
    await fetch('/api/resumes', {
      body: formData,
      method: 'POST',
    }),
  )
}

export async function listApplicationPacketReviews() {
  return readJson<{ ok: boolean; packets: ApplicationPacketReview[] }>(await fetch('/api/packet-review'))
}

export async function createApplicationPacketReview(input: ApplicationPacketReviewRequest) {
  return readJson<{ ok: boolean; packet: ApplicationPacketReview }>(
    await fetch('/api/packet-review', {
      body: JSON.stringify(input),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    }),
  )
}

export async function getWorkflowKernelState() {
  return readJson<{ ok: boolean; state: WorkflowKernelState }>(await fetch('/api/workflows'))
}

export async function bootstrapWorkflowKernel() {
  return readJson<{ createdRun: boolean; ok: boolean; runId: string; state: WorkflowKernelState }>(
    await fetch('/api/workflows', {
      body: JSON.stringify({ action: 'bootstrap_core' }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    }),
  )
}

export async function startWorkflowRun(input: StartWorkflowRunRequest) {
  return readJson<{ ok: boolean; runId: string; state: WorkflowKernelState }>(
    await fetch('/api/workflows', {
      body: JSON.stringify({
        action: 'start_run',
        input: input.input,
        priority: input.priority,
        subjectId: input.subjectId,
        subjectType: input.subjectType,
        workflowKey: input.workflowKey,
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    }),
  )
}

export async function recordConsentReceipt(receiptId: string, consentStatus: 'approved' | 'revoked') {
  return readJson<{ ok: boolean; state: WorkflowKernelState }>(
    await fetch('/api/workflows', {
      body: JSON.stringify({
        action: 'record_consent',
        consentStatus,
        receiptId,
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    }),
  )
}

export async function getResumeIntelligenceState() {
  return readJson<{ ok: boolean; state: ResumeIntelligenceState }>(await fetch('/api/resume-intelligence'))
}

export async function createResumeTailwindAnalysis(input: ResumeTailwindRequest) {
  return readJson<{ analysis: ResumeTailwindAnalysis; ok: boolean; state: ResumeIntelligenceState }>(
    await fetch('/api/resume-intelligence', {
      body: JSON.stringify(input),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    }),
  )
}

export async function getAntiGhostingPipelineState() {
  return readJson<{ ok: boolean; state: AntiGhostingPipelineState }>(await fetch('/api/pipeline'))
}

export async function createPipelineItem(input: CreatePipelineItemRequest) {
  return readJson<{ itemId: string; ok: boolean; state: AntiGhostingPipelineState }>(
    await fetch('/api/pipeline', {
      body: JSON.stringify({
        action: 'create_item',
        company: input.company,
        notes: input.notes,
        roleTitle: input.roleTitle,
        salaryRange: input.salaryRange,
        source: input.source,
        state: input.state,
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    }),
  )
}

export async function advancePipelineItem(itemId: string, toState: PipelineState) {
  return readJson<{ ok: boolean; state: AntiGhostingPipelineState }>(
    await fetch('/api/pipeline', {
      body: JSON.stringify({
        action: 'advance_stage',
        itemId,
        toState,
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    }),
  )
}

export async function runPipelineStaleCheck() {
  return readJson<{ ok: boolean; state: AntiGhostingPipelineState }>(
    await fetch('/api/pipeline', {
      body: JSON.stringify({
        action: 'run_stale_check',
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    }),
  )
}

export async function getInterviewPrepState() {
  return readJson<{ ok: boolean; state: InterviewPrepState }>(await fetch('/api/interview-prep'))
}

export async function createInterviewPrepSession(input: CreateInterviewPrepSessionRequest) {
  return readJson<{ ok: boolean; sessionId: string; state: InterviewPrepState }>(
    await fetch('/api/interview-prep', {
      body: JSON.stringify({
        action: 'create_session',
        company: input.company,
        evidence: input.evidence,
        requiredSkills: input.requiredSkills,
        stage: input.stage,
        targetRole: input.targetRole,
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    }),
  )
}

export async function evaluateInterviewPracticeAnswer(input: EvaluateInterviewAnswerRequest) {
  return readJson<{ answerId: string; ok: boolean; state: InterviewPrepState }>(
    await fetch('/api/interview-prep', {
      body: JSON.stringify({
        action: 'evaluate_answer',
        answerText: input.answerText,
        questionKey: input.questionKey,
        sessionId: input.sessionId,
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    }),
  )
}
