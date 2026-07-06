import type { BackendSession } from '../../backendClient'
import { createJobsFlowSession, deleteBackendSession, getBackendSession, humanizeJobsFlowError } from '../../backendClient'
import { ArrowRight, LogOut, RefreshCw } from 'lucide-react'
import { JobsFlowLogoMark, StatusPill } from '../../components/ui'
import { friendlyUserMessage } from '../../lib/format'
import { candidateActivationChecklist } from '../../data/candidate'
import { employerActivationChecklist, employerActivationPreview } from '../../data/employer'
import { ResumeStoragePanel } from '../shared/ResumeStoragePanel'
import type { JobsFlowSsoProviderKey } from '../../jobsFlowSsoContext'
import { useJobsFlowSso } from '../../jobsFlowSsoContext'
import { writeAuthReturnPending } from '../../lib/appView'
import { humanizeSsoError, isMissingEmailAccountError } from '../../lib/ssoErrors'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

export const ssoProviderActions: Array<{ key: JobsFlowSsoProviderKey; label: string }> = [
  { key: 'google', label: 'Google' },
  { key: 'apple', label: 'Apple' },
  { key: 'linkedin_oidc', label: 'LinkedIn' },
  { key: 'microsoft', label: 'Microsoft' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'github', label: 'GitHub' },
  { key: 'x', label: 'X' },
  { key: 'email', label: 'Email' },
]

export const productionOauthProviderKeys = new Set<JobsFlowSsoProviderKey>(['google', 'apple'])

export const ssoProviderIconText: Record<JobsFlowSsoProviderKey, string> = {
  apple: 'A',
  email: '@',
  facebook: 'f',
  github: 'GH',
  google: 'G',
  linkedin_oidc: 'in',
  microsoft: 'M',
  x: 'X',
}

export function AuthPanel({
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
