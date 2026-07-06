import { AuthenticateWithRedirectCallback, ClerkProvider, useAuth, useClerk, useSignIn, useUser } from '@clerk/clerk-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  disabledSso,
  JobsFlowSsoContext,
  type JobsFlowEmailSignInOptions,
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

function getFutureSignIn(signIn: unknown) {
  return (signIn as ClerkSignInWithFuture | null | undefined)?.__internal_future
}

function providerFromStrategy(strategy: string): JobsFlowSsoProviderKey | undefined {
  return (Object.entries(oauthStrategyByProvider).find(([, value]) => value === strategy)?.[0] ??
    undefined) as JobsFlowSsoProviderKey | undefined
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
  const { isLoaded: isSignInLoaded, setActive, signIn } = useSignIn()
  const { user } = useUser()
  const [loadTimedOut, setLoadTimedOut] = useState(false)
  const emailSignInAttempt = useRef<ClerkAttemptResult | null>(null)

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
  const redirectUrlComplete = `${window.location.origin}/#workspace`
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
      throw new Error('Secure provider sign-in is still loading. Try again in a moment.')
    }

    const strategy = oauthStrategyByProvider[provider as keyof typeof oauthStrategyByProvider]
    const futureSignIn = getFutureSignIn(signIn)
    let futureSsoError: unknown = null
    if (futureSignIn?.sso) {
      try {
        const result = await futureSignIn.sso({
          redirectCallbackUrl: redirectUrl,
          redirectUrl: redirectUrlComplete,
          strategy,
        })
        if (result.error) {
          throw result.error
        }
        return
      } catch (error) {
        futureSsoError = error
      }
    }

    const redirectSignIn = (signIn as ClerkSignInWithFuture).authenticateWithRedirect
    if (!redirectSignIn) {
      if (futureSsoError) {
        throw futureSsoError
      }
      throw new Error('Secure provider sign-in is unavailable. Refresh the page and try again.')
    }

    await redirectSignIn({
      continueSignIn: true,
      continueSignUp: true,
      redirectUrl,
      redirectUrlComplete,
      strategy,
    })
  }

  async function prepareEmailSignIn(identifier: string): Promise<JobsFlowEmailSignInOptions> {
    if (!isSignInLoaded || !signIn) {
      throw new Error('Secure sign-in is still loading. Try again in a moment.')
    }

    const attempt = await (signIn as ClerkSignInWithFuture).create?.({ identifier })
    if (!attempt) {
      throw new Error('Secure sign-in could not initialize. Try again in a moment.')
    }

    emailSignInAttempt.current = attempt
    const firstFactors = attempt.supportedFirstFactors ?? []
    if (firstFactors.some((factor) => factor.strategy === 'password')) {
      return { method: 'password' }
    }

    const emailCodeFactor = firstFactors.find(
      (factor) => factor.strategy === 'email_code' && factor.emailAddressId,
    )
    if (emailCodeFactor?.emailAddressId) {
      await attempt.prepareFirstFactor?.({
        emailAddressId: emailCodeFactor.emailAddressId,
        strategy: 'email_code',
      })
      return {
        method: 'email_code',
        safeIdentifier: emailCodeFactor.safeIdentifier,
      }
    }

    const oauthFactor = firstFactors.find((factor) => factor.strategy.startsWith('oauth_'))
    return {
      method: 'oauth_only',
      provider: oauthFactor ? providerFromStrategy(oauthFactor.strategy) : undefined,
    }
  }

  async function signInWithEmailCode(code: string) {
    if (!isSignInLoaded || !signIn || !setActive) {
      throw new Error('Secure sign-in is still loading. Try again in a moment.')
    }

    markAuthReturnPending()
    const attempt = emailSignInAttempt.current ?? (signIn as ClerkAttemptResult)
    const result = await attempt.attemptFirstFactor?.({
      code,
      strategy: 'email_code',
    })

    if (!result || result.status !== 'complete' || !result.createdSessionId) {
      throw new Error('That code could not complete sign-in. Check the code and try again.')
    }

    await setActive({ session: result.createdSessionId })
  }

  async function signInWithPassword(identifier: string, password: string) {
    if (!isSignInLoaded || !signIn || !setActive) {
      throw new Error('Secure sign-in is still loading. Try again in a moment.')
    }

    markAuthReturnPending()

    const currentAttempt = emailSignInAttempt.current
    if (currentAttempt?.attemptFirstFactor) {
      const result = await currentAttempt.attemptFirstFactor({
        password,
        strategy: 'password',
      })

      if (!result || result.status !== 'complete' || !result.createdSessionId) {
        throw new Error('JobsFlow needs another verification step before this session can open.')
      }

      await setActive({ session: result.createdSessionId })
      return
    }

    const futureSignIn = getFutureSignIn(signIn)
    if (futureSignIn?.password && futureSignIn.finalize) {
      const passwordResult = await futureSignIn.password({ identifier, password })
      if (passwordResult.error) {
        throw passwordResult.error
      }
      const finalizeResult = await futureSignIn.finalize()
      if (finalizeResult.error) {
        throw finalizeResult.error
      }
      return
    }

    const result = await (signIn as ClerkSignInWithFuture).create?.({
      identifier,
      strategy: 'password',
      password,
    })

    if (!result || result.status !== 'complete' || !result.createdSessionId) {
      throw new Error('JobsFlow needs another verification step before this session can open.')
    }

    await setActive({ session: result.createdSessionId })
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
        prepareEmailSignIn,
        signInWithEmailCode,
        signInWithPassword,
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
          signInFallbackRedirectUrl="/#workspace"
          signInForceRedirectUrl="/#workspace"
          signInUrl="/#signin"
          signUpFallbackRedirectUrl="/#workspace"
          signUpForceRedirectUrl="/#workspace"
          signUpUrl="/#signin"
        />
      ) : (
        <ClerkBridge>{children}</ClerkBridge>
      )}
    </ClerkProvider>
  )
}
