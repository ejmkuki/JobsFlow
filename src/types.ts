export type Workspace = 'candidate' | 'employer' | 'trust'
export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'neutral'

export type LandingSearchIntent = {
  role: string
  location: string
}

export type Metric = {
  label: string
  value: string
  detail: string
  tone?: Tone
}

export type Mode = {
  name: string
  detail: string
  owner: string
  limit: string
  log: string
}

export type SignalDecision = {
  workspace: Workspace
  label: string
  title: string
  status: string
  owner: string
  changed: string
  matters: string
  next: string
  tone: Tone
  evidence: string[]
}

export type CandidateEvidenceReview = {
  role: string
  company: string
  fit: string
  decision: string
  gate: string
  evidence: string[]
  gaps: string[]
  safeguards: string[]
  next: string
  tone: Tone
}

export type EmployerEvidenceReview = {
  candidate: string
  recommendation: string
  score: string
  owner: string
  rubric: Array<[string, string]>
  evidence: string[]
  risks: string[]
  next: string
  tone: Tone
}

export type ComplianceLedgerItem = {
  control: string
  status: string
  owner: string
  proof: string
  next: string
  tone: Tone
}
