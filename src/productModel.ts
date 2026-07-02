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
    name: 'Tenant',
    workspace: 'platform',
    purpose: 'Separates candidate accounts, employer companies, and future internal operations.',
    keyFields: ['tenantId', 'type', 'status', 'billingCustomerId'],
    launchNote: 'Needed before auth, billing, employer teams, or audit retention.',
  },
  {
    name: 'User',
    workspace: 'platform',
    purpose: 'Stores identity, role membership, and workspace access boundaries.',
    keyFields: ['userId', 'tenantId', 'role', 'emailVerifiedAt'],
    launchNote: 'Use RBAC before any employer-side collaboration is live.',
  },
  {
    name: 'CandidateProfile',
    workspace: 'candidate',
    purpose: 'Owns career goals, salary floor, exclusions, parsed resume signals, and consent settings.',
    keyFields: ['profileId', 'userId', 'targetRoles', 'salaryFloor', 'exclusions'],
    launchNote: 'Encrypt sensitive profile fields and support export/delete.',
  },
  {
    name: 'ResumeArtifact',
    workspace: 'candidate',
    purpose: 'Tracks uploaded resumes, parsed facts, tailored variants, and approval status.',
    keyFields: ['artifactId', 'profileId', 'sourceHash', 'variantOf', 'approvalStatus'],
    launchNote: 'Never submit a variant unless the candidate has approved it.',
  },
  {
    name: 'JobRole',
    workspace: 'employer',
    purpose: 'Normalizes employer criteria, required skills, compensation range, and scorecard rules.',
    keyFields: ['roleId', 'tenantId', 'criteria', 'compBand', 'scorecardVersion'],
    launchNote: 'Lock role criteria before ranking to protect consistency.',
  },
  {
    name: 'ApplicationPacket',
    workspace: 'candidate',
    purpose: 'Connects a candidate, role, resume variant, answers, fit evidence, and review status.',
    keyFields: ['packetId', 'profileId', 'roleId', 'fitScore', 'reviewGate'],
    launchNote: 'Packet state should be explicit: draft, queued, approved, sent, blocked.',
  },
  {
    name: 'ConsentReceipt',
    workspace: 'platform',
    purpose: 'Records who approved which AI-assisted action, when, under what limit.',
    keyFields: ['receiptId', 'actorId', 'action', 'scope', 'expiresAt'],
    launchNote: 'Required for automation, integrations, and reputation safety.',
  },
  {
    name: 'AuditEvent',
    workspace: 'platform',
    purpose: 'Logs owner, trigger, model/tool output, user decision, and resulting state change.',
    keyFields: ['eventId', 'tenantId', 'actorId', 'eventType', 'metadata'],
    launchNote: 'Make audit logs immutable enough for support, abuse review, and compliance.',
  },
  {
    name: 'BillingSubscription',
    workspace: 'platform',
    purpose: 'Maps Stripe customer, plan, entitlement limits, renewal, and cancellation state.',
    keyFields: ['subscriptionId', 'tenantId', 'stripeCustomerId', 'planCode', 'status'],
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
    provider: 'Clerk, Auth.js, or Supabase Auth',
    phase: 'Phase 2',
    requirement: 'Email verification, organization membership, RBAC, and session audit events.',
  },
  {
    area: 'Database',
    provider: 'Postgres',
    phase: 'Phase 2',
    requirement: 'Tenant-scoped rows, encryption strategy, migrations, backups, and retention jobs.',
  },
  {
    area: 'File storage',
    provider: 'Cloudflare R2, S3, or Supabase Storage',
    phase: 'Phase 2',
    requirement: 'Private resume storage, malware checks, source hashes, signed URLs, and deletion flow.',
  },
  {
    area: 'AI workflow',
    provider: 'Model gateway',
    phase: 'Phase 3',
    requirement: 'Structured outputs, prompt/version logs, human review gates, and quality evals.',
  },
  {
    area: 'Billing',
    provider: 'Stripe Checkout and Stripe Billing',
    phase: 'Phase 3',
    requirement: 'Customer portal, coupons, hardship pricing, webhooks, and entitlement limits.',
  },
  {
    area: 'Messaging',
    provider: 'Resend, Postmark, Gmail, or Outlook',
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
    detail: 'Connect plan limits to review queues, AI drafts, employer seats, and audit retention.',
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
    outcome: 'Real users can save profiles and companies without crossing tenant boundaries.',
    deliverables: ['Auth', 'Postgres schema', 'Encrypted storage', 'RBAC', 'Export/delete'],
  },
  {
    phase: 'Phase 3: AI evidence engine',
    outcome: 'JobsFlow can generate fit evidence and drafts under review gates.',
    deliverables: ['Resume parsing', 'Fit scoring', 'Tailoring pipeline', 'Eval suite', 'Audit logs'],
  },
  {
    phase: 'Phase 4: Paid beta',
    outcome: 'Stripe-backed subscriptions and employer collaboration are ready for controlled launch.',
    deliverables: ['Stripe webhooks', 'Entitlements', 'Employer teams', 'Scorecards', 'Support console'],
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
    outcome: 'Every AI-assisted action has an owner, limit, review gate, and audit event.',
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
    limits: ['3 seats', '5 open roles', '90-day audit history'],
    safeguards: ['Criteria lock', 'Fairness checklist', 'Evidence-first ranking'],
  },
  {
    plan: 'Platform Readiness',
    audience: 'Platform',
    monthlyPrice: 'Internal',
    included: ['Admin health', 'Audit review', 'Abuse monitoring', 'Integration readiness'],
    limits: ['Prototype only', 'No live submissions', 'No payment collection'],
    safeguards: ['Human review gates', 'Tenant separation plan', 'Retention policy draft'],
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
    recovery: 'Require consent receipt, action preview, owner, limit, and audit log entry.',
  },
]
