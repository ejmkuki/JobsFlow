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
    packetReviewEngine: boolean
    ssoProvider?: boolean
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

type JobsFlowErrorContext = 'audit' | 'auth' | 'backend' | 'packet' | 'resume'

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
      if (context === 'packet') {
        return 'Start a workspace first, then JobsFlow can review the packet and record the decision.'
      }

      if (context === 'resume') {
        return 'Start a workspace first, then resume storage will unlock for this tenant.'
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
