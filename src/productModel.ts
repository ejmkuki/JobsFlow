export type WorkspaceKind = 'candidate' | 'employer' | 'platform'

export type AccessRole =
  | 'candidate'
  | 'recruiter'
  | 'hiring_manager'
  | 'platform_admin'

export type ProductionEntity = {
  name: string
  workspace: WorkspaceKind
  purpose: string
  keyFields: string[]
  launchNote: string
}

export type ConsentGate = {
  key: string
  action: string
  defaultEnabled: boolean
  requiredApproval: string
  auditEvent: string
  risk: string
}

export type ProviderReadiness = {
  area: string
  provider: string
  phase: string
  requirement: string
}

export type BillingChecklistItem = {
  item: string
  status: 'Ready to design' | 'Needs Stripe setup' | 'Needs policy'
  detail: string
}

export type RoadmapPhase = {
  phase: string
  outcome: string
  deliverables: string[]
}

export type OnboardingStep = {
  key: string
  title: string
  owner: WorkspaceKind
  outcome: string
  proof: string
}

export type PlanEntitlement = {
  plan: string
  audience: 'Candidate' | 'Hiring team' | 'Platform'
  monthlyPrice: string
  included: string[]
  limits: string[]
  safeguards: string[]
}

export type ProductState = {
  state: 'Empty' | 'Loading' | 'Error' | 'Blocked'
  surface: string
  message: string
  recovery: string
}

export const accessRoles: AccessRole[] = [
  'candidate',
  'recruiter',
  'hiring_manager',
  'platform_admin',
]

export const productionEntities: ProductionEntity[] = [
  {
    name: 'Workspace',
    workspace: 'platform',
    purpose: 'Separates candidate accounts, employer companies, and future internal operations.',
    keyFields: ['workspaceId', 'type', 'status', 'billingCustomerId'],
    launchNote: 'Needed before sign-in, billing, employer teams, or activity retention.',
  },
  {
    name: 'User',
    workspace: 'platform',
    purpose: 'Stores identity, role membership, and workspace access boundaries.',
    keyFields: ['userId', 'workspaceId', 'role', 'emailVerifiedAt'],
    launchNote: 'Use role-based access before any employer-side collaboration is live.',
  },
  {
    name: 'Candidate Profile',
    workspace: 'candidate',
    purpose: 'Owns career goals, salary floor, exclusions, parsed resume signals, and consent settings.',
    keyFields: ['profileId', 'userId', 'targetRoles', 'salaryFloor', 'exclusions'],
    launchNote: 'Encrypt sensitive profile fields and support export/delete.',
  },
  {
    name: 'Resume File',
    workspace: 'candidate',
    purpose: 'Tracks uploaded resumes, parsed facts, tailored variants, and approval status.',
    keyFields: ['resumeId', 'profileId', 'sourceCheck', 'variantOf', 'approvalStatus'],
    launchNote: 'Never submit a variant unless the candidate has approved it.',
  },
  {
    name: 'Job Role',
    workspace: 'employer',
    purpose: 'Normalizes employer criteria, required skills, compensation range, and scorecard rules.',
    keyFields: ['roleId', 'workspaceId', 'criteria', 'compensationBand', 'scorecardVersion'],
    launchNote: 'Lock role criteria before ranking to protect consistency.',
  },
  {
    name: 'Application Packet',
    workspace: 'candidate',
    purpose: 'Connects a candidate, role, resume variant, answers, fit evidence, and review status.',
    keyFields: ['packetId', 'profileId', 'roleId', 'fitScore', 'reviewGate'],
    launchNote: 'Packet state should be explicit: draft, queued, approved, sent, blocked.',
  },
  {
    name: 'Approval Receipt',
    workspace: 'platform',
    purpose: 'Records who approved which AI-assisted action, when, under what limit.',
    keyFields: ['receiptId', 'ownerId', 'action', 'limit', 'expiresAt'],
    launchNote: 'Required for automation, integrations, and reputation safety.',
  },
  {
    name: 'Activity History',
    workspace: 'platform',
    purpose: 'Logs owner, trigger, model/tool output, user decision, and resulting state change.',
    keyFields: ['eventId', 'workspaceId', 'ownerId', 'eventType', 'summary'],
    launchNote: 'Make activity history durable enough for support, abuse review, and compliance.',
  },
  {
    name: 'Billing Subscription',
    workspace: 'platform',
    purpose: 'Maps Stripe customer, plan, entitlement limits, renewal, and cancellation state.',
    keyFields: ['subscriptionId', 'workspaceId', 'customerId', 'planCode', 'status'],
    launchNote: 'Keep affordable candidate access and clear cancellation rules visible.',
  },
]

