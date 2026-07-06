import { createContext, useContext } from 'react'

export type JobsFlowSsoProviderKey =
  | 'apple'
  | 'email'
  | 'facebook'
  | 'github'
  | 'google'
  | 'linkedin_oidc'
  | 'microsoft'
  | 'x'

export type JobsFlowEmailSignInMethod = 'password' | 'email_code' | 'oauth_only'

export type JobsFlowEmailSignInOptions = {
  method: JobsFlowEmailSignInMethod
  provider?: JobsFlowSsoProviderKey
  safeIdentifier?: string
}

export type JobsFlowSsoContextValue = {
  configured: boolean
  displayName: string | null
  email: string | null
  getToken: () => Promise<string | null>
  isLoaded: boolean
  isSignedIn: boolean
  loadTimedOut: boolean
  openSignIn: () => void
  openSignUp: (initialEmail?: string) => void
  openProviderSignIn: (provider: JobsFlowSsoProviderKey) => Promise<void>
  prepareEmailSignIn: (email: string) => Promise<JobsFlowEmailSignInOptions>
  signInWithEmailCode: (code: string) => Promise<void>
  signInWithPassword: (email: string, password: string) => Promise<void>
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
  prepareEmailSignIn: async () => ({ method: 'password' }),
  signInWithEmailCode: async () => undefined,
  signInWithPassword: async () => undefined,
  signOut: async () => undefined,
}

export const JobsFlowSsoContext = createContext<JobsFlowSsoContextValue>(disabledSso)

export function useJobsFlowSso() {
  return useContext(JobsFlowSsoContext)
}
