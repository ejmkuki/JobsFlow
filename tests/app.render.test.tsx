// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import App from '../src/App'

// App issues backend calls on mount; stub fetch so they fail closed and the
// landing shell still renders. useJobsFlowSso falls back to the disabledSso
// context default, so no provider wrapper is needed.
vi.stubGlobal(
  'fetch',
  vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 503 })),
)

afterEach(() => {
  cleanup()
})

describe('App', () => {
  it('renders the landing shell without crashing', () => {
    render(<App />)
    expect(screen.getAllByText('JobsFlow AI').length).toBeGreaterThan(0)
  })
})
