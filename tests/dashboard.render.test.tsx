// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppTopNav } from '../src/features/dashboard/AppTopNav'
import { CandidateHomePage } from '../src/features/dashboard/CandidateHomePage'
import { CandidateJobsPage } from '../src/features/dashboard/CandidateJobsPage'
import { CandidateApplicationsPage } from '../src/features/dashboard/CandidateApplicationsPage'
import { EmployerPipelinePage } from '../src/features/dashboard/EmployerPipelinePage'
import { EmployerJobsPage } from '../src/features/dashboard/EmployerJobsPage'

vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 503 })))
afterEach(() => cleanup())

const wrap = (ui: React.ReactNode, path = '/candidate') => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>)

describe('unified shell + candidate dashboard', () => {
  it('AppTopNav renders tabs and the Find work / Hire switch', () => {
    render(
      <MemoryRouter initialEntries={['/candidate']}>
        <Routes>
          <Route path="/candidate" element={<AppTopNav session={null} onSignOut={() => undefined} />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Find work')).toBeTruthy()
    expect(screen.getByText('Hire')).toBeTruthy()
    expect(screen.getByText('Home')).toBeTruthy()
    expect(screen.getByText('Applications')).toBeTruthy()
  })

  it('CandidateHomePage renders the hero and profile checklist', () => {
    wrap(<CandidateHomePage session={null} />)
    expect(screen.getByRole('heading', { name: 'Apply with precision, not volume' })).toBeTruthy()
    expect(screen.getByText('Profile checklist')).toBeTruthy()
    expect(screen.getByText('Active applications')).toBeTruthy()
  })

  it('CandidateJobsPage renders the search and jobs heading', () => {
    wrap(<CandidateJobsPage session={null} />, '/candidate/jobs')
    expect(screen.getByRole('heading', { name: 'Jobs' })).toBeTruthy()
    expect(screen.getByText(/No open roles match/i)).toBeTruthy()
  })

  it('CandidateApplicationsPage renders the applications heading', () => {
    wrap(<CandidateApplicationsPage session={null} />, '/candidate/applications')
    expect(screen.getByRole('heading', { name: 'Applications' })).toBeTruthy()
  })
})

describe('employer dashboard pages', () => {
  it('EmployerPipelinePage renders the candidates header and empty state', () => {
    wrap(<EmployerPipelinePage session={null} />, '/employer/candidates')
    expect(screen.getByRole('heading', { name: 'Candidates' })).toBeTruthy()
    expect(screen.getByText(/No roles yet/i)).toBeTruthy()
  })

  it('EmployerJobsPage renders the jobs table and post form', () => {
    wrap(<EmployerJobsPage session={null} />, '/employer/jobs')
    expect(screen.getByRole('heading', { name: 'Jobs' })).toBeTruthy()
    expect(screen.getByText('Post a role')).toBeTruthy()
  })
})
