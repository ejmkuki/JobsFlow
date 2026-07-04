import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  CreditCard,
  DatabaseZap,
  FileCheck2,
  FileText,
  Gauge,
  Globe2,
  Handshake,
  LayoutDashboard,
  LogOut,
  ListChecks,
  LockKeyhole,
  MailCheck,
  MessageSquareText,
  NotebookTabs,
  RefreshCw,
  Scale,
  SearchCheck,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import './App.css'
import { useJobsFlowSso } from './jobsFlowSsoContext'
import {
  type AuditEvent,
  type ApplicationPacketReview,
  type AntiGhostingPipelineState,
  type BackendHealth,
  type BackendSession,
  type PipelineState,
  type ResumeArtifact,
  type ResumeIntelligenceState,
  type WorkflowKernelState,
  advancePipelineItem,
  bootstrapWorkflowKernel,
  createApplicationPacketReview,
  createPipelineItem,
  createResumeTailwindAnalysis,
  createJobsFlowSession,
  deleteBackendSession,
  getBackendHealth,
  getBackendSession,
  getAntiGhostingPipelineState,
  getResumeIntelligenceState,
  getWorkflowKernelState,
  humanizeJobsFlowError,
  listAuditEvents,
  listResumes,
  runPipelineStaleCheck,
  startWorkflowRun,
  uploadResume,
} from './backendClient'
import {
  billingChecklist,
  consentGateMatrix,
  implementationRoadmap,
  onboardingSteps,
  planEntitlements,
  productionEntities,
  productStates,
  providerReadiness,
} from './productModel'

type Workspace = 'candidate' | 'employer' | 'trust'
type Tone = 'green' | 'amber' | 'red' | 'blue' | 'neutral'

type Metric = {
  label: string
  value: string
  detail: string
  tone?: Tone
}

type Mode = {
  name: string
  detail: string
  owner: string
  limit: string
  log: string
}

