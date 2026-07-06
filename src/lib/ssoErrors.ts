import { friendlyUserMessage } from './format'

export type ClerkAuthError = {
  code?: string
  longMessage?: string
  message?: string
}

export function collectSsoErrorText(error: unknown) {
  const clerkErrors = (error as { errors?: ClerkAuthError[] })?.errors
  const parts: string[] = []

  if (Array.isArray(clerkErrors)) {
    clerkErrors.forEach((clerkError) => {
      if (clerkError.code) {
        parts.push(clerkError.code)
      }
      if (clerkError.longMessage) {
        parts.push(clerkError.longMessage)
      }
      if (clerkError.message) {
        parts.push(clerkError.message)
      }
    })
  }

  if (error instanceof Error && error.message) {
    parts.push(error.message)
  }

  return parts.join(' ')
}

export function isMissingEmailAccountError(error: unknown) {
  const normalized = collectSsoErrorText(error).toLowerCase()

  return (
    normalized.includes('identifier_not_found') ||
    normalized.includes('form_identifier_not_found') ||
    normalized.includes('not found') ||
    normalized.includes('does not exist') ||
    normalized.includes('could not find') ||
    normalized.includes("couldn't find")
  )
}

export function isPasswordStrategyError(error: unknown) {
  return collectSsoErrorText(error).toLowerCase().includes('verification strategy is not valid')
}

export function humanizeSsoError(error: unknown, fallback = 'Sign-in could not complete. Try again.') {
  const clerkErrors = (error as { errors?: ClerkAuthError[] })?.errors
  const firstClerkError = Array.isArray(clerkErrors) ? clerkErrors[0] : null
  const normalized = collectSsoErrorText(error).toLowerCase()

  if (!normalized) {
    return fallback
  }

  if (normalized.includes('clerkjs: response') || normalized.includes('not supported yet')) {
    return 'We could not open that sign-in option in this browser. Refresh the page and try again, or continue with email.'
  }

  if (isMissingEmailAccountError(error)) {
    return 'No JobsFlow account exists for this email yet. Use Sign up to create one.'
  }

  if (isPasswordStrategyError(error)) {
    return 'This email is not set up with a JobsFlow password yet. Use Google or Apple if that is how you created the account.'
  }

  if (
    normalized.includes('form_password_incorrect') ||
    normalized.includes('form_password_or_identifier_incorrect') ||
    (normalized.includes('password') &&
      (normalized.includes('incorrect') || normalized.includes('invalid') || normalized.includes('wrong')))
  ) {
    return 'That password is not correct. Check it and try again.'
  }

  if (
    normalized.includes('form_code_incorrect') ||
    normalized.includes('verification_failed') ||
    (normalized.includes('code') && (normalized.includes('incorrect') || normalized.includes('invalid')))
  ) {
    return 'That verification code is not correct. Check the code and try again.'
  }

  if (normalized.includes('expired') && normalized.includes('code')) {
    return 'That verification code expired. Start again to request a new code.'
  }

  if (normalized.includes('clerkjs:')) {
    return fallback
  }

  if (normalized.includes('sso') || normalized.includes('oauth')) {
    return 'Google or Apple sign-in is taking longer than expected. Try again, or continue with email.'
  }

  if (normalized.includes('session') && normalized.includes('token')) {
    return 'We could not open your workspace yet. Refresh the page and sign in again.'
  }

  if (firstClerkError?.code) {
    return fallback
  }

  if (error instanceof Error && error.message) {
    return friendlyUserMessage(error.message, fallback)
  }

  return fallback
}
