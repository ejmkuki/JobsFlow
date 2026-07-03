import { ClerkProvider, useAuth, useClerk, useUser } from '@clerk/clerk-react'
import { useEffect, useState, type ReactNode } from 'react'
import { disabledSso, JobsFlowSsoContext } from './jobsFlowSsoContext'

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

function ClerkBridge({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const { openSignIn, signOut } = useClerk()
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

  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? null
  const displayName = user?.fullName ?? user?.username ?? email

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
        openSignIn: () =>
          openSignIn({
            appearance: jobsFlowClerkAppearance,
            fallbackRedirectUrl: window.location.href,
            forceRedirectUrl: window.location.href,
            signUpFallbackRedirectUrl: window.location.href,
            withSignUp: true,
          }),
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
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProvider>
  )
}
