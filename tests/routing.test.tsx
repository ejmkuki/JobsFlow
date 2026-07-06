// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import App from '../src/App'

// Backend calls fail closed so session stays null and the router shows the
// public views. These lock the hash-to-routes migration behavior.
vi.stubGlobal(
  'fetch',
  vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 503 })),
)

afterEach(() => {
  cleanup()
  window.history.pushState({}, '', '/')
})

const gatewayHeading = 'Ready to take the next step?'

describe('routing', () => {
  it('/auth renders the sign-in gateway', () => {
    window.history.pushState({}, '', '/auth')
    render(<App />)
    expect(screen.getByText(gatewayHeading)).toBeTruthy()
  })

  it('/candidate without a session redirects to the sign-in gateway', () => {
    window.history.pushState({}, '', '/candidate')
    render(<App />)
    expect(screen.getByText(gatewayHeading)).toBeTruthy()
  })

  it('/ renders the landing view, not the auth gateway', () => {
    window.history.pushState({}, '', '/')
    render(<App />)
    expect(screen.queryByText(gatewayHeading)).toBeNull()
    expect(screen.getAllByText('JobsFlow AI').length).toBeGreaterThan(0)
  })
})
