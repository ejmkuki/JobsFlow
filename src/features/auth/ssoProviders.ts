import type { JobsFlowSsoProviderKey } from '../../jobsFlowSsoContext'

export const ssoProviderActions: Array<{ key: JobsFlowSsoProviderKey; label: string }> = [
  { key: 'google', label: 'Google' },
  { key: 'apple', label: 'Apple' },
  { key: 'linkedin_oidc', label: 'LinkedIn' },
  { key: 'microsoft', label: 'Microsoft' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'github', label: 'GitHub' },
  { key: 'x', label: 'X' },
  { key: 'email', label: 'Email' },
]

export const productionOauthProviderKeys = new Set<JobsFlowSsoProviderKey>(['google', 'apple'])

export const ssoProviderIconText: Record<JobsFlowSsoProviderKey, string> = {
  apple: 'A',
  email: '@',
  facebook: 'f',
  github: 'GH',
  google: 'G',
  linkedin_oidc: 'in',
  microsoft: 'M',
  x: 'X',
}
