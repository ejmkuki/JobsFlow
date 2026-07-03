import { ClerkProvider, useAuth, useClerk, useUser } from '@clerk/clerk-react'
import type { ReactNode } from 'react'
import { disabledSso, JobsFlowSsoContext } from './jobsFlowSsoContext'

function ClerkBridge({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const { openSignIn, signOut } = useClerk()
  const { user } = useUser()

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
        openSignIn: () => openSignIn(),
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
    <ClerkProvider afterSignOutUrl="/" publishableKey={publishableKey}>
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProvider>
  )
}
