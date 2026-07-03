import { createContext, useContext } from 'react'

export type JobsFlowSsoContextValue = {
  configured: boolean
  displayName: string | null
  email: string | null
  getToken: () => Promise<string | null>
  isLoaded: boolean
  isSignedIn: boolean
  loadTimedOut: boolean
  openSignIn: () => void
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
  signOut: async () => undefined,
}

export const JobsFlowSsoContext = createContext<JobsFlowSsoContextValue>(disabledSso)

export function useJobsFlowSso() {
  return useContext(JobsFlowSsoContext)
}
