import { AuthenticateWithRedirectCallback, ClerkProvider, useAuth, useClerk, useSignIn, useUser } from '@clerk/clerk-react'
import { useEffect, useState, type ReactNode } from 'react'
import { disabledSso, JobsFlowSsoContext, type JobsFlowSsoProviderKey } from './jobsFlowSsoContext'

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
  google: 'oauth_google',
} as const

function ClerkBridge({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const { openSignIn, openSignUp, signOut } = useClerk()
  const { isLoaded: isSignInLoaded, signIn } = useSignIn()
  const { user } = useUser()
  const [loadTimedOut, setLoadTimedOut] = useState(false)

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
  const redirectUrlComplete = window.location.href
  const redirectUrl = `${window.location.origin}/sso-callback`

  async function openProviderSignIn(provider: JobsFlowSsoProviderKey) {
    if (provider === 'email') {
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

    delete document.documentElement.dataset.jobsflowClerkMode
    if (!isSignInLoaded || !signIn) {
      openSignIn({
        appearance: jobsFlowClerkAppearance,
        fallbackRedirectUrl: redirectUrlComplete,
        forceRedirectUrl: redirectUrlComplete,
        signUpFallbackRedirectUrl: redirectUrlComplete,
        withSignUp: true,
      })
      return
    }

    await signIn.authenticateWithRedirect({
      continueSignIn: true,
      continueSignUp: true,
      redirectUrl,
      redirectUrlComplete,
      strategy: oauthStrategyByProvider[provider],
    })
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
          delete document.documentElement.dataset.jobsflowClerkMode
          openSignIn({
            appearance: jobsFlowClerkAppearance,
            fallbackRedirectUrl: window.location.href,
            forceRedirectUrl: window.location.href,
            signUpFallbackRedirectUrl: window.location.href,
            withSignUp: true,
          })
        },
        openSignUp: () => {
          document.documentElement.dataset.jobsflowClerkMode = 'signup'
          openSignUp({
            appearance: emailOnlyClerkAppearance,
            fallbackRedirectUrl: window.location.href,
            forceRedirectUrl: window.location.href,
            signInFallbackRedirectUrl: window.location.href,
          })
        },
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
        <AuthenticateWithRedirectCallback />
      ) : (
        <ClerkBridge>{children}</ClerkBridge>
      )}
    </ClerkProvider>
  )
}
