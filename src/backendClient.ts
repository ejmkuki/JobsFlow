export type BackendHealth = {
  bindings: {
    bootstrapToken: boolean
    db: boolean
    resumeBucket: boolean
    sessionSecret: boolean
  }
  databaseReady: boolean
  externalSubmissionsEnabled: boolean
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

async function readJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new Error('JobsFlow API is not available from this dev server. Use Cloudflare Pages runtime for backend endpoints.')
  }

  const payload = (await response.json()) as T & { message?: string }
  if (!response.ok) {
    throw new Error(payload.message ?? `JobsFlow API request failed with ${response.status}`)
  }

  return payload
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
