// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AuthPanel } from '../src/features/auth/AuthPanel'
import { CandidateWorkspace } from '../src/features/candidate/CandidateWorkspace'

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
