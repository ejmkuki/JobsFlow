// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AuthPanel } from '../src/features/auth/AuthPanel'
import { AuthGateway } from '../src/features/auth/AuthGateway'
import { CandidateWorkspace } from '../src/features/candidate/CandidateWorkspace'
import { EmployerJobsPanel } from '../src/features/employer/EmployerJobsPanel'
import { JobBoardPanel } from '../src/features/candidate/JobBoardPanel'
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

// Backend calls fire on mount; stub fetch so panels fail closed and still
// render their static shell. These are structural guards for the upcoming
// decomposition of AuthPanel and CandidateWorkspace.
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

describe('core loop panels', () => {
  it('EmployerJobsPanel renders the post-a-role form', () => {
    render(<EmployerJobsPanel session={null} />)
    expect(screen.getByText('Post roles and review real applicants')).toBeTruthy()
    expect(screen.getByText('Publish role')).toBeTruthy()
  })

  it('JobBoardPanel renders the job board', () => {
    render(<JobBoardPanel session={null} />)
    expect(screen.getByText('Find and apply to real roles')).toBeTruthy()
    expect(screen.getByText('Your applications')).toBeTruthy()
  })
})

describe('AuthPanel', () => {
  it('renders the sign-in shell without crashing', () => {
    render(<AuthPanel session={null} onSessionChange={() => undefined} />)
    expect(screen.getAllByText('JobsFlow AI').length).toBeGreaterThan(0)
  })
})

describe('CandidateWorkspace', () => {
  it('renders the workspace shell without crashing', () => {
    render(<CandidateWorkspace automationMode="Co-pilot" onModeChange={() => undefined} session={null} />)
    expect(screen.getByText('Apply with precision, not volume')).toBeTruthy()
  })
})
