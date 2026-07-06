import type { BackendSession } from './backendClient'
import { deleteBackendSession } from './backendClient'
import { JobsFlowLogoMark, StatusPill, WorkspaceButton } from './components/ui'
import { automationModes } from './data/candidate'
import { workspaces } from './data/workspaces'
import { AuthPanel } from './features/auth/AuthPanel'
import { CandidateWorkspace } from './features/candidate/CandidateWorkspace'
import { EmployerWorkspace } from './features/employer/EmployerWorkspace'
import { LandingHero, ProductOnboarding, SignalOperationsLayer } from './features/landing'
import { TrustWorkspace } from './features/trust/TrustWorkspace'
import { useJobsFlowSso } from './jobsFlowSsoContext'
import { readAppViewFromHash, writeAppViewHash, writeAuthReturnPending } from './lib/appView'
import { onboardingSteps } from './productModel'
import type { MouseEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { AppView, LandingSearchIntent, Workspace } from './types'
import './App.css'

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