export const consentGateMatrix: ConsentGate[] = [
  {
    key: 'resume_tailoring',
    action: 'Generate resume or answer variant',
    defaultEnabled: true,
    requiredApproval: 'Candidate reviews before reuse',
    auditEvent: 'draft.generated',
    risk: 'Low if draft-only',
  },
  {
    key: 'packet_queue',
    action: 'Queue application packet for a matched role',
    defaultEnabled: true,
    requiredApproval: 'Candidate approves role, resume, answers, and salary fit',
    auditEvent: 'packet.queued',
    risk: 'Medium without exclusions',
  },
  {
    key: 'external_submit',
    action: 'Submit or send anything outside JobsFlow',
    defaultEnabled: false,
    requiredApproval: 'Explicit per-action consent receipt',
    auditEvent: 'external_action.requested',
    risk: 'High until integrations are certified',
  },
  {
    key: 'employer_visibility',
    action: 'Share candidate fit evidence with an employer',
    defaultEnabled: false,
    requiredApproval: 'Candidate consent and employer data-use terms',
    auditEvent: 'evidence.shared',
    risk: 'High for privacy and fairness',
  },
]

export const providerReadiness: ProviderReadiness[] = [
  {
    area: 'Authentication',
    provider: 'Customer sign-in service',
    phase: 'Phase 2',
    requirement: 'Email verification, organization membership, role-based access, and activity history.',
  },
  {
    area: 'Database',
    provider: 'Workspace data service',
    phase: 'Phase 2',
    requirement: 'Workspace-separated records, encryption, backups, and retention rules.',
  },
  {
    area: 'File storage',
    provider: 'Private file storage',
    phase: 'Phase 2',
    requirement: 'Private resume storage, malware checks, integrity checks, protected links, and deletion flow.',
  },
  {
    area: 'AI workflow',
    provider: 'AI quality layer',
    phase: 'Phase 3',
    requirement: 'Consistent responses, review history, human approval gates, and quality checks.',
  },
  {
    area: 'Billing',
    provider: 'Billing service',
    phase: 'Phase 3',
    requirement: 'Customer portal, coupons, hardship pricing, billing updates, and plan limits.',
  },
  {
    area: 'Messaging',
    provider: 'Email delivery service',
    phase: 'Phase 4',
    requirement: 'Draft-first email workflow, unsubscribe rules, and approval before outbound sends.',
  },
]

export const billingChecklist: BillingChecklistItem[] = [
  {
    item: 'Stripe product catalog',
    status: 'Needs Stripe setup',
    detail: 'Create Starter, Pro, and Hiring Team products with monthly and annual prices.',
  },
  {
    item: 'Customer portal',
    status: 'Needs Stripe setup',
    detail: 'Allow plan changes, cancellation, invoices, and payment method updates.',
  },
  {
    item: 'Affordable access policy',
    status: 'Needs policy',
    detail: 'Define student, transition, hardship, and market-based pricing rules before launch.',
  },
  {
    item: 'Entitlement map',
    status: 'Ready to design',
    detail: 'Connect plan limits to review queues, AI drafts, employer seats, and activity history retention.',
  },
]

export const implementationRoadmap: RoadmapPhase[] = [
  {
    phase: 'Phase 1: Workflow prototype',
    outcome: 'Credible SaaS surface with trust-first candidate, employer, and platform workspaces.',
    deliverables: ['Local React state', 'Mock data', 'Responsive dashboards', 'Safety copy'],
  },
  {
    phase: 'Phase 2: Secure accounts',
    outcome: 'Real users can save profiles and companies without crossing workspace boundaries.',
    deliverables: ['Secure sign-in', 'Workspace records', 'Encrypted storage', 'Role-based access', 'Export/delete'],
  },
  {
    phase: 'Phase 3: AI evidence engine',
    outcome: 'JobsFlow can generate fit evidence and drafts under review gates.',
    deliverables: ['Resume review', 'Fit scoring', 'Tailoring flow', 'Quality checks', 'Activity history'],
  },
  {
    phase: 'Phase 4: Paid beta',
    outcome: 'Stripe-backed subscriptions and employer collaboration are ready for controlled launch.',
    deliverables: ['Billing updates', 'Plan limits', 'Employer teams', 'Scorecards', 'Support console'],
  },
]

