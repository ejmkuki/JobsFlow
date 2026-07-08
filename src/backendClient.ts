export type BackendHealth = {
  bindings: {
    bootstrapToken: boolean
    db: boolean
    emailProvider: boolean
    resumeBucket: boolean
    sessionSecret: boolean
  }
  databaseReady: boolean
  externalSubmissionsEnabled: boolean
  features?: {
    achievementProfiles?: boolean
    atsSync?: boolean
    antiGhostingPipeline?: boolean
    interviewPrep?: boolean
    jobSyndication?: boolean
    passiveSourcing?: boolean
    outboundEmail?: boolean
    packetReviewEngine: boolean
    prescreening?: boolean
    resumeIntelligence?: boolean
    skillMatching?: boolean
    ssoProvider?: boolean
    transparencyBlueprint?: boolean
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

export type EmailProviderStatus = {
  availableActions: string[]
  configured: boolean
  from: string
  ok: boolean
  recipient: string
  replyTo: string
}

export type EmailTestResult = {
  emailId: string
  ok: boolean
  recipient: string
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

export type TransparencySalaryBlueprint = {
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

export type TransparencyCultureSignal = {
  anonymityFloorMet: boolean
  company: string
  createdAt: string
  evidence: string[]
  id: string
  sentiment: 'mixed' | 'negative' | 'positive'
  signalKey: string
  signalLabel: string
  verificationCount: number
}

export type TransparencyReport = {
  createdAt: string
  cultureSummary: Array<{
    evidence: string[]
    label: string
    sentiment: 'mixed' | 'negative' | 'positive'
    verificationCount: number
  }>
  id: string
  location: string
  riskFlags: string[]
  salaryPercentiles: {
    currency?: string
    p25?: number
    p50?: number
    p75?: number
  }
  targetCompany: string
  targetRole: string
}

export type TransparencyBlueprintState = {
  cultureSignals: TransparencyCultureSignal[]
  reports: TransparencyReport[]
  salaries: TransparencySalaryBlueprint[]
  summary: {
    cultureSignals: number
    latestConfidenceScore: number | null
    reports: number
    salaryBlueprints: number
    verifiedSalaryBlueprints: number
  }
}

export type CreateTransparencyReportRequest = {
  cultureSignals?: Array<{
    evidence?: string[]
    label: string
    sentiment?: 'mixed' | 'negative' | 'positive'
    verificationCount?: number
  }>
  location?: string
  salaryRange?: {
    currency?: string
    maxCents?: number
    minCents?: number
  }
  targetCompany: string
  targetRole: string
}

export type PassiveSourcingCard = {
  anonymousHandle: string
  contactReleaseStatus: 'approved' | 'locked' | 'pending'
  createdAt: string
  currentEmployerMasked: boolean
  expiresAt: string
  headline: string
  id: string
  maskedAchievements: string[]
  maskedSkills: string[]
  targetRoles: string[]
  updatedAt: string
  visibility: 'paused' | 'private' | 'recruiter_marketplace'
}

export type PassiveSourcingBroadcast = {
  cardId: string
  channel: string
  contactRedactions: string[]
  createdAt: string
  id: string
  payload: Record<string, unknown>
  status: 'blocked' | 'queued' | 'reviewed' | 'sent'
}

export type ContactReleaseRequest = {
  cardId: string
  createdAt: string
  id: string
  reason: string
  requesterCompany: string
  requesterName: string
  status: 'approved' | 'denied' | 'pending'
  updatedAt: string
}

export type PassiveSourcingState = {
  broadcasts: PassiveSourcingBroadcast[]
  cards: PassiveSourcingCard[]
  releaseRequests: ContactReleaseRequest[]
  summary: {
    activeCards: number
    broadcasts: number
    lockedCards: number
    pendingReleaseRequests: number
    privateCards: number
  }
}

export type CreatePassiveSourcingCardRequest = {
  achievements?: string[]
  headline?: string
  skills?: string[]
  targetRoles?: string[]
}

export type SkillTaxonomyNode = {
  createdAt: string
  id: string
  label: string
  parentKey: string | null
  relatedSkills: string[]
  skillKey: string
  vectorKey: string
}

export type EmployerRoleRequirement = {
  adjacentSkills: string[]
  company: string
  createdAt: string
  id: string
  minimumSignals: string[]
  requiredSkills: string[]
  roleTitle: string
}

export type CandidateSkillProfile = {
  achievements: string[]
  candidateAlias: string
  createdAt: string
  id: string
  skills: string[]
  vectorDocuments: Array<Record<string, unknown>>
  visibility: 'archived' | 'internal_review' | 'shortlist_ready'
}

export type SemanticMatchRun = {
  adjacentMatches: Array<{
    candidateSkill: string
    relationship: string
    requiredSkill: string
  }>
  candidateProfileId: string
  createdAt: string
  explanation: string[]
  gaps: string[]
  id: string
  matchScore: number
  matchedSkills: string[]
  roleRequirementId: string
}

export type SkillMatchingState = {
  candidateProfiles: CandidateSkillProfile[]
  matchRuns: SemanticMatchRun[]
  roleRequirements: EmployerRoleRequirement[]
  summary: {
    candidateProfiles: number
    latestMatchScore: number | null
    matchRuns: number
    roleRequirements: number
    taxonomyNodes: number
  }
  taxonomyNodes: SkillTaxonomyNode[]
}

export type RunSemanticSkillMatchRequest = {
  adjacentSkills?: string[]
  achievements?: string[]
  candidateAlias?: string
  candidateSkills?: string[]
  company?: string
  minimumSignals?: string[]
  requiredSkills?: string[]
  roleTitle?: string
}

export type JobSyndicationPost = {
  company: string
  createdAt: string
  description: string
  employmentType: 'contract' | 'full_time' | 'part_time' | 'temporary'
  googleJobsPayload: Record<string, unknown>
  id: string
  location: string
  partnerPayload: Record<string, unknown>
  roleTitle: string
  salary: {
    currency?: string
    maxCents?: number
    minCents?: number
  }
  status: 'blocked' | 'draft' | 'published' | 'queued'
  updatedAt: string
  validationErrors: string[]
}

export type JobSyndicationDelivery = {
  createdAt: string
  destination: 'google_jobs_markup' | 'partner_network' | 'workflowfy_digest'
  id: string
  postId: string
  request: Record<string, unknown>
  response: Record<string, unknown>
  status: 'blocked' | 'delivered' | 'failed' | 'queued'
  updatedAt: string
}

export type JobSyndicationState = {
  deliveries: JobSyndicationDelivery[]
  posts: JobSyndicationPost[]
  summary: {
    blockedPosts: number
    queuedDeliveries: number
    queuedPosts: number
    syndicationPosts: number
  }
}

export type CreateJobSyndicationPostRequest = {
  company?: string
  description?: string
  employmentType?: 'contract' | 'full_time' | 'part_time' | 'temporary'
  location?: string
  roleTitle?: string
  salaryRange?: {
    currency?: string
    maxCents?: number
    minCents?: number
  }
}

export type PrescreeningAgent = {
  company: string
  createdAt: string
  criteria: Record<string, unknown>
  id: string
  knockoutCriteria: string[]
  roleTitle: string
  status: 'active' | 'archived' | 'paused'
  updatedAt: string
}

export type PrescreeningSession = {
  agentId: string
  candidateAlias: string
  createdAt: string
  decision: Record<string, unknown>
  id: string
  score: number
  status: 'disqualified' | 'needs_review' | 'qualified'
  updatedAt: string
}

export type PrescreeningMessage = {
  createdAt: string
  id: string
  messageText: string
  sender: 'agent' | 'candidate' | 'system'
  sessionId: string
}

export type PrescreeningDecision = {
  createdAt: string
  id: string
  minimumCriteria: string[]
  recommendation: string
  risks: string[]
  sessionId: string
}

export type PrescreeningState = {
  agents: PrescreeningAgent[]
  decisions: PrescreeningDecision[]
  messages: PrescreeningMessage[]
  sessions: PrescreeningSession[]
  summary: {
    activeAgents: number
    latestScore: number | null
    needsReview: number
    qualified: number
    sessions: number
  }
}

export type RunPrescreeningRequest = {
  baselineSkills?: string[]
  candidateAlias?: string
  candidateSkills?: string[]
  company?: string
  knockoutCriteria?: string[]
  roleTitle?: string
  timelineDays?: number
  visaStatus?: string
}

export type AchievementProfile = {
  candidateAlias: string
  createdAt: string
  id: string
  profileScore: number
  sourceLabel: string
  status: 'draft' | 'review_ready' | 'verified'
  summary: string
  updatedAt: string
}

export type AchievementProfileCard = {
  cardType: 'credential' | 'leadership' | 'metric' | 'project'
  createdAt: string
  evidence: string[]
  id: string
  metrics: string[]
  profileId: string
  title: string
  verificationStatus: 'pending' | 'rejected' | 'verified'
}

export type CredentialVerification = {
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

export type AchievementProfileState = {
  cards: AchievementProfileCard[]
  profiles: AchievementProfile[]
  summary: {
    latestProfileScore: number | null
    metricCards: number
    pendingVerifications: number
    profiles: number
    verifiedCards: number
  }
  verifications: CredentialVerification[]
}

export type CreateAchievementProfileRequest = {
  candidateAlias?: string
  resumeText?: string
  sourceLabel?: string
}

export type AtsProvider = 'greenhouse' | 'lever' | 'workday'

export type AtsConnection = {
  accountLabel: string
  createdAt: string
  id: string
  lastSyncAt: string | null
  oauthStatus: 'connected' | 'disconnected' | 'needs_reauth'
  provider: AtsProvider
  scopes: string[]
  tokenReference: string | null
  updatedAt: string
}

export type AtsSyncMapping = {
  active: boolean
  connectionId: string
  createdAt: string
  direction: 'bidirectional' | 'inbound' | 'outbound'
  fieldMap: Record<string, unknown>
  id: string
  localEntity: string
  remoteEntity: string
}

export type AtsSyncRun = {
  completedAt: string | null
  connectionId: string
  createdAt: string
  direction: 'bidirectional' | 'inbound' | 'outbound'
  id: string
  startedAt: string | null
  status: 'blocked' | 'completed' | 'failed' | 'queued'
  summary: Record<string, unknown>
}

export type AtsSyncEvent = {
  createdAt: string
  eventType: string
  id: string
  localRecordRef: string
  payload: Record<string, unknown>
  remoteRecordRef: string
  status: 'blocked' | 'mapped' | 'skipped' | 'synced'
  syncRunId: string
}

export type AtsSyncState = {
  connections: AtsConnection[]
  events: AtsSyncEvent[]
  mappings: AtsSyncMapping[]
  runs: AtsSyncRun[]
  summary: {
    blockedRuns: number
    connectedProviders: number
    mappings: number
    providers: number
    syncRuns: number
  }
}

type JobsFlowErrorContext =
  | 'achievement-profiles'
  | 'ats-sync'
  | 'audit'
  | 'auth'
  | 'backend'
  | 'email'
  | 'interview-prep'
  | 'job-syndication'
  | 'packet'
  | 'passive-sourcing'
  | 'pipeline'
  | 'prescreening'
  | 'resume'
  | 'resume-intelligence'
  | 'skill-matching'
  | 'transparency'
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

function cleanApiMessage(message: string | undefined, fallback: string, code?: string) {
  const raw = message?.trim()
  if (!raw) {
    return fallback
  }

  const normalized = raw.toLowerCase()
  const normalizedCode = code?.toLowerCase() ?? ''

  if (normalizedCode === 'unauthorized') {
    return 'Sign in to continue.'
  }

  if (
    normalized.includes('clerk') ||
    normalized.includes('clerkjs') ||
    normalized.includes('sso') ||
    normalized.includes('oauth') ||
    normalized.includes('jwt') ||
    normalized.includes('token') ||
    normalized.includes('verification strategy') ||
    normalized.includes('not supported yet')
  ) {
    return 'Sign-in is taking longer than expected. Try again, or continue with email.'
  }

  if (
    normalizedCode.includes('configuration') ||
    normalized.includes('configuration') ||
    normalized.includes('cloudflare') ||
    normalized.includes('d1') ||
    normalized.includes('r2') ||
    normalized.includes('binding') ||
    normalized.includes('secret') ||
    normalized.includes('runtime') ||
    normalized.includes('migration') ||
    normalized.includes('backend') ||
    normalized.includes('payload') ||
    normalized.includes('status 4') ||
    normalized.includes('status 5')
  ) {
    return 'This part of JobsFlow is still being prepared. Please try again shortly.'
  }

  if (
    normalized.includes('tenant') ||
    normalized.includes('kernel') ||
    normalized.includes('artifact') ||
    normalized.includes('vector') ||
    normalized.includes('syndication') ||
    normalized.includes('ats') ||
    normalized.includes('provider')
  ) {
    return raw
      .replace(/\btenant-scoped\b/gi, 'workspace-protected')
      .replace(/\btenant\b/gi, 'workspace')
      .replace(/\bkernel\b/gi, 'workspace engine')
      .replace(/\bartifact\b/gi, 'file')
      .replace(/\bvector-ready\b/gi, 'ready')
      .replace(/\bvector\b/gi, 'evidence')
      .replace(/\bsyndication\b/gi, 'publishing')
      .replace(/\bATS\b/g, 'hiring system')
      .replace(/\bprovider\b/gi, 'connection')
  }

  return raw
}

async function readJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new JobsFlowApiError(
      'JobsFlow could not connect to its workspace service. Refresh the page and try again.',
      response.status,
      'runtime_unavailable',
    )
  }

  const payload = (await response.json()) as T & { error?: string; message?: string }
  if (!response.ok) {
    const fallback = 'JobsFlow could not complete that request. Please try again.'

    throw new JobsFlowApiError(
      cleanApiMessage(payload.message, fallback, payload.error),
      response.status,
      payload.error,
    )
  }

  return payload
}

export function humanizeJobsFlowError(error: unknown, context: JobsFlowErrorContext) {
  if (error instanceof JobsFlowApiError) {
    if (
      error.code === 'sso_provider_unavailable' ||
      error.code === 'invalid_sso_token' ||
      error.code === 'expired_sso_token' ||
      error.code === 'invalid_sso_origin' ||
      error.code === 'sso_email_missing' ||
      error.code === 'sso_not_configured'
    ) {
      return 'We could not confirm your sign-in right now. Refresh the page and try again.'
    }

    if (error.code === 'invalid_private_beta_code') {
      return 'That access code is no longer active. Request a fresh invite and try again.'
    }

    if (error.code === 'private_beta_code_required') {
      return 'Enter your invite code to open a JobsFlow workspace.'
    }

    if (error.code === 'private_beta_not_configured') {
      return 'Workspace access is still being prepared. Please try again shortly.'
    }

    if (error.code === 'unauthorized') {
      if (context === 'achievement-profiles') {
        return 'Start a candidate workspace first, then JobsFlow can create dynamic achievement profile cards.'
      }

      if (context === 'ats-sync') {
        return 'Start an employer workspace first, then JobsFlow can connect hiring systems.'
      }

      if (context === 'workflow') {
        return 'Start a workspace first, then JobsFlow can turn on guided automation.'
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

      if (context === 'transparency') {
        return 'Start a workspace first, then JobsFlow can load verified salary and culture blueprints.'
      }

      if (context === 'passive-sourcing') {
        return 'Start a candidate workspace first, then JobsFlow can create anonymous sourcing cards.'
      }

      if (context === 'skill-matching') {
        return 'Start an employer workspace first, then JobsFlow can compare role needs with candidate evidence.'
      }

      if (context === 'job-syndication') {
        return 'Start an employer workspace first, then JobsFlow can prepare the job for publishing review.'
      }

      if (context === 'prescreening') {
        return 'Start an employer workspace first, then JobsFlow can run conversational pre-screening.'
      }

      if (context === 'resume') {
        return 'Start a workspace first, then resume upload will unlock.'
      }

      if (context === 'resume-intelligence') {
        return 'Start a candidate workspace first, then JobsFlow can run Resume Tailwind Optimization.'
      }

      if (context === 'audit') {
        return 'Start a workspace first, then JobsFlow can show your activity history.'
      }

      if (context === 'email') {
        return 'Start a workspace first, then JobsFlow can send a test email to your signed-in address.'
      }

      return 'No active workspace yet. Sign in to begin.'
    }

    if (error.code === 'wrong_workspace_type') {
      return 'This action belongs in a candidate workspace. Switch to candidate mode before running it.'
    }

    if (error.code === 'missing_configuration') {
      if (context === 'email') {
        return 'Email delivery is still being prepared. Please try again shortly.'
      }

      return 'This feature is still being prepared. Please try again shortly.'
    }

    if (error.code === 'resend_unavailable') {
      return 'Email delivery is taking longer than expected. Please try again shortly.'
    }

    if (error.code === 'workflow_kernel_unavailable') {
      return 'Guided automation is being updated. Please try again shortly.'
    }

    if (error.code === 'resume_intelligence_unavailable') {
      return 'Resume optimization is being updated. Please try again shortly.'
    }

    if (error.code === 'pipeline_unavailable') {
      return 'Application tracking is being updated. Please try again shortly.'
    }

    if (error.code === 'interview_prep_unavailable') {
      return 'Interview prep is being updated. Please try again shortly.'
    }

    if (error.code === 'transparency_unavailable') {
      return 'Trust insights are being updated. Please try again shortly.'
    }

    if (error.code === 'passive_sourcing_unavailable') {
      return 'Candidate visibility tools are being updated. Please try again shortly.'
    }

    if (error.code === 'skill_matching_unavailable') {
      return 'Skill matching is being updated. Please try again shortly.'
    }

    if (error.code === 'job_syndication_unavailable') {
      return 'Job publishing tools are being updated. Please try again shortly.'
    }

    if (error.code === 'prescreening_unavailable') {
      return 'Pre-screening is being updated. Please try again shortly.'
    }

    if (error.code === 'achievement_profiles_unavailable') {
      return 'Achievement profiles are being updated. Please try again shortly.'
    }

    if (error.code === 'ats_sync_unavailable') {
      return 'Hiring-system connections are being updated. Please try again shortly.'
    }

    return 'JobsFlow could not complete that action. Please try again.'
  }

  return 'JobsFlow could not complete that action. Please try again.'
}

export async function getBackendHealth() {
  return readJson<BackendHealth>(await fetch('/api/health'))
}

export async function getBackendSession() {
  return readJson<{ authenticated: boolean; session: BackendSession }>(await fetch('/api/session'))
}

export async function getEmailProviderStatus() {
  return readJson<EmailProviderStatus>(await fetch('/api/email'))
}

export async function sendEmailTest() {
  return readJson<EmailTestResult>(
    await fetch('/api/email', {
      body: JSON.stringify({ action: 'send_test' }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    }),
  )
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

export async function getTransparencyBlueprintState() {
  return readJson<{ ok: boolean; state: TransparencyBlueprintState }>(await fetch('/api/transparency'))
}

export async function createTransparencyReport(input: CreateTransparencyReportRequest) {
  return readJson<{ ok: boolean; reportId: string; state: TransparencyBlueprintState }>(
    await fetch('/api/transparency', {
      body: JSON.stringify({
        action: 'create_report',
        cultureSignals: input.cultureSignals,
        location: input.location,
        salaryRange: input.salaryRange,
        targetCompany: input.targetCompany,
        targetRole: input.targetRole,
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    }),
  )
}

export async function getPassiveSourcingState() {
  return readJson<{ ok: boolean; state: PassiveSourcingState }>(await fetch('/api/passive-sourcing'))
}

export async function createPassiveSourcingCard(input: CreatePassiveSourcingCardRequest) {
  return readJson<{ cardId: string; ok: boolean; state: PassiveSourcingState }>(
    await fetch('/api/passive-sourcing', {
      body: JSON.stringify({
        achievements: input.achievements,
        action: 'create_card',
        headline: input.headline,
        skills: input.skills,
        targetRoles: input.targetRoles,
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    }),
  )
}

export async function broadcastPassiveSourcingCard(cardId?: string) {
  return readJson<{ broadcastId: string; ok: boolean; state: PassiveSourcingState }>(
    await fetch('/api/passive-sourcing', {
      body: JSON.stringify({
        action: 'broadcast_card',
        cardId,
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    }),
  )
}

export async function requestPassiveSourcingContactRelease(cardId?: string) {
  return readJson<{ ok: boolean; requestId: string; state: PassiveSourcingState }>(
    await fetch('/api/passive-sourcing', {
      body: JSON.stringify({
        action: 'request_contact_release',
        cardId,
        reason: 'The recruiter request matches the card target roles and keeps contact release candidate-approved.',
        requesterCompany: 'Kora Health',
        requesterEmail: 'talent@kora.example',
        requesterName: 'Kora recruiting team',
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    }),
  )
}

export async function getSkillMatchingState() {
  return readJson<{ ok: boolean; state: SkillMatchingState }>(await fetch('/api/skill-matching'))
}

export async function runSemanticSkillMatch(input: RunSemanticSkillMatchRequest) {
  return readJson<{ ok: boolean; runId: string; state: SkillMatchingState }>(
    await fetch('/api/skill-matching', {
      body: JSON.stringify({
        action: 'run_match',
        adjacentSkills: input.adjacentSkills,
        achievements: input.achievements,
        candidateAlias: input.candidateAlias,
        candidateSkills: input.candidateSkills,
        company: input.company,
        minimumSignals: input.minimumSignals,
        requiredSkills: input.requiredSkills,
        roleTitle: input.roleTitle,
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    }),
  )
}

export async function getJobSyndicationState() {
  return readJson<{ ok: boolean; state: JobSyndicationState }>(await fetch('/api/job-syndication'))
}

export async function createJobSyndicationPost(input: CreateJobSyndicationPostRequest) {
  return readJson<{ ok: boolean; postId: string; state: JobSyndicationState }>(
    await fetch('/api/job-syndication', {
      body: JSON.stringify({
        action: 'validate_and_queue',
        company: input.company,
        description: input.description,
        employmentType: input.employmentType,
        location: input.location,
        roleTitle: input.roleTitle,
        salaryRange: input.salaryRange,
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    }),
  )
}

export async function getPrescreeningState() {
  return readJson<{ ok: boolean; state: PrescreeningState }>(await fetch('/api/prescreening'))
}

export async function runPrescreeningSession(input: RunPrescreeningRequest) {
  return readJson<{ ok: boolean; sessionId: string; state: PrescreeningState }>(
    await fetch('/api/prescreening', {
      body: JSON.stringify({
        action: 'run_prescreen',
        baselineSkills: input.baselineSkills,
        candidateAlias: input.candidateAlias,
        candidateSkills: input.candidateSkills,
        company: input.company,
        knockoutCriteria: input.knockoutCriteria,
        roleTitle: input.roleTitle,
        timelineDays: input.timelineDays,
        visaStatus: input.visaStatus,
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    }),
  )
}

export async function getAchievementProfileState() {
  return readJson<{ ok: boolean; state: AchievementProfileState }>(await fetch('/api/achievement-profiles'))
}

export async function createAchievementProfile(input: CreateAchievementProfileRequest) {
  return readJson<{ ok: boolean; profileId: string; state: AchievementProfileState }>(
    await fetch('/api/achievement-profiles', {
      body: JSON.stringify({
        action: 'create_profile',
        candidateAlias: input.candidateAlias,
        resumeText: input.resumeText,
        sourceLabel: input.sourceLabel,
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    }),
  )
}

export async function getAtsSyncState() {
  return readJson<{ ok: boolean; state: AtsSyncState }>(await fetch('/api/ats-sync'))
}

export async function seedAtsSyncConnections() {
  return readJson<{ ok: boolean; state: AtsSyncState }>(
    await fetch('/api/ats-sync', {
      body: JSON.stringify({
        action: 'seed_connections',
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    }),
  )
}

export async function runAtsDrySync(provider: AtsProvider = 'greenhouse') {
  return readJson<{ ok: boolean; runId: string; state: AtsSyncState }>(
    await fetch('/api/ats-sync', {
      body: JSON.stringify({
        action: 'run_dry_sync',
        provider,
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    }),
  )
}

// --- Core loop: jobs and applications ---------------------------------------

export type Job = {
  id: string
  company: string
  title: string
  location: string
  employmentType: string
  workplaceType: string
  description: string
  requiredSkills: string[]
  salaryMinCents: number | null
  salaryMaxCents: number | null
  salaryCurrency: string
  status: string
  applicantCount: number
  createdAt: string
}

export type JobDraft = {
  title: string
  company?: string
  location?: string
  employmentType?: string
  workplaceType?: string
  description?: string
  requiredSkills?: string[]
  salaryMinCents?: number | null
  salaryMaxCents?: number | null
  salaryCurrency?: string
  status?: 'open' | 'draft' | 'paused' | 'closed'
}

export type CandidateApplication = {
  id: string
  jobId: string
  status: string
  readinessScore: number
  coverNote: string
  createdAt: string
  lastStatusChangeAt: string
  jobTitle: string
  company: string
  location: string
}

export type JobApplicant = {
  id: string
  status: string
  candidateName: string
  candidateEmail: string
  readinessScore: number
  coverNote: string
  resumeArtifactId: string | null
  employerSlaDueAt: string | null
  createdAt: string
  lastStatusChangeAt: string
}

const jsonPost = (body: unknown): RequestInit => ({
  body: JSON.stringify(body),
  headers: { 'content-type': 'application/json' },
  method: 'POST',
})

export async function listOpenJobs(query = '') {
  const url = query ? `/api/jobs?q=${encodeURIComponent(query)}` : '/api/jobs'
  return readJson<{ ok: boolean; jobs: Job[] }>(await fetch(url))
}

export async function listMyJobs() {
  return readJson<{ ok: boolean; jobs: Job[] }>(await fetch('/api/jobs?scope=mine'))
}

export async function createJob(input: JobDraft) {
  return readJson<{ ok: boolean; job: Job }>(await fetch('/api/jobs', jsonPost(input)))
}

export async function updateJob(id: string, input: JobDraft) {
  return readJson<{ ok: boolean; job: Job }>(
    await fetch('/api/jobs', { ...jsonPost({ ...input, id }), method: 'PUT' }),
  )
}

export async function deleteJob(id: string) {
  return readJson<{ ok: boolean }>(await fetch(`/api/jobs?id=${encodeURIComponent(id)}`, { method: 'DELETE' }))
}

export async function listMyApplications() {
  return readJson<{ ok: boolean; applications: CandidateApplication[] }>(await fetch('/api/job-applications'))
}

export async function listJobApplicants(jobId: string) {
  return readJson<{ ok: boolean; applicants: JobApplicant[] }>(
    await fetch(`/api/job-applications?jobId=${encodeURIComponent(jobId)}`),
  )
}

export async function applyToJob(input: {
  jobId: string
  coverNote?: string
  resumeArtifactId?: string
  readinessScore?: number
}) {
  return readJson<{ applicationId: string; ok: boolean; status: string }>(
    await fetch('/api/job-applications', jsonPost({ action: 'apply', ...input })),
  )
}

export async function advanceApplication(input: { applicationId: string; status: string; note?: string }) {
  return readJson<{ applicationId: string; ok: boolean; status: string }>(
    await fetch('/api/job-applications', jsonPost({ action: 'advance', ...input })),
  )
}

export async function withdrawApplication(applicationId: string) {
  return readJson<{ applicationId: string; ok: boolean; status: string }>(
    await fetch('/api/job-applications', jsonPost({ action: 'withdraw', applicationId })),
  )
}