type SignalDecision = {
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

type CandidateEvidenceReview = {
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

type EmployerEvidenceReview = {
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

type ComplianceLedgerItem = {
  control: string
  status: string
  owner: string
  proof: string
  next: string
  tone: Tone
}

const workspaces: Array<{
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
    summary: 'Consent, auditability, integrations, pricing, and production gates.',
  },
]

const signalDecisions: SignalDecision[] = [
  {
    workspace: 'candidate',
    label: 'Candidate decision',
    title: 'Approve Kora packet only after the proof gap is fixed',
    status: 'Review gate open',
    owner: 'Maya',
    changed: 'Resume storage and packet builder are ready for the first high-fit role.',
    matters: 'A missing claims-operations example could make the tailored packet feel generic.',
    next: 'Add one evidence bullet, then approve the resume variant and two ATS answers.',
    tone: 'amber',
    evidence: ['96% role fit', '$118k floor satisfied', 'No company exclusion'],
  },
  {
    workspace: 'employer',
    label: 'Employer decision',
    title: 'Lock the scorecard before outreach leaves draft mode',
    status: 'Manager input needed',
    owner: 'Hiring manager',
    changed: 'Shortlist is usable, but compensation and product analytics criteria are not final.',
    matters: 'Ranking before criteria are locked creates fairness and expectation risk.',
    next: 'Confirm comp band and whether product analytics is required or coachable.',
    tone: 'amber',
    evidence: ['24 qualified candidates', '5 of 6 fairness checks', 'Two candidate gaps flagged'],
  },
  {
    workspace: 'trust',
    label: 'Platform decision',
    title: 'Keep external actions blocked until consent receipts exist',
    status: 'Production gate',
    owner: 'Platform',
    changed: 'D1, R2, session cookies, and audit writes are live in the beta stack.',
    matters: 'Real automation needs export/delete, retention, abuse review, and billing controls.',
    next: 'Ship production auth UI, consent receipts, and audit review before any integration sends.',
    tone: 'green',
    evidence: ['Live health check passes', 'R2 upload smoke test passes', 'External submissions disabled'],
  },
]

const candidateProfile = {
  name: 'Maya Thompson',
  headline: 'Product operations leader for AI-enabled healthcare teams',
  location: 'Austin, TX',
  target: 'Remote or hybrid product operations roles above $115k',
  health: 86,
  verifiedSignals: [
    'Resume parsed',
    'LinkedIn connected',
    'Salary floor set',
    'Company exclusions active',
  ],
  needsReview: [
    'Add two quantified launch metrics',
    'Approve Workday answer template',
  ],
}

const candidateMetrics: Metric[] = [
  {
    label: 'Profile health',
    value: '86%',
    detail: '2 evidence gaps remain',
    tone: 'green',
  },
  {
    label: 'High-fit roles',
    value: '18',
    detail: '6 need human review',
    tone: 'blue',
  },
  {
    label: 'Active applications',
    value: '11',
    detail: '4 recruiter touchpoints',
    tone: 'neutral',
  },
  {
    label: 'Reputation risk',
    value: 'Low',
    detail: 'Duplicates blocked',
    tone: 'green',
  },
]

const candidateCommandCenter = [
  {
    label: 'Ready now',
    value: '2 packets',
    detail: 'Resume, answers, and salary checks are ready for candidate review.',
  },
  {
    label: 'Needs proof',
    value: '3 roles',
    detail: 'Fit is strong, but one evidence gap should be resolved before applying.',
  },
  {
    label: 'Blocked safely',
    value: '5 actions',
    detail: 'Duplicates, low salary ranges, and excluded companies were stopped.',
  },
]

const automationModes: Mode[] = [
  {
    name: 'Review-only',
    detail: 'AI drafts resume, answers, and notes without preparing external action.',
    owner: 'Candidate',
    limit: 'No queued applications',
    log: 'Draft history only',
  },
  {
    name: 'Co-pilot',
    detail: 'AI prepares the packet and waits for candidate approval before anything leaves JobsFlow.',
    owner: 'Candidate',
    limit: 'Manual approval required',
    log: 'Every packet versioned',
  },
  {
    name: 'Guarded autopilot',
    detail: 'AI may queue approved-fit roles inside strict rules, exclusions, and daily limits.',
    owner: 'Candidate + policy',
    limit: '12 reviewed actions/day',
    log: 'Full action audit',
  },
]

const applicationPacket = {
  role: 'Product Operations Manager',
  company: 'Kora Health',
  readiness: 91,
  sections: [
    ['Resume variant', 'Ready for candidate review'],
    ['Cover note', 'Drafted from approved evidence'],
    ['ATS questions', '2 answers need approval'],
    ['Salary check', '$118k floor satisfied'],
    ['Company risk', 'No exclusions detected'],
  ],
  blockers: [
    'Add one claims operations example before approving the packet.',
    'Confirm the Workday answer about sponsorship is still accurate.',
  ],
}

const candidateEvidenceReviews: CandidateEvidenceReview[] = [
  {
    role: 'Product Operations Manager',
    company: 'Kora Health',
    fit: '96%',
    decision: 'Approve after proof gap',
    gate: 'Candidate approval required',
    evidence: ['Scaled intake workflow', 'Healthcare SaaS delivery', 'Vendor operations ownership'],
    gaps: ['Add a claims-operations example to strengthen the packet.'],
    safeguards: ['$118k salary floor satisfied', 'No duplicate application found', 'No exclusion conflict'],
    next: 'Add one quantified claims workflow bullet, then review the resume variant and ATS answers.',
    tone: 'amber',
  },
  {
    role: 'Customer Success Lead',
    company: 'Northstar Labs',
    fit: '92%',
    decision: 'Hold for salary review',
    gate: 'Salary guardrail active',
    evidence: ['B2B revenue operations', 'Team leadership', 'Renewal process rebuild'],
    gaps: ['Compensation range is below current floor unless candidate overrides.'],
    safeguards: ['Travel tolerance needs confirmation', 'AsterCloud duplicate checked', 'Follow-up remains draft-only'],
    next: 'Confirm whether this role is strategic enough to override the salary floor.',
    tone: 'amber',
  },
  {
    role: 'AI Program Coordinator',
    company: 'SignalForge AI',
    fit: '89%',
    decision: 'Watchlist, do not packet yet',
    gate: 'Role-level fit review',
    evidence: ['AI rollout support', 'Client-facing launch rhythm', 'Strong coordination history'],
    gaps: ['Seniority may be below target and title scope needs validation.'],
    safeguards: ['No external action queued', 'Candidate reputation risk low', 'Company research still needed'],
    next: 'Wait for role clarification or a senior program opening before drafting materials.',
    tone: 'blue',
  },
]

const candidateGuardrails = [
  {
    label: 'Salary floor',
    value: '$115k',
    detail: 'Roles below floor are blocked unless the candidate overrides the rule.',
  },
  {
    label: 'Company exclusions',
    value: '9 active',
    detail: 'Current employer, vendors, conflicts, and personal no-go companies are excluded.',
  },
  {
    label: 'Duplicate prevention',
    value: 'Active',
    detail: 'Reposts and previously submitted ATS records are flagged before queueing.',
  },
]

const resumeSignals = [
  {
    label: 'ATS fit score',
    value: '94%',
    detail: 'For Kora Health Product Operations Manager',
  },
  {
    label: 'Keyword coverage',
    value: '31 / 35',
    detail: 'Missing: vendor governance, claims operations',
  },
  {
    label: 'Proof strength',
    value: 'Strong',
    detail: '7 quantified impact bullets detected',
  },
]

const jobMatches = [
  {
    company: 'Kora Health',
    role: 'Product Operations Manager',
    fit: 96,
    status: 'Ready for review',
    salary: '$118k - $138k',
    evidence: ['Scaled intake workflow', 'Healthcare SaaS', 'Vendor ops'],
    gaps: ['Add claims operations example'],
  },
  {
    company: 'Northstar Labs',
    role: 'Customer Success Lead',
    fit: 92,
    status: 'Needs answer approval',
    salary: '$96k - $112k',
    evidence: ['B2B revenue ops', 'Team leadership', 'Renewal process'],
    gaps: ['Confirm travel tolerance'],
  },
  {
    company: 'SignalForge AI',
    role: 'AI Program Coordinator',
    fit: 89,
    status: 'Watchlist',
    salary: '$104k - $124k',
    evidence: ['AI rollout support', 'Client-facing delivery', 'Launch rhythm'],
    gaps: ['Role may be junior for target'],
  },
]

const applications = [
  {
    company: 'Kora Health',
    stage: 'Packet review',
    next: 'Approve tailored resume',
    owner: 'Maya',
    age: 'Today',
  },
  {
    company: 'Northstar Labs',
    stage: 'Question review',
    next: 'Edit leadership example',
    owner: 'Maya',
    age: '1 day',
  },
  {
    company: 'AsterCloud',
    stage: 'Recruiter reply',
    next: 'Send availability',
    owner: 'JobsFlow draft',
    age: '2 days',
  },
  {
    company: 'BrightOps',
    stage: 'Interview prep',
    next: 'Review scorecard brief',
    owner: 'Maya',
    age: 'Friday',
  },
]

const savedResponses = [
  {
    prompt: 'Why are you interested in this role?',
    status: 'Approved base',
    detail: 'Personalized per company before review.',
  },
  {
    prompt: 'Describe a difficult cross-functional project.',
    status: 'Needs proof',
    detail: 'Add measurable outcome before reuse.',
  },
  {
    prompt: 'Salary expectations',
    status: 'Guarded',
    detail: 'Never sent below salary floor.',
  },
]

const prepItems = [
  'Prepare Kora Health role-scorecard narrative',
  'Review Northstar customer escalation examples',
  'Send AsterCloud availability after candidate approval',
]

const candidateActivationChecklist = [
  {
    step: 'Create private workspace',
    detail: 'Signed session, tenant boundary, and audit trail before resume storage.',
  },
  {
    step: 'Upload resume',
    detail: 'Store the source file, then build profile facts from reviewed evidence.',
  },
  {
    step: 'Set target rules',
    detail: 'Role targets, salary floor, location preferences, and company exclusions.',
  },
  {
    step: 'Review first matches',
    detail: 'Only high-fit roles with visible evidence move into packet review.',
  },
]

const employerActivationChecklist = [
  {
    step: 'Create hiring workspace',
    detail: 'Company, team role, and hiring owners stay scoped to the employer tenant.',
  },
  {
    step: 'Add first role',
    detail: 'Clarify must-haves, nice-to-haves, compensation, and decision criteria.',
  },
  {
    step: 'Lock scorecard',
    detail: 'Ranking starts only after the team agrees what good fit means.',
  },
  {
    step: 'Review shortlist',
    detail: 'Candidates are recommended with evidence, gaps, and outreach context.',
  },
]

const candidateMarketPlays = [
  {
    pattern: 'Professional graph',
    jobsFlowMove: 'Relationship-aware targets',
    detail: 'Future profile imports should identify warm paths and referrals without exposing private contacts.',
  },
  {
    pattern: 'Job inventory',
    jobsFlowMove: 'Curated match queue',
    detail: 'Broad discovery becomes a smaller queue ranked by fit, salary floor, exclusions, and proof strength.',
  },
  {
    pattern: 'Mobile alerts',
    jobsFlowMove: 'Review-ready alerts',
    detail: 'Candidates get notified when a role is worth attention, not when every new posting appears.',
  },
  {
    pattern: 'Salary and reviews',
    jobsFlowMove: 'Company transparency brief',
    detail: 'Compensation, interview signals, and reputation notes become part of the packet review gate.',
  },
  {
    pattern: 'Early-career networks',
    jobsFlowMove: 'Pathway mode',
    detail: 'Students and career switchers can separate internships, apprenticeships, and first-role evidence.',
  },
]

const employerCompany = {
  company: 'Northstar Labs',
  role: 'Senior Customer Success Lead',
  team: 'Revenue Operations',
  criteria:
    'Own strategic accounts, improve renewal workflow, and partner with product on expansion signals.',
  fairness:
    'Structured evidence, consistent scorecard, and bias checks before outreach.',
}

const employerMetrics: Metric[] = [
  {
    label: 'Qualified shortlist',
    value: '24',
    detail: '8 high-confidence candidates',
    tone: 'green',
  },
  {
    label: 'Pipeline health',
    value: '72%',
    detail: 'Needs more senior CS profiles',
    tone: 'amber',
  },
  {
    label: 'Response queue',
    value: '9',
    detail: '4 require hiring manager note',
    tone: 'blue',
  },
  {
    label: 'Fairness checks',
    value: '5 / 6',
    detail: 'Comp band review pending',
    tone: 'green',
  },
]

const employerCommandCenter = [
  {
    label: 'Role clarity',
    value: '82%',
    detail: 'Scorecard is usable; compensation band still needs manager confirmation.',
  },
  {
    label: 'Decision risk',
    value: 'Medium',
    detail: 'Two candidates have gaps that should be discussed before outreach.',
  },
  {
    label: 'Team load',
    value: '6 tasks',
    detail: 'Recruiter owns outreach, manager owns scorecard and comp alignment.',
  },
]

const employerPriorities = [
  'Enterprise renewal ownership',
  'Operational playbook building',
  'Product feedback synthesis',
  'Calm executive communication',
]

const candidateShortlist = [
  {
    name: 'Maya Thompson',
    fit: 94,
    stage: 'Recommended',
    evidence: ['Renewal process rebuild', 'Healthcare SaaS', 'Executive comms'],
    risks: ['Needs product analytics example'],
  },
  {
    name: 'Jordan Lee',
    fit: 88,
    stage: 'Review',
    evidence: ['Enterprise CS', 'Expansion motions', 'Team lead'],
    risks: ['Comp target may exceed band'],
  },
  {
    name: 'Priya Shah',
    fit: 84,
    stage: 'Nurture',
    evidence: ['Implementation ops', 'Strong customer storytelling'],
    risks: ['Less renewal ownership'],
  },
]

const employerEvidenceReviews: EmployerEvidenceReview[] = [
  {
    candidate: 'Maya Thompson',
    recommendation: 'Advance to recruiter screen',
    score: '94%',
    owner: 'Recruiter',
    rubric: [
      ['Renewal ownership', 'Strong'],
      ['Playbook building', 'Strong'],
      ['Product feedback synthesis', 'Needs example'],
      ['Executive communication', 'Strong'],
    ],
    evidence: ['Healthcare SaaS workflow rebuild', 'Executive customer communication', 'Renewal process improvements'],
    risks: ['Product analytics example is not yet explicit.'],
    next: 'Personalize outreach with healthcare workflow evidence after manager confirms the analytics gap is coachable.',
    tone: 'green',
  },
  {
    candidate: 'Jordan Lee',
    recommendation: 'Pause until compensation alignment',
    score: '88%',
    owner: 'Hiring manager',
    rubric: [
      ['Renewal ownership', 'Strong'],
      ['Playbook building', 'Moderate'],
      ['Product feedback synthesis', 'Strong'],
      ['Executive communication', 'Moderate'],
    ],
    evidence: ['Enterprise CS ownership', 'Expansion motions', 'Team leadership'],
    risks: ['Compensation target may exceed approved band.'],
    next: 'Confirm compensation flexibility before asking the recruiter to schedule a screen.',
    tone: 'amber',
  },
  {
    candidate: 'Priya Shah',
    recommendation: 'Nurture for implementation track',
    score: '84%',
    owner: 'Talent ops',
    rubric: [
      ['Renewal ownership', 'Light'],
      ['Playbook building', 'Strong'],
      ['Product feedback synthesis', 'Moderate'],
      ['Executive communication', 'Moderate'],
    ],
    evidence: ['Implementation operations', 'Customer storytelling', 'Structured enablement'],
    risks: ['Less direct renewal ownership for the current role.'],
    next: 'Move to future implementation lead nurture lane with a clear role note.',
    tone: 'blue',
  },
]

const employerPipeline = [
  ['Sourced', '42'],
  ['Qualified', '24'],
  ['Outreach', '9'],
  ['Interviewing', '5'],
  ['Decision', '2'],
]

const outreachTasks = [
  {
    candidate: 'Maya Thompson',
    action: 'Personalize outreach with healthcare workflow evidence',
    owner: 'Recruiter',
  },
  {
    candidate: 'Jordan Lee',
    action: 'Confirm salary alignment before interview',
    owner: 'Hiring manager',
  },
  {
    candidate: 'Priya Shah',
    action: 'Invite to future implementation lead role',
    owner: 'Talent ops',
  },
]

const scorecardCriteria = [
  {
    criterion: 'Enterprise renewal ownership',
    weight: '30%',
    evidence: 'Managed high-value accounts and improved renewal process.',
  },
  {
    criterion: 'Operational playbook building',
    weight: '25%',
    evidence: 'Created repeatable workflow, documentation, and enablement rhythm.',
  },
  {
    criterion: 'Product feedback synthesis',
    weight: '20%',
    evidence: 'Translated customer signals into product-facing themes.',
  },
  {
    criterion: 'Executive communication',
    weight: '25%',
    evidence: 'Calm communication with senior stakeholders under pressure.',
  },
]

const interviewCoordination = [
  {
    candidate: 'Maya Thompson',
    panel: 'Recruiter screen',
    status: 'Awaiting candidate availability',
  },
  {
    candidate: 'Jordan Lee',
    panel: 'Hiring manager deep dive',
    status: 'Comp alignment needed first',
  },
  {
    candidate: 'Priya Shah',
    panel: 'Future role nurture',
    status: 'Hold for implementation role',
  },
]

const collaborationNotes = [
  {
    owner: 'Recruiter',
    note: 'Outreach copy must cite evidence from the locked scorecard.',
  },
  {
    owner: 'Hiring manager',
    note: 'Confirm whether product analytics is a must-have or coachable gap.',
  },
  {
    owner: 'Talent ops',
    note: 'Review compensation band before inviting final interviews.',
  },
]

const fairnessChecks: Array<[string, boolean]> = [
  ['Structured criteria locked before ranking', true],
  ['Compensation band visible to team', false],
  ['Candidate evidence shown before AI summary', true],
  ['Interview scorecard consistent across candidates', true],
]

const employerMarketPlays = [
  {
    pattern: 'Talent search',
    jobsFlowMove: 'Evidence-filtered sourcing',
    detail: 'Search by skills, seniority, location, and proof signals after criteria are locked.',
  },
  {
    pattern: 'Invite to apply',
    jobsFlowMove: 'Invite to review',
    detail: 'Employers can draft targeted invitations, but outreach waits for human review and audit logging.',
  },
  {
    pattern: 'Employer brand',
    jobsFlowMove: 'Trust profile',
    detail: 'Teams publish role clarity, salary band, interview plan, and response expectations before outreach.',
  },
  {
    pattern: 'Sponsored reach',
    jobsFlowMove: 'Distribution readiness',
    detail: 'Paid distribution is blocked until the role has clear criteria, comp visibility, and fairness checks.',
  },
  {
    pattern: 'Campus recruiting',
    jobsFlowMove: 'Early-talent lanes',
    detail: 'Internship and graduate hiring can run with event pipelines, school cohorts, and entry-level scorecards.',
  },
]

const employerActivationPreview = [
  ['Role', 'Senior Customer Success Lead'],
  ['Must-have evidence', 'Enterprise renewals, playbook building, executive communication'],
  ['Compensation check', '$115k - $145k band needs final approval'],
  ['Next gate', 'Lock scorecard before inviting candidates'],
]

const trustCommandCenter = [
  {
    label: 'External actions',
    value: '0 live',
    detail: 'Prototype remains draft-only with explicit review gates.',
  },
  {
    label: 'Consent gates',
    value: '4 tracked',
    detail: 'Riskier actions stay blocked until production controls exist.',
  },
  {
    label: 'Billing status',
    value: 'Stripe-ready',
    detail: 'Plans are modeled, but no card collection exists in the prototype.',
  },
]

const trustControls = [
  {
    title: 'Candidate review gate',
    status: 'Required',
    detail: 'Applications, outreach, and follow-ups require approval until production policies are configured.',
  },
  {
    title: 'Company exclusion list',
    status: 'Active',
    detail: 'Blocks current employers, conflicts, sensitive industries, and candidate-defined no-go companies.',
  },
  {
    title: 'Duplicate prevention',
    status: 'Active',
    detail: 'Detects repeated roles, recruiter reposts, and ATS duplicates before queueing action.',
  },
  {
    title: 'Data export and deletion',
    status: 'Planned',
    detail: 'Candidates and employers need visible export, deletion, retention, and consent controls.',
  },
]

const dataOwnershipControls = [
  {
    title: 'Export readiness',
    detail: 'Candidate profile, resume artifacts, saved answers, and audit receipts need portable exports.',
  },
  {
    title: 'Deletion readiness',
    detail: 'Sensitive profile fields, files, drafts, and inactive employer data need retention-aware deletion.',
  },
  {
    title: 'Privacy boundaries',
    detail: 'Employer visibility should require explicit candidate consent and employer data-use terms.',
  },
]

const complianceLedger: ComplianceLedgerItem[] = [
  {
    control: 'Consent receipts',
    status: 'Modeled',
    owner: 'Platform',
    proof: 'Consent matrix identifies required approvals and audit event names.',
    next: 'Persist consent receipts with scope, actor, expiration, and action preview.',
    tone: 'blue',
  },
  {
    control: 'Resume privacy',
    status: 'Live foundation',
    owner: 'Platform',
    proof: 'R2 upload, D1 metadata, tenant session, and audit event smoke test passed.',
    next: 'Add private download, malware scanning, source hash, and deletion workflow.',
    tone: 'green',
  },
  {
    control: 'External actions',
    status: 'Blocked',
    owner: 'Trust policy',
    proof: 'Prototype has no application submission, outreach send, scraping, or payment behavior.',
    next: 'Require certified integrations, per-action approval, and audit review before launch.',
    tone: 'green',
  },
  {
    control: 'Affordable billing',
    status: 'Stripe-ready design',
    owner: 'Growth and finance',
    proof: 'Plan entitlements and candidate affordability philosophy are visible.',
    next: 'Create Stripe products, portal, coupons, hardship policy, and entitlement checks.',
    tone: 'amber',
  },
  {
    control: 'Fairness review',
    status: 'Prototype checklist',
    owner: 'Hiring team',
    proof: 'Employer workspace requires criteria before ranking and shows gap/risk indicators.',
    next: 'Persist scorecard versions and decision notes with role-level audit history.',
    tone: 'amber',
  },
  {
    control: 'Export and deletion',
    status: 'Policy needed',
    owner: 'Privacy',
    proof: 'Data ownership surface defines candidate and employer control expectations.',
    next: 'Build export/delete endpoints, retention jobs, and user-facing confirmation receipts.',
    tone: 'red',
  },
]

const abusePreventionRules = [
  'Daily action limits for any guarded queue',
  'Duplicate detection before packet review',
  'Company exclusions checked before every recommendation',
  'Manual support review for unusual activity patterns',
]

const auditEvents = [
  {
    event: 'Resume variant generated',
    owner: 'JobsFlow AI',
    limit: 'Draft only',
    time: '09:14',
  },
  {
    event: 'Kora Health packet marked ready',
    owner: 'Candidate',
    limit: 'Awaiting approval',
    time: '09:31',
  },
  {
    event: 'Duplicate BrightOps posting blocked',
    owner: 'Policy guard',
    limit: 'No external action',
    time: '10:08',
  },
]

const integrations = [
  ['LinkedIn', 'Extension design'],
  ['Greenhouse', 'ATS adapter'],
  ['Lever', 'ATS adapter'],
  ['Workday', 'Guarded beta'],
  ['Google Calendar', 'Interview sync'],
  ['Gmail / Outlook', 'Follow-up drafts'],
  ['Stripe', 'Affordable billing'],
  ['Slack', 'Employer team alerts'],
]

function toneClass(tone: Tone = 'neutral') {
  return `tone-${tone}`
}

function StatusPill({ children, tone = 'neutral' }: { children: string; tone?: Tone }) {
  return <span className={`status-pill ${toneClass(tone)}`}>{children}</span>
}

function MetricTile({ metric }: { metric: Metric }) {
  return (
    <article className="metric-tile">
      <span>{metric.label}</span>
      <strong>{metric.value}</strong>
      <p>{metric.detail}</p>
    </article>
  )
}

function SectionHeader({
  eyebrow,
  title,
  copy,
}: {
  eyebrow: string
  title: string
  copy?: string
}) {
  return (
    <div className="section-header">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      {copy ? <p>{copy}</p> : null}
    </div>
  )
}

function EvidenceList({ items }: { items: string[] }) {
  return (
    <ul className="evidence-list">
      {items.map((item) => (
        <li key={item}>
          <CheckCircle2 size={15} aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  )
}

function WorkspaceButton({
  workspace,
  active,
  onClick,
}: {
  workspace: (typeof workspaces)[number]
  active: boolean
  onClick: () => void
}) {
  const Icon = workspace.icon

  return (
    <button
      className={active ? 'workspace-tab active' : 'workspace-tab'}
      onClick={onClick}
      type="button"
    >
      <Icon size={18} aria-hidden="true" />
      <span>{workspace.label}</span>
    </button>
  )
}

function ProductOnboarding({
  activeStep,
  onStepChange,
}: {
  activeStep: string
  onStepChange: (step: string) => void
}) {
  const selectedStep =
    onboardingSteps.find((step) => step.key === activeStep) ?? onboardingSteps[0]

  return (
    <section className="onboarding-panel" aria-label="Product onboarding">
      <div className="onboarding-copy">
        <span>Guided setup</span>
        <h2>Turn intent into trusted workflow</h2>
        <p>
          JobsFlow starts by clarifying signal, consent, ownership, and affordability before
          any automation is allowed to act.
        </p>
      </div>
      <div className="onboarding-steps" role="tablist" aria-label="Onboarding steps">
        {onboardingSteps.map((step, index) => (
          <button
            aria-selected={step.key === activeStep}
            className={step.key === activeStep ? 'onboarding-step active' : 'onboarding-step'}
            key={step.key}
            onClick={() => onStepChange(step.key)}
            role="tab"
            type="button"
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{step.title}</strong>
          </button>
        ))}
      </div>
      <article className="onboarding-detail">
        <StatusPill tone="blue">{`${selectedStep.owner} workspace`}</StatusPill>
        <h3>{selectedStep.outcome}</h3>
        <p>{selectedStep.proof}</p>
      </article>
    </section>
  )
}

function CommandCenter({ items }: { items: Array<{ label: string; value: string; detail: string }> }) {
  return (
    <div className="command-center">
      {items.map((item) => (
        <div className="command-item" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <p>{item.detail}</p>
        </div>
      ))}
    </div>
  )
}

function SignalOperationsLayer({
  activeWorkspace,
  onWorkspaceChange,
}: {
  activeWorkspace: Workspace
  onWorkspaceChange: (workspace: Workspace) => void
}) {
  const activeDecision = signalDecisions.find((decision) => decision.workspace === activeWorkspace)
  const relatedDecisions = signalDecisions.filter((decision) => decision.workspace !== activeWorkspace)

  return (
    <section className="ops-layer" aria-label="Signal operations layer">
      <div className="ops-copy">
        <span>Signal operations</span>
        <h2>Run the next reviewed decision</h2>
        <p>
          JobsFlow keeps each workspace focused on what changed, why it matters,
          and which evidence-backed action should happen next.
        </p>
      </div>

      {activeDecision ? (
        <article className="ops-decision primary-decision">
          <div className="decision-topline">
            <StatusPill tone={activeDecision.tone}>{activeDecision.status}</StatusPill>
            <span>{activeDecision.owner}</span>
          </div>
          <strong>{activeDecision.title}</strong>
          <div className="decision-flow">
            <div>
              <span>Changed</span>
              <p>{activeDecision.changed}</p>
            </div>
            <div>
              <span>Matters</span>
              <p>{activeDecision.matters}</p>
            </div>
            <div>
              <span>Next</span>
              <p>{activeDecision.next}</p>
            </div>
          </div>
          <EvidenceList items={activeDecision.evidence} />
        </article>
      ) : null}

      <aside className="ops-router" aria-label="Other workspace decisions">
        {relatedDecisions.map((decision) => (
          <button
            key={decision.label}
            onClick={() => onWorkspaceChange(decision.workspace)}
            type="button"
          >
            <span>{decision.label}</span>
            <strong>{decision.title}</strong>
            <small>{decision.next}</small>
          </button>
        ))}
      </aside>
    </section>
  )
}

function AuthPanel({
  session,
  onSessionChange,
}: {
  session: BackendSession | null
  onSessionChange: (session: BackendSession | null) => void
}) {
  const [accountType, setAccountType] = useState<'candidate' | 'employer'>('candidate')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [bootstrapToken, setBootstrapToken] = useState('')
  const [message, setMessage] = useState('Looking for an active JobsFlow workspace...')
  const [isBusy, setIsBusy] = useState(false)
  const sso = useJobsFlowSso()
  const autoSsoSessionAttempted = useRef(false)
  const selectedChecklist =
    accountType === 'candidate' ? candidateActivationChecklist : employerActivationChecklist
  const needsFreshCode =
    !session &&
    (message.includes('no longer active') || message.includes('expired') || message.includes('fresh'))

  const checkSession = useCallback(async () => {
    setIsBusy(true)
    try {
      const result = await getBackendSession()
      onSessionChange(result.session)
      setMessage(`Workspace is open for ${result.session.email}.`)
    } catch (error) {
      onSessionChange(null)
      setMessage(humanizeJobsFlowError(error, 'auth'))
    } finally {
      setIsBusy(false)
    }
  }, [onSessionChange])

  async function handleCreateSession() {
    const normalizedEmail = email.trim()
    if (!normalizedEmail) {
      setMessage('Add an email so JobsFlow knows who owns this workspace.')
      return
    }

    const normalizedName = displayName.trim() || normalizedEmail.split('@')[0] || 'JobsFlow User'

    setIsBusy(true)
    setMessage('Checking the private beta gate...')
    try {
      const result = await createJobsFlowSession({
        accountType,
        bootstrapToken: bootstrapToken.trim() || undefined,
        displayName: normalizedName,
        email: normalizedEmail,
        role: accountType === 'employer' ? 'recruiter' : 'candidate',
        tenantName:
          tenantName.trim() ||
          (accountType === 'employer'
            ? `${normalizedName} Hiring Team`
            : `${normalizedName} Career Workspace`),
      })
      onSessionChange(result.session)
      setBootstrapToken('')
      setMessage(`Workspace opened for ${result.session.email}. JobsFlow is ready to keep actions behind review.`)
    } catch (error) {
      onSessionChange(null)
      setMessage(humanizeJobsFlowError(error, 'auth'))
    } finally {
      setIsBusy(false)
    }
  }

  const handleCreateSsoSession = useCallback(async () => {
    if (!sso.configured) {
      setMessage('SSO is selected for JobsFlow, but the provider keys are not connected yet.')
      return
    }

    if (!sso.isLoaded) {
      setMessage(
        sso.loadTimedOut
          ? 'SSO is connected, but this browser could not load Clerk yet. Hard refresh, disable blockers for JobsFlow and Clerk, or use the private beta fallback.'
          : 'SSO is loading. The sign-in buttons will unlock as soon as Clerk is ready.',
      )
      return
    }

    if (!sso.isSignedIn) {
      sso.openSignIn()
      return
    }

    const token = await sso.getToken()
    if (!token) {
      setMessage('SSO is signed in, but JobsFlow could not read a secure session token yet.')
      return
    }

    const normalizedEmail = sso.email ?? email.trim()
    if (!normalizedEmail) {
      setMessage('SSO worked, but JobsFlow still needs an email to create the workspace.')
      return
    }

    const normalizedName =
      sso.displayName || displayName.trim() || normalizedEmail.split('@')[0] || 'JobsFlow User'

    setIsBusy(true)
    setMessage('Opening a JobsFlow workspace from SSO...')

    try {
      const result = await createJobsFlowSession({
        accountType,
        displayName: normalizedName,
        email: normalizedEmail,
        role: accountType === 'employer' ? 'recruiter' : 'candidate',
        ssoToken: token,
        tenantName:
          tenantName.trim() ||
          (accountType === 'employer'
            ? `${normalizedName} Hiring Team`
            : `${normalizedName} Career Workspace`),
      })
      onSessionChange(result.session)
      setMessage(`Workspace opened from SSO for ${result.session.email}. JobsFlow is ready to keep actions behind review.`)
    } catch (error) {
      onSessionChange(null)
      setMessage(humanizeJobsFlowError(error, 'auth'))
    } finally {
      setIsBusy(false)
    }
  }, [accountType, displayName, email, onSessionChange, sso, tenantName])

  const handleCreateSsoAccount = useCallback(() => {
    if (!sso.configured) {
      setMessage('SSO is selected for JobsFlow, but the provider keys are not connected yet.')
      return
    }

    if (!sso.isLoaded) {
      setMessage(
        sso.loadTimedOut
          ? 'SSO is connected, but this browser could not load Clerk yet. Hard refresh, disable blockers for JobsFlow and Clerk, or use the private beta fallback.'
          : 'SSO is loading. The account creation button will unlock as soon as Clerk is ready.',
      )
      return
    }

    if (!sso.isSignedIn) {
      sso.openSignUp()
      return
    }

    void handleCreateSsoSession()
  }, [handleCreateSsoSession, sso])

  async function handleSignOut() {
    setIsBusy(true)
    try {
      await deleteBackendSession()
      if (sso.isSignedIn) {
        await sso.signOut()
      }
      autoSsoSessionAttempted.current = false
      onSessionChange(null)
      setMessage('Workspace closed. Your next action will need a fresh signed session.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'auth'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void checkSession()
  }, [checkSession])

  useEffect(() => {
    if (!sso.isSignedIn) {
      autoSsoSessionAttempted.current = false
    }
  }, [sso.isSignedIn])

  useEffect(() => {
    if (!sso.email && !sso.displayName) {
      return
    }

    if (sso.email && !email) {
      setEmail(sso.email)
    }

    if (sso.displayName && !displayName) {
      setDisplayName(sso.displayName)
    }
  }, [displayName, email, sso.displayName, sso.email])

  useEffect(() => {
    if (!sso.isLoaded || !sso.isSignedIn || session || isBusy || autoSsoSessionAttempted.current) {
      return
    }

    autoSsoSessionAttempted.current = true
    setMessage('SSO sign-in complete. Opening your JobsFlow workspace...')
    void handleCreateSsoSession()
  }, [handleCreateSsoSession, sso.isLoaded, sso.isSignedIn, session, isBusy])

  useEffect(() => {
    if (!session) {
      return
    }

    setAccountType(session.role === 'candidate' ? 'candidate' : 'employer')
  }, [session])

  return (
    <section className="auth-panel" aria-label="JobsFlow activation center">
      <div className="auth-copy">
        <span>Private workspace</span>
        <h2>Open JobsFlow, then decide what leaves the room</h2>
        <p>
          Sign in once. Upload evidence, review matches, and keep every employer-facing
          action behind consent.
        </p>
        <div className="activation-path">
          {selectedChecklist.slice(0, 3).map((item, index) => (
            <div className="activation-item" key={item.step}>
              <b>{String(index + 1).padStart(2, '0')}</b>
              <div>
                <strong>{item.step}</strong>
                <p>{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="auth-form">
        <div className="sso-card">
          <span>Secure access</span>
          <strong>
            {sso.isSignedIn ? 'You are signed in. Open your workspace.' : 'Sign in or create your JobsFlow account'}
          </strong>
          <p>
            Use the secure Clerk window for Google, Apple, or email. JobsFlow keeps identity
            simple before it starts handling evidence.
          </p>
          <div className="sso-actions">
            <button
              className="primary-sso"
              disabled={isBusy || !sso.configured || !sso.isLoaded}
              onClick={handleCreateSsoSession}
              type="button"
            >
              <ShieldCheck size={18} aria-hidden="true" />
              {sso.isSignedIn ? 'Open workspace from SSO' : 'Sign in'}
            </button>
            {!sso.isSignedIn ? (
              <button
                className="secondary-sso"
                disabled={isBusy || !sso.configured || !sso.isLoaded}
                onClick={handleCreateSsoAccount}
                type="button"
              >
                Create account
              </button>
            ) : null}
          </div>
          <div className="sso-provider-row" aria-label="Supported sign-in methods">
            <span>Google</span>
            <span>Apple</span>
            <span>Email</span>
          </div>
          <small>
            {sso.configured
              ? sso.isSignedIn
                ? `SSO is signed in as ${sso.email ?? 'this user'}.`
                : sso.isLoaded
                  ? 'Google, Apple, and email are the JobsFlow sign-in targets. Apple appears after the Clerk Apple provider is enabled.'
                  : sso.loadTimedOut
                    ? 'SSO is connected, but the browser is blocking or still waiting on Clerk JS. Try a hard refresh or disable blockers for this site.'
                    : 'SSO is connected. Loading the secure sign-in provider...'
              : 'SSO provider keys are not connected yet. Private beta access is still available below.'}
          </small>
        </div>
        {session ? (
          <div className="session-ready-card">
            <StatusPill tone="green">Workspace ready</StatusPill>
            <strong>{session.displayName}</strong>
            <span>{session.email}</span>
            <p>
              Resume upload, packet review, and the consent gate are unlocked for this
              signed session.
            </p>
          </div>
        ) : (
          <>
            <div className="segmented-control" aria-label="Account type">
              {(['candidate', 'employer'] as const).map((type) => (
                <button
                  aria-pressed={accountType === type}
                  className={accountType === type ? 'active' : ''}
                  key={type}
                  onClick={() => setAccountType(type)}
                  type="button"
                >
                  {type === 'candidate' ? 'Candidate' : 'Employer'}
                </button>
              ))}
            </div>
            <details className="beta-fallback" open={!sso.configured || needsFreshCode}>
              <summary>Need the private beta fallback?</summary>
              <div className="beta-fallback-grid">
                <label>
                  <span>Email</span>
                  <input
                    autoComplete="email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    type="email"
                    value={email}
                  />
                </label>
                <label>
                  <span>Name</span>
                  <input
                    autoComplete="name"
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Workspace owner"
                    type="text"
                    value={displayName}
                  />
                </label>
                <label>
                  <span>Workspace</span>
                  <input
                    onChange={(event) => setTenantName(event.target.value)}
                    placeholder={accountType === 'employer' ? 'Hiring team name' : 'Career workspace name'}
                    type="text"
                    value={tenantName}
                  />
                </label>
                <label>
                  <span>Private beta code</span>
                  <input
                    autoComplete="one-time-code"
                    onChange={(event) => setBootstrapToken(event.target.value)}
                    placeholder="Fallback only"
                    type="password"
                    value={bootstrapToken}
                  />
                </label>
                <p className="auth-helper">
                  SSO is the main path. Use this only if the hosted sign-in provider is unavailable.
                </p>
              </div>
            </details>
          </>
        )}
      </div>

      <div className="auth-state">
        <StatusPill tone={session ? 'green' : needsFreshCode ? 'red' : 'amber'}>
          {session ? 'Workspace open' : needsFreshCode ? 'Fresh code needed' : 'Private beta gate'}
        </StatusPill>
        {session ? (
          <div className="session-summary">
            <strong>{session.displayName}</strong>
            <span>{session.email}</span>
            <small>
              {session.role} / tenant {session.tenantId.slice(0, 8)}
            </small>
          </div>
        ) : (
          <>
            <strong className="auth-state-title">Ready when you are</strong>
            <p>{message}</p>
          </>
        )}
        {session ? <p className="runtime-message">{message}</p> : null}
        <div className="auth-actions">
          <button disabled={isBusy} onClick={checkSession} type="button">
            <RefreshCw size={16} aria-hidden="true" />
            Refresh status
          </button>
          {!session ? (
            <button disabled={isBusy} onClick={handleCreateSession} type="button">
              <LockKeyhole size={16} aria-hidden="true" />
              {isBusy ? 'Opening...' : 'Use beta fallback'}
            </button>
          ) : null}
          <button disabled={isBusy || !session} onClick={handleSignOut} type="button">
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </div>

      <div className="activation-next">
        {accountType === 'candidate' ? (
          <>
            <div className="activation-next-copy">
              <span>Candidate first action</span>
              <h3>Upload the resume that becomes your evidence base</h3>
              <p>
                The best candidate experience starts with one concrete action. Once
                signed in, store your resume here, then JobsFlow can build profile
                health, match evidence, and packet review around it.
              </p>
            </div>
            {session ? (
              <ResumeStoragePanel session={session} variant="activation" />
            ) : (
              <div className="activation-placeholder">
                <StatusPill tone="amber">Session needed</StatusPill>
                <strong>Start a workspace to unlock secure resume upload.</strong>
                <p>
                  Resume storage uses the signed session so files and metadata stay
                  scoped to the active tenant.
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="activation-next-copy">
              <span>Employer first action</span>
              <h3>Clarify the role before JobsFlow ranks anyone</h3>
              <p>
                The employer path starts with role criteria, scorecard weights, and
                compensation visibility. Better shortlists begin with better intake.
              </p>
            </div>
            <div className="employer-activation-preview">
              {employerActivationPreview.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function ResumeStoragePanel({
  session,
  variant = 'panel',
}: {
  session: BackendSession | null
  variant?: 'panel' | 'activation'
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [resumes, setResumes] = useState<ResumeArtifact[]>([])
  const [status, setStatus] = useState('Choose a PDF or DOCX resume. JobsFlow will keep it private to this workspace.')
  const [isUploading, setIsUploading] = useState(false)
  const isActivation = variant === 'activation'

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    setSelectedFile(file)
    setStatus(file ? `${file.name} is ready to store privately.` : 'Choose a PDF or DOCX resume. JobsFlow will keep it private to this workspace.')
  }

  async function handleUpload() {
    if (!session) {
      setStatus('Start a workspace first, then resume storage will unlock.')
      return
    }

    if (!selectedFile) {
      setStatus('Choose a resume first, then JobsFlow can store it safely.')
      return
    }

    setIsUploading(true)
    setStatus('Storing this resume inside the active workspace...')

    try {
      const result = await uploadResume(selectedFile)
      setStatus(
        `${result.resume.filename} is stored privately. JobsFlow recorded the audit trail.`,
      )
      const nextResumes = await listResumes()
      setResumes(nextResumes.resumes)
    } catch (error) {
      setStatus(humanizeJobsFlowError(error, 'resume'))
    } finally {
      setIsUploading(false)
    }
  }

  const refreshResumes = useCallback(async () => {
    if (!session) {
      setResumes([])
      setStatus('Start a workspace first, then JobsFlow can show stored resume metadata.')
      return
    }

    setIsUploading(true)
    try {
      const result = await listResumes()
      setResumes(result.resumes)
      setStatus(`${result.resumes.length} resume artifact${result.resumes.length === 1 ? '' : 's'} visible in this workspace.`)
    } catch (error) {
      setStatus(humanizeJobsFlowError(error, 'resume'))
    } finally {
      setIsUploading(false)
    }
  }, [session])

  useEffect(() => {
    if (session) {
      void refreshResumes()
    } else {
      setResumes([])
    }
  }, [refreshResumes, session])

  return (
    <article className={isActivation ? 'resume-storage-panel activation-resume' : 'panel resume-storage-panel'}>
      <div className="panel-title">
        <div>
          <span>Secure resume storage</span>
          <h3>{isActivation ? 'Upload resume and begin' : 'Private resume workspace'}</h3>
        </div>
        <DatabaseZap size={22} aria-hidden="true" />
      </div>
      <p className="muted-line">
        Your file stays private to this workspace. JobsFlow stores the resume, keeps
        metadata tenant-scoped, and records the action for audit review.
      </p>
      <div className="upload-control">
        <input
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileChange}
          type="file"
        />
        <button disabled={isUploading} onClick={handleUpload} type="button">
          <FileCheck2 size={16} aria-hidden="true" />
          {isUploading ? 'Uploading...' : 'Upload resume'}
        </button>
        <button disabled={isUploading} onClick={refreshResumes} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
      </div>
      <p className="runtime-message">{status}</p>
      <div className="resume-artifact-list">
        {resumes.map((resume) => (
          <div className="resume-artifact-row" key={resume.id}>
            <FileText size={16} aria-hidden="true" />
            <div>
              <strong>{resume.filename}</strong>
              <span>
                {(resume.sizeBytes / 1024).toFixed(1)} KB / {resume.approvalStatus}
              </span>
            </div>
          </div>
        ))}
      </div>
    </article>
  )
}

function BackendStatusPanel({
  session,
  onSessionChange,
}: {
  session: BackendSession | null
  onSessionChange: (session: BackendSession | null) => void
}) {
  const [health, setHealth] = useState<BackendHealth | null>(null)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [message, setMessage] = useState('Checking whether JobsFlow is ready to protect real workspace data...')
  const [isBusy, setIsBusy] = useState(false)

  const refreshBackend = useCallback(async () => {
    setIsBusy(true)
    try {
      const nextHealth = await getBackendHealth()
      setHealth(nextHealth)
      setMessage(
        nextHealth.databaseReady
          ? 'JobsFlow is awake. Workspace data, packet review, and audit trails are ready.'
          : 'JobsFlow is reachable, but one production data table still needs attention.',
      )

      try {
        const nextSession = await getBackendSession()
        onSessionChange(nextSession.session)
      } catch {
        onSessionChange(null)
      }
    } catch (error) {
      setHealth(null)
      onSessionChange(null)
      setMessage(humanizeJobsFlowError(error, 'backend'))
    } finally {
      setIsBusy(false)
    }
  }, [onSessionChange])

  async function loadAuditEvents() {
    setIsBusy(true)
    try {
      const result = await listAuditEvents()
      setAuditEvents(result.events)
      setMessage(`${result.events.length} audit event${result.events.length === 1 ? '' : 's'} loaded for this workspace.`)
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'audit'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshBackend()
  }, [refreshBackend])

  const bindingRows: Array<[string, boolean]> = health
    ? [
        ['Workspace database', health.bindings.db],
        ['Resume storage', health.bindings.resumeBucket],
        ['Session signing', health.bindings.sessionSecret],
        ['Private beta gate', health.bindings.bootstrapToken],
        ['SSO provider', Boolean(health.features?.ssoProvider)],
        ['Packet review engine', Boolean(health.features?.packetReviewEngine)],
      ]
    : []

  return (
    <article className="panel backend-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>Live backend readiness</span>
          <h3>Secure workspaces, resume storage, and audit trails</h3>
        </div>
        <StatusPill tone={health?.databaseReady ? 'green' : 'amber'}>
          {health ? 'Ready' : 'Checking'}
        </StatusPill>
      </div>
      <div className="backend-grid">
        <div className="backend-card">
          <strong>JobsFlow services</strong>
          <p>{message}</p>
          <div className="backend-actions">
            <button disabled={isBusy} onClick={refreshBackend} type="button">
              <RefreshCw size={16} aria-hidden="true" />
              Refresh
            </button>
            <button disabled={isBusy} onClick={loadAuditEvents} type="button">
              <DatabaseZap size={16} aria-hidden="true" />
              Load audit log
            </button>
          </div>
        </div>
        <div className="backend-card">
          <strong>Bindings</strong>
          <div className="binding-grid">
            {bindingRows.length ? (
              bindingRows.map(([label, ready]) => (
                <div className="binding-row" key={label}>
                  <span>{label}</span>
                  <StatusPill tone={ready ? 'green' : 'amber'}>{ready ? 'Ready' : 'Missing'}</StatusPill>
                </div>
              ))
            ) : (
              <p>Open the deployed app to inspect live readiness.</p>
            )}
          </div>
        </div>
        <div className="backend-card">
          <strong>Active session</strong>
          {session ? (
            <div className="session-summary">
              <span>{session.email}</span>
              <small>
                {session.role} / tenant {session.tenantId.slice(0, 8)}
              </small>
            </div>
          ) : (
            <p>No active signed JobsFlow session.</p>
          )}
        </div>
      </div>
      <div className="audit-preview">
        {auditEvents.map((event) => (
          <div className="audit-preview-row" key={event.id}>
            <span>{event.eventType}</span>
            <strong>{event.action}</strong>
            <small>{event.riskLevel} risk</small>
          </div>
        ))}
      </div>
    </article>
  )
}

function workflowTone(state: string): Tone {
  if (state === 'completed' || state === 'running') {
    return 'green'
  }

  if (state === 'blocked' || state === 'failed') {
    return 'red'
  }

  return state === 'waiting_for_approval' ? 'amber' : 'blue'
}

function textFromRecord(record: Record<string, unknown>, key: string, fallback: string) {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value : fallback
}

function WorkflowKernelPanel({ session }: { session: BackendSession | null }) {
  const [kernelState, setKernelState] = useState<WorkflowKernelState | null>(null)
  const [message, setMessage] = useState(
    'Start a workspace, then activate the Cloudflare workflow kernel for this tenant.',
  )
  const [isBusy, setIsBusy] = useState(false)
  const latestRun = kernelState?.runs[0] ?? null
  const pendingReceipts = kernelState?.receipts.filter((receipt) => receipt.status === 'pending') ?? []
  const pillarDefinitions =
    kernelState?.definitions.filter((definition) => definition.key !== 'platform.workflow_kernel') ?? []
  const activeDefinitions = kernelState?.summary.activeDefinitions ?? 0

  const refreshKernel = useCallback(async () => {
    if (!session) {
      setKernelState(null)
      setMessage('Start a workspace first, then JobsFlow can read tenant-scoped workflow state.')
      return
    }

    setIsBusy(true)
    try {
      const result = await getWorkflowKernelState()
      setKernelState(result.state)
      setMessage(
        result.state.summary.activeDefinitions
          ? `${result.state.summary.activeDefinitions} workflow definitions are active for this Cloudflare production kernel.`
          : 'Workflow tables are ready. Activate the kernel to seed the production definitions.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'workflow'))
    } finally {
      setIsBusy(false)
    }
  }, [session])

  async function activateKernel() {
    if (!session) {
      setMessage('Start a workspace first, then JobsFlow can activate the kernel for this tenant.')
      return
    }

    setIsBusy(true)
    setMessage('Seeding workflow definitions, policies, integration boundaries, and consent receipts...')
    try {
      const result = await bootstrapWorkflowKernel()
      setKernelState(result.state)
      setMessage(
        result.createdRun
          ? 'Cloudflare workflow kernel activated. External actions are still blocked behind consent and certification.'
          : 'Cloudflare workflow kernel verified. Existing consent and automation boundaries remain intact.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'workflow'))
    } finally {
      setIsBusy(false)
    }
  }

  async function startResumeWorkflow() {
    if (!session) {
      setMessage('Start a workspace before creating a workflow run.')
      return
    }

    setIsBusy(true)
    setMessage('Creating a guarded resume optimization workflow run...')
    try {
      if (!kernelState?.definitions.some((definition) => definition.key === 'resume.tailwind_optimization')) {
        await bootstrapWorkflowKernel()
      }

      const result = await startWorkflowRun({
        input: {
          targetCompany: 'Kora Health',
          targetRole: 'Product Operations Manager',
          source: 'trust_workspace_activation',
        },
        priority: 4,
        subjectId: 'first-resume-artifact',
        subjectType: 'resume_artifact',
        workflowKey: 'resume.tailwind_optimization',
      })
      setKernelState(result.state)
      setMessage('Resume optimization workflow run created behind a review gate.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'workflow'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshKernel()
  }, [refreshKernel])

  return (
    <article className="panel workflow-kernel-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>Cloudflare workflow kernel</span>
          <h3>Durable state before automation</h3>
        </div>
        <StatusPill tone={activeDefinitions ? 'green' : 'amber'}>
          {activeDefinitions ? 'Kernel ready' : 'Needs activation'}
        </StatusPill>
      </div>
      <p className="muted-line">
        D1 stores the workflow state, consent receipts, automation policies, integration boundaries, and delivery records that every JobsFlow pillar now builds on.
      </p>
      <div className="kernel-actions">
        <button disabled={isBusy} onClick={refreshKernel} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          Refresh kernel
        </button>
        <button disabled={isBusy || !session} onClick={activateKernel} type="button">
          <DatabaseZap size={16} aria-hidden="true" />
          Activate kernel
        </button>
        <button disabled={isBusy || !session} onClick={startResumeWorkflow} type="button">
          <FileCheck2 size={16} aria-hidden="true" />
          Start resume workflow
        </button>
      </div>
      <p className="runtime-message">{message}</p>
      <div className="kernel-metrics">
        <div>
          <strong>{kernelState?.summary.activeDefinitions ?? 0}</strong>
          <span>active definitions</span>
        </div>
        <div>
          <strong>{kernelState?.summary.activeRuns ?? 0}</strong>
          <span>active runs</span>
        </div>
        <div>
          <strong>{kernelState?.summary.pendingReceipts ?? 0}</strong>
          <span>pending receipts</span>
        </div>
        <div>
          <strong>{kernelState?.summary.enabledPolicies ?? 0}</strong>
          <span>enabled policies</span>
        </div>
      </div>
      <div className="kernel-grid">
        <div className="kernel-column">
          <strong>Core pillar workflows</strong>
          <div className="kernel-list">
            {pillarDefinitions.slice(0, 10).map((definition) => (
              <div className="kernel-row" key={definition.id}>
                <span>{definition.workspace}</span>
                <p>{definition.name}</p>
                <small>{definition.triggerEvent}</small>
              </div>
            ))}
            {!pillarDefinitions.length ? (
              <div className="kernel-empty">Activate the kernel to seed the ten JobsFlow pillar workflows.</div>
            ) : null}
          </div>
        </div>
        <div className="kernel-column">
          <strong>Latest runs and receipts</strong>
          <div className="kernel-list">
            {latestRun ? (
              <div className="kernel-row">
                <StatusPill tone={workflowTone(latestRun.state)}>{latestRun.state}</StatusPill>
                <p>{latestRun.workflowKey}</p>
                <small>{latestRun.currentStep}</small>
              </div>
            ) : (
              <div className="kernel-empty">No workflow runs yet.</div>
            )}
            {pendingReceipts.slice(0, 3).map((receipt) => (
              <div className="kernel-row" key={receipt.id}>
                <StatusPill tone="amber">{receipt.status}</StatusPill>
                <p>{receipt.action}</p>
                <small>{textFromRecord(receipt.preview, 'title', 'Consent preview recorded')}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="kernel-column">
          <strong>Integration boundaries</strong>
          <div className="kernel-list">
            {(kernelState?.integrations ?? []).slice(0, 6).map((integration) => (
              <div className="kernel-row" key={integration.id}>
                <span>{integration.status.replace(/_/g, ' ')}</span>
                <p>{integration.accountLabel}</p>
                <small>{integration.provider}</small>
              </div>
            ))}
            {!kernelState?.integrations.length ? (
              <div className="kernel-empty">No provider boundaries seeded yet.</div>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}

const defaultResumeTailwindText = [
  'Scaled intake workflow across 4 healthcare SaaS implementation teams and reduced launch handoff time by 28%.',
  'Owned vendor governance process for product operations handoffs, executive stakeholder updates, and launch quality reviews.',
  'Built repeatable operating rhythm for cross-functional product, implementation, and customer success teams.',
  'Managed executive customer communication during complex workflow rollouts for healthcare accounts.',
  'Created reporting dashboards for launch readiness, risk flags, and delivery quality across 18 active projects.',
].join('\n')

const defaultResumeTailwindJob = [
  'Product Operations Manager role focused on healthcare SaaS delivery, vendor governance, claims operations, and cross-functional launch quality.',
  'Own product operations workflows, coordinate claims workflow improvements, translate customer and implementation signals into product-facing priorities, and communicate clearly with executive stakeholders.',
  'The role requires product operations, healthcare SaaS, vendor governance, claims operations, product analytics, and executive communication.',
].join(' ')

function ResumeTailwindPanel({ session }: { session: BackendSession | null }) {
  const [targetRole, setTargetRole] = useState(applicationPacket.role)
  const [company, setCompany] = useState(applicationPacket.company)
  const [resumeText, setResumeText] = useState(defaultResumeTailwindText)
  const [jobDescription, setJobDescription] = useState(defaultResumeTailwindJob)
  const [resumeIntelState, setResumeIntelState] = useState<ResumeIntelligenceState | null>(null)
  const [message, setMessage] = useState('Start a workspace, then JobsFlow can run Resume Tailwind Optimization.')
  const [isBusy, setIsBusy] = useState(false)
  const latestAnalysis = resumeIntelState?.analyses[0] ?? null

  const refreshResumeIntelligence = useCallback(async () => {
    if (!session) {
      setResumeIntelState(null)
      setMessage('Start a candidate workspace first, then JobsFlow can load resume intelligence.')
      return
    }

    setIsBusy(true)
    try {
      const result = await getResumeIntelligenceState()
      setResumeIntelState(result.state)
      setMessage(
        result.state.summary.analyses
          ? `${result.state.summary.analyses} resume analysis record${result.state.summary.analyses === 1 ? '' : 's'} ready.`
          : 'No resume analyses yet. Run the optimizer to create one.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'resume-intelligence'))
    } finally {
      setIsBusy(false)
    }
  }, [session])

  async function runResumeTailwind() {
    if (!session) {
      setMessage('Start a candidate workspace before running Resume Tailwind Optimization.')
      return
    }

    setIsBusy(true)
    setMessage('Parsing resume facts, job requirements, semantic gaps, and vector-ready records...')
    try {
      const result = await createResumeTailwindAnalysis({
        company,
        jobDescription,
        requiredSkills: ['Product operations', 'Healthcare SaaS', 'Vendor governance', 'Claims operations', 'Product analytics'],
        resumeText,
        salaryRange: {
          currency: 'USD',
          maxCents: 13800000,
          minCents: 11800000,
        },
        targetRole,
      })
      setResumeIntelState(result.state)
      setMessage(
        `Resume Tailwind Optimization complete: ${result.analysis.readinessScore}% ready with ${result.analysis.missingSkills.length} gap${result.analysis.missingSkills.length === 1 ? '' : 's'}.`,
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'resume-intelligence'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshResumeIntelligence()
  }, [refreshResumeIntelligence])

  return (
    <article className="panel resume-tailwind-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>Resume Tailwind Optimization</span>
          <h3>Semantic gaps before tailored variants</h3>
        </div>
        <StatusPill tone={latestAnalysis ? 'green' : 'amber'}>
          {latestAnalysis ? `${latestAnalysis.readinessScore}% ready` : 'No analysis yet'}
        </StatusPill>
      </div>
      <div className="tailwind-form">
        <label>
          <span>Target role</span>
          <input onChange={(event) => setTargetRole(event.target.value)} type="text" value={targetRole} />
        </label>
        <label>
          <span>Company</span>
          <input onChange={(event) => setCompany(event.target.value)} type="text" value={company} />
        </label>
        <label className="tailwind-textarea">
          <span>Master resume evidence</span>
          <textarea onChange={(event) => setResumeText(event.target.value)} rows={7} value={resumeText} />
        </label>
        <label className="tailwind-textarea">
          <span>Target job description</span>
          <textarea onChange={(event) => setJobDescription(event.target.value)} rows={7} value={jobDescription} />
        </label>
      </div>
      <div className="kernel-actions">
        <button disabled={isBusy || !session} onClick={runResumeTailwind} type="button">
          <SearchCheck size={16} aria-hidden="true" />
          {isBusy ? 'Analyzing...' : 'Run optimizer'}
        </button>
        <button disabled={isBusy || !session} onClick={refreshResumeIntelligence} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          Refresh analyses
        </button>
      </div>
      <p className="runtime-message">{message}</p>
      {latestAnalysis ? (
        <>
          <div className="tailwind-score-grid">
            <div>
              <strong>{latestAnalysis.readinessScore}%</strong>
              <span>readiness</span>
            </div>
            <div>
              <strong>{latestAnalysis.skillCoverageScore}%</strong>
              <span>skill coverage</span>
            </div>
            <div>
              <strong>{latestAnalysis.semanticOverlapScore}%</strong>
              <span>semantic overlap</span>
            </div>
            <div>
              <strong>{latestAnalysis.proofStrength}</strong>
              <span>proof strength</span>
            </div>
          </div>
          <div className="tailwind-results-grid">
            <div className="tailwind-result-box">
              <strong>Matched skills</strong>
              <EvidenceList items={latestAnalysis.matchedSkills.length ? latestAnalysis.matchedSkills : ['No matched skills detected yet']} />
            </div>
            <div className="tailwind-result-box">
              <strong>Missing skills</strong>
              <EvidenceList items={latestAnalysis.missingSkills.length ? latestAnalysis.missingSkills : ['No required skill gaps detected']} />
            </div>
            <div className="tailwind-result-box">
              <strong>Recommendations</strong>
              <EvidenceList
                items={
                  latestAnalysis.recommendations.length
                    ? latestAnalysis.recommendations.map((recommendation) => recommendation.title)
                    : ['Resume evidence is ready for candidate review']
                }
              />
            </div>
            <div className="tailwind-result-box">
              <strong>Vector queue</strong>
              <EvidenceList
                items={[
                  `${latestAnalysis.vectorDocuments.length} vector-ready document${latestAnalysis.vectorDocuments.length === 1 ? '' : 's'}`,
                  `${resumeIntelState?.summary.pendingVectorDocuments ?? 0} pending embedding${resumeIntelState?.summary.pendingVectorDocuments === 1 ? '' : 's'}`,
                ]}
              />
            </div>
          </div>
        </>
      ) : null}
    </article>
  )
}

const pipelineStages: Array<{ key: PipelineState; label: string }> = [
  { key: 'packet_review', label: 'Packet' },
  { key: 'applied', label: 'Applied' },
  { key: 'employer_review', label: 'Review' },
  { key: 'recruiter_screen', label: 'Screen' },
  { key: 'interview', label: 'Interview' },
  { key: 'offer', label: 'Offer' },
]

function pipelineTone(status: string): Tone {
  if (status === 'overdue' || status === 'high') {
    return 'red'
  }

  if (status === 'due_soon' || status === 'medium') {
    return 'amber'
  }

  return status === 'not_required' ? 'neutral' : 'green'
}

function AntiGhostingPipelinePanel({ session }: { session: BackendSession | null }) {
  const [pipelineState, setPipelineState] = useState<AntiGhostingPipelineState | null>(null)
  const [message, setMessage] = useState('Start a workspace, then JobsFlow can track application response SLAs.')
  const [isBusy, setIsBusy] = useState(false)
  const latestItem = pipelineState?.items[0] ?? null
  const openTasks = pipelineState?.tasks.filter((task) => task.status === 'open') ?? []

  const refreshPipeline = useCallback(async () => {
    if (!session) {
      setPipelineState(null)
      setMessage('Start a candidate workspace first, then JobsFlow can read pipeline state.')
      return
    }

    setIsBusy(true)
    try {
      const result = await getAntiGhostingPipelineState()
      setPipelineState(result.state)
      setMessage(
        result.state.summary.activeApplications
          ? `${result.state.summary.activeApplications} active application${result.state.summary.activeApplications === 1 ? '' : 's'} under SLA control.`
          : 'No active applications yet. Track one to activate anti-ghosting controls.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'pipeline'))
    } finally {
      setIsBusy(false)
    }
  }, [session])

  async function trackKoraApplication() {
    if (!session) {
      setMessage('Start a candidate workspace before tracking an application.')
      return
    }

    setIsBusy(true)
    setMessage('Creating application tracker item and employer response SLA...')
    try {
      const result = await createPipelineItem({
        company: applicationPacket.company,
        notes: 'Created from JobsFlow packet review path.',
        roleTitle: applicationPacket.role,
        salaryRange: {
          maxCents: 13800000,
          minCents: 11800000,
        },
        source: 'jobsflow_packet',
        state: 'applied',
      })
      setPipelineState(result.state)
      setMessage('Application is now tracked. JobsFlow created the response SLA and any needed follow-up task.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'pipeline'))
    } finally {
      setIsBusy(false)
    }
  }

  async function advanceLatest() {
    if (!latestItem) {
      setMessage('Track an application first, then JobsFlow can advance its stage.')
      return
    }

    const currentIndex = pipelineStages.findIndex((stage) => stage.key === latestItem.state)
    const nextStage = pipelineStages[Math.min(currentIndex + 1, pipelineStages.length - 1)]?.key ?? 'employer_review'

    setIsBusy(true)
    setMessage('Advancing pipeline stage and recalculating response expectations...')
    try {
      const result = await advancePipelineItem(latestItem.id, nextStage)
      setPipelineState(result.state)
      setMessage(`Moved ${latestItem.company} to ${nextStage.replaceAll('_', ' ')} with a fresh response SLA.`)
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'pipeline'))
    } finally {
      setIsBusy(false)
    }
  }

  async function checkStaleApplications() {
    if (!session) {
      setMessage('Start a candidate workspace before checking stale applications.')
      return
    }

    setIsBusy(true)
    setMessage('Checking response SLAs and drafting fallback reminders...')
    try {
      const result = await runPipelineStaleCheck()
      setPipelineState(result.state)
      setMessage('Pipeline stale check complete. Follow-up drafts remain inside JobsFlow until approved.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'pipeline'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshPipeline()
  }, [refreshPipeline])

  return (
    <article className="panel anti-ghosting-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>Anti-Ghosting Pipeline Tracker</span>
          <h3>Response SLAs, follow-ups, and fallback motion</h3>
        </div>
        <StatusPill tone={pipelineState?.summary.overdueApplications ? 'red' : pipelineState?.summary.dueSoonApplications ? 'amber' : 'green'}>
          {pipelineState?.summary.overdueApplications
            ? `${pipelineState.summary.overdueApplications} overdue`
            : `${pipelineState?.summary.activeApplications ?? 0} active`}
        </StatusPill>
      </div>
      <div className="kernel-actions">
        <button disabled={isBusy || !session} onClick={trackKoraApplication} type="button">
          <ClipboardCheck size={16} aria-hidden="true" />
          Track Kora
        </button>
        <button disabled={isBusy || !latestItem} onClick={advanceLatest} type="button">
          <ArrowRight size={16} aria-hidden="true" />
          Advance latest
        </button>
        <button disabled={isBusy || !session} onClick={checkStaleApplications} type="button">
          <Clock3 size={16} aria-hidden="true" />
          Run stale check
        </button>
        <button disabled={isBusy || !session} onClick={refreshPipeline} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          Refresh tracker
        </button>
      </div>
      <p className="runtime-message">{message}</p>
      <div className="pipeline-summary-grid">
        <div>
          <strong>{pipelineState?.summary.activeApplications ?? 0}</strong>
          <span>active</span>
        </div>
        <div>
          <strong>{pipelineState?.summary.dueSoonApplications ?? 0}</strong>
          <span>due soon</span>
        </div>
        <div>
          <strong>{pipelineState?.summary.overdueApplications ?? 0}</strong>
          <span>overdue</span>
        </div>
        <div>
          <strong>{pipelineState?.summary.openFollowUps ?? 0}</strong>
          <span>open follow-ups</span>
        </div>
      </div>
      <div className="pipeline-kanban">
        {pipelineStages.map((stage) => {
          const stageItems = pipelineState?.items.filter((item) => item.state === stage.key) ?? []
          return (
            <div className="pipeline-stage-card" key={stage.key}>
              <strong>{stage.label}</strong>
              {stageItems.length ? (
                stageItems.slice(0, 3).map((item) => (
                  <div className="pipeline-item-card" key={item.id}>
                    <p>{item.company}</p>
                    <small>{item.roleTitle}</small>
                    <StatusPill tone={pipelineTone(item.employerUpdateStatus)}>
                      {item.employerUpdateStatus.replaceAll('_', ' ')}
                    </StatusPill>
                  </div>
                ))
              ) : (
                <span>No tracked roles</span>
              )}
            </div>
          )
        })}
      </div>
      <div className="pipeline-followup-list">
        <strong>Open follow-up drafts</strong>
        {openTasks.slice(0, 3).map((task) => (
          <div className="pipeline-followup-row" key={task.id}>
            <StatusPill tone={pipelineTone(task.riskLevel)}>{task.taskType.replaceAll('_', ' ')}</StatusPill>
            <p>{task.draftText}</p>
            <small>{task.channel} / consent required</small>
          </div>
        ))}
        {!openTasks.length ? <div className="kernel-empty">No follow-up drafts are open.</div> : null}
      </div>
    </article>
  )
}

function CandidateWorkspace({
  automationMode,
  onModeChange,
  session,
}: {
  automationMode: string
  onModeChange: (mode: string) => void
  session: BackendSession | null
}) {
  const [packetReviewResult, setPacketReviewResult] = useState<ApplicationPacketReview | null>(null)
  const [packetReviewMessage, setPacketReviewMessage] = useState(
    'Start a workspace, then JobsFlow can review this packet and explain whether it is ready or not yet.',
  )
  const [isReviewingPacket, setIsReviewingPacket] = useState(false)
  const packetReviewTone: Tone = packetReviewResult?.state === 'approved'
    ? 'green'
    : packetReviewResult?.state === 'blocked'
      ? 'red'
      : 'amber'

  async function handlePacketReview() {
    if (!session) {
      setPacketReviewMessage('Start a candidate workspace before running the packet review engine.')
      return
    }

    setIsReviewingPacket(true)
    setPacketReviewMessage('Checking the evidence, safeguards, and approval gates...')

    try {
      const result = await createApplicationPacketReview({
        company: applicationPacket.company,
        duplicateFound: false,
        evidence: [
          'Scaled intake workflow across 4 healthcare SaaS implementation teams',
          'Owned vendor governance process for product operations handoffs',
          'Reduced launch handoff time by 28% with a repeatable operating rhythm',
          'Managed executive stakeholder communication during cross-functional rollout',
        ],
        jobDescription:
          'Product Operations Manager role focused on healthcare SaaS delivery, vendor governance, claims operations, and cross-functional launch quality.',
        requiredSkills: [
          'Product operations',
          'Healthcare SaaS',
          'Vendor governance',
          'Claims operations',
        ],
        salaryFloorCents: 11500000,
        salaryRange: {
          currency: 'USD',
          maxCents: 13800000,
          minCents: 11800000,
        },
        sensitiveAnswers: [
          {
            approved: false,
            key: 'workday-sponsorship',
            label: 'Workday sponsorship answer',
            value: 'No current sponsorship requirement',
          },
        ],
        targetRole: applicationPacket.role,
      })

      setPacketReviewResult(result.packet)
      const reviewGateCount = result.packet.requiredReviews.length
      setPacketReviewMessage(
        reviewGateCount
          ? `JobsFlow says not yet for ${reviewGateCount} reason${reviewGateCount === 1 ? '' : 's'}. The packet is ${result.packet.readinessScore}% ready, and external action stays blocked.`
          : `JobsFlow says this packet is ready for candidate approval. External action still waits for explicit consent.`,
      )
    } catch (error) {
      setPacketReviewMessage(humanizeJobsFlowError(error, 'packet'))
    } finally {
      setIsReviewingPacket(false)
    }
  }

  return (
    <section className="workspace-grid candidate-workspace">
      <div className="workspace-lead">
        <SectionHeader
          copy="Today’s focus: review two high-fit packets, strengthen one proof gap, and keep every external action under candidate approval."
          eyebrow="Candidate workspace"
          title="Apply with precision, not volume"
        />
        <div className="lead-actions">
          <button type="button">
            <FileCheck2 size={18} aria-hidden="true" />
            Review packets
          </button>
          <button type="button">
            <SearchCheck size={18} aria-hidden="true" />
            Tune matches
          </button>
        </div>
      </div>

      <CommandCenter items={candidateCommandCenter} />

      <div className="metrics-row">
        {candidateMetrics.map((metric) => (
          <MetricTile key={metric.label} metric={metric} />
        ))}
      </div>

      <article className="panel profile-panel">
        <div className="panel-title">
          <div>
            <span>Profile health</span>
            <h3>{candidateProfile.name}</h3>
          </div>
          <StatusPill tone="green">{`${candidateProfile.health}% ready`}</StatusPill>
        </div>
        <p className="profile-headline">{candidateProfile.headline}</p>
        <p className="muted-line">{candidateProfile.target}</p>
        <div className="progress-track" aria-label="Profile health">
          <span style={{ width: `${candidateProfile.health}%` }}></span>
        </div>
        <div className="two-column-list">
          <div>
            <h4>Verified signals</h4>
            <EvidenceList items={candidateProfile.verifiedSignals} />
          </div>
          <div>
            <h4>Needs review</h4>
            <ul className="plain-list">
              {candidateProfile.needsReview.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </article>

      <article className="panel resume-panel">
        <div className="panel-title">
          <div>
            <span>Resume intelligence</span>
            <h3>Evidence before recommendation</h3>
          </div>
          <Gauge size={22} aria-hidden="true" />
        </div>
        <div className="signal-stack">
          {resumeSignals.map((signal) => (
            <div className="signal-row" key={signal.label}>
              <span>{signal.label}</span>
              <strong>{signal.value}</strong>
              <p>{signal.detail}</p>
            </div>
          ))}
        </div>
      </article>

      <ResumeTailwindPanel session={session} />

      <article className="panel packet-panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Application packet builder</span>
            <h3>
              {applicationPacket.role} at {applicationPacket.company}
            </h3>
          </div>
          <StatusPill tone="green">{`${applicationPacket.readiness}% packet ready`}</StatusPill>
        </div>
        <div className="packet-grid">
          <div>
            <div className="progress-track" aria-label="Application packet readiness">
              <span style={{ width: `${applicationPacket.readiness}%` }}></span>
            </div>
            <div className="packet-checklist">
              {applicationPacket.sections.map(([section, status]) => (
                <div className="packet-row" key={section}>
                  <strong>{section}</strong>
                  <span>{status}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="review-gate-box">
            <StatusPill tone={packetReviewResult ? packetReviewTone : 'amber'}>
              {packetReviewResult ? packetReviewResult.state.replaceAll('_', ' ') : 'Review gate required'}
            </StatusPill>
            <h4>Before anything external</h4>
            <ul className="plain-list">
              {applicationPacket.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
            <div className="backend-actions">
              <button disabled={isReviewingPacket} onClick={handlePacketReview} type="button">
                <ShieldCheck size={16} aria-hidden="true" />
                {isReviewingPacket ? 'Checking...' : 'Run review engine'}
              </button>
            </div>
            <div className="runtime-message">
              <strong>{packetReviewMessage}</strong>
              {packetReviewResult ? (
                <p>
                  Skill coverage: {packetReviewResult.skillCoverageScore}% / proof strength:{' '}
                  {packetReviewResult.proofStrength}. Required next action:{' '}
                  {packetReviewResult.requiredReviews[0]?.requiredAction ?? 'Candidate approval can proceed.'}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </article>

      <AntiGhostingPipelinePanel session={session} />

      <article className="panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Job match queue</span>
            <h3>Roles worth human attention</h3>
          </div>
          <StatusPill tone="blue">6 review-ready</StatusPill>
        </div>
        <div className="match-table">
          {jobMatches.map((match) => (
            <div className="match-row" key={`${match.company}-${match.role}`}>
              <div>
                <strong>{match.role}</strong>
                <span>{match.company}</span>
              </div>
              <div>
                <b>{match.fit}%</b>
                <span>{match.salary}</span>
              </div>
              <div>
                <StatusPill tone={match.status === 'Watchlist' ? 'amber' : 'green'}>
                  {match.status}
                </StatusPill>
              </div>
              <div>
                <EvidenceList items={match.evidence} />
                <p className="risk-note">{match.gaps.join(', ')}</p>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="panel evidence-review-panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Fit evidence review</span>
            <h3>Decide with proof, gaps, and guardrails visible</h3>
          </div>
          <StatusPill tone="amber">Human approval required</StatusPill>
        </div>
        <div className="evidence-review-grid">
          {candidateEvidenceReviews.map((review) => (
            <div className="review-card" key={`${review.company}-${review.role}`}>
              <div className="review-card-header">
                <div>
                  <strong>{review.role}</strong>
                  <span>{review.company}</span>
                </div>
                <StatusPill tone={review.tone}>{review.decision}</StatusPill>
              </div>
              <div className="review-score">
                <b>{review.fit}</b>
                <span>{review.gate}</span>
              </div>
              <div className="review-columns">
                <div>
                  <h4>Evidence</h4>
                  <EvidenceList items={review.evidence} />
                </div>
                <div>
                  <h4>Gaps and safeguards</h4>
                  <ul className="plain-list">
                    {[...review.gaps, ...review.safeguards].map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="next-action">{review.next}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="panel market-panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Market-inspired candidate tools</span>
            <h3>Keep the reach, remove the noise</h3>
          </div>
          <Globe2 size={22} aria-hidden="true" />
        </div>
        <div className="market-grid">
          {candidateMarketPlays.map((play) => (
            <div className="market-row" key={play.pattern}>
              <span>{play.pattern}</span>
              <strong>{play.jobsFlowMove}</strong>
              <p>{play.detail}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="panel applications-panel">
        <div className="panel-title">
          <div>
            <span>Application tracker</span>
            <h3>What changed, what matters, what is next</h3>
          </div>
          <Clock3 size={22} aria-hidden="true" />
        </div>
        <div className="timeline-list">
          {applications.map((application) => (
            <div className="timeline-row" key={application.company}>
              <span>{application.age}</span>
              <div>
                <strong>{application.company}</strong>
                <p>{application.stage}</p>
              </div>
              <div>
                <b>{application.next}</b>
                <p>{application.owner}</p>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="panel controls-panel">
        <div className="panel-title">
          <div>
            <span>Automation controls</span>
            <h3>Owner, limit, and log for every mode</h3>
          </div>
          <ShieldCheck size={22} aria-hidden="true" />
        </div>
        <div className="mode-selector">
          {automationModes.map((mode) => (
            <button
              className={automationMode === mode.name ? 'mode-option active' : 'mode-option'}
              key={mode.name}
              onClick={() => onModeChange(mode.name)}
              type="button"
            >
              <strong>{mode.name}</strong>
              <span>{mode.detail}</span>
              <small>
                {mode.owner} / {mode.limit} / {mode.log}
              </small>
            </button>
          ))}
        </div>
      </article>

      <article className="panel guardrail-panel">
        <div className="panel-title">
          <div>
            <span>Reputation guardrails</span>
            <h3>Rules that protect the candidate first</h3>
          </div>
          <ShieldCheck size={22} aria-hidden="true" />
        </div>
        <div className="guardrail-grid">
          {candidateGuardrails.map((guardrail) => (
            <div className="guardrail-row" key={guardrail.label}>
              <strong>{guardrail.label}</strong>
              <b>{guardrail.value}</b>
              <p>{guardrail.detail}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="panel compact-panel">
        <div className="panel-title">
          <div>
            <span>Saved responses</span>
            <h3>Reusable, but never generic</h3>
          </div>
          <NotebookTabs size={22} aria-hidden="true" />
        </div>
        <div className="response-list">
          {savedResponses.map((response) => (
            <div className="response-row" key={response.prompt}>
              <strong>{response.prompt}</strong>
              <span>{response.status}</span>
              <p>{response.detail}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="panel compact-panel">
        <div className="panel-title">
          <div>
            <span>Interview and follow-up prep</span>
            <h3>Next actions under control</h3>
          </div>
          <CalendarCheck size={22} aria-hidden="true" />
        </div>
        <ul className="action-list">
          {prepItems.map((item) => (
            <li key={item}>
              <Bell size={16} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </article>
    </section>
  )
}

function EmployerWorkspace() {
  return (
    <section className="workspace-grid employer-workspace">
      <div className="workspace-lead">
        <SectionHeader
          copy="Role clarity, transparent evidence, and consistent decisions turn candidate volume into hiring signal."
          eyebrow="Employer workspace"
          title="See why candidates fit before outreach"
        />
        <div className="lead-actions">
          <button type="button">
            <ClipboardCheck size={18} aria-hidden="true" />
            Lock scorecard
          </button>
          <button type="button">
            <MailCheck size={18} aria-hidden="true" />
            Review outreach
          </button>
        </div>
      </div>

      <CommandCenter items={employerCommandCenter} />

      <div className="metrics-row">
        {employerMetrics.map((metric) => (
          <MetricTile key={metric.label} metric={metric} />
        ))}
      </div>

      <article className="panel role-panel">
        <div className="panel-title">
          <div>
            <span>Role intake</span>
            <h3>{employerCompany.role}</h3>
          </div>
          <StatusPill tone="blue">{employerCompany.team}</StatusPill>
        </div>
        <p>{employerCompany.criteria}</p>
        <div className="priority-grid">
          {employerPriorities.map((priority) => (
            <span key={priority}>{priority}</span>
          ))}
        </div>
        <p className="muted-line">{employerCompany.fairness}</p>
      </article>

      <article className="panel scorecard-panel">
        <div className="panel-title">
          <div>
            <span>Hiring criteria builder</span>
            <h3>Scorecard before ranking</h3>
          </div>
          <ClipboardCheck size={22} aria-hidden="true" />
        </div>
        <div className="scorecard-list">
          {scorecardCriteria.map((item) => (
            <div className="scorecard-row" key={item.criterion}>
              <div>
                <strong>{item.criterion}</strong>
                <span>{item.weight}</span>
              </div>
              <p>{item.evidence}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="panel shortlist-panel wide-panel">
        <div className="panel-title">
          <div>
            <span>AI-ranked shortlist</span>
            <h3>Fit evidence before the summary</h3>
          </div>
          <StatusPill tone="green">24 qualified</StatusPill>
        </div>
        <div className="candidate-table">
          {candidateShortlist.map((candidate) => (
            <div className="candidate-row" key={candidate.name}>
              <div>
                <strong>{candidate.name}</strong>
                <span>{candidate.stage}</span>
              </div>
              <div>
                <b>{candidate.fit}% fit</b>
                <span>Evidence score</span>
              </div>
              <div>
                <EvidenceList items={candidate.evidence} />
                <p className="risk-note">{candidate.risks.join(', ')}</p>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="panel evidence-review-panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Shortlist decision review</span>
            <h3>Scorecard evidence before outreach</h3>
          </div>
          <StatusPill tone="blue">Review before contact</StatusPill>
        </div>
        <div className="employer-review-grid">
          {employerEvidenceReviews.map((review) => (
            <div className="review-card" key={review.candidate}>
              <div className="review-card-header">
                <div>
                  <strong>{review.candidate}</strong>
                  <span>{review.owner}</span>
                </div>
                <StatusPill tone={review.tone}>{review.recommendation}</StatusPill>
              </div>
              <div className="review-score">
                <b>{review.score}</b>
                <span>Evidence score</span>
              </div>
              <div className="rubric-grid">
                {review.rubric.map(([criterion, level]) => (
                  <div className="rubric-row" key={`${review.candidate}-${criterion}`}>
                    <span>{criterion}</span>
                    <strong>{level}</strong>
                  </div>
                ))}
              </div>
              <div className="review-columns">
                <div>
                  <h4>Evidence</h4>
                  <EvidenceList items={review.evidence} />
                </div>
                <div>
                  <h4>Risks</h4>
                  <ul className="plain-list">
                    {review.risks.map((risk) => (
                      <li key={risk}>{risk}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="next-action">{review.next}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="panel market-panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Market-inspired employer tools</span>
            <h3>Source, invite, and build trust without hiding judgment</h3>
          </div>
          <Handshake size={22} aria-hidden="true" />
        </div>
        <div className="market-grid">
          {employerMarketPlays.map((play) => (
            <div className="market-row" key={play.pattern}>
              <span>{play.pattern}</span>
              <strong>{play.jobsFlowMove}</strong>
              <p>{play.detail}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="panel pipeline-panel">
        <div className="panel-title">
          <div>
            <span>Pipeline stages</span>
            <h3>Where the hiring motion stands</h3>
          </div>
          <BriefcaseBusiness size={22} aria-hidden="true" />
        </div>
        <div className="pipeline-bars">
          {employerPipeline.map(([stage, count]) => (
            <div className="pipeline-bar" key={stage}>
              <span>{stage}</span>
              <strong>{count}</strong>
            </div>
          ))}
        </div>
      </article>

      <article className="panel outreach-panel">
        <div className="panel-title">
          <div>
            <span>Outreach queue</span>
            <h3>Personalize before contact</h3>
          </div>
          <MessageSquareText size={22} aria-hidden="true" />
        </div>
        <div className="task-list">
          {outreachTasks.map((task) => (
            <div className="task-row" key={task.candidate}>
              <strong>{task.candidate}</strong>
              <p>{task.action}</p>
              <span>{task.owner}</span>
            </div>
          ))}
        </div>
      </article>

      <article className="panel analytics-panel">
        <div className="panel-title">
          <div>
            <span>Hiring analytics</span>
            <h3>Quality and consistency, not noise</h3>
          </div>
          <Gauge size={22} aria-hidden="true" />
        </div>
        <div className="analytics-grid">
          <div>
            <strong>42%</strong>
            <span>Inbound noise reduced</span>
          </div>
          <div>
            <strong>3.1d</strong>
            <span>Median outreach time</span>
          </div>
          <div>
            <strong>81%</strong>
            <span>Scorecard completion</span>
          </div>
        </div>
      </article>

      <article className="panel interview-panel">
        <div className="panel-title">
          <div>
            <span>Interview coordination</span>
            <h3>Panels, owners, and blockers</h3>
          </div>
          <CalendarCheck size={22} aria-hidden="true" />
        </div>
        <div className="task-list">
          {interviewCoordination.map((item) => (
            <div className="task-row" key={`${item.candidate}-${item.panel}`}>
              <strong>{item.candidate}</strong>
              <p>{item.panel}</p>
              <span>{item.status}</span>
            </div>
          ))}
        </div>
      </article>

      <article className="panel collaboration-panel">
        <div className="panel-title">
          <div>
            <span>Team collaboration</span>
            <h3>Decision notes without hidden judgment</h3>
          </div>
          <UsersRound size={22} aria-hidden="true" />
        </div>
        <div className="task-list">
          {collaborationNotes.map((item) => (
            <div className="task-row" key={item.owner}>
              <strong>{item.owner}</strong>
              <p>{item.note}</p>
              <span>Placeholder workflow</span>
            </div>
          ))}
        </div>
      </article>

      <article className="panel fairness-panel">
        <div className="panel-title">
          <div>
            <span>Fairness checklist</span>
            <h3>Make shortcuts accountable</h3>
          </div>
          <Scale size={22} aria-hidden="true" />
        </div>
        <div className="check-list">
          {fairnessChecks.map(([check, complete]) => (
            <label key={check}>
              <input checked={Boolean(complete)} readOnly type="checkbox" />
              {check}
            </label>
          ))}
        </div>
      </article>
    </section>
  )
}

function TrustWorkspace({
  session,
  onSessionChange,
}: {
  session: BackendSession | null
  onSessionChange: (session: BackendSession | null) => void
}) {
  const [gateState, setGateState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(consentGateMatrix.map((gate) => [gate.key, gate.defaultEnabled])),
  )

  return (
    <section className="workspace-grid trust-workspace">
      <div className="workspace-lead">
        <SectionHeader
          copy="Automation earns trust when users can see, limit, approve, export, delete, and audit the actions around their data."
          eyebrow="Trust & platform"
          title="Every promise needs a product control"
        />
        <div className="lead-actions">
          <button type="button">
            <LockKeyhole size={18} aria-hidden="true" />
            Review controls
          </button>
          <button type="button">
            <CreditCard size={18} aria-hidden="true" />
            Stripe-ready plans
          </button>
        </div>
      </div>

      <CommandCenter items={trustCommandCenter} />

      <BackendStatusPanel session={session} onSessionChange={onSessionChange} />

      <WorkflowKernelPanel session={session} />

      <article className="panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Trust controls</span>
            <h3>Control before scale</h3>
          </div>
          <StatusPill tone="green">No external submission behavior</StatusPill>
        </div>
        <div className="trust-grid">
          {trustControls.map((control) => (
            <div className="trust-control" key={control.title}>
              <strong>{control.title}</strong>
              <StatusPill tone={control.status === 'Planned' ? 'amber' : 'green'}>
                {control.status}
              </StatusPill>
              <p>{control.detail}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="panel ownership-panel">
        <div className="panel-title">
          <div>
            <span>Data ownership model</span>
            <h3>Export, deletion, and privacy are product features</h3>
          </div>
          <LockKeyhole size={22} aria-hidden="true" />
        </div>
        <div className="ownership-list">
          {dataOwnershipControls.map((control) => (
            <div className="ownership-row" key={control.title}>
              <strong>{control.title}</strong>
              <p>{control.detail}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="panel consent-panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Consent gate matrix</span>
            <h3>Human approval stays visible</h3>
          </div>
          <StatusPill tone="blue">Local controls only</StatusPill>
        </div>
        <div className="consent-grid">
          {consentGateMatrix.map((gate) => (
            <label className="consent-row" key={gate.key}>
              <input
                checked={Boolean(gateState[gate.key])}
                onChange={(event) =>
                  setGateState((current) => ({
                    ...current,
                    [gate.key]: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>
                <strong>{gate.action}</strong>
                <small>{gate.requiredApproval}</small>
              </span>
              <StatusPill tone={gateState[gate.key] ? 'green' : 'amber'}>
                {gateState[gate.key] ? 'Allowed in prototype' : 'Blocked'}
              </StatusPill>
              <p>{gate.risk}</p>
              <code>{gate.auditEvent}</code>
            </label>
          ))}
        </div>
      </article>

      <article className="panel states-panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Product states</span>
            <h3>Empty, loading, error, and blocked states are part of trust</h3>
          </div>
          <ListChecks size={22} aria-hidden="true" />
        </div>
        <div className="states-grid">
          {productStates.map((state) => (
            <div className="state-row" key={`${state.state}-${state.surface}`}>
              <StatusPill
                tone={
                  state.state === 'Error'
                    ? 'red'
                    : state.state === 'Blocked'
                      ? 'amber'
                      : 'blue'
                }
              >
                {state.state}
              </StatusPill>
              <strong>{state.surface}</strong>
              <p>{state.message}</p>
              <small>{state.recovery}</small>
            </div>
          ))}
        </div>
      </article>

      <article className="panel compliance-panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Compliance readiness ledger</span>
            <h3>Controls that must exist before scale</h3>
          </div>
          <StatusPill tone="amber">Beta hardening</StatusPill>
        </div>
        <div className="ledger-grid">
          {complianceLedger.map((item) => (
            <div className="ledger-row" key={item.control}>
              <div>
                <strong>{item.control}</strong>
                <span>{item.owner}</span>
              </div>
              <StatusPill tone={item.tone}>{item.status}</StatusPill>
              <p>{item.proof}</p>
              <small>{item.next}</small>
            </div>
          ))}
        </div>
      </article>

      <article className="panel audit-panel">
        <div className="panel-title">
          <div>
            <span>AI action audit trail</span>
            <h3>Owner, limit, and log</h3>
          </div>
          <DatabaseZap size={22} aria-hidden="true" />
        </div>
        <div className="audit-list">
          {auditEvents.map((event) => (
            <div className="audit-row" key={`${event.event}-${event.time}`}>
              <span>{event.time}</span>
              <strong>{event.event}</strong>
              <p>{event.owner}</p>
              <small>{event.limit}</small>
            </div>
          ))}
        </div>
      </article>

      <article className="panel abuse-panel">
        <div className="panel-title">
          <div>
            <span>Abuse and spam prevention</span>
            <h3>Signal protection before scale</h3>
          </div>
          <ShieldCheck size={22} aria-hidden="true" />
        </div>
        <ul className="action-list">
          {abusePreventionRules.map((rule) => (
            <li key={rule}>
              <CheckCircle2 size={16} aria-hidden="true" />
              {rule}
            </li>
          ))}
        </ul>
      </article>

      <article className="panel integrations-panel">
        <div className="panel-title">
          <div>
            <span>Integration roadmap</span>
            <h3>Coverage without unsafe shortcuts</h3>
          </div>
          <Globe2 size={22} aria-hidden="true" />
        </div>
        <div className="integration-grid">
          {integrations.map(([name, status]) => (
            <div key={name}>
              <strong>{name}</strong>
              <span>{status}</span>
            </div>
          ))}
        </div>
      </article>

      <article className="panel schema-panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Production data model</span>
            <h3>Tenant-safe entities for the backend build</h3>
          </div>
          <DatabaseZap size={22} aria-hidden="true" />
        </div>
        <div className="schema-grid">
          {productionEntities.map((entity) => (
            <div className="schema-row" key={entity.name}>
              <div>
                <strong>{entity.name}</strong>
                <span>{entity.workspace} workspace</span>
              </div>
              <p>{entity.purpose}</p>
              <ul>
                {entity.keyFields.map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
              <small>{entity.launchNote}</small>
            </div>
          ))}
        </div>
      </article>

      <article className="panel readiness-panel">
        <div className="panel-title">
          <div>
            <span>Provider readiness</span>
            <h3>Real services without unsafe shortcuts</h3>
          </div>
          <LockKeyhole size={22} aria-hidden="true" />
        </div>
        <div className="readiness-grid">
          {providerReadiness.map((provider) => (
            <div className="readiness-row" key={provider.area}>
              <strong>{provider.area}</strong>
              <span>{provider.provider}</span>
              <StatusPill tone="neutral">{provider.phase}</StatusPill>
              <p>{provider.requirement}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="panel billing-ops-panel">
        <div className="panel-title">
          <div>
            <span>Stripe launch checklist</span>
            <h3>Billing must protect affordability</h3>
          </div>
          <CreditCard size={22} aria-hidden="true" />
        </div>
        <div className="billing-checklist">
          {billingChecklist.map((item) => (
            <div className="billing-check-row" key={item.item}>
              <strong>{item.item}</strong>
              <StatusPill tone={item.status === 'Needs policy' ? 'amber' : 'blue'}>
                {item.status}
              </StatusPill>
              <p>{item.detail}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="panel pricing-panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Affordable plans</span>
            <h3>Stripe-ready billing that keeps access broad</h3>
          </div>
          <CreditCard size={22} aria-hidden="true" />
        </div>
        <div className="pricing-grid">
          {planEntitlements.map((plan) => (
            <div className="pricing-row" key={plan.plan}>
              <strong>{plan.plan}</strong>
              <b>{plan.monthlyPrice}</b>
              <p>{plan.audience}</p>
              <EvidenceList items={plan.included} />
              <div className="entitlement-notes">
                <small>{plan.limits.join(' / ')}</small>
                <small>{plan.safeguards.join(' / ')}</small>
              </div>
            </div>
          ))}
        </div>
        <p className="fine-print">
          Production billing should use Stripe Checkout or Stripe Billing, with hardship pricing and transparent cancellation before launch.
        </p>
      </article>

      <article className="panel platform-panel">
        <div className="panel-title">
          <div>
            <span>Production gates</span>
            <h3>What must exist before real automation</h3>
          </div>
          <ListChecks size={22} aria-hidden="true" />
        </div>
        <ul className="action-list">
          <li>
            <ShieldCheck size={16} aria-hidden="true" />
            Auth, encryption, and retention controls
          </li>
          <li>
            <Handshake size={16} aria-hidden="true" />
            Candidate consent receipts
          </li>
          <li>
            <RefreshCw size={16} aria-hidden="true" />
            Duplicate and abuse monitoring
          </li>
          <li>
            <Scale size={16} aria-hidden="true" />
            Employer fairness review flow
          </li>
        </ul>
      </article>

      <article className="panel roadmap-panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Execution roadmap</span>
            <h3>From trusted prototype to paid beta</h3>
          </div>
          <ListChecks size={22} aria-hidden="true" />
        </div>
        <div className="roadmap-grid">
          {implementationRoadmap.map((phase) => (
            <div className="roadmap-row" key={phase.phase}>
              <strong>{phase.phase}</strong>
              <p>{phase.outcome}</p>
              <EvidenceList items={phase.deliverables} />
            </div>
          ))}
        </div>
      </article>

      <article className="panel system-panel">
        <div className="panel-title">
          <div>
            <span>Admin health</span>
            <h3>Future operating console</h3>
          </div>
          <LayoutDashboard size={22} aria-hidden="true" />
        </div>
        <div className="analytics-grid">
          <div>
            <strong>0</strong>
            <span>External submissions in prototype</span>
          </div>
          <div>
            <strong>100%</strong>
            <span>Actions require review</span>
          </div>
          <div>
            <strong>Draft</strong>
            <span>Compliance posture</span>
          </div>
        </div>
      </article>
    </section>
  )
}

function App() {
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace>('candidate')
  const [automationMode, setAutomationMode] = useState(automationModes[1].name)
  const [activeOnboardingStep, setActiveOnboardingStep] = useState(onboardingSteps[0].key)
  const [session, setSession] = useState<BackendSession | null>(null)

  const activeSummary = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspace)?.summary,
    [activeWorkspace],
  )

  return (
    <div className="app-root">
      <header className="app-shell-header">
        <a className="brand" href="/" aria-label="JobsFlow by Workflowfy AI home">
          <span className="brand-mark">J</span>
          <span>
            <strong>Workflowfy AI</strong>
            <small>JobsFlow</small>
          </span>
        </a>

        <div className="workspace-switcher" aria-label="Workspace switcher">
          {workspaces.map((workspace) => (
            <WorkspaceButton
              active={workspace.id === activeWorkspace}
              key={workspace.id}
              onClick={() => setActiveWorkspace(workspace.id)}
              workspace={workspace}
            />
          ))}
        </div>

        <div className="header-status">
          <StatusPill tone="green">Prototype safe mode</StatusPill>
          <a href="https://jobsflow.workflowfy.ai">
            jobsflow.workflowfy.ai
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </header>

      <main className="app-main">
        <section className="workspace-summary" aria-label="Current workspace">
          <div>
            <span>Evidence-first hiring platform</span>
            <h1>JobsFlow by Workflowfy AI</h1>
            <p>{activeSummary}</p>
          </div>
          <div className="summary-controls">
            <StatusPill tone="blue">Signal over volume</StatusPill>
            <StatusPill tone="green">Consent before action</StatusPill>
            <StatusPill tone="amber">Stripe-ready pricing</StatusPill>
          </div>
        </section>

        <AuthPanel session={session} onSessionChange={setSession} />

        <ProductOnboarding
          activeStep={activeOnboardingStep}
          onStepChange={setActiveOnboardingStep}
        />

        <SignalOperationsLayer
          activeWorkspace={activeWorkspace}
          onWorkspaceChange={setActiveWorkspace}
        />

        {activeWorkspace === 'candidate' ? (
          <CandidateWorkspace
            automationMode={automationMode}
            onModeChange={setAutomationMode}
            session={session}
          />
        ) : null}
        {activeWorkspace === 'employer' ? <EmployerWorkspace /> : null}
        {activeWorkspace === 'trust' ? (
          <TrustWorkspace session={session} onSessionChange={setSession} />
        ) : null}
      </main>
    </div>
  )
}

export default App