export const onboardingSteps: OnboardingStep[] = [
  {
    key: 'career-goal',
    title: 'Define the signal target',
    owner: 'candidate',
    outcome: 'Candidate chooses target roles, salary floor, location rules, and company exclusions.',
    proof: 'Profile health, salary guardrail, and exclusion receipt become visible before matching.',
  },
  {
    key: 'role-criteria',
    title: 'Lock employer criteria',
    owner: 'employer',
    outcome: 'Hiring team converts the role into scorecard criteria before ranking candidates.',
    proof: 'Scorecard version, must-have skills, and fairness checklist are stored with the role.',
  },
  {
    key: 'review-gates',
    title: 'Set approval rules',
    owner: 'platform',
    outcome: 'Every AI-assisted action has an owner, limit, review gate, and activity record.',
    proof: 'Consent matrix blocks risky actions until production controls exist.',
  },
  {
    key: 'billing-fit',
    title: 'Choose affordable access',
    owner: 'platform',
    outcome: 'Users see what their plan can do before Stripe billing is turned on.',
    proof: 'Entitlements describe limits without charging cards in the prototype.',
  },
]

export const planEntitlements: PlanEntitlement[] = [
  {
    plan: 'Candidate Starter',
    audience: 'Candidate',
    monthlyPrice: '$9',
    included: ['Profile health', 'Application tracker', 'Resume intelligence', 'Review-only drafts'],
    limits: ['25 saved roles', '10 tailored drafts/month', 'No guarded queue'],
    safeguards: ['No external actions', 'Export-ready profile', 'Duplicate alerts'],
  },
  {
    plan: 'Candidate Pro',
    audience: 'Candidate',
    monthlyPrice: '$19',
    included: ['Co-pilot packets', 'Interview prep', 'Saved answers', 'Follow-up drafting'],
    limits: ['80 saved roles', '40 tailored drafts/month', '12 guarded queue reviews/day'],
    safeguards: ['Approval receipts', 'Salary floor guard', 'Company exclusions'],
  },
  {
    plan: 'Hiring Team',
    audience: 'Hiring team',
    monthlyPrice: '$99',
    included: ['Role intake', 'Scorecards', 'Ranked shortlists', 'Pipeline analytics'],
    limits: ['3 seats', '5 open roles', '90-day activity history'],
    safeguards: ['Criteria lock', 'Fairness checklist', 'Evidence-first ranking'],
  },
  {
    plan: 'Platform Readiness',
    audience: 'Platform',
    monthlyPrice: 'Internal',
    included: ['Admin health', 'Activity review', 'Abuse monitoring', 'Integration readiness'],
    limits: ['Prototype only', 'No live submissions', 'No payment collection'],
    safeguards: ['Human review gates', 'Workspace separation plan', 'Retention policy draft'],
  },
]

export const productStates: ProductState[] = [
  {
    state: 'Empty',
    surface: 'Candidate match queue',
    message: 'No high-fit roles yet.',
    recovery: 'Show profile tuning, missing evidence, and saved search criteria instead of a blank screen.',
  },
  {
    state: 'Loading',
    surface: 'Resume intelligence',
    message: 'Analyzing resume evidence.',
    recovery: 'Show skeleton rows and keep previous approved resume version visible.',
  },
  {
    state: 'Error',
    surface: 'Employer shortlist',
    message: 'Ranking unavailable.',
    recovery: 'Fall back to scorecard criteria and manual review queue until ranking is restored.',
  },
  {
    state: 'Blocked',
    surface: 'External action',
    message: 'Approval required before anything leaves JobsFlow.',
    recovery: 'Require consent receipt, action preview, owner, limit, and activity history entry.',
  },
]
