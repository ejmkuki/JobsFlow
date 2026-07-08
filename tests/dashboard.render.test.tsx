// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DashboardShell } from '../src/features/dashboard/DashboardShell'
import { EmployerPipelinePage } from '../src/features/dashboard/EmployerPipelinePage'
import { EmployerJobsPage } from '../src/features/dashboard/EmployerJobsPage'

vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 503 })))

afterEach(() => cleanup())

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('employer dashboard', () => {
  it('DashboardShell renders the sidebar nav and sign out', () => {
    wrap(<DashboardShell session={null} onSignOut={() => undefined} />)
    expect(screen.getByText('Candidates')).toBeTruthy()
    expect(screen.getByText('Jobs')).toBeTruthy()
    expect(screen.getByText('Sign out')).toBeTruthy()
  })

  it('EmployerPipelinePage renders the candidates header and empty state', () => {
    wrap(<EmployerPipelinePage session={null} />)
    expect(screen.getByRole('heading', { name: 'Candidates' })).toBeTruthy()
    expect(screen.getByText(/No roles yet/i)).toBeTruthy()
  })

  it('EmployerJobsPage renders the jobs table and post form', () => {
    wrap(<EmployerJobsPage session={null} />)
    expect(screen.getByRole('heading', { name: 'Jobs' })).toBeTruthy()
    expect(screen.getByText('Post a role')).toBeTruthy()
    expect(screen.getByText('Publish role')).toBeTruthy()
  })
})
