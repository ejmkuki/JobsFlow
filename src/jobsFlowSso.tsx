import { AuthenticateWithRedirectCallback, ClerkProvider, useAuth, useClerk, useSignIn, useSignUp, useUser } from '@clerk/clerk-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { isMissingEmailAccountError } from './lib/ssoErrors'
import {
  disabledSso,
  JobsFlowSsoContext,
  type JobsFlowEmailCodeMode,
  type JobsFlowSsoProviderKey,
} from './jobsFlowSsoContext'

const jobsFlowClerkAppearance = {
  elements: {
    cardBox: {
      borderRadius: '8px',
      boxShadow: '0 24px 70px rgba(14, 116, 144, 0.18)',
    },
    formButtonPrimary: {
      backgroundColor: '#0284c7',
      borderRadius: '8px',
      fontWeight: 750,
    },
    socialButtonsBlockButton: {
      borderColor: '#bae6fd',
      borderRadius: '8px',
      color: '#0f172a',
      fontWeight: 700,
    },
    otpCodeField: {
      display: 'flex',
      gap: '6px',
      justifyContent: 'center',
      marginLeft: 'auto',
      marginRight: 'auto',
      width: '100%',
    },
    otpCodeFieldInput: {
      borderColor: '#bae6fd',
      borderRadius: '8px',
      boxSizing: 'border-box',
      flex: '0 0 36px',
      fontSize: '1.08rem',
      fontWeight: 800,
      height: '44px',
      maxWidth: '36px',
      minWidth: '36px',
      textAlign: 'center',
      width: '36px',
    },
  },
  variables: {
    borderRadius: '8px',
    colorBackground: '#ffffff',
    colorBorder: '#dbeafe',
    colorForeground: '#0f172a',
    colorInput: '#f8fbff',
    colorInputForeground: '#0f172a',
    colorMuted: '#eef8ff',
    colorMutedForeground: '#475569',
    colorPrimary: '#0284c7',
    colorPrimaryForeground: '#ffffff',
    colorRing: '#38bdf8',
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
}

const emailOnlyClerkAppearance = {
  ...jobsFlowClerkAppearance,
  elements: {
    ...jobsFlowClerkAppearance.elements,
    dividerRow: {
      display: 'none',
    },
    socialButtonsRoot: {
      display: 'none',
    },
  },
}

const oauthStrategyByProvider = {
  apple: 'oauth_apple',
  facebook: 'oauth_facebook',
  github: 'oauth_github',
  google: 'oauth_google',
  linkedin_oidc: 'oauth_linkedin_oidc',
  microsoft: 'oauth_microsoft',
  x: 'oauth_x',
} as const

type ClerkFactor = {
  emailAddressId?: string
  safeIdentifier?: string
  strategy: string
}

type ClerkAttemptResult = {
  createdSessionId?: string | null
  status?: string | null
  supportedFirstFactors?: ClerkFactor[] | null
  attemptFirstFactor?: (params: { code?: string; password?: string; strategy: string }) => Promise<ClerkAttemptResult>
  prepareFirstFactor?: (params: { emailAddressId?: string; strategy: string }) => Promise<ClerkAttemptResult>
}

type ClerkFutureFlow = {
  emailCode?: {
    sendCode?: (params: { emailAddress?: string; emailAddressId?: string }) => Promise<{ error: unknown | null }>
    verifyCode?: (params: { code: string }) => Promise<{ error: unknown | null }>
  }
  finalize?: () => Promise<{ error: unknown | null }>
  password?: (params: { identifier: string; password: string }) => Promise<{ error: unknown | null }>
  sso?: (params: { redirectCallbackUrl: string; redirectUrl: string; strategy: string }) => Promise<{ error: unknown | null }>
}

type ClerkSignInWithFuture = ClerkAttemptResult & {
  __internal_future?: ClerkFutureFlow
  authenticateWithRedirect?: (params: {
    continueSignIn?: boolean
    continueSignUp?: boolean
    redirectUrl: string
    redirectUrlComplete: string
    strategy: string
  }) => Promise<void>
  create?: (params: Record<string, unknown>) => Promise<ClerkAttemptResult>
}

const authReturnStorageKey = 'jobsflow.auth.return.pending'

function markAuthReturnPending() {
  try {
    window.sessionStorage.setItem(authReturnStorageKey, '1')
  } catch {
    // Session storage can be unavailable in hardened browser modes.
  }
}

function ClerkBridge({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const { openSignIn, openSignUp, signOut } = useClerk()
  const { isLoaded: isSignInLoaded, setActive: setActiveSignIn, signIn } = useSignIn()
  const { isLoaded: isSignUpLoaded, setActive: setActiveSignUp, signUp } = useSignUp()
  const { user } = useUser()
  const [loadTimedOut, setLoadTimedOut] = useState(false)
  const emailFlowMode = useRef<JobsFlowEmailCodeMode | null>(null)
  const emailFlowAddressId = useRef<string | null>(null)

  useEffect(() => {
    if (isLoaded) {
      setLoadTimedOut(false)
      return
    }

    const timer = window.setTimeout(() => setLoadTimedOut(true), 12000)
    return () => window.clearTimeout(timer)
  }, [isLoaded])

  useEffect(() => {
    function syncClerkStep() {
      const mode = document.documentElement.dataset.jobsflowClerkMode
      const modalText = document.querySelector('.cl-modalContent, .cl-card')?.textContent ?? ''
      const isSignupVerification =
        mode === 'signup' &&
        (modalText.includes('Verify your email') || modalText.includes('verification code sent to your email'))

      if (isSignupVerification) {
        document.documentElement.dataset.jobsflowClerkStep = 'signup-verification'
      } else if (document.documentElement.dataset.jobsflowClerkStep === 'signup-verification') {
        delete document.documentElement.dataset.jobsflowClerkStep
      }
    }

    syncClerkStep()
    const observer = new MutationObserver(syncClerkStep)
    observer.observe(document.body, { childList: true, characterData: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? null
  const displayName = user?.fullName ?? user?.username ?? email
  const redirectUrlComplete = `${window.location.origin}/auth`
  const redirectUrl = `${window.location.origin}/sso-callback`

  async function openProviderSignIn(provider: JobsFlowSsoProviderKey) {
    if (provider === 'email') {
      markAuthReturnPending()
      document.documentElement.dataset.jobsflowClerkMode = 'email'
      openSignIn({
        appearance: emailOnlyClerkAppearance,
        fallbackRedirectUrl: redirectUrlComplete,
        forceRedirectUrl: redirectUrlComplete,
        signUpFallbackRedirectUrl: redirectUrlComplete,
        withSignUp: true,
      })
      return
    }

    if (!(provider in oauthStrategyByProvider)) {
      markAuthReturnPending()
      openSignIn({
        appearance: jobsFlowClerkAppearance,
        fallbackRedirectUrl: redirectUrlComplete,
        forceRedirectUrl: redirectUrlComplete,
        signUpFallbackRedirectUrl: redirectUrlComplete,
        withSignUp: true,
      })
      return
    }

    markAuthReturnPending()
    delete document.documentElement.dataset.jobsflowClerkMode
    if (!isSignInLoaded || !signIn) {
      throw new Error('Sign-in is still getting ready. Please try again in a moment.')
    }

    const strategy = oauthStrategyByProvider[provider as keyof typeof oauthStrategyByProvider]
    const redirectSignIn = (signIn as ClerkSignInWithFuture).authenticateWithRedirect
    if (!redirectSignIn) {
      throw new Error('We could not start sign-in. Refresh the page and try again.')
    }

    await redirectSignIn({
      continueSignIn: true,
      continueSignUp: true,
      redirectUrl,
      redirectUrlComplete,
      strategy,
    })
  }

  // Passwordless email: one entry point that signs in an existing account or
  // creates a new one, always by emailing a one-time code.
  async function startEmailCode(rawEmail: string): Promise<{ mode: JobsFlowEmailCodeMode }> {
    if (!isSignInLoaded || !signIn || !isSignUpLoaded || !signUp) {
      throw new Error('Sign-in is still getting ready. Please try again in a moment.')
    }

    markAuthReturnPending()
    const emailAddress = rawEmail.trim().toLowerCase()

    try {
      const attempt = await signIn.create({ identifier: emailAddress })
      const factor = attempt.supportedFirstFactors?.find((candidate) => candidate.strategy === 'email_code')
      if (factor && 'emailAddressId' in factor && factor.emailAddressId) {
        await signIn.prepareFirstFactor({ strategy: 'email_code', emailAddressId: factor.emailAddressId })
        emailFlowMode.current = 'sign_in'
        emailFlowAddressId.current = factor.emailAddressId
        return { mode: 'sign_in' }
      }
      throw new Error('This email is linked to a social account. Use Google or Apple above.')
    } catch (error) {
      if (isMissingEmailAccountError(error)) {
        await signUp.create({ emailAddress })
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
        emailFlowMode.current = 'sign_up'
        emailFlowAddressId.current = null
        return { mode: 'sign_up' }
      }
      throw error
    }
  }

  async function verifyEmailCode(code: string) {
    const trimmed = code.trim()

    if (emailFlowMode.current === 'sign_up') {
      if (!signUp || !setActiveSignUp) {
        throw new Error('Sign-up is still getting ready. Please try again in a moment.')
      }
      const result = await signUp.attemptEmailAddressVerification({ code: trimmed })
      if (result.status !== 'complete' || !result.createdSessionId) {
        throw new Error('That code did not complete sign-up. Check the code and try again.')
      }
      await setActiveSignUp({ session: result.createdSessionId })
      return
    }

    if (!signIn || !setActiveSignIn) {
      throw new Error('Sign-in is still getting ready. Please try again in a moment.')
    }
    const result = await signIn.attemptFirstFactor({ strategy: 'email_code', code: trimmed })
    if (result.status !== 'complete' || !result.createdSessionId) {
      throw new Error('That code did not complete sign-in. Check the code and try again.')
    }
    await setActiveSignIn({ session: result.createdSessionId })
  }

  async function resendEmailCode() {
    if (emailFlowMode.current === 'sign_up') {
      if (!signUp) {
        throw new Error('Start again to resend a code.')
      }
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      return
    }

    if (!signIn || !emailFlowAddressId.current) {
      throw new Error('Start again to resend a code.')
    }
    await signIn.prepareFirstFactor({ strategy: 'email_code', emailAddressId: emailFlowAddressId.current })
  }

  return (
    <JobsFlowSsoContext.Provider
      value={{
        configured: true,
        displayName,
        email,
        getToken: () => getToken(),
        isLoaded,
        isSignedIn: Boolean(isSignedIn),
        loadTimedOut,
        openProviderSignIn,
        openSignIn: () => {
          markAuthReturnPending()
          delete document.documentElement.dataset.jobsflowClerkMode
          openSignIn({
            appearance: jobsFlowClerkAppearance,
            fallbackRedirectUrl: redirectUrlComplete,
            forceRedirectUrl: redirectUrlComplete,
            signUpFallbackRedirectUrl: redirectUrlComplete,
            withSignUp: true,
          })
        },
        openSignUp: (initialEmail?: string) => {
          markAuthReturnPending()
          document.documentElement.dataset.jobsflowClerkMode = 'signup'
          const trimmedInitialEmail = initialEmail?.trim()
          openSignUp({
            appearance: emailOnlyClerkAppearance,
            fallbackRedirectUrl: redirectUrlComplete,
            forceRedirectUrl: redirectUrlComplete,
            initialValues: trimmedInitialEmail ? { emailAddress: trimmedInitialEmail } : undefined,
            signInFallbackRedirectUrl: redirectUrlComplete,
          })
        },
        startEmailCode,
        verifyEmailCode,
        resendEmailCode,
        signOut: () => signOut(),
      }}
    >
      {children}
    </JobsFlowSsoContext.Provider>
  )
}

export function JobsFlowSsoProvider({ children }: { children: ReactNode }) {
  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

  if (!publishableKey) {
    return <JobsFlowSsoContext.Provider value={disabledSso}>{children}</JobsFlowSsoContext.Provider>
  }

  return (
    <ClerkProvider afterSignOutUrl="/" appearance={jobsFlowClerkAppearance} publishableKey={publishableKey}>
      {window.location.pathname === '/sso-callback' ? (
        <AuthenticateWithRedirectCallback
          signInFallbackRedirectUrl="/auth"
          signInForceRedirectUrl="/auth"
          signInUrl="/auth"
          signUpFallbackRedirectUrl="/auth"
          signUpForceRedirectUrl="/auth"
          signUpUrl="/auth"
        />
      ) : (
        <ClerkBridge>{children}</ClerkBridge>
      )}
    </ClerkProvider>
  )
}
