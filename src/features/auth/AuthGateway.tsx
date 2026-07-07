import { ArrowRight } from 'lucide-react'
import type { FormEvent } from 'react'
import { JobsFlowLogoMark } from '../../components/ui'
import { friendlyUserMessage } from '../../lib/format'
import type { JobsFlowSsoContextValue, JobsFlowSsoProviderKey } from '../../jobsFlowSsoContext'
import { productionOauthProviderKeys, ssoProviderActions, ssoProviderIconText } from './ssoProviders'

type AuthGatewayProps = {
  sso: JobsFlowSsoContextValue
  email: string
  emailCode: string
  emailStep: 'email' | 'code'
  emailMode: 'sign_in' | 'sign_up'
  message: string
  isBusy: boolean
  onEmailChange: (value: string) => void
  onCodeChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onResend: () => void
  onChangeEmail: () => void
  onProviderSignIn: (provider: JobsFlowSsoProviderKey) => void
}

export function AuthGateway({
  sso,
  email,
  emailCode,
  emailStep,
  emailMode,
  message,
  isBusy,
  onEmailChange,
  onCodeChange,
  onSubmit,
  onResend,
  onChangeEmail,
  onProviderSignIn,
}: AuthGatewayProps) {
  const oauthProviders = ssoProviderActions.filter(
    (provider) => provider.key !== 'email' && productionOauthProviderKeys.has(provider.key),
  )
  const emailSubmitDisabled =
    !sso.configured ||
    isBusy ||
    (emailStep === 'email' ? !email.trim() : emailCode.trim().length < 6)
  const gatewayStatus = !sso.configured
    ? 'Sign-in is being prepared. Please try again shortly.'
    : !sso.isLoaded
      ? sso.loadTimedOut
        ? 'Sign-in is taking longer than expected in this browser. Refresh the page, then try again.'
        : 'Loading sign-in...'
      : null

  return (
    <section className="auth-gateway" aria-label="JobsFlow account access">
      <div className="auth-gateway-inner">
        <div className="auth-gateway-wordmark" aria-label="JobsFlow AI">
          <JobsFlowLogoMark />
          <strong>JobsFlow AI</strong>
        </div>

        <article className="auth-gateway-card">
          <div className="auth-gateway-copy">
            <h2>Ready to take the next step?</h2>
            <p className="auth-gateway-subtitle">Create an account or sign in.</p>
            <p className="auth-gateway-terms">
              By clicking any of the Continue options below, you understand and agree
              to JobsFlow's <a href="#workspace">Terms</a>. You also acknowledge our{' '}
              <a href="#workspace">Cookie</a> and <a href="#workspace">Privacy</a> policies.
            </p>
          </div>

          <div className="auth-gateway-oauth" aria-label="Continue with a sign-in option">
            {oauthProviders.map((provider) => (
              <button
                className="auth-provider-button"
                disabled={!sso.configured}
                key={provider.key}
                onClick={() => onProviderSignIn(provider.key)}
                type="button"
              >
                <span className={`auth-provider-icon auth-provider-icon-${provider.key}`}>
                  {ssoProviderIconText[provider.key]}
                </span>
                Continue with {provider.label}
              </button>
            ))}
          </div>

          <div className="auth-gateway-divider">
            <span />
            <strong>or</strong>
            <span />
          </div>

          <form className="auth-gateway-email-form" onSubmit={onSubmit}>
            {emailStep === 'email' ? (
              <label>
                <span>Sign in or create an account with a one-time code.</span>
                <strong>Email address *</strong>
                <input
                  autoComplete="email"
                  onChange={(event) => onEmailChange(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </label>
            ) : (
              <label>
                <span>
                  {emailMode === 'sign_up'
                    ? `Creating your account. Enter the 6-digit code we emailed to ${email}.`
                    : `Enter the 6-digit code we emailed to ${email}.`}
                </span>
                <strong>Verification code *</strong>
                <input
                  autoComplete="one-time-code"
                  autoFocus
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) => onCodeChange(event.target.value.replace(/\D/g, ''))}
                  required
                  type="text"
                  value={emailCode}
                />
              </label>
            )}
            <button disabled={emailSubmitDisabled} type="submit">
              {emailStep === 'email' ? 'Continue' : 'Verify and continue'}
              <ArrowRight size={24} aria-hidden="true" />
            </button>
          </form>

          {emailStep === 'code' ? (
            <div className="auth-code-actions" role="group" aria-label="Code options">
              <button disabled={isBusy} onClick={onResend} type="button">
                Resend code
              </button>
              <button disabled={isBusy} onClick={onChangeEmail} type="button">
                Use a different email
              </button>
            </div>
          ) : null}

          <p className="auth-gateway-status" aria-live="polite">{friendlyUserMessage(message)}</p>
          {gatewayStatus ? <p className="auth-gateway-status">{friendlyUserMessage(gatewayStatus)}</p> : null}
        </article>
      </div>
    </section>
  )
}
