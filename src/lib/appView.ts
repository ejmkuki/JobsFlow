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
