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

export type JobsFlowEmailCodeMode = 'sign_in' | 'sign_up'

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
  // Passwordless email: request a one-time code (creates the account if the
  // email is new), verify it, and resend it. Same entry point signs in and
  // signs up.
  startEmailCode: (email: string) => Promise<{ mode: JobsFlowEmailCodeMode }>
  verifyEmailCode: (code: string) => Promise<void>
  resendEmailCode: () => Promise<void>
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
  startEmailCode: async () => ({ mode: 'sign_in' }),
  verifyEmailCode: async () => undefined,
  resendEmailCode: async () => undefined,
  signOut: async () => undefined,
}

export const JobsFlowSsoContext = createContext<JobsFlowSsoContextValue>(disabledSso)

export function useJobsFlowSso() {
  return useContext(JobsFlowSsoContext)
}
