import type { CandidateEvidenceReview, Metric, Mode } from '../types'

export const candidateProfile = {
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

export const candidateMetrics: Metric[] = [
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

export const candidateCommandCenter = [
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

export const automationModes: Mode[] = [
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
    log: 'Full action history',
  },
]

export const applicationPacket = {
  role: 'Product Operations Manager',
  company: 'Kora Health',
  readiness: 91,
  sections: [
    ['Resume variant', 'Ready for candidate review'],
    ['Cover note', 'Drafted from approved evidence'],
    ['Screening questions', '2 answers need approval'],
    ['Salary check', '$118k floor satisfied'],
    ['Company risk', 'No exclusions detected'],
  ],
  blockers: [
    'Add one claims operations example before approving the packet.',
    'Confirm the Workday answer about sponsorship is still accurate.',
  ],
}

export const candidateEvidenceReviews: CandidateEvidenceReview[] = [
  {
    role: 'Product Operations Manager',
    company: 'Kora Health',
    fit: '96%',
    decision: 'Approve after proof gap',
    gate: 'Candidate approval required',
    evidence: ['Scaled intake workflow', 'Healthcare SaaS delivery', 'Vendor operations ownership'],
    gaps: ['Add a claims-operations example to strengthen the packet.'],
    safeguards: ['$118k salary floor satisfied', 'No duplicate application found', 'No exclusion conflict'],
    next: 'Add one quantified claims workflow bullet, then review the resume variant and screening answers.',
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

export const candidateGuardrails = [
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
    detail: 'Reposts and previously submitted hiring records are flagged before queueing.',
  },
]

export const resumeSignals = [
  {
    label: 'Role-fit score',
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

export const jobMatches = [
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

export const applications = [
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

export const savedResponses = [
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

export const prepItems = [
  'Prepare Kora Health role-scorecard narrative',
  'Review Northstar customer escalation examples',
  'Send AsterCloud availability after candidate approval',
]

export const candidateActivationChecklist = [
  {
    step: 'Create private workspace',
    detail: 'Private session, workspace boundary, and activity history before resume storage.',
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

export const candidateMarketPlays = [
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
