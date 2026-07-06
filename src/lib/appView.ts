import type { AppView } from '../types'

export function readAppViewFromHash(): AppView {
  if (typeof window === 'undefined') {
    return 'landing'
  }

  if (window.location.hash === '#signin' || window.location.hash === '#auth') {
    return 'auth'
  }

  if (window.location.hash === '#workspace') {
    return 'workspace'
  }

  return 'landing'
}

export function writeAppViewHash(view: AppView, mode: 'push' | 'replace' = 'push') {
  if (typeof window === 'undefined') {
    return
  }

  const nextHash = view === 'landing' ? '' : view === 'auth' ? '#signin' : '#workspace'
  const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`

  if (`${window.location.pathname}${window.location.search}${window.location.hash}` === nextUrl) {
    return
  }

  if (mode === 'replace') {
    window.history.replaceState(null, '', nextUrl)
    return
  }

  window.history.pushState(null, '', nextUrl)
}

const authReturnStorageKey = 'jobsflow.auth.return.pending'

export function writeAuthReturnPending(value: boolean) {
  try {
    if (value) {
      window.sessionStorage.setItem(authReturnStorageKey, '1')
    } else {
      window.sessionStorage.removeItem(authReturnStorageKey)
    }
  } catch {
    // Session storage can be unavailable in hardened browser modes.
  }
}
