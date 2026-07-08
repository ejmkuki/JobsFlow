import type { MouseEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import type { BackendSession } from './backendClient'
import { deleteBackendSession, getBackendSession } from './backendClient'
import { JobsFlowLogoMark, StatusPill, WorkspaceButton } from './components/ui'
import { automationModes } from './data/candidate'
import { workspaces } from './data/workspaces'
import { AuthPanel } from './features/auth/AuthPanel'
import { CandidateWorkspace } from './features/candidate/CandidateWorkspace'
import { EmployerWorkspace } from './features/employer/EmployerWorkspace'
import { ProductOnboarding, SignalOperationsLayer } from './features/landing'
import { LandingHero } from './features/landing'
import { TrustWorkspace } from './features/trust/TrustWorkspace'
import { DashboardShell } from './features/dashboard/DashboardShell'
import { EmployerPipelinePage } from './features/dashboard/EmployerPipelinePage'
import { EmployerJobsPage } from './features/dashboard/EmployerJobsPage'
import { useJobsFlowSso } from './jobsFlowSsoContext'
import { writeAuthReturnPending } from './lib/appView'
import { onboardingSteps } from './productModel'
import type { LandingSearchIntent, Workspace } from './types'
import './App.css'

const workspaceIds: Workspace[] = ['candidate', 'employer', 'trust']

function isWorkspaceId(value: string): value is Workspace {
  return (workspaceIds as string[]).includes(value)
}

function roleWorkspace(session: BackendSession): Workspace {
  return session.role === 'candidate' ? 'candidate' : 'employer'
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}

function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const sso = useJobsFlowSso()
  const [automationMode, setAutomationMode] = useState(automationModes[1].name)
  const [activeOnboardingStep, setActiveOnboardingStep] = useState(onboardingSteps[0].key)
  const [session, setSession] = useState<BackendSession | null>(null)
  const [searchIntent, setSearchIntent] = useState<LandingSearchIntent | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const pathId = location.pathname.slice(1)
  const activeWorkspace: Workspace = isWorkspaceId(pathId) ? pathId : 'candidate'
  const viewClass = location.pathname === '/' ? 'landing' : location.pathname === '/auth' ? 'auth' : 'workspace'
  const isEmployerDashboard = location.pathname.startsWith('/employer')

  function handleHeaderWorkspaceChange(workspace: Workspace) {
    navigate(session ? `/${workspace}` : '/')
  }

  function handleHeaderSignIn() {
    navigate(session ? `/${roleWorkspace(session)}` : '/auth')
  }

  function handleGetStarted() {
    navigate('/auth')
  }

  function handlePostJob() {
    navigate(session ? '/employer' : '/auth')
  }

  function handleLandingSearch(intent: LandingSearchIntent) {
    setSearchIntent(intent)
    navigate('/auth')
  }

  function handleBrandClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    writeAuthReturnPending(false)
    navigate('/')
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
      navigate('/', { replace: true })
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

  // Restore an existing signed session on load, so deep links to the workspace
  // or dashboard work without bouncing through the sign-in screen.
  useEffect(() => {
    let cancelled = false
    getBackendSession()
      .then((result) => {
        if (!cancelled) {
          setSession(result.session)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  // After a session is established from a public page, land the user in their
  // role workspace. Deep links into a workspace/dashboard are left in place.
  useEffect(() => {
    if (!session) {
      return
    }

    writeAuthReturnPending(false)
    if (location.pathname === '/' || location.pathname === '/auth') {
      navigate(`/${roleWorkspace(session)}`, { replace: true })
    }
  }, [session, navigate, location.pathname])

  return (
    <div className="app-root">
      {!isEmployerDashboard ? (
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
              active={workspace.id === activeWorkspace && viewClass === 'workspace'}
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
      ) : null}

      <main className={isEmployerDashboard ? 'app-main-bleed' : `app-main app-main-${viewClass}`}>
        <Routes>
          <Route
            path="/"
            element={<LandingHero onGetStarted={handleGetStarted} onSearch={handleLandingSearch} />}
          />
          <Route
            path="/auth"
            element={
              <div id="secure-access" className="landing-section-anchor">
                <AuthPanel session={session} onSessionChange={setSession} />
              </div>
            }
          />
          <Route
            path="/employer"
            element={
              !session ? (
                <Navigate replace to="/auth" />
              ) : session.role === 'candidate' ? (
                <Navigate replace to="/candidate" />
              ) : (
                <DashboardShell session={session} onSignOut={handleSignOut} />
              )
            }
          >
            <Route index element={<Navigate replace to="candidates" />} />
            <Route path="candidates" element={<EmployerPipelinePage session={session} />} />
            <Route path="jobs" element={<EmployerJobsPage session={session} />} />
            <Route path="*" element={<Navigate replace to="/employer/candidates" />} />
          </Route>
          {workspaceIds
            .filter((workspace) => workspace !== 'employer')
            .map((workspace) => (
            <Route
              key={workspace}
              path={`/${workspace}`}
              element={
                session ? (
                  <WorkspacePane
                    activeWorkspace={workspace}
                    session={session}
                    automationMode={automationMode}
                    onModeChange={setAutomationMode}
                    activeOnboardingStep={activeOnboardingStep}
                    onStepChange={setActiveOnboardingStep}
                    searchIntentCopy={searchIntentCopy}
                    onWorkspaceChange={handleHeaderWorkspaceChange}
                    onSessionChange={setSession}
                  />
                ) : (
                  <Navigate replace to="/auth" />
                )
              }
            />
          ))}
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </main>
    </div>
  )
}

type WorkspacePaneProps = {
  activeWorkspace: Workspace
  session: BackendSession
  automationMode: string
  onModeChange: (mode: string) => void
  activeOnboardingStep: string
  onStepChange: (step: string) => void
  searchIntentCopy: string | null
  onWorkspaceChange: (workspace: Workspace) => void
  onSessionChange: (session: BackendSession | null) => void
}

function WorkspacePane({
  activeWorkspace,
  session,
  automationMode,
  onModeChange,
  activeOnboardingStep,
  onStepChange,
  searchIntentCopy,
  onWorkspaceChange,
  onSessionChange,
}: WorkspacePaneProps) {
  const activeSummary = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspace)?.summary,
    [activeWorkspace],
  )

  return (
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

      <ProductOnboarding activeStep={activeOnboardingStep} onStepChange={onStepChange} />

      <SignalOperationsLayer activeWorkspace={activeWorkspace} onWorkspaceChange={onWorkspaceChange} />

      {activeWorkspace === 'candidate' ? (
        <CandidateWorkspace automationMode={automationMode} onModeChange={onModeChange} session={session} />
      ) : null}
      {activeWorkspace === 'employer' ? <EmployerWorkspace session={session} /> : null}
      {activeWorkspace === 'trust' ? (
        <TrustWorkspace session={session} onSessionChange={onSessionChange} />
      ) : null}
    </>
  )
}

export default App
