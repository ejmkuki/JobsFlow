import { createContext, useContext } from 'react'

export type JobsFlowSsoProviderKey = 'apple' | 'email' | 'google'

export type JobsFlowSsoContextValue = {
  configured: boolean
  displayName: string | null
  email: string | null
  getToken: () => Promise<string | null>
  isLoaded: boolean
  isSignedIn: boolean
  loadTimedOut: boolean
  openSignIn: () => void
  openSignUp: () => void
  openProviderSignIn: (provider: JobsFlowSsoProviderKey) => Promise<void>
  signOut: () => Promise<void>
}

export const disabledSso: JobsFlowSsoContextValue = {
  configured: false,
  displayName: null,
  email: null,
  getToken: async () => null,
  isLoaded: true,
  isSignedIn: false,
  loadTimedOut: false,
  openSignIn: () => undefined,
  openSignUp: () => undefined,
  openProviderSignIn: async () => undefined,
  signOut: async () => undefined,
}

export const JobsFlowSsoContext = createContext<JobsFlowSsoContextValue>(disabledSso)

export function useJobsFlowSso() {
  return useContext(JobsFlowSsoContext)
}
