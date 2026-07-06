import type { EmployerEvidenceReview, Metric } from '../types'

export const employerActivationChecklist = [
  {
    step: 'Create hiring workspace',
    detail: 'Company, team role, and hiring owners stay protected inside the employer workspace.',
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

export const employerCompany = {
  company: 'Northstar Labs',
  role: 'Senior Customer Success Lead',
  team: 'Revenue Operations',
  criteria:
    'Own strategic accounts, improve renewal workflow, and partner with product on expansion signals.',
  fairness:
    'Structured evidence, consistent scorecard, and bias checks before outreach.',
}

export const employerMetrics: Metric[] = [
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

export const employerCommandCenter = [
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

export const employerPriorities = [
  'Enterprise renewal ownership',
  'Operational playbook building',
  'Product feedback synthesis',
  'Calm executive communication',
]

export const candidateShortlist = [
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

export const employerEvidenceReviews: EmployerEvidenceReview[] = [
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

export const employerPipeline = [
  ['Sourced', '42'],
  ['Qualified', '24'],
  ['Outreach', '9'],
  ['Interviewing', '5'],
  ['Decision', '2'],
]

export const outreachTasks = [
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

export const scorecardCriteria = [
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

export const interviewCoordination = [
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

export const collaborationNotes = [
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

export const fairnessChecks: Array<[string, boolean]> = [
  ['Structured criteria locked before ranking', true],
  ['Compensation band visible to team', false],
  ['Candidate evidence shown before AI summary', true],
  ['Interview scorecard consistent across candidates', true],
]

export const employerMarketPlays = [
  {
    pattern: 'Talent search',
    jobsFlowMove: 'Evidence-filtered sourcing',
    detail: 'Search by skills, seniority, location, and proof signals after criteria are locked.',
  },
  {
    pattern: 'Invite to apply',
    jobsFlowMove: 'Invite to review',
    detail: 'Employers can draft targeted invitations, but outreach waits for human review and activity history.',
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

export const employerActivationPreview = [
  ['Role', 'Senior Customer Success Lead'],
  ['Must-have evidence', 'Enterprise renewals, playbook building, executive communication'],
  ['Compensation check', '$115k - $145k band needs final approval'],
  ['Next gate', 'Lock scorecard before inviting candidates'],
]
