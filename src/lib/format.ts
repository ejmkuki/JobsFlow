import type { Tone } from '../types'

export function friendlyUserMessage(
  message: string | null | undefined,
  fallback = 'JobsFlow could not complete that action. Please try again.',
) {
  const raw = message?.trim()
  if (!raw) {
    return fallback
  }

  const normalized = raw.toLowerCase()

  if (
    normalized.includes('clerk') ||
    normalized.includes('clerkjs') ||
    normalized.includes('sso') ||
    normalized.includes('provider keys') ||
    normalized.includes('session token') ||
    normalized.includes('verification strategy')
  ) {
    return 'Sign-in is taking longer than expected. Try again, or continue with email.'
  }

  if (normalized.includes('oauth')) {
    return 'This connection is still being prepared. Please try again shortly.'
  }

  if (normalized.includes('resend') || normalized.includes('message id')) {
    return normalized.includes('accepted') || normalized.includes('sent')
      ? 'Test email sent. Check your inbox in a moment.'
      : 'Email delivery is being prepared. Please try again shortly.'
  }

  if (
    normalized.includes('runtime') ||
    normalized.includes('cloudflare') ||
    normalized.includes('d1') ||
    normalized.includes('r2') ||
    normalized.includes('migration') ||
    normalized.includes('binding') ||
    normalized.includes('secret') ||
    normalized.includes('bootstrap') ||
    normalized.includes('status 4') ||
    normalized.includes('status 5') ||
    normalized.includes('payload')
  ) {
    return 'This part of JobsFlow is still being prepared. Please try again shortly.'
  }

  return raw
    .replace(/\btenant-scoped\b/gi, 'workspace-protected')
    .replace(/\btenant\b/gi, 'workspace')
    .replace(/\bkernel\b/gi, 'workspace engine')
    .replace(/\bartifact\b/gi, 'file')
    .replace(/\bvector-ready\b/gi, 'ready')
    .replace(/\bvector\b/gi, 'evidence')
    .replace(/\bsyndication\b/gi, 'publishing')
    .replace(/\bATS\b/g, 'hiring system')
    .replace(/\bprovider\b/gi, 'connection')
}

export function formatProductLabel(value: string | null | undefined, fallback = 'Not available') {
  const raw = value?.trim()
  if (!raw) {
    return fallback
  }

  return raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^platform\.workflow_kernel$/i, 'JobsFlow automation foundation')
    .replace(/[._-]+/g, ' ')
    .replace(/\bats\b/gi, 'hiring system')
    .replace(/\bsso\b/gi, 'sign in')
    .replace(/\boauth\b/gi, 'external account')
    .replace(/\bkernel\b/gi, 'automation')
    .replace(/\bsyndication\b/gi, 'publishing')
    .replace(/\bsemantic\b/gi, 'skill')
    .replace(/\bvector\b/gi, 'evidence')
    .replace(/\bartifact\b/gi, 'file')
}

export function toneClass(tone: Tone = 'neutral') {
  return `tone-${tone}`
}

export function formatCents(cents: number | undefined, currency = 'USD') {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) {
    return 'Not enough signal'
  }

  return new Intl.NumberFormat('en-US', {
    currency,
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(cents / 100)
}

export function workflowTone(state: string): Tone {
  if (state === 'completed' || state === 'running') {
    return 'green'
  }

  if (state === 'blocked' || state === 'failed') {
    return 'red'
  }

  return state === 'waiting_for_approval' ? 'amber' : 'blue'
}

export function pipelineTone(status: string): Tone {
  if (status === 'overdue' || status === 'high') {
    return 'red'
  }

  if (status === 'due_soon' || status === 'medium') {
    return 'amber'
  }

  return status === 'not_required' ? 'neutral' : 'green'
}

export function textFromRecord(record: Record<string, unknown>, key: string, fallback: string) {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value : fallback
}
