import type { ComplianceLedgerItem } from '../types'

export const trustCommandCenter = [
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

export const trustControls = [
  {
    title: 'Candidate review gate',
    status: 'Required',
    detail: 'Applications, outreach, and follow-ups require approval until production policies are active.',
  },
  {
    title: 'Company exclusion list',
    status: 'Active',
    detail: 'Blocks current employers, conflicts, sensitive industries, and candidate-defined no-go companies.',
  },
  {
    title: 'Duplicate prevention',
    status: 'Active',
    detail: 'Detects repeated roles, recruiter reposts, and duplicate hiring records before queueing action.',
  },
  {
    title: 'Data export and deletion',
    status: 'Planned',
    detail: 'Candidates and employers need visible export, deletion, retention, and consent controls.',
  },
]

export const dataOwnershipControls = [
  {
    title: 'Export readiness',
    detail: 'Candidate profile, resume files, saved answers, and activity history need portable exports.',
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

export const complianceLedger: ComplianceLedgerItem[] = [
  {
    control: 'Approval records',
    status: 'Modeled',
    owner: 'Platform',
    proof: 'Approval matrix identifies required reviews and activity names.',
    next: 'Save approval records with scope, actor, expiration, and action preview.',
    tone: 'blue',
  },
  {
    control: 'Resume privacy',
    status: 'Live foundation',
    owner: 'Platform',
    proof: 'Resume upload, workspace metadata, signed session, and activity history check passed.',
    next: 'Add private download, malware scanning, source hash, and deletion workflow.',
    tone: 'green',
  },
  {
    control: 'External actions',
    status: 'Blocked',
    owner: 'Trust policy',
    proof: 'Prototype has no application submission, outreach send, scraping, or payment behavior.',
    next: 'Require certified connections, per-action approval, and activity review before launch.',
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
    next: 'Save scorecard versions and decision notes with role-level activity history.',
    tone: 'amber',
  },
  {
    control: 'Export and deletion',
    status: 'Policy needed',
    owner: 'Privacy',
    proof: 'Data ownership surface defines candidate and employer control expectations.',
    next: 'Build export/delete actions, retention jobs, and user-facing confirmation records.',
    tone: 'red',
  },
]

export const abusePreventionRules = [
  'Daily action limits for any guarded queue',
  'Duplicate detection before packet review',
  'Company exclusions checked before every recommendation',
  'Manual support review for unusual activity patterns',
]

export const auditEvents = [
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

export const integrations = [
  ['LinkedIn', 'Extension design'],
  ['Greenhouse', 'Hiring-system adapter'],
  ['Lever', 'Hiring-system adapter'],
  ['Workday', 'Guarded beta'],
  ['Google Calendar', 'Interview sync'],
  ['Gmail / Outlook', 'Follow-up drafts'],
  ['Stripe', 'Affordable billing'],
  ['Slack', 'Employer team alerts'],
]
