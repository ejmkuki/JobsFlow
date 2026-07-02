import { type ChangeEvent, useEffect, useMemo, useState } from 'react'
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
  Gauge,
  Globe2,
  Handshake,
  LayoutDashboard,
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
import {
  type AuditEvent,
  type BackendHealth,
  type BackendSession,
  createDevelopmentSession,
  getBackendHealth,
  getBackendSession,
  listAuditEvents,
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

const workspaces: Array<{
  id: Workspace
  label: string
  icon: LucideIcon
  summary: string
}> = [
  {
    id: 'candidate',
    label: 'Candidate Workspace',
    icon: UsersRound,
    summary: 'Readiness, fit evidence, applications, interviews, and controls.',
  },
  {
    id: 'employer',
    label: 'Employer Workspace',
    icon: Building2,
    summary: 'Role criteria, ranked candidates, outreach, pipeline, and fairness.',
  },
  {
    id: 'trust',
    label: 'Trust & Platform',
    icon: ShieldCheck,
    summary: 'Consent, auditability, integrations, pricing, and production gates.',
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

function ResumeStoragePanel() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [status, setStatus] = useState('Choose a PDF or DOCX resume to store in private R2 storage.')
  const [isUploading, setIsUploading] = useState(false)

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    setSelectedFile(file)
    setStatus(file ? `${file.name} selected for secure storage.` : 'Choose a PDF or DOCX resume to store in private R2 storage.')
  }

  async function handleUpload() {
    if (!selectedFile) {
      setStatus('Select a resume before storing it.')
      return
    }

    setIsUploading(true)
    setStatus('Contacting JobsFlow API...')

    try {
      const result = await uploadResume(selectedFile)
      setStatus(
        `${result.resume.filename} stored. Audit event and resume metadata were written by the backend.`,
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Resume upload failed.')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <article className="panel resume-storage-panel">
      <div className="panel-title">
        <div>
          <span>Secure resume storage</span>
          <h3>R2 upload with D1 metadata</h3>
        </div>
        <DatabaseZap size={22} aria-hidden="true" />
      </div>
      <p className="muted-line">
        This control calls the real JobsFlow API. It requires a signed session, D1 binding,
        and R2 bucket binding.
      </p>
      <div className="upload-control">
        <input
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileChange}
          type="file"
        />
        <button disabled={isUploading} onClick={handleUpload} type="button">
          <FileCheck2 size={16} aria-hidden="true" />
          {isUploading ? 'Storing...' : 'Store resume'}
        </button>
      </div>
      <p className="runtime-message">{status}</p>
    </article>
  )
}

function BackendStatusPanel() {
  const [health, setHealth] = useState<BackendHealth | null>(null)
  const [session, setSession] = useState<BackendSession | null>(null)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [message, setMessage] = useState('Checking JobsFlow backend runtime...')
  const [isBusy, setIsBusy] = useState(false)

  async function refreshBackend() {
    setIsBusy(true)
    try {
      const nextHealth = await getBackendHealth()
      setHealth(nextHealth)
      setMessage(nextHealth.databaseReady ? 'Backend runtime is reachable and D1 is migrated.' : 'Backend runtime is reachable; D1 still needs migration or binding.')

      try {
        const nextSession = await getBackendSession()
        setSession(nextSession.session)
      } catch {
        setSession(null)
      }
    } catch (error) {
      setHealth(null)
      setSession(null)
      setMessage(error instanceof Error ? error.message : 'Backend runtime check failed.')
    } finally {
      setIsBusy(false)
    }
  }

  async function createSession() {
    setIsBusy(true)
    try {
      const result = await createDevelopmentSession()
      setSession(result.session)
      setMessage(`Session created for ${result.session.email}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Session creation failed.')
    } finally {
      setIsBusy(false)
    }
  }

  async function loadAuditEvents() {
    setIsBusy(true)
    try {
      const result = await listAuditEvents()
      setAuditEvents(result.events)
      setMessage(`${result.events.length} audit events loaded from D1.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Audit log read failed.')
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshBackend()
  }, [])

  const bindingRows: Array<[string, boolean]> = health
    ? [
        ['D1 database', health.bindings.db],
        ['R2 resume bucket', health.bindings.resumeBucket],
        ['Session secret', health.bindings.sessionSecret],
        ['Bootstrap token', health.bindings.bootstrapToken],
      ]
    : []

  return (
    <article className="panel backend-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>Live backend readiness</span>
          <h3>Auth, tenants, resume storage, and audit logs</h3>
        </div>
        <StatusPill tone={health?.databaseReady ? 'green' : 'amber'}>
          {health ? 'API reachable' : 'Runtime pending'}
        </StatusPill>
      </div>
      <div className="backend-grid">
        <div className="backend-card">
          <strong>Cloudflare runtime</strong>
          <p>{message}</p>
          <div className="backend-actions">
            <button disabled={isBusy} onClick={refreshBackend} type="button">
              <RefreshCw size={16} aria-hidden="true" />
              Refresh
            </button>
            <button disabled={isBusy} onClick={createSession} type="button">
              <LockKeyhole size={16} aria-hidden="true" />
              Create dev session
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
              <p>Run under Cloudflare Pages runtime to inspect bindings.</p>
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

function CandidateWorkspace({
  automationMode,
  onModeChange,
}: {
  automationMode: string
  onModeChange: (mode: string) => void
}) {
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

      <ResumeStoragePanel />

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
            <StatusPill tone="amber">Review gate required</StatusPill>
            <h4>Before anything external</h4>
            <ul className="plain-list">
              {applicationPacket.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        </div>
      </article>

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

function TrustWorkspace() {
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

      <BackendStatusPanel />

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
            <span>Hiring workflow OS</span>
            <h1>JobsFlow by Workflowfy AI</h1>
            <p>{activeSummary}</p>
          </div>
          <div className="summary-controls">
            <StatusPill tone="blue">Signal over volume</StatusPill>
            <StatusPill tone="green">Consent before action</StatusPill>
            <StatusPill tone="amber">Stripe-ready pricing</StatusPill>
          </div>
        </section>

        <ProductOnboarding
          activeStep={activeOnboardingStep}
          onStepChange={setActiveOnboardingStep}
        />

        {activeWorkspace === 'candidate' ? (
          <CandidateWorkspace
            automationMode={automationMode}
            onModeChange={setAutomationMode}
          />
        ) : null}
        {activeWorkspace === 'employer' ? <EmployerWorkspace /> : null}
        {activeWorkspace === 'trust' ? <TrustWorkspace /> : null}
      </main>
    </div>
  )
}

export default App
