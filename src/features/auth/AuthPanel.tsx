import type { BackendSession } from '../../backendClient'
import { createJobsFlowSession, deleteBackendSession, getBackendSession, humanizeJobsFlowError } from '../../backendClient'
import { candidateActivationChecklist } from '../../data/candidate'
import { employerActivationChecklist } from '../../data/employer'
import type { JobsFlowSsoProviderKey } from '../../jobsFlowSsoContext'
import { useJobsFlowSso } from '../../jobsFlowSsoContext'
import { writeAuthReturnPending } from '../../lib/appView'
import { humanizeSsoError } from '../../lib/ssoErrors'
import { AuthGateway } from './AuthGateway'
import { WorkspaceReadyView } from './WorkspaceReadyView'
import { ssoProviderActions } from './ssoProviders'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'

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
  const [emailStep, setEmailStep] = useState<'email' | 'code'>('email')
  const [emailMode, setEmailMode] = useState<'sign_in' | 'sign_up'>('sign_in')
  const [emailCode, setEmailCode] = useState('')
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

  // One submit handles both steps: request a code, then verify it. New emails
  // create an account; existing ones sign in. No password.
  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (emailStep === 'email') {
      const normalizedEmail = email.trim()
      if (!normalizedEmail) {
        setMessage('Enter your email address to continue.')
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

      setEmail(normalizedEmail)
      setIsBusy(true)
      setMessage(`Sending a sign-in code to ${normalizedEmail}...`)
      try {
        const { mode } = await sso.startEmailCode(normalizedEmail)
        setEmailMode(mode)
        setEmailCode('')
        setEmailStep('code')
        setMessage(`We sent a 6-digit code to ${normalizedEmail}. Enter it below.`)
      } catch (error) {
        setMessage(humanizeSsoError(error, 'We could not send a code to this email. Please try again.'))
      } finally {
        setIsBusy(false)
      }
      return
    }

    const code = emailCode.trim()
    if (!code) {
      setMessage('Enter the 6-digit code from your email.')
      return
    }

    setIsBusy(true)
    setAuthReturnPending(true)
    setMessage('Checking your code...')
    try {
      await sso.verifyEmailCode(code)
      autoSsoSessionAttempted.current = false
      setMessage(
        emailMode === 'sign_up'
          ? 'Account created. Opening your JobsFlow workspace...'
          : 'Signed in. Opening your JobsFlow workspace...',
      )
    } catch (error) {
      setAuthReturnPending(false)
      setMessage(humanizeSsoError(error, 'That code did not work. Check it and try again.'))
    } finally {
      setIsBusy(false)
    }
  }

  async function handleResendCode() {
    if (emailStep !== 'code') {
      return
    }

    setIsBusy(true)
    setMessage('Sending a new code...')
    try {
      await sso.resendEmailCode()
      setMessage(`New code sent to ${email}. Enter it below.`)
    } catch (error) {
      setMessage(humanizeSsoError(error, 'We could not resend the code. Please try again.'))
    } finally {
      setIsBusy(false)
    }
  }

  function handleChangeEmail() {
    setEmailStep('email')
    setEmailCode('')
    setMessage('Enter your email to get a sign-in code.')
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
    return (
      <AuthGateway
        sso={sso}
        email={email}
        emailCode={emailCode}
        emailStep={emailStep}
        emailMode={emailMode}
        accountType={accountType}
        message={message}
        isBusy={isBusy}
        onAccountTypeChange={setAccountType}
        onEmailChange={setEmail}
        onCodeChange={setEmailCode}
        onSubmit={handleEmailSubmit}
        onResend={handleResendCode}
        onChangeEmail={handleChangeEmail}
        onProviderSignIn={handleProviderSignIn}
      />
    )
  }

  return (
    <WorkspaceReadyView
      session={session}
      accountType={accountType}
      selectedChecklist={selectedChecklist}
      message={message}
      isBusy={isBusy}
      onRefresh={checkSession}
      onSignOut={handleSignOut}
    />
  )
}
