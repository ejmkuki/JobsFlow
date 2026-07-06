import type { BackendSession } from '../../backendClient'
import { createJobsFlowSession, deleteBackendSession, getBackendSession, humanizeJobsFlowError } from '../../backendClient'
import { candidateActivationChecklist } from '../../data/candidate'
import { employerActivationChecklist } from '../../data/employer'
import type { JobsFlowSsoProviderKey } from '../../jobsFlowSsoContext'
import { useJobsFlowSso } from '../../jobsFlowSsoContext'
import { writeAuthReturnPending } from '../../lib/appView'
import { humanizeSsoError, isMissingEmailAccountError } from '../../lib/ssoErrors'
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
    return (
      <AuthGateway
        sso={sso}
        email={email}
        password={password}
        emailCode={emailCode}
        emailSignInStep={emailSignInStep}
        showInlineSignUp={showInlineSignUp}
        message={message}
        isBusy={isBusy}
        onEmailChange={(value) => {
          setEmail(value)
          setPassword('')
          setEmailCode('')
          setEmailSignInStep('email')
          setShowInlineSignUp(false)
        }}
        onPasswordChange={(value) => {
          setPassword(value)
          setShowInlineSignUp(false)
        }}
        onCodeChange={(value) => {
          setEmailCode(value)
          setShowInlineSignUp(false)
        }}
        onSubmit={handleEmailContinue}
        onProviderSignIn={handleProviderSignIn}
        onInlineSignUp={handleInlineSignUp}
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
