import type { LucideIcon } from 'lucide-react'
import { Building2, ShieldCheck, UsersRound } from 'lucide-react'
import type { Workspace } from '../types'

export const workspaces: Array<{
  id: Workspace
  label: string
  icon: LucideIcon
  summary: string
}> = [
  {
    id: 'candidate',
    label: 'Candidate',
    icon: UsersRound,
    summary: 'Readiness, fit evidence, applications, interviews, and controls.',
  },
  {
    id: 'employer',
    label: 'Employer',
    icon: Building2,
    summary: 'Role criteria, ranked candidates, outreach, pipeline, and fairness.',
  },
  {
    id: 'trust',
    label: 'Trust',
    icon: ShieldCheck,
    summary: 'Consent, accountability, integrations, pricing, and production gates.',
  },
]
