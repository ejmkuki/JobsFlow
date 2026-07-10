export type Workspace = 'candidate' | 'employer' | 'trust'
export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'neutral'

export type LandingSearchIntent = {
  role: string
  location: string
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

export type ComplianceLedgerItem = {
  control: string
  status: string
  owner: string
  proof: string
  next: string
  tone: Tone
}
