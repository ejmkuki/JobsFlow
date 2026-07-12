import type { MouseEvent } from 'react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import type { BackendSession } from './backendClient'
import { deleteBackendSession, getBackendSession } from './backendClient'
import { JobsFlowLogoMark, StatusPill, WorkspaceButton } from './components/ui'
import { workspaces } from './data/workspaces'
import { AuthPanel } from './features/auth/AuthPanel'
import { ProductOnboarding, SignalOperationsLayer } from './features/landing'
import { LandingHero } from './features/landing'
import { TrustWorkspace } from './features/trust/TrustWorkspace'
import { useJobsFlowSso } from './jobsFlowSsoContext'
import { writeAuthReturnPending } from './lib/appView'
import { onboardingSteps } from './productModel'
import type { LandingSearchIntent, Workspace } from './types'
import './App.css'

// The candidate and employer dashboards are the bulk of the app; lazy-load
// them so the landing page and sign-in ship a much smaller initial bundle.
const AppTopNav = lazy(() => import('./features/dashboard/AppTopNav').then((m) => ({ default: m.AppTopNav })))
const CandidateHomePage = lazy(() =>
  import('./features/dashboard/CandidateHomePage').then((m) => ({ default: m.CandidateHomePage })),
)
const CandidateJobsPage = lazy(() =>
  import('./features/dashboard/CandidateJobsPage').then((m) => ({ default: m.CandidateJobsPage })),
)
const CandidateApplicationsPage = lazy(() =>
  import('./features/dashboard/CandidateApplicationsPage').then((m) => ({ default: m.CandidateApplicationsPage })),
)
const CandidateProfilePage = lazy(() =>
  import('./features/dashboard/CandidateProfilePage').then((m) => ({ default: m.CandidateProfilePage })),
)
const EmployerPipelinePage = lazy(() =>
  import('./features/dashboard/EmployerPipelinePage').then((m) => ({ default: m.EmployerPipelinePage })),
)
const EmployerJobsPage = lazy(() =>
  import('./features/dashboard/EmployerJobsPage').then((m) => ({ default: m.EmployerJobsPage })),
)
const TeamPage = lazy(() => import('./features/dashboard/TeamPage').then((m) => ({ default: m.TeamPage })))
const ActivityPage = lazy(() => import('./features/dashboard/ActivityPage').then((m) => ({ default: m.ActivityPage })))

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
  const [activeOnboardingStep, setActiveOnboardingStep] = useState(onboardingSteps[0].key)
  const [session, setSession] = useState<BackendSession | null>(null)
  const [searchIntent, setSearchIntent] = useState<LandingSearchIntent | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const pathId = location.pathname.slice(1)
  const activeWorkspace: Workspace = isWorkspaceId(pathId) ? pathId : 'candidate'
  const viewClass = location.pathname === '/' ? 'landing' : location.pathname === '/auth' ? 'auth' : 'workspace'
  const isDashboard = location.pathname.startsWith('/employer') || location.pathname.startsWith('/candidate')

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
      {!isDashboard ? (
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

      <main className={isDashboard ? 'app-main-bleed' : `app-main app-main-${viewClass}`}>
        <Suspense fallback={null}>
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
            path="/candidate"
            element={session ? <AppTopNav session={session} onSignOut={handleSignOut} /> : <Navigate replace to="/auth" />}
          >
            <Route index element={<CandidateHomePage session={session} />} />
            <Route path="jobs" element={<CandidateJobsPage session={session} />} />
            <Route path="applications" element={<CandidateApplicationsPage session={session} />} />
            <Route path="profile" element={<CandidateProfilePage session={session} />} />
            <Route path="activity" element={<ActivityPage session={session} />} />
            <Route path="*" element={<Navigate replace to="/candidate" />} />
          </Route>
          <Route
            path="/employer"
            element={session ? <AppTopNav session={session} onSignOut={handleSignOut} /> : <Navigate replace to="/auth" />}
          >
            <Route index element={<Navigate replace to="candidates" />} />
            <Route path="candidates" element={<EmployerPipelinePage session={session} />} />
            <Route path="jobs" element={<EmployerJobsPage session={session} />} />
            <Route path="team" element={<TeamPage session={session} />} />
            <Route path="activity" element={<ActivityPage session={session} />} />
            <Route path="*" element={<Navigate replace to="/employer/candidates" />} />
          </Route>
          <Route
            path="/trust"
            element={
              session ? (
                <WorkspacePane
                  activeWorkspace="trust"
                  session={session}
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
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
        </Suspense>
      </main>
    </div>
  )
}

type WorkspacePaneProps = {
  activeWorkspace: Workspace
  session: BackendSession
  activeOnboardingStep: string
  onStepChange: (step: string) => void
  searchIntentCopy: string | null
  onWorkspaceChange: (workspace: Workspace) => void
  onSessionChange: (session: BackendSession | null) => void
}

// Trust & compliance page, rendered under the classic header chrome.
function WorkspacePane({
  activeWorkspace,
  session,
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

      <TrustWorkspace session={session} onSessionChange={onSessionChange} />
    </>
  )
}

export default App
