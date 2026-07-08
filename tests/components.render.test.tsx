// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AuthPanel } from '../src/features/auth/AuthPanel'
import { AuthGateway } from '../src/features/auth/AuthGateway'
import { disabledSso } from '../src/jobsFlowSsoContext'

const readySso = { ...disabledSso, configured: true, isLoaded: true }
const noop = () => undefined
const gatewayProps = {
  sso: readySso,
  email: '',
  emailCode: '',
  emailMode: 'sign_in' as const,
  accountType: 'candidate' as const,
  message: '',
  isBusy: false,
  onAccountTypeChange: noop,
  onEmailChange: noop,
  onCodeChange: noop,
  onSubmit: (event: { preventDefault: () => void }) => event.preventDefault(),
  onResend: noop,
  onChangeEmail: noop,
  onProviderSignIn: noop,
}

vi.stubGlobal(
  'fetch',
  vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 503 })),
)

afterEach(() => {
  cleanup()
})

describe('AuthGateway email flow', () => {
  it('email step shows the email field and a Continue button', () => {
    render(<AuthGateway {...gatewayProps} emailStep="email" />)
    expect(screen.getByText('Continue')).toBeTruthy()
    expect(screen.getByText(/one-time code/i)).toBeTruthy()
    expect(screen.queryByText('Resend code')).toBeNull()
  })

  it('code step shows the code field, resend, and change-email controls', () => {
    render(<AuthGateway {...gatewayProps} emailStep="code" email="me@example.com" />)
    expect(screen.getByText('Verify and continue')).toBeTruthy()
    expect(screen.getByText('Resend code')).toBeTruthy()
    expect(screen.getByText('Use a different email')).toBeTruthy()
  })
})

describe('AuthPanel', () => {
  it('renders the sign-in shell without crashing', () => {
    render(<AuthPanel session={null} onSessionChange={() => undefined} />)
    expect(screen.getAllByText('JobsFlow AI').length).toBeGreaterThan(0)
  })
})
