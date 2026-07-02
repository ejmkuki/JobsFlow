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

export async function createDevelopmentSession() {
  return readJson<{ ok: boolean; session: BackendSession }>(
    await fetch('/api/session', {
      body: JSON.stringify({
        accountType: 'candidate',
        displayName: 'JobsFlow Founder',
        email: 'founder@workflowfy.ai',
        role: 'candidate',
        tenantName: 'JobsFlow Founder Workspace',
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    }),
  )
}

export async function listAuditEvents() {
  return readJson<{ events: AuditEvent[]; ok: boolean }>(await fetch('/api/audit'))
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
