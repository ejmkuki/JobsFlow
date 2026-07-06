import { type ChangeEvent, type FormEvent, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Bell,
  BriefcaseBusiness,
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
  MapPin,
  MessageSquareText,
  NotebookTabs,
  RefreshCw,
  Scale,
  Search,
  SearchCheck,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import './App.css'
import { useJobsFlowSso, type JobsFlowSsoProviderKey } from './jobsFlowSsoContext'
import {
  type AchievementProfileState,
  type AtsProvider,
  type AtsSyncState,
  type AuditEvent,
  type ApplicationPacketReview,
  type AntiGhostingPipelineState,
  type BackendHealth,
  type BackendSession,
  type InterviewPrepState,
  type InterviewQuestion,
  type InterviewStage,
  type JobSyndicationState,
  type PassiveSourcingState,
  type PipelineState,
  type PrescreeningState,
  type ResumeArtifact,
  type ResumeIntelligenceState,
  type SkillMatchingState,
  type TransparencyBlueprintState,
  type WorkflowKernelState,
  advancePipelineItem,
  bootstrapWorkflowKernel,
  broadcastPassiveSourcingCard,
  createApplicationPacketReview,
  createAchievementProfile,
  createInterviewPrepSession,
  createJobSyndicationPost,
  createPassiveSourcingCard,
  createPipelineItem,
  createResumeTailwindAnalysis,
  createTransparencyReport,
  createJobsFlowSession,
  deleteBackendSession,
  evaluateInterviewPracticeAnswer,
  getBackendHealth,
  getBackendSession,
  getAntiGhostingPipelineState,
  getAchievementProfileState,
  getAtsSyncState,
  getInterviewPrepState,
  getJobSyndicationState,
  getPassiveSourcingState,
  getPrescreeningState,
  getResumeIntelligenceState,
  getSkillMatchingState,
  getTransparencyBlueprintState,
  getWorkflowKernelState,
  humanizeJobsFlowError,
  listAuditEvents,
  listResumes,
  requestPassiveSourcingContactRelease,
  runAtsDrySync,
  runSemanticSkillMatch,
  runPipelineStaleCheck,
  runPrescreeningSession,
  seedAtsSyncConnections,
  sendEmailTest,
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
import type { AppView, LandingSearchIntent, Metric, Tone, Workspace } from './types'
import { readAppViewFromHash, writeAppViewHash, writeAuthReturnPending } from "./lib/appView"
import {
  formatCents,
  formatProductLabel,
  friendlyUserMessage,
  pipelineTone,
  textFromRecord,
  toneClass,
  workflowTone,
} from "./lib/format"
import { humanizeSsoError, isMissingEmailAccountError } from "./lib/ssoErrors"



function JobsFlowLogoMark({ className = 'brand-mark' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox="0 0 64 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        className="brand-mark-jf-j-base"
        d="M2.8 40.3h18.8c6.9 0 12.1-5.3 12.1-12.2V8.2l-8.4 7.9v11.4c0 2.8-1.8 4.6-4.6 4.6h-9.5l-8.4 8.2Z"
      />
      <path
        className="brand-mark-jf-j"
        d="M5.4 36.7h16.1c4.7 0 8.1-3.4 8.1-8.3V6.7l-8.3 7.7v13.2c0 2.9-1.8 4.8-4.7 4.8H9.2l-3.8 4.3Z"
      />
      <path
        className="brand-mark-jf-f"
        d="M29.7 6.7h26.8l-5.4 7.7H39.5c-2.8 0-4.7 1.9-4.7 4.7v21.2h-9.5V18.5c0-5 1.6-8.7 4.4-11.8Z"
      />
      <path className="brand-mark-jf-accent" d="M34.8 22.5h18.7l-5.2 7.5H34.8v-7.5Z" />
      <path className="brand-mark-jf-highlight" d="M21.3 14.4 29.6 6.7v21.5c0 4.9-3.4 8.3-8.1 8.3H8c4-1.5 13.3-3.9 13.3-8.4V14.4Z" />
    </svg>
  )
}

const ssoProviderActions: Array<{ key: JobsFlowSsoProviderKey; label: string }> = [
  { key: 'google', label: 'Google' },
  { key: 'apple', label: 'Apple' },
  { key: 'linkedin_oidc', label: 'LinkedIn' },
  { key: 'microsoft', label: 'Microsoft' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'github', label: 'GitHub' },
  { key: 'x', label: 'X' },
  { key: 'email', label: 'Email' },
]

const productionOauthProviderKeys = new Set<JobsFlowSsoProviderKey>(['google', 'apple'])

const ssoProviderIconText: Record<JobsFlowSsoProviderKey, string> = {
  apple: 'A',
  email: '@',
  facebook: 'f',
  github: 'GH',
  google: 'G',
  linkedin_oidc: 'in',
  microsoft: 'M',
  x: 'X',
}


import {
  applicationPacket,
  applications,
  automationModes,
  candidateActivationChecklist,
  candidateCommandCenter,
  candidateEvidenceReviews,
  candidateGuardrails,
  candidateMarketPlays,
  candidateMetrics,
  candidateProfile,
  jobMatches,
  prepItems,
  resumeSignals,
  savedResponses,
} from './data/candidate'
import {
  candidateShortlist,
  collaborationNotes,
  employerActivationChecklist,
  employerActivationPreview,
  employerCommandCenter,
  employerCompany,
  employerEvidenceReviews,
  employerMarketPlays,
  employerMetrics,
  employerPipeline,
  employerPriorities,
  fairnessChecks,
  interviewCoordination,
  outreachTasks,
  scorecardCriteria,
} from './data/employer'
import { signalDecisions } from './data/signals'
import {
  abusePreventionRules,
  auditEvents,
  complianceLedger,
  dataOwnershipControls,
  integrations,
  trustCommandCenter,
  trustControls,
} from './data/trust'
import { workspaces } from './data/workspaces'


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
  return (
    <button
      className={active ? 'header-nav-link active' : 'header-nav-link'}
      onClick={onClick}
      type="button"
    >
      <span>{workspace.label}</span>
    </button>
  )
}

function LandingHero({
  onGetStarted,
  onSearch,
}: {
  onGetStarted: () => void
  onSearch: (intent: LandingSearchIntent) => void
}) {
  const [role, setRole] = useState('')
  const [location, setLocation] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSearch({
      location: location.trim(),
      role: role.trim(),
    })
  }

  return (
    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-hero-inner">
        <div className="hero-wordmark" aria-label="JobsFlow AI">
          <JobsFlowLogoMark className="brand-mark hero-brand-mark" />
          <span>JobsFlow AI</span>
        </div>

        <h1 id="landing-title">
          JobsFlow AI turns resumes, jobs, and hiring signals into evidence-based matches.
        </h1>
        <p>
          Optimize your profile, track applications, prep for interviews, and help
          employers find verified-fit candidates faster.
        </p>

        <form className="landing-search" aria-label="Start a JobsFlow match" onSubmit={handleSubmit}>
          <label className="landing-search-field">
            <span className="visually-hidden">Role or keyword</span>
            <Search size={22} aria-hidden="true" />
            <input
              autoComplete="off"
              onChange={(event) => setRole(event.target.value)}
              placeholder="Job title, skill, or company"
              type="search"
              value={role}
            />
          </label>
          <label className="landing-search-field">
            <span className="visually-hidden">Location</span>
            <MapPin size={22} aria-hidden="true" />
            <input
              autoComplete="address-level2"
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Location or remote"
              type="search"
              value={location}
            />
          </label>
          <button type="submit">
            Start match
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </form>

        <div className="hero-secondary-actions">
          <button type="button" onClick={onGetStarted}>
            Get started
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
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
  const [emailSignInStep, setEmailSignInStep] = useState<'email' | 'password' | 'code'>('email')
  const [password, setPassword] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [showInlineSignUp, setShowInlineSignUp] = useState(false)
  const [tenantName] = useState('')
  const [message, setMessage] = useState('Looking for an active JobsFlow workspace...')
  const [isBusy, setIsBusy] = useState(false)
  const sso = useJobsFlowSso()
  const autoSsoSessionAttempted = useRef(false)
  const selectedChecklist =
    accountType === 'candidate' ? candidateActivationChecklist : employerActivationChecklist

  const setAuthReturnPending = useCallback((pending: boolean) => {
    writeAuthReturnPending(pending)
  }, [])

  const checkSession = useCallback(async () => {
    setIsBusy(true)
    try {
      const result = await getBackendSession()
      onSessionChange(result.session)
      setMessage(`Workspace is open for ${result.session.email}.`)
      setAuthReturnPending(false)
    } catch (error) {
      onSessionChange(null)
      setMessage(humanizeJobsFlowError(error, 'auth'))
    } finally {
      setIsBusy(false)
    }
  }, [onSessionChange, setAuthReturnPending])

  const handleCreateSsoSession = useCallback(async () => {
    if (!sso.configured) {
      setMessage('Sign-in is being prepared. Please continue with email for now.')
      return
    }

    if (!sso.isLoaded) {
      setMessage(
        sso.loadTimedOut
          ? 'Sign-in is taking longer than expected in this browser. Refresh the page, then try again.'
          : 'Sign-in is getting ready. The buttons will unlock in a moment.',
      )
      return
    }

    if (!sso.isSignedIn) {
      sso.openSignIn()
      return
    }

    const token = await sso.getToken()
    if (!token) {
      setMessage('We could not open your workspace yet. Refresh the page and sign in again.')
      return
    }

    const normalizedEmail = sso.email ?? email.trim()
    if (!normalizedEmail) {
      setMessage('JobsFlow needs an email address to open your workspace.')
      return
    }

    const normalizedName =
      sso.displayName || displayName.trim() || normalizedEmail.split('@')[0] || 'JobsFlow User'

    setIsBusy(true)
    setMessage('Opening your JobsFlow workspace...')

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
      setAuthReturnPending(false)
      setMessage(`Workspace opened for ${result.session.email}. JobsFlow is ready.`)
    } catch (error) {
      onSessionChange(null)
      setMessage(humanizeJobsFlowError(error, 'auth'))
    } finally {
      setIsBusy(false)
    }
  }, [accountType, displayName, email, onSessionChange, setAuthReturnPending, sso, tenantName])

  const handleProviderSignIn = useCallback(
    (provider: JobsFlowSsoProviderKey) => {
      if (!sso.configured) {
        setMessage('Sign-in is being prepared. Please continue with email for now.')
        return
      }

      if (!sso.isLoaded) {
        setMessage(
          sso.loadTimedOut
            ? 'Sign-in is taking longer than expected in this browser. Refresh the page, then try again.'
            : 'Sign-in is getting ready. Please try again in a moment.',
        )
        return
      }

      if (sso.isSignedIn) {
        void handleCreateSsoSession()
        return
      }

      const providerLabel = ssoProviderActions.find((action) => action.key === provider)?.label ?? 'Email'
      setAuthReturnPending(true)
      setMessage(
        provider === 'email'
          ? 'Opening the email sign-in screen.'
          : `Opening ${providerLabel} sign-in...`,
      )
      void sso.openProviderSignIn(provider).catch((error: unknown) => {
        setMessage(humanizeSsoError(error))
        setAuthReturnPending(false)
      })
    },
    [handleCreateSsoSession, setAuthReturnPending, sso],
  )

  async function handleEmailContinue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedEmail = email.trim()
    if (!normalizedEmail) {
      setMessage('Enter your email address to continue.')
      setShowInlineSignUp(false)
      return
    }

    setEmail(normalizedEmail)

    if (emailSignInStep === 'email') {
      if (!sso.isLoaded) {
        setMessage(
          sso.loadTimedOut
            ? 'Sign-in is taking longer than expected in this browser. Refresh the page, then try again.'
            : 'Sign-in is getting ready. Please try again in a moment.',
        )
        setShowInlineSignUp(false)
        return
      }

      setIsBusy(true)
      setShowInlineSignUp(false)
      setMessage(`Checking how ${normalizedEmail} can sign in...`)
      try {
        const signInOptions = await sso.prepareEmailSignIn(normalizedEmail)
        if (signInOptions.method === 'password') {
          setEmailSignInStep('password')
          setPassword('')
          setEmailCode('')
          setMessage(`Enter your JobsFlow password for ${normalizedEmail}.`)
          return
        }

        if (signInOptions.method === 'email_code') {
          setEmailSignInStep('code')
          setPassword('')
          setEmailCode('')
          setMessage(
            `Enter the verification code sent to ${signInOptions.safeIdentifier ?? normalizedEmail}.`,
          )
          return
        }

        setMessage(
          signInOptions.provider
            ? `This email uses ${ssoProviderActions.find((provider) => provider.key === signInOptions.provider)?.label ?? 'a social account'} sign-in. Choose that option above.`
            : 'This email is not set up with a JobsFlow password yet. Use Google or Apple if that is how you created the account.',
        )
      } catch (error) {
        setShowInlineSignUp(isMissingEmailAccountError(error))
        setMessage(humanizeSsoError(error, 'We could not find sign-in options for this email.'))
      } finally {
        setIsBusy(false)
      }
      return
    }

    if (emailSignInStep === 'password' && !password) {
      setMessage('Enter your password to continue.')
      setShowInlineSignUp(false)
      return
    }

    if (emailSignInStep === 'code' && !emailCode.trim()) {
      setMessage('Enter the verification code from your email to continue.')
      setShowInlineSignUp(false)
      return
    }

    setIsBusy(true)
    setAuthReturnPending(true)
    setMessage(emailSignInStep === 'code' ? 'Checking your email code...' : 'Signing you in...')

    if (!sso.isLoaded) {
      setIsBusy(false)
      setAuthReturnPending(false)
      setShowInlineSignUp(false)
      setMessage(
        sso.loadTimedOut
          ? 'Sign-in is taking longer than expected in this browser. Refresh the page, then try again.'
          : 'Sign-in is getting ready. Please try again in a moment.',
      )
      return
    }

    try {
      if (emailSignInStep === 'code') {
        await sso.signInWithEmailCode(emailCode.trim())
      } else {
        await sso.signInWithPassword(normalizedEmail, password)
      }
      setPassword('')
      setEmailCode('')
      setShowInlineSignUp(false)
      autoSsoSessionAttempted.current = false
      setMessage('Email sign-in complete. Opening your JobsFlow workspace...')
    } catch (error) {
      setAuthReturnPending(false)
      setShowInlineSignUp(isMissingEmailAccountError(error))
      setMessage(
        humanizeSsoError(
          error,
          emailSignInStep === 'code'
            ? 'Email sign-in could not complete. Check the verification code and try again.'
            : 'Email sign-in could not complete. Check the password and try again.',
        ),
      )
    } finally {
      setIsBusy(false)
    }
  }

  function handleInlineSignUp() {
    const normalizedEmail = email.trim()

    if (!normalizedEmail) {
      setMessage('Enter your email address before creating a JobsFlow account.')
      setShowInlineSignUp(false)
      return
    }

    if (!sso.configured) {
      setMessage('Sign-up is being prepared. Please try again shortly.')
      return
    }

    if (!sso.isLoaded) {
      setMessage(
        sso.loadTimedOut
          ? 'Sign-up is taking longer than expected in this browser. Refresh the page, then try again.'
          : 'Sign-up is getting ready. Please try again in a moment.',
      )
      return
    }

    setAuthReturnPending(true)
    setMessage(`Opening sign up for ${normalizedEmail}.`)
    sso.openSignUp(normalizedEmail)
  }

  async function handleSignOut() {
    setIsBusy(true)
    try {
      await deleteBackendSession()
      if (sso.isSignedIn) {
        await sso.signOut()
      }
      autoSsoSessionAttempted.current = false
      setAuthReturnPending(false)
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
      setEmailSignInStep('password')
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
    setMessage('Sign-in complete. Opening your JobsFlow workspace...')
    void handleCreateSsoSession()
  }, [handleCreateSsoSession, sso.isLoaded, sso.isSignedIn, session, isBusy])

  useEffect(() => {
    if (!session) {
      return
    }

    setAccountType(session.role === 'candidate' ? 'candidate' : 'employer')
  }, [session])

  if (!session) {
    const oauthProviders = ssoProviderActions.filter(
      (provider) => provider.key !== 'email' && productionOauthProviderKeys.has(provider.key),
    )
    const emailSubmitDisabled =
      !sso.configured ||
      !email.trim() ||
      isBusy ||
      (emailSignInStep === 'password' && !password) ||
      (emailSignInStep === 'code' && !emailCode.trim())
    const gatewayStatus = !sso.configured
      ? 'Sign-in is being prepared. Please try again shortly.'
      : !sso.isLoaded
        ? sso.loadTimedOut
          ? 'Sign-in is taking longer than expected in this browser. Refresh the page, then try again.'
          : 'Loading sign-in...'
        : null

    return (
      <section className="auth-gateway" aria-label="JobsFlow account access">
        <div className="auth-gateway-inner">
          <div className="auth-gateway-wordmark" aria-label="JobsFlow AI">
            <JobsFlowLogoMark />
            <strong>JobsFlow AI</strong>
          </div>

          <article className="auth-gateway-card">
            <div className="auth-gateway-copy">
              <h2>Ready to take the next step?</h2>
              <p className="auth-gateway-subtitle">Create an account or sign in.</p>
              <p className="auth-gateway-terms">
                By clicking any of the Continue options below, you understand and agree
                to JobsFlow's <a href="#workspace">Terms</a>. You also acknowledge our{' '}
                <a href="#workspace">Cookie</a> and <a href="#workspace">Privacy</a> policies.
              </p>
            </div>

            <div className="auth-gateway-oauth" aria-label="Continue with a sign-in option">
              {oauthProviders.map((provider) => (
                <button
                  className="auth-provider-button"
                  disabled={!sso.configured}
                  key={provider.key}
                  onClick={() => handleProviderSignIn(provider.key)}
                  type="button"
                >
                  <span className={`auth-provider-icon auth-provider-icon-${provider.key}`}>
                    {ssoProviderIconText[provider.key]}
                  </span>
                  Continue with {provider.label}
                </button>
              ))}
            </div>

            <div className="auth-gateway-divider">
              <span />
              <strong>or</strong>
              <span />
            </div>

            <form className="auth-gateway-email-form" onSubmit={handleEmailContinue}>
              <label>
                <span>All fields marked with * are required.</span>
                <strong>Email address *</strong>
                <input
                  autoComplete="email"
                  onChange={(event) => {
                    setEmail(event.target.value)
                    setPassword('')
                    setEmailCode('')
                    setEmailSignInStep('email')
                    setShowInlineSignUp(false)
                  }}
                  required
                  type="email"
                  value={email}
                />
              </label>
              {emailSignInStep === 'password' ? (
                <label>
                  <strong>Password *</strong>
                  <input
                    autoComplete="current-password"
                    autoFocus
                    onChange={(event) => {
                      setPassword(event.target.value)
                      setShowInlineSignUp(false)
                    }}
                    required
                    type="password"
                    value={password}
                  />
                </label>
              ) : null}
              {emailSignInStep === 'code' ? (
                <label>
                  <strong>Verification code *</strong>
                  <input
                    autoComplete="one-time-code"
                    autoFocus
                    inputMode="numeric"
                    onChange={(event) => {
                      setEmailCode(event.target.value)
                      setShowInlineSignUp(false)
                    }}
                    required
                    type="text"
                    value={emailCode}
                  />
                </label>
              ) : null}
              <button
                disabled={emailSubmitDisabled}
                type="submit"
              >
                {emailSignInStep === 'email' ? 'Continue' : 'Sign in'}
                <ArrowRight size={24} aria-hidden="true" />
              </button>
            </form>

            {showInlineSignUp ? (
              <div className="auth-inline-signup" role="note">
                <span>No JobsFlow account exists for this email yet.</span>
                <button type="button" onClick={handleInlineSignUp}>
                  Sign up with this email
                </button>
              </div>
            ) : null}

            <p className="auth-gateway-status" aria-live="polite">{friendlyUserMessage(message)}</p>
            {gatewayStatus ? <p className="auth-gateway-status">{friendlyUserMessage(gatewayStatus)}</p> : null}
          </article>
        </div>
      </section>
    )
  }

  return (
    <section className="auth-panel auth-panel-ready" aria-label="JobsFlow activation center">
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

      <div className="auth-workspace-card">
        <StatusPill tone="green">Workspace ready</StatusPill>
        <h3>Your JobsFlow workspace is open</h3>
        <strong>{session.displayName}</strong>
        <span>{session.email}</span>
        <p>
          Resume upload, packet review, and the consent gate are unlocked for this
          signed session.
        </p>
      </div>

      <div className="auth-state">
        <StatusPill tone="green">Workspace open</StatusPill>
        <div className="session-summary">
          <strong>{session.displayName}</strong>
          <span>{session.email}</span>
          <small>{session.role} workspace</small>
        </div>
        <p className="runtime-message">{friendlyUserMessage(message)}</p>
        <div className="auth-actions">
          <button disabled={isBusy} onClick={checkSession} type="button">
            <RefreshCw size={16} aria-hidden="true" />
            Refresh status
          </button>
          <button disabled={isBusy} onClick={handleSignOut} type="button">
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
                  Resume storage uses your signed-in workspace so files and metadata stay
                  protected.
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
        `${result.resume.filename} is stored privately. JobsFlow recorded the activity history.`,
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
      setStatus(`${result.resumes.length} resume file${result.resumes.length === 1 ? '' : 's'} visible in this workspace.`)
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
        metadata workspace-protected, and records the action for review history.
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
      <p className="runtime-message">{friendlyUserMessage(status)}</p>
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
          ? 'JobsFlow is online. Workspace data, packet review, and activity history are ready.'
          : 'JobsFlow is online, but one workspace area still needs attention.',
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
      setMessage(`${result.events.length} activity item${result.events.length === 1 ? '' : 's'} loaded for this workspace.`)
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'audit'))
    } finally {
      setIsBusy(false)
    }
  }

  async function sendOutboundEmailTest() {
    if (!session) {
      setMessage('Start a workspace first, then JobsFlow can send a test email to the signed-in address.')
      return
    }

    setIsBusy(true)
    try {
      const result = await sendEmailTest()
      setMessage(`Test email sent to ${result.recipient}. Check your inbox in a moment.`)
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'email'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshBackend()
  }, [refreshBackend])

  const bindingRows: Array<[string, boolean]> = health
    ? [
        ['Workspace data', health.bindings.db],
        ['Resume storage', health.bindings.resumeBucket],
        ['Secure sessions', health.bindings.sessionSecret],
        ['Invite access', health.bindings.bootstrapToken],
        ['Account sign-in', Boolean(health.features?.ssoProvider)],
        ['Outbound email', Boolean(health.features?.outboundEmail || health.bindings.emailProvider)],
        ['Packet review engine', Boolean(health.features?.packetReviewEngine)],
      ]
    : []

  return (
    <article className="panel backend-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>Live workspace readiness</span>
          <h3>Secure workspaces, resume storage, and activity trails</h3>
        </div>
        <StatusPill tone={health?.databaseReady ? 'green' : 'amber'}>
          {health ? 'Ready' : 'Checking'}
        </StatusPill>
      </div>
      <div className="backend-grid">
        <div className="backend-card">
          <strong>JobsFlow services</strong>
          <p>{friendlyUserMessage(message)}</p>
          <div className="backend-actions">
            <button disabled={isBusy} onClick={refreshBackend} type="button">
              <RefreshCw size={16} aria-hidden="true" />
              Refresh
            </button>
            <button disabled={isBusy} onClick={loadAuditEvents} type="button">
              <DatabaseZap size={16} aria-hidden="true" />
              Load activity history
            </button>
            <button
              disabled={isBusy || !session || !(health?.features?.outboundEmail || health?.bindings.emailProvider)}
              onClick={sendOutboundEmailTest}
              type="button"
            >
              <MailCheck size={16} aria-hidden="true" />
              Send email test
            </button>
          </div>
        </div>
        <div className="backend-card">
          <strong>Readiness</strong>
          <div className="binding-grid">
            {bindingRows.length ? (
              bindingRows.map(([label, ready]) => (
                <div className="binding-row" key={label}>
                  <span>{label}</span>
                  <StatusPill tone={ready ? 'green' : 'amber'}>{ready ? 'Ready' : 'Needs attention'}</StatusPill>
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
                {session.role} workspace
              </small>
            </div>
          ) : (
            <p>No active JobsFlow workspace.</p>
          )}
        </div>
      </div>
      <div className="audit-preview">
        {auditEvents.map((event) => (
          <div className="audit-preview-row" key={event.id}>
            <span>{formatProductLabel(event.eventType)}</span>
            <strong>{formatProductLabel(event.action)}</strong>
            <small>{formatProductLabel(event.riskLevel)} risk</small>
          </div>
        ))}
      </div>
    </article>
  )
}


function WorkflowKernelPanel({ session }: { session: BackendSession | null }) {
  const [kernelState, setKernelState] = useState<WorkflowKernelState | null>(null)
  const [message, setMessage] = useState(
    'Start a workspace, then turn on guided automation.',
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
      setMessage('Start a workspace first, then JobsFlow can load guided automation.')
      return
    }

    setIsBusy(true)
    try {
      const result = await getWorkflowKernelState()
      setKernelState(result.state)
      setMessage(
        result.state.summary.activeDefinitions
          ? `${result.state.summary.activeDefinitions} automation workflow${result.state.summary.activeDefinitions === 1 ? '' : 's'} ready.`
          : 'Guided automation is ready to activate.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'workflow'))
    } finally {
      setIsBusy(false)
    }
  }, [session])

  async function activateKernel() {
    if (!session) {
      setMessage('Start a workspace first, then JobsFlow can turn on guided automation.')
      return
    }

    setIsBusy(true)
    setMessage('Preparing automation rules, safety checks, and approval records...')
    try {
      const result = await bootstrapWorkflowKernel()
      setKernelState(result.state)
      setMessage(
        result.createdRun
          ? 'Guided automation is ready. External actions remain blocked until reviewed and approved.'
          : 'Guided automation is ready. Existing approval boundaries remain intact.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'workflow'))
    } finally {
      setIsBusy(false)
    }
  }

  async function startResumeWorkflow() {
    if (!session) {
      setMessage('Start a workspace before preparing resume automation.')
      return
    }

    setIsBusy(true)
    setMessage('Preparing a guarded resume optimization plan...')
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
      setMessage('Resume optimization plan created behind a review gate.')
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
          <span>Guided automation</span>
          <h3>Durable state before automation</h3>
        </div>
        <StatusPill tone={activeDefinitions ? 'green' : 'amber'}>
          {activeDefinitions ? 'Ready' : 'Needs activation'}
        </StatusPill>
      </div>
      <p className="muted-line">
        JobsFlow records every automation plan, approval, and delivery event before any external action can happen.
      </p>
      <div className="kernel-actions">
        <button disabled={isBusy} onClick={refreshKernel} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          Refresh automation
        </button>
        <button disabled={isBusy || !session} onClick={activateKernel} type="button">
          <DatabaseZap size={16} aria-hidden="true" />
          Activate automation
        </button>
        <button disabled={isBusy || !session} onClick={startResumeWorkflow} type="button">
          <FileCheck2 size={16} aria-hidden="true" />
          Start resume workflow
        </button>
      </div>
      <p className="runtime-message">{friendlyUserMessage(message)}</p>
      <div className="kernel-metrics">
        <div>
          <strong>{kernelState?.summary.activeDefinitions ?? 0}</strong>
          <span>ready automations</span>
        </div>
        <div>
          <strong>{kernelState?.summary.activeRuns ?? 0}</strong>
          <span>active plans</span>
        </div>
        <div>
          <strong>{kernelState?.summary.pendingReceipts ?? 0}</strong>
          <span>pending approvals</span>
        </div>
        <div>
          <strong>{kernelState?.summary.enabledPolicies ?? 0}</strong>
          <span>active safeguards</span>
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
                <small>{formatProductLabel(definition.triggerEvent)}</small>
              </div>
            ))}
            {!pillarDefinitions.length ? (
              <div className="kernel-empty">Activate automation to prepare the ten JobsFlow pillar workflows.</div>
            ) : null}
          </div>
        </div>
        <div className="kernel-column">
          <strong>Latest runs and receipts</strong>
          <div className="kernel-list">
            {latestRun ? (
              <div className="kernel-row">
                <StatusPill tone={workflowTone(latestRun.state)}>{formatProductLabel(latestRun.state)}</StatusPill>
                <p>{formatProductLabel(latestRun.workflowKey)}</p>
                <small>{formatProductLabel(latestRun.currentStep)}</small>
              </div>
            ) : (
              <div className="kernel-empty">No automation plans yet.</div>
            )}
            {pendingReceipts.slice(0, 3).map((receipt) => (
              <div className="kernel-row" key={receipt.id}>
                <StatusPill tone="amber">{formatProductLabel(receipt.status)}</StatusPill>
                <p>{formatProductLabel(receipt.action)}</p>
                <small>{textFromRecord(receipt.preview, 'title', 'Consent preview recorded')}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="kernel-column">
          <strong>Connection boundaries</strong>
          <div className="kernel-list">
            {(kernelState?.integrations ?? []).slice(0, 6).map((integration) => (
              <div className="kernel-row" key={integration.id}>
                <span>{formatProductLabel(integration.status)}</span>
                <p>{integration.accountLabel}</p>
                <small>{formatProductLabel(integration.provider)}</small>
              </div>
            ))}
            {!kernelState?.integrations.length ? (
              <div className="kernel-empty">No connection boundaries are ready yet.</div>
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
  const [message, setMessage] = useState('Start a workspace, then JobsFlow can optimize this resume for a target role.')
  const [isBusy, setIsBusy] = useState(false)
  const latestAnalysis = resumeIntelState?.analyses[0] ?? null

  const refreshResumeIntelligence = useCallback(async () => {
    if (!session) {
      setResumeIntelState(null)
      setMessage('Start a candidate workspace first, then JobsFlow can load resume optimization results.')
      return
    }

    setIsBusy(true)
    try {
      const result = await getResumeIntelligenceState()
      setResumeIntelState(result.state)
      setMessage(
        result.state.summary.analyses
          ? `${result.state.summary.analyses} resume optimization result${result.state.summary.analyses === 1 ? '' : 's'} ready.`
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
      setMessage('Start a candidate workspace before optimizing this resume.')
      return
    }

    setIsBusy(true)
    setMessage('Reading resume facts, role requirements, proof gaps, and match signals...')
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
          <span>Resume optimization</span>
          <h3>Proof gaps before tailored variants</h3>
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
      <p className="runtime-message">{friendlyUserMessage(message)}</p>
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
              <span>role overlap</span>
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
              <strong>Prepared evidence</strong>
              <EvidenceList
                items={[
                  `${latestAnalysis.vectorDocuments.length} evidence note${latestAnalysis.vectorDocuments.length === 1 ? '' : 's'} ready`,
                  `${resumeIntelState?.summary.pendingVectorDocuments ?? 0} insight${resumeIntelState?.summary.pendingVectorDocuments === 1 ? '' : 's'} waiting to be prepared`,
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


function AntiGhostingPipelinePanel({ session }: { session: BackendSession | null }) {
  const [pipelineState, setPipelineState] = useState<AntiGhostingPipelineState | null>(null)
  const [message, setMessage] = useState('Start a workspace, then JobsFlow can track application response SLAs.')
  const [isBusy, setIsBusy] = useState(false)
  const latestItem = pipelineState?.items[0] ?? null
  const openTasks = pipelineState?.tasks.filter((task) => task.status === 'open') ?? []

  const refreshPipeline = useCallback(async () => {
    if (!session) {
      setPipelineState(null)
      setMessage('Start a candidate workspace first, then JobsFlow can load application tracking.')
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
      <p className="runtime-message">{friendlyUserMessage(message)}</p>
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
            <small>{formatProductLabel(task.channel)} / approval required</small>
          </div>
        ))}
        {!openTasks.length ? <div className="kernel-empty">No follow-up drafts are open.</div> : null}
      </div>
    </article>
  )
}

const interviewStageOptions: Array<{ key: InterviewStage; label: string }> = [
  { key: 'recruiter_screen', label: 'Recruiter screen' },
  { key: 'hiring_manager', label: 'Hiring manager' },
  { key: 'panel', label: 'Panel' },
  { key: 'case_study', label: 'Case study' },
  { key: 'final_round', label: 'Final round' },
]

const defaultInterviewAnswer = [
  'Situation: I inherited a launch intake process that created duplicated product operations handoffs across implementation, customer success, and vendor teams.',
  'Action: I rebuilt the operating rhythm around weekly risk review, executive customer updates, and a shared readiness dashboard.',
  'Result: The handoff timeline dropped 28%, launch owners had clearer escalation rules, and quality reviews became repeatable across 18 active projects.',
  'Lesson: I now start by aligning the decision log, success metrics, and escalation owners before automating any part of the workflow.',
].join(' ')

function findQuestionForAnswer(state: InterviewPrepState | null, questionKey: string): InterviewQuestion | null {
  for (const questionSet of state?.questionSets ?? []) {
    const question = questionSet.questions.find((item) => item.key === questionKey)
    if (question) {
      return question
    }
  }

  return null
}

function InterviewPrepSandboxPanel({ session }: { session: BackendSession | null }) {
  const [interviewState, setInterviewState] = useState<InterviewPrepState | null>(null)
  const [stage, setStage] = useState<InterviewStage>('hiring_manager')
  const [answerText, setAnswerText] = useState(defaultInterviewAnswer)
  const [selectedQuestionKey, setSelectedQuestionKey] = useState('role-fit')
  const [message, setMessage] = useState('Start a workspace, then JobsFlow can generate targeted interview practice.')
  const [isBusy, setIsBusy] = useState(false)
  const latestSession = interviewState?.sessions[0] ?? null
  const activeQuestionSet = latestSession
    ? interviewState?.questionSets.find((questionSet) => questionSet.sessionId === latestSession.id) ?? null
    : null
  const questions = activeQuestionSet?.questions ?? []
  const selectedQuestion = questions.find((question) => question.key === selectedQuestionKey) ?? questions[0] ?? null
  const latestAnswer = interviewState?.answers[0] ?? null
  const latestAnswerQuestion = latestAnswer ? findQuestionForAnswer(interviewState, latestAnswer.questionKey) : null

  const refreshInterviewPrep = useCallback(async () => {
    if (!session) {
      setInterviewState(null)
      setMessage('Start a candidate workspace first, then JobsFlow can load interview practice.')
      return
    }

    setIsBusy(true)
    try {
      const result = await getInterviewPrepState()
      setInterviewState(result.state)
      const firstQuestion = result.state.questionSets[0]?.questions[0]
      if (firstQuestion) {
        setSelectedQuestionKey(firstQuestion.key)
      }
      setMessage(
        result.state.summary.activeSessions
          ? `${result.state.summary.activeSessions} active prep session${result.state.summary.activeSessions === 1 ? '' : 's'} ready.`
          : 'No interview prep session yet. Generate one for the target role.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'interview-prep'))
    } finally {
      setIsBusy(false)
    }
  }, [session])

  async function createKoraPrepSession() {
    if (!session) {
      setMessage('Start a candidate workspace before generating interview prep.')
      return
    }

    setIsBusy(true)
    setMessage('Generating stage-aware interview questions and a scoring rubric...')
    try {
      const result = await createInterviewPrepSession({
        company: applicationPacket.company,
        evidence: [
          'Reduced launch handoff time by 28%',
          'Built product operations dashboards for 18 active projects',
          'Owned vendor governance and executive customer updates',
        ],
        requiredSkills: ['Product operations', 'Healthcare SaaS', 'Vendor governance', 'Executive communication'],
        stage,
        targetRole: applicationPacket.role,
      })
      setInterviewState(result.state)
      const firstQuestion = result.state.questionSets.find((questionSet) => questionSet.sessionId === result.sessionId)?.questions[0]
      if (firstQuestion) {
        setSelectedQuestionKey(firstQuestion.key)
      }
      setMessage('Interview prep session created. Questions and rubric are workspace-protected and saved to history.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'interview-prep'))
    } finally {
      setIsBusy(false)
    }
  }

  async function evaluatePracticeAnswer() {
    if (!latestSession || !selectedQuestion) {
      setMessage('Create an interview prep session first, then choose a question to evaluate.')
      return
    }

    setIsBusy(true)
    setMessage('Evaluating answer specificity, proof, structure, and risk handling...')
    try {
      const result = await evaluateInterviewPracticeAnswer({
        answerText,
        questionKey: selectedQuestion.key,
        sessionId: latestSession.id,
      })
      setInterviewState(result.state)
      setMessage('Practice answer scored. JobsFlow saved strengths, risks, and next rehearsal moves.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'interview-prep'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshInterviewPrep()
  }, [refreshInterviewPrep])

  return (
    <article className="panel interview-prep-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>Native AI Interview Prep Sandbox</span>
          <h3>Questions, answers, and role-specific scoring</h3>
        </div>
        <StatusPill tone={latestAnswer ? (latestAnswer.overallScore >= 75 ? 'green' : 'amber') : latestSession ? 'blue' : 'amber'}>
          {latestAnswer ? `${latestAnswer.overallScore}% latest answer` : latestSession ? 'Session ready' : 'No session yet'}
        </StatusPill>
      </div>
      <div className="interview-prep-controls">
        <label>
          <span>Stage</span>
          <select onChange={(event) => setStage(event.target.value as InterviewStage)} value={stage}>
            {interviewStageOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="kernel-actions">
          <button disabled={isBusy || !session} onClick={createKoraPrepSession} type="button">
            <CalendarCheck size={16} aria-hidden="true" />
            Generate prep
          </button>
          <button disabled={isBusy || !session} onClick={refreshInterviewPrep} type="button">
            <RefreshCw size={16} aria-hidden="true" />
            Refresh sandbox
          </button>
        </div>
      </div>
      <p className="runtime-message">{friendlyUserMessage(message)}</p>
      <div className="interview-prep-grid">
        <div className="interview-question-list">
          <strong>Question set</strong>
          {questions.length ? (
            questions.map((question) => (
              <button
                className={selectedQuestion?.key === question.key ? 'interview-question active' : 'interview-question'}
                key={question.key}
                onClick={() => setSelectedQuestionKey(question.key)}
                type="button"
              >
                <span>{question.category.replaceAll('_', ' ')}</span>
                <strong>{question.prompt}</strong>
                <small>{question.signal}</small>
              </button>
            ))
          ) : (
            <div className="kernel-empty">Generate prep to create a question set.</div>
          )}
        </div>
        <div className="interview-answer-box">
          <strong>{selectedQuestion?.prompt ?? 'Practice answer'}</strong>
          <textarea onChange={(event) => setAnswerText(event.target.value)} rows={9} value={answerText} />
          <button disabled={isBusy || !latestSession || !selectedQuestion} onClick={evaluatePracticeAnswer} type="button">
            <MessageSquareText size={16} aria-hidden="true" />
            {isBusy ? 'Scoring...' : 'Evaluate answer'}
          </button>
        </div>
      </div>
      {latestAnswer ? (
        <div className="interview-evaluation-grid">
          <div className="interview-score-card">
            <strong>{latestAnswer.overallScore}%</strong>
            <span>{latestAnswerQuestion?.prompt ?? latestAnswer.questionKey}</span>
          </div>
          <div>
            <strong>Strengths</strong>
            <EvidenceList items={latestAnswer.strengths} />
          </div>
          <div>
            <strong>Risks</strong>
            <EvidenceList items={latestAnswer.risks.length ? latestAnswer.risks : ['No major answer risk detected']} />
          </div>
          <div>
            <strong>Next rehearsal</strong>
            <EvidenceList items={latestAnswer.recommendations} />
          </div>
        </div>
      ) : null}
    </article>
  )
}


function TransparencyBlueprintPanel({ session }: { session: BackendSession | null }) {
  const [transparencyState, setTransparencyState] = useState<TransparencyBlueprintState | null>(null)
  const [message, setMessage] = useState('Start a workspace, then JobsFlow can load salary and culture transparency.')
  const [isBusy, setIsBusy] = useState(false)
  const latestReport = transparencyState?.reports[0] ?? null
  const latestSalary = transparencyState?.salaries[0] ?? null
  const cultureSignals = transparencyState?.cultureSignals.slice(0, 4) ?? []

  const refreshTransparency = useCallback(async () => {
    if (!session) {
      setTransparencyState(null)
      setMessage('Start a workspace first, then JobsFlow can read transparency blueprints.')
      return
    }

    setIsBusy(true)
    try {
      const result = await getTransparencyBlueprintState()
      setTransparencyState(result.state)
      setMessage(
        result.state.summary.reports
          ? `${result.state.summary.reports} transparency blueprint${result.state.summary.reports === 1 ? '' : 's'} available.`
          : 'No transparency blueprint yet. Create one for the target role.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'transparency'))
    } finally {
      setIsBusy(false)
    }
  }, [session])

  async function createKoraBlueprint() {
    if (!session) {
      setMessage('Start a workspace before creating a transparency blueprint.')
      return
    }

    setIsBusy(true)
    setMessage('Building anonymized salary and culture blueprint...')
    try {
      const result = await createTransparencyReport({
        cultureSignals: [
          {
            evidence: ['Interview plan shared before scheduling', 'Recruiter outlined response expectations'],
            label: 'Process clarity',
            sentiment: 'positive',
            verificationCount: 5,
          },
          {
            evidence: ['Product and implementation teams use weekly risk review', 'Launch readiness ownership is visible'],
            label: 'Operating rhythm',
            sentiment: 'positive',
            verificationCount: 4,
          },
          {
            evidence: ['Delivery load can spike around enterprise launches'],
            label: 'Workload boundaries',
            sentiment: 'mixed',
            verificationCount: 2,
          },
        ],
        location: 'United States remote/hybrid',
        salaryRange: {
          currency: 'USD',
          maxCents: 14200000,
          minCents: 11800000,
        },
        targetCompany: applicationPacket.company,
        targetRole: applicationPacket.role,
      })
      setTransparencyState(result.state)
      setMessage('Transparency blueprint created with salary bands, anonymity floors, and culture risks.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'transparency'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshTransparency()
  }, [refreshTransparency])

  return (
    <article className="panel transparency-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>Transparency Blueprint Portal</span>
          <h3>Verified salary bands and anonymized culture signals</h3>
        </div>
        <StatusPill tone={latestReport ? 'green' : 'amber'}>
          {latestReport ? `${transparencyState?.summary.latestConfidenceScore ?? 0}% confidence` : 'No blueprint yet'}
        </StatusPill>
      </div>
      <div className="kernel-actions">
        <button disabled={isBusy || !session} onClick={createKoraBlueprint} type="button">
          <Scale size={16} aria-hidden="true" />
          Create blueprint
        </button>
        <button disabled={isBusy || !session} onClick={refreshTransparency} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          Refresh transparency
        </button>
      </div>
      <p className="runtime-message">{friendlyUserMessage(message)}</p>
      <div className="transparency-grid">
        <div className="transparency-salary-card">
          <strong>{latestReport?.targetRole ?? applicationPacket.role}</strong>
          <span>{latestReport?.targetCompany ?? applicationPacket.company}</span>
          <div className="salary-band">
            <b>{formatCents(latestReport?.salaryPercentiles.p25 ?? latestSalary?.salaryMinCents, latestReport?.salaryPercentiles.currency ?? latestSalary?.currency)}</b>
            <b>{formatCents(latestReport?.salaryPercentiles.p50, latestReport?.salaryPercentiles.currency ?? latestSalary?.currency)}</b>
            <b>{formatCents(latestReport?.salaryPercentiles.p75 ?? latestSalary?.salaryMaxCents, latestReport?.salaryPercentiles.currency ?? latestSalary?.currency)}</b>
          </div>
          <small>P25 / midpoint / P75, stored as anonymized workspace evidence</small>
        </div>
        <div className="transparency-risk-card">
          <strong>Risk flags</strong>
          <EvidenceList items={latestReport?.riskFlags ?? ['Create a blueprint to reveal negotiation and culture risk.']} />
        </div>
        <div className="transparency-culture-list">
          <strong>Culture conditions</strong>
          {cultureSignals.length ? (
            cultureSignals.map((signal) => (
              <div className="transparency-culture-row" key={signal.id}>
                <StatusPill tone={signal.sentiment === 'positive' ? 'green' : signal.sentiment === 'negative' ? 'red' : 'amber'}>
                  {signal.sentiment}
                </StatusPill>
                <div>
                  <strong>{signal.signalLabel}</strong>
                  <span>
                    {signal.verificationCount} confirmation{signal.verificationCount === 1 ? '' : 's'} /{' '}
                    {signal.anonymityFloorMet ? 'anonymity floor met' : 'masked'}
                  </span>
                  <p>{signal.evidence[0]}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="kernel-empty">No culture blueprint signals yet.</div>
          )}
        </div>
      </div>
    </article>
  )
}

function PassiveSourcingCardsPanel({ session }: { session: BackendSession | null }) {
  const [passiveState, setPassiveState] = useState<PassiveSourcingState | null>(null)
  const [message, setMessage] = useState('Start a candidate workspace, then JobsFlow can create anonymous sourcing cards.')
  const [isBusy, setIsBusy] = useState(false)
  const latestCard = passiveState?.cards[0] ?? null
  const latestBroadcast = passiveState?.broadcasts[0] ?? null
  const pendingRequest = passiveState?.releaseRequests.find((request) => request.status === 'pending') ?? null

  const refreshPassiveSourcing = useCallback(async () => {
    if (!session) {
      setPassiveState(null)
      setMessage('Start a candidate workspace first, then JobsFlow can load passive sourcing cards.')
      return
    }

    setIsBusy(true)
    try {
      const result = await getPassiveSourcingState()
      setPassiveState(result.state)
      setMessage(
        result.state.summary.activeCards
          ? `${result.state.summary.activeCards} anonymous card${result.state.summary.activeCards === 1 ? '' : 's'} visible to vetted recruiters.`
          : 'No public passive sourcing card yet. Create and broadcast one when ready.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'passive-sourcing'))
    } finally {
      setIsBusy(false)
    }
  }, [session])

  async function createAnonymousCard() {
    if (!session) {
      setMessage('Start a candidate workspace before creating a passive sourcing card.')
      return
    }

    setIsBusy(true)
    setMessage('Creating anonymous card with contact and employer redactions...')
    try {
      const result = await createPassiveSourcingCard({
        achievements: [
          'Reduced launch handoff time by 28%',
          'Built readiness reporting across 18 active projects',
          'Owned vendor governance without exposing current employer details',
        ],
        headline: 'Anonymous product operations leader open to vetted healthcare SaaS roles',
        skills: ['Product operations', 'Healthcare SaaS', 'Vendor governance', 'Executive communication'],
        targetRoles: [applicationPacket.role, 'Implementation Operations Lead'],
      })
      setPassiveState(result.state)
      setMessage('Anonymous sourcing card created. Contact release remains locked until candidate approval.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'passive-sourcing'))
    } finally {
      setIsBusy(false)
    }
  }

  async function broadcastLatestCard() {
    if (!latestCard) {
      setMessage('Create an anonymous card first, then JobsFlow can queue a redacted broadcast.')
      return
    }

    setIsBusy(true)
    setMessage('Preparing the redacted card for recruiter marketplace review...')
    try {
      const result = await broadcastPassiveSourcingCard(latestCard.id)
      setPassiveState(result.state)
      setMessage('Broadcast queued with name, email, phone, current employer, and resume file redacted.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'passive-sourcing'))
    } finally {
      setIsBusy(false)
    }
  }

  async function simulateReleaseRequest() {
    if (!latestCard) {
      setMessage('Create an anonymous card first, then JobsFlow can record contact release requests.')
      return
    }

    setIsBusy(true)
    setMessage('Recording recruiter contact-release request for candidate approval...')
    try {
      const result = await requestPassiveSourcingContactRelease(latestCard.id)
      setPassiveState(result.state)
      setMessage('Contact-release request recorded. Candidate identity remains locked.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'passive-sourcing'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshPassiveSourcing()
  }, [refreshPassiveSourcing])

  return (
    <article className="panel passive-sourcing-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>Passive Sourcing Cards</span>
          <h3>Anonymous demand generation with contact release gates</h3>
        </div>
        <StatusPill tone={latestCard?.visibility === 'recruiter_marketplace' ? 'green' : latestCard ? 'blue' : 'amber'}>
          {latestCard?.visibility.replaceAll('_', ' ') ?? 'No card yet'}
        </StatusPill>
      </div>
      <div className="kernel-actions">
        <button disabled={isBusy || !session} onClick={createAnonymousCard} type="button">
          <LockKeyhole size={16} aria-hidden="true" />
          Create card
        </button>
        <button disabled={isBusy || !latestCard} onClick={broadcastLatestCard} type="button">
          <Globe2 size={16} aria-hidden="true" />
          Broadcast redacted card
        </button>
        <button disabled={isBusy || !latestCard} onClick={simulateReleaseRequest} type="button">
          <Handshake size={16} aria-hidden="true" />
          Request release
        </button>
        <button disabled={isBusy || !session} onClick={refreshPassiveSourcing} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          Refresh cards
        </button>
      </div>
      <p className="runtime-message">{friendlyUserMessage(message)}</p>
      <div className="passive-grid">
        <div className="passive-card-preview">
          <span>{latestCard?.anonymousHandle ?? 'Anonymous handle pending'}</span>
          <strong>{latestCard?.headline ?? 'Create a card to generate masked recruiter-facing signal.'}</strong>
          <EvidenceList items={latestCard?.maskedSkills ?? ['Skills are visible; contact and current employer are not.']} />
          <small>{latestCard ? `Expires ${latestCard.expiresAt}` : 'Cards default to private until broadcast.'}</small>
        </div>
        <div className="passive-safeguard-list">
          <strong>Redactions</strong>
          <EvidenceList
            items={
              latestBroadcast?.contactRedactions.map((item) => item.replaceAll('_', ' ')) ?? [
                'candidate name',
                'email',
                'phone',
                'current employer',
              ]
            }
          />
        </div>
        <div className="passive-release-card">
          <strong>Contact release</strong>
          {pendingRequest ? (
            <>
              <StatusPill tone="amber">{pendingRequest.status}</StatusPill>
              <p>{pendingRequest.requesterCompany}</p>
              <span>{pendingRequest.reason}</span>
            </>
          ) : (
            <>
              <StatusPill tone={latestCard?.contactReleaseStatus === 'locked' ? 'blue' : 'amber'}>
                {latestCard?.contactReleaseStatus ?? 'locked'}
              </StatusPill>
              <p>No recruiter request is waiting for approval.</p>
            </>
          )}
        </div>
      </div>
    </article>
  )
}

function DynamicAchievementProfilesPanel({ session }: { session: BackendSession | null }) {
  const [achievementState, setAchievementState] = useState<AchievementProfileState | null>(null)
  const [message, setMessage] = useState('Start a candidate workspace, then JobsFlow can structure achievement cards.')
  const [isBusy, setIsBusy] = useState(false)
  const latestProfile = achievementState?.profiles[0] ?? null
  const latestCards = latestProfile
    ? achievementState?.cards.filter((card) => card.profileId === latestProfile.id).slice(0, 6) ?? []
    : []

  const refreshAchievementProfiles = useCallback(async () => {
    if (!session) {
      setAchievementState(null)
      setMessage('Start a candidate workspace first, then JobsFlow can load achievement profiles.')
      return
    }

    setIsBusy(true)
    try {
      const result = await getAchievementProfileState()
      setAchievementState(result.state)
      setMessage(
        result.state.summary.profiles
          ? `${result.state.summary.profiles} dynamic achievement profile${result.state.summary.profiles === 1 ? '' : 's'} available.`
          : 'No achievement profile yet. Transform resume evidence into cards.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'achievement-profiles'))
    } finally {
      setIsBusy(false)
    }
  }, [session])

  async function createKoraAchievementProfile() {
    if (!session) {
      setMessage('Start a candidate workspace before creating an achievement profile.')
      return
    }

    setIsBusy(true)
    setMessage('Transforming resume evidence into structured achievement cards...')
    try {
      const result = await createAchievementProfile({
        candidateAlias: 'Candidate JFC-1428',
        resumeText: [
          defaultResumeTailwindText,
          'Certified Scrum Product Owner credential under review.',
          'Led product, implementation, and customer success partners through healthcare SaaS launch risk reviews.',
        ].join('\n'),
        sourceLabel: 'Master resume evidence',
      })
      setAchievementState(result.state)
      setMessage('Achievement profile created with metric, leadership, project, and credential cards.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'achievement-profiles'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshAchievementProfiles()
  }, [refreshAchievementProfiles])

  return (
    <article className="panel achievement-profile-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>Dynamic Achievement Profiles</span>
          <h3>Structured cards instead of resume walls</h3>
        </div>
        <StatusPill tone={latestProfile ? (latestProfile.profileScore >= 70 ? 'green' : 'amber') : 'amber'}>
          {latestProfile ? `${latestProfile.profileScore}% ${latestProfile.status.replaceAll('_', ' ')}` : 'No profile yet'}
        </StatusPill>
      </div>
      <div className="kernel-actions">
        <button disabled={isBusy || !session} onClick={createKoraAchievementProfile} type="button">
          <FileText size={16} aria-hidden="true" />
          Create cards
        </button>
        <button disabled={isBusy || !session} onClick={refreshAchievementProfiles} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          Refresh profiles
        </button>
      </div>
      <p className="runtime-message">{friendlyUserMessage(message)}</p>
      <div className="achievement-profile-grid">
        <div className="achievement-summary-card">
          <strong>{latestProfile?.candidateAlias ?? 'Candidate alias pending'}</strong>
          <span>{latestProfile?.sourceLabel ?? 'Resume source pending'}</span>
          <p>{latestProfile?.summary ?? 'Create a profile to convert evidence into structured cards.'}</p>
          <small>{achievementState?.summary.pendingVerifications ?? 0} pending verification item(s)</small>
        </div>
        <div className="achievement-card-list">
          {latestCards.length ? (
            latestCards.map((card) => (
              <div className="achievement-card-row" key={card.id}>
                <StatusPill tone={card.verificationStatus === 'verified' ? 'green' : 'amber'}>
                  {card.cardType}
                </StatusPill>
                <strong>{card.title}</strong>
                <span>{card.metrics.length ? card.metrics.join(', ') : card.verificationStatus}</span>
                <p>{card.evidence[0]}</p>
              </div>
            ))
          ) : (
            <div className="kernel-empty">No achievement cards yet.</div>
          )}
        </div>
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

      <TransparencyBlueprintPanel session={session} />

      <PassiveSourcingCardsPanel session={session} />

      <DynamicAchievementProfilesPanel session={session} />

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

      <InterviewPrepSandboxPanel session={session} />

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

function SemanticSkillMatchingPanel({ session }: { session: BackendSession | null }) {
  const [skillState, setSkillState] = useState<SkillMatchingState | null>(null)
  const [message, setMessage] = useState('Start an employer workspace, then JobsFlow can match role needs to candidate evidence.')
  const [isBusy, setIsBusy] = useState(false)
  const latestRun = skillState?.matchRuns[0] ?? null
  const latestCandidate = latestRun
    ? skillState?.candidateProfiles.find((profile) => profile.id === latestRun.candidateProfileId) ?? null
    : null
  const latestRole = latestRun ? skillState?.roleRequirements.find((role) => role.id === latestRun.roleRequirementId) ?? null : null

  const refreshSkillMatching = useCallback(async () => {
    if (!session) {
      setSkillState(null)
      setMessage('Start an employer workspace first, then JobsFlow can load skill matches.')
      return
    }

    setIsBusy(true)
    try {
      const result = await getSkillMatchingState()
      setSkillState(result.state)
      setMessage(
        result.state.summary.matchRuns
          ? `${result.state.summary.matchRuns} skill match${result.state.summary.matchRuns === 1 ? '' : 'es'} ready.`
          : 'No skill match yet. Run the matcher for the current role.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'skill-matching'))
    } finally {
      setIsBusy(false)
    }
  }, [session])

  async function runKoraSemanticMatch() {
    if (!session) {
      setMessage('Start an employer workspace before matching skills to the role.')
      return
    }

    setIsBusy(true)
    setMessage('Preparing role requirements, skill groups, candidate evidence, and match scoring...')
    try {
      const result = await runSemanticSkillMatch({
        adjacentSkills: ['Implementation operations', 'Healthtech', 'Workflow governance'],
        achievements: [
          'Reduced launch handoff time by 28%',
          'Built readiness dashboards for 18 active projects',
          'Owned executive customer communication during workflow rollout',
        ],
        candidateAlias: 'Candidate JFC-1428',
        candidateSkills: [
          'Product operations',
          'Healthcare technology',
          'Vendor governance',
          'Operational reporting',
          'Stakeholder management',
        ],
        company: applicationPacket.company,
        minimumSignals: ['Quantified impact', 'Cross-functional launch ownership'],
        requiredSkills: [
          'Product operations',
          'Healthcare SaaS',
          'Vendor governance',
          'Claims operations',
          'Executive communication',
        ],
        roleTitle: applicationPacket.role,
      })
      setSkillState(result.state)
      setMessage('Skill match complete. Adjacent evidence is separated from direct proof for reviewer control.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'skill-matching'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshSkillMatching()
  }, [refreshSkillMatching])

  return (
    <article className="panel semantic-match-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>Skill matching</span>
          <h3>Related skills without keyword tunnel vision</h3>
        </div>
        <StatusPill tone={latestRun ? (latestRun.matchScore >= 75 ? 'green' : 'amber') : 'amber'}>
          {latestRun ? `${latestRun.matchScore}% match` : 'No match yet'}
        </StatusPill>
      </div>
      <div className="kernel-actions">
        <button disabled={isBusy || !session} onClick={runKoraSemanticMatch} type="button">
          <SearchCheck size={16} aria-hidden="true" />
          Run skill match
        </button>
        <button disabled={isBusy || !session} onClick={refreshSkillMatching} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          Refresh matches
        </button>
      </div>
      <p className="runtime-message">{friendlyUserMessage(message)}</p>
      <div className="semantic-match-grid">
        <div className="semantic-score-card">
          <strong>{latestRun?.matchScore ?? 0}%</strong>
          <span>{latestCandidate?.candidateAlias ?? 'Candidate profile pending'}</span>
          <p>{latestRole ? `${latestRole.roleTitle} at ${latestRole.company}` : 'Run a match to create the employer role requirement.'}</p>
        </div>
        <div>
          <strong>Direct proof</strong>
          <EvidenceList items={latestRun?.matchedSkills.length ? latestRun.matchedSkills : ['No direct matched skills yet']} />
        </div>
        <div>
          <strong>Adjacent bridges</strong>
          <EvidenceList
            items={
              latestRun?.adjacentMatches.length
                ? latestRun.adjacentMatches.map((match) => `${match.candidateSkill} bridges ${match.requiredSkill}`)
                : ['No adjacent skill bridges yet']
            }
          />
        </div>
        <div>
          <strong>Review gaps</strong>
          <EvidenceList items={latestRun?.gaps.length ? latestRun.gaps : ['No gaps recorded yet']} />
        </div>
      </div>
    </article>
  )
}

function JobSyndicationPanel({ session }: { session: BackendSession | null }) {
  const [syndicationState, setSyndicationState] = useState<JobSyndicationState | null>(null)
  const [message, setMessage] = useState('Start an employer workspace, then JobsFlow can prepare jobs for publishing review.')
  const [isBusy, setIsBusy] = useState(false)
  const latestPost = syndicationState?.posts[0] ?? null
  const latestDeliveries = latestPost
    ? syndicationState?.deliveries.filter((delivery) => delivery.postId === latestPost.id) ?? []
    : []

  const refreshSyndication = useCallback(async () => {
    if (!session) {
      setSyndicationState(null)
      setMessage('Start an employer workspace first, then JobsFlow can load job publishing drafts.')
      return
    }

    setIsBusy(true)
    try {
      const result = await getJobSyndicationState()
      setSyndicationState(result.state)
      setMessage(
        result.state.summary.syndicationPosts
          ? `${result.state.summary.syndicationPosts} job publishing draft${result.state.summary.syndicationPosts === 1 ? '' : 's'} recorded.`
          : 'No job publishing drafts yet. Validate and queue the first role.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'job-syndication'))
    } finally {
      setIsBusy(false)
    }
  }, [session])

  async function queueKoraJob() {
    if (!session) {
      setMessage('Start an employer workspace before queueing a job for publishing review.')
      return
    }

    setIsBusy(true)
    setMessage('Validating job content, salary band, search listing details, and partner-ready drafts...')
    try {
      const result = await createJobSyndicationPost({
        company: applicationPacket.company,
        description:
          'Own product operations workflows for healthcare SaaS delivery, vendor governance, launch readiness, claims operations collaboration, executive communication, and cross-functional operating rhythm improvements. This role requires evidence-first communication, product analytics, measurable implementation quality ownership, and clear partnership with product, implementation, and customer success teams.',
        employmentType: 'full_time',
        location: 'United States remote/hybrid',
        roleTitle: applicationPacket.role,
        salaryRange: {
          currency: 'USD',
          maxCents: 14200000,
          minCents: 11800000,
        },
      })
      setSyndicationState(result.state)
      setMessage('Job publishing drafts are queued inside JobsFlow. External publishing remains review-gated.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'job-syndication'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshSyndication()
  }, [refreshSyndication])

  return (
    <article className="panel job-syndication-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>One-click job publishing</span>
          <h3>Validated drafts before external publishing</h3>
        </div>
        <StatusPill tone={latestPost?.status === 'queued' ? 'green' : latestPost?.status === 'blocked' ? 'red' : 'amber'}>
          {latestPost?.status ?? 'No post yet'}
        </StatusPill>
      </div>
      <div className="kernel-actions">
        <button disabled={isBusy || !session} onClick={queueKoraJob} type="button">
          <Globe2 size={16} aria-hidden="true" />
          Validate and queue
        </button>
        <button disabled={isBusy || !session} onClick={refreshSyndication} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          Refresh drafts
        </button>
      </div>
      <p className="runtime-message">{friendlyUserMessage(message)}</p>
      <div className="syndication-grid">
        <div className="syndication-post-card">
          <strong>{latestPost?.roleTitle ?? applicationPacket.role}</strong>
          <span>{latestPost?.company ?? applicationPacket.company}</span>
          <p>
            {formatCents(latestPost?.salary.minCents, latestPost?.salary.currency)} -{' '}
            {formatCents(latestPost?.salary.maxCents, latestPost?.salary.currency)}
          </p>
          <small>{latestPost ? 'Search listing draft ready' : 'Search listing draft pending'}</small>
        </div>
        <div>
          <strong>Validation</strong>
          <EvidenceList items={latestPost?.validationErrors.length ? latestPost.validationErrors : ['Draft passes local publishing checks']} />
        </div>
        <div>
          <strong>Delivery records</strong>
          {latestDeliveries.length ? (
            latestDeliveries.map((delivery) => (
              <div className="syndication-delivery-row" key={delivery.id}>
                <StatusPill tone={delivery.status === 'queued' ? 'blue' : delivery.status === 'blocked' ? 'red' : 'green'}>
                  {delivery.status}
                </StatusPill>
                <span>{delivery.destination.replaceAll('_', ' ')}</span>
              </div>
            ))
          ) : (
            <div className="kernel-empty">No delivery records yet.</div>
          )}
        </div>
      </div>
    </article>
  )
}

function PrescreeningAgentsPanel({ session }: { session: BackendSession | null }) {
  const [prescreeningState, setPrescreeningState] = useState<PrescreeningState | null>(null)
  const [message, setMessage] = useState('Start an employer workspace, then JobsFlow can run conversational pre-screening.')
  const [isBusy, setIsBusy] = useState(false)
  const latestSession = prescreeningState?.sessions[0] ?? null
  const latestDecision = latestSession
    ? prescreeningState?.decisions.find((decision) => decision.sessionId === latestSession.id) ?? null
    : null
  const transcript = latestSession
    ? (prescreeningState?.messages ?? []).filter((item) => item.sessionId === latestSession.id).slice().reverse()
    : []

  const refreshPrescreening = useCallback(async () => {
    if (!session) {
      setPrescreeningState(null)
      setMessage('Start an employer workspace first, then JobsFlow can load pre-screening sessions.')
      return
    }

    setIsBusy(true)
    try {
      const result = await getPrescreeningState()
      setPrescreeningState(result.state)
      setMessage(
        result.state.summary.sessions
          ? `${result.state.summary.sessions} pre-screening session${result.state.summary.sessions === 1 ? '' : 's'} recorded.`
          : 'No pre-screening sessions yet. Run one against the minimum criteria.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'prescreening'))
    } finally {
      setIsBusy(false)
    }
  }, [session])

  async function runKoraPrescreen() {
    if (!session) {
      setMessage('Start an employer workspace before running pre-screening.')
      return
    }

    setIsBusy(true)
    setMessage('Running criteria-bound conversational pre-screening...')
    try {
      const result = await runPrescreeningSession({
        baselineSkills: ['Product operations', 'Healthcare SaaS', 'Vendor governance'],
        candidateAlias: 'Candidate JFC-1428',
        candidateSkills: ['Product operations', 'Healthcare SaaS', 'Operational reporting'],
        company: applicationPacket.company,
        knockoutCriteria: ['Needs sponsorship immediately', 'Cannot start within 90 days'],
        roleTitle: applicationPacket.role,
        timelineDays: 21,
        visaStatus: 'authorized',
      })
      setPrescreeningState(result.state)
      setMessage('Pre-screening complete. Transcript and decision are saved before scheduling.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'prescreening'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshPrescreening()
  }, [refreshPrescreening])

  return (
    <article className="panel prescreening-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>Conversational Pre-Screening Agents</span>
          <h3>Minimum criteria before scheduling</h3>
        </div>
        <StatusPill tone={latestSession?.status === 'qualified' ? 'green' : latestSession?.status === 'disqualified' ? 'red' : 'amber'}>
          {latestSession ? `${latestSession.score}% ${latestSession.status.replaceAll('_', ' ')}` : 'No session yet'}
        </StatusPill>
      </div>
      <div className="kernel-actions">
        <button disabled={isBusy || !session} onClick={runKoraPrescreen} type="button">
          <MessageSquareText size={16} aria-hidden="true" />
          Run pre-screen
        </button>
        <button disabled={isBusy || !session} onClick={refreshPrescreening} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          Refresh sessions
        </button>
      </div>
      <p className="runtime-message">{friendlyUserMessage(message)}</p>
      <div className="prescreening-grid">
        <div className="prescreening-score-card">
          <strong>{latestSession?.score ?? 0}%</strong>
          <span>{latestSession?.candidateAlias ?? 'Candidate pending'}</span>
          <p>{latestDecision?.recommendation ?? 'Run pre-screening to create a scheduling decision.'}</p>
        </div>
        <div>
          <strong>Criteria passed</strong>
          <EvidenceList items={latestDecision?.minimumCriteria.length ? latestDecision.minimumCriteria : ['No criteria checked yet']} />
        </div>
        <div>
          <strong>Risks</strong>
          <EvidenceList items={latestDecision?.risks.length ? latestDecision.risks : ['No knockout risk recorded']} />
        </div>
        <div>
          <strong>Transcript</strong>
          <div className="prescreening-transcript">
            {transcript.length ? (
              transcript.map((item) => (
                <div className="prescreening-message-row" key={item.id}>
                  <span>{item.sender}</span>
                  <p>{item.messageText}</p>
                </div>
              ))
            ) : (
              <div className="kernel-empty">No transcript yet.</div>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

function AtsSynchronizersPanel({ session }: { session: BackendSession | null }) {
  const [atsState, setAtsState] = useState<AtsSyncState | null>(null)
  const [provider, setProvider] = useState<AtsProvider>('greenhouse')
  const [message, setMessage] = useState('Start an employer workspace, then JobsFlow can prepare hiring-system connections.')
  const [isBusy, setIsBusy] = useState(false)
  const latestRun = atsState?.runs[0] ?? null
  const latestEvents = latestRun ? (atsState?.events ?? []).filter((event) => event.syncRunId === latestRun.id).slice(0, 5) : []

  const refreshAtsSync = useCallback(async () => {
    if (!session) {
      setAtsState(null)
      setMessage('Start an employer workspace first, then JobsFlow can load hiring-system connections.')
      return
    }

    setIsBusy(true)
    try {
      const result = await getAtsSyncState()
      setAtsState(result.state)
      setMessage(
        result.state.summary.providers
          ? `${result.state.summary.providers} hiring-system connection${result.state.summary.providers === 1 ? '' : 's'} ready.`
          : 'No hiring-system connections are ready yet.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'ats-sync'))
    } finally {
      setIsBusy(false)
    }
  }, [session])

  async function seedProviders() {
    if (!session) {
      setMessage('Start an employer workspace before preparing hiring-system connections.')
      return
    }

    setIsBusy(true)
    setMessage('Preparing hiring-system connections and field maps...')
    try {
      const result = await seedAtsSyncConnections()
      setAtsState(result.state)
      setMessage('Hiring-system connections are ready. External sync remains off until you connect an account.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'ats-sync'))
    } finally {
      setIsBusy(false)
    }
  }

  async function runDrySyncPlan() {
    if (!session) {
      setMessage('Start an employer workspace before checking the hiring-system sync plan.')
      return
    }

    setIsBusy(true)
    setMessage('Checking the sync plan without changing external hiring systems...')
    try {
      const result = await runAtsDrySync(provider)
      setAtsState(result.state)
      setMessage('Sync plan checked. External updates remain blocked until a connection is approved.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'ats-sync'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshAtsSync()
  }, [refreshAtsSync])

  return (
    <article className="panel ats-sync-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>Hiring-system connections</span>
          <h3>Connection rules, field maps, and test events</h3>
        </div>
        <StatusPill tone={atsState?.summary.connectedProviders ? 'green' : latestRun?.status === 'blocked' ? 'amber' : 'blue'}>
          {atsState?.summary.connectedProviders ? `${atsState.summary.connectedProviders} connected` : 'Not connected'}
        </StatusPill>
      </div>
      <div className="ats-sync-controls">
        <label>
          <span>System</span>
          <select onChange={(event) => setProvider(event.target.value as AtsProvider)} value={provider}>
            <option value="greenhouse">Greenhouse</option>
            <option value="lever">Lever</option>
            <option value="workday">Workday</option>
          </select>
        </label>
        <div className="kernel-actions">
          <button disabled={isBusy || !session} onClick={seedProviders} type="button">
            <DatabaseZap size={16} aria-hidden="true" />
            Prepare connections
          </button>
          <button disabled={isBusy || !session} onClick={runDrySyncPlan} type="button">
            <RefreshCw size={16} aria-hidden="true" />
            Run dry sync
          </button>
          <button disabled={isBusy || !session} onClick={refreshAtsSync} type="button">
            <Clock3 size={16} aria-hidden="true" />
            Refresh systems
          </button>
        </div>
      </div>
      <p className="runtime-message">{friendlyUserMessage(message)}</p>
      <div className="ats-sync-grid">
        <div>
          <strong>Connections</strong>
          {(atsState?.connections ?? []).length ? (
            atsState?.connections.map((connection) => (
              <div className="ats-connection-row" key={connection.id}>
                <StatusPill tone={connection.oauthStatus === 'connected' ? 'green' : 'amber'}>
                  {connection.oauthStatus === 'connected' ? 'connected' : 'not connected'}
                </StatusPill>
                <div>
                  <strong>{connection.accountLabel}</strong>
                  <span>{formatProductLabel(connection.provider)} / {connection.scopes.length} permission areas</span>
                </div>
              </div>
            ))
          ) : (
            <div className="kernel-empty">No hiring-system connections yet.</div>
          )}
        </div>
        <div>
          <strong>Field maps</strong>
          <EvidenceList
            items={
              atsState?.mappings.length
                ? atsState.mappings.slice(0, 5).map((mapping) => `${mapping.localEntity} -> ${mapping.remoteEntity} (${mapping.direction})`)
                : ['Prepare connections to create field maps']
            }
          />
        </div>
        <div>
          <strong>Latest sync events</strong>
          {latestEvents.length ? (
            latestEvents.map((event) => (
              <div className="ats-event-row" key={event.id}>
                <StatusPill tone={event.status === 'blocked' ? 'amber' : 'green'}>{event.status}</StatusPill>
                <div>
                  <strong>{event.eventType.replaceAll('_', ' ')}</strong>
                  <span>{formatProductLabel(event.remoteRecordRef)}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="kernel-empty">No sync events yet.</div>
          )}
        </div>
      </div>
    </article>
  )
}

function EmployerWorkspace({ session }: { session: BackendSession | null }) {
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

      <SemanticSkillMatchingPanel session={session} />

      <JobSyndicationPanel session={session} />

      <PrescreeningAgentsPanel session={session} />

      <AtsSynchronizersPanel session={session} />

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
            <span>AI action history</span>
            <h3>Owner, limit, and record</h3>
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
            <span>Launch data areas</span>
            <h3>Workspace-safe data areas for launch</h3>
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
                  <li key={field}>{formatProductLabel(field)}</li>
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
            <span>Service readiness</span>
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
  const [appView, setAppView] = useState<AppView>(() => readAppViewFromHash())
  const [automationMode, setAutomationMode] = useState(automationModes[1].name)
  const [activeOnboardingStep, setActiveOnboardingStep] = useState(onboardingSteps[0].key)
  const [session, setSession] = useState<BackendSession | null>(null)
  const [searchIntent, setSearchIntent] = useState<LandingSearchIntent | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const sso = useJobsFlowSso()

  const activeSummary = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspace)?.summary,
    [activeWorkspace],
  )

  const effectiveView: AppView = session ? 'workspace' : appView === 'workspace' ? 'auth' : appView

  function navigateToView(view: AppView, mode: 'push' | 'replace' = 'push') {
    setAppView(view)
    writeAppViewHash(view, mode)
  }

  function handleHeaderSignIn() {
    navigateToView(session ? 'workspace' : 'auth')
  }

  function handleGetStarted() {
    navigateToView('auth')
  }

  function handlePostJob() {
    setActiveWorkspace('employer')
    navigateToView(session ? 'workspace' : 'auth')
  }

  function handleHeaderWorkspaceChange(workspace: Workspace) {
    setActiveWorkspace(workspace)
    navigateToView(session ? 'workspace' : 'landing')
  }

  function handleLandingSearch(intent: LandingSearchIntent) {
    setSearchIntent(intent)
    setActiveWorkspace('candidate')
    navigateToView('auth')
  }

  function handleBrandClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    writeAuthReturnPending(false)
    navigateToView('landing')
  }

  async function handleSignOut() {
    setIsSigningOut(true)
    try {
      await deleteBackendSession()
      if (sso.isSignedIn) {
        await sso.signOut()
      }
      setSession(null)
      writeAuthReturnPending(false)
      navigateToView('landing', 'replace')
    } finally {
      setIsSigningOut(false)
    }
  }

  const searchIntentCopy = searchIntent
    ? [
        searchIntent.role ? `role: ${searchIntent.role}` : null,
        searchIntent.location ? `location: ${searchIntent.location}` : null,
      ]
        .filter(Boolean)
        .join(' / ')
    : null

  useEffect(() => {
    function handleHashChange() {
      setAppView(readAppViewFromHash())
    }

    window.addEventListener('hashchange', handleHashChange)
    window.addEventListener('popstate', handleHashChange)
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
      window.removeEventListener('popstate', handleHashChange)
    }
  }, [])

  useEffect(() => {
    if (!session) {
      return
    }

    setActiveWorkspace(session.role === 'candidate' ? 'candidate' : 'employer')
    writeAuthReturnPending(false)
    navigateToView('workspace', 'replace')
  }, [session])

  return (
    <div className="app-root">
      <header className="app-shell-header">
        <a className="brand" href="/" aria-label="JobsFlow AI home" onClick={handleBrandClick}>
          <JobsFlowLogoMark />
          <span>
            <strong>JobsFlow AI</strong>
          </span>
        </a>

        <nav className="header-nav" aria-label="JobsFlow sections">
          {workspaces.map((workspace) => (
            <WorkspaceButton
              active={workspace.id === activeWorkspace}
              key={workspace.id}
              onClick={() => handleHeaderWorkspaceChange(workspace.id)}
              workspace={workspace}
            />
          ))}
        </nav>

        <div className="header-actions">
          <button className="header-auth-link" onClick={handleHeaderSignIn} type="button">
            {session ? 'Workspace' : 'Sign in'}
          </button>
          {session ? (
            <button
              className="header-post-link"
              disabled={isSigningOut}
              onClick={handleSignOut}
              type="button"
            >
              Sign out
            </button>
          ) : (
            <button className="header-post-link" onClick={handlePostJob} type="button">
              Employers / Post Job
            </button>
          )}
        </div>
      </header>

      <main className={`app-main app-main-${effectiveView}`}>
        {effectiveView === 'landing' ? (
          <LandingHero
            onGetStarted={handleGetStarted}
            onSearch={handleLandingSearch}
          />
        ) : null}

        {effectiveView === 'auth' ? (
          <div id="secure-access" className="landing-section-anchor">
            <AuthPanel
              session={session}
              onSessionChange={setSession}
            />
          </div>
        ) : null}

        {effectiveView === 'workspace' ? (
          <>
            <section className="workspace-summary workspace-context" id="workspace" aria-label="Current workspace">
              <div>
                <span>Workspace context</span>
                <h2>{workspaces.find((workspace) => workspace.id === activeWorkspace)?.label}</h2>
                <p>
                  {searchIntentCopy
                    ? `Starting point saved from the hero search: ${searchIntentCopy}.`
                    : activeSummary}
                </p>
              </div>
              <div className="summary-controls">
                <StatusPill tone="blue">Signal over volume</StatusPill>
                <StatusPill tone="green">Consent before action</StatusPill>
                <StatusPill tone="amber">Review before automation</StatusPill>
              </div>
            </section>

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
            {activeWorkspace === 'employer' ? <EmployerWorkspace session={session} /> : null}
            {activeWorkspace === 'trust' ? (
              <TrustWorkspace session={session} onSessionChange={setSession} />
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  )
}

export default App
