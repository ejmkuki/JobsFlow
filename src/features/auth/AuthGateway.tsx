import { ArrowRight } from 'lucide-react'
import type { FormEvent } from 'react'
import { JobsFlowLogoMark } from '../../components/ui'
import { friendlyUserMessage } from '../../lib/format'
import type { JobsFlowSsoContextValue, JobsFlowSsoProviderKey } from '../../jobsFlowSsoContext'
import { productionOauthProviderKeys, ssoProviderActions, ssoProviderIconText } from './ssoProviders'

type AuthGatewayProps = {
  sso: JobsFlowSsoContextValue
  email: string
  password: string
  emailCode: string
  emailSignInStep: 'email' | 'password' | 'code'
  showInlineSignUp: boolean
  message: string
  isBusy: boolean
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onCodeChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onProviderSignIn: (provider: JobsFlowSsoProviderKey) => void
  onInlineSignUp: () => void
}

export function AuthGateway({
  sso,
  email,
  password,
  emailCode,
  emailSignInStep,
  showInlineSignUp,
  message,
  isBusy,
  onEmailChange,
  onPasswordChange,
  onCodeChange,
  onSubmit,
  onProviderSignIn,
  onInlineSignUp,
}: AuthGatewayProps) {
  const oauthProviders = ssoProviderActions.filter(
    (provider) => provider.key !== 'email' && productionOauthProviderKeys.has(provider.key),
  )
  const emailSubmitDisabled =
    !sso.configured ||
    !email.trim() ||
    isBusy ||
    (emailSignInStep === 'password' && !password) ||
    (emailSignInStep === 'code' && !emailCode.trim())
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
            <label>
              <span>All fields marked with * are required.</span>
              <strong>Email address *</strong>
              <input
                autoComplete="email"
                onChange={(event) => onEmailChange(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            {emailSignInStep === 'password' ? (
              <label>
                <strong>Password *</strong>
                <input
                  autoComplete="current-password"
                  autoFocus
                  onChange={(event) => onPasswordChange(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
            ) : null}
            {emailSignInStep === 'code' ? (
              <label>
                <strong>Verification code *</strong>
                <input
                  autoComplete="one-time-code"
                  autoFocus
                  inputMode="numeric"
                  onChange={(event) => onCodeChange(event.target.value)}
                  required
                  type="text"
                  value={emailCode}
                />
              </label>
            ) : null}
            <button
              disabled={emailSubmitDisabled}
              type="submit"
            >
              {emailSignInStep === 'email' ? 'Continue' : 'Sign in'}
              <ArrowRight size={24} aria-hidden="true" />
            </button>
          </form>

          {showInlineSignUp ? (
            <div className="auth-inline-signup" role="note">
              <span>No JobsFlow account exists for this email yet.</span>
              <button type="button" onClick={onInlineSignUp}>
                Sign up with this email
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
