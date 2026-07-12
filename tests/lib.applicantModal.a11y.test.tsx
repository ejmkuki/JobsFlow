// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { ApplicantDetailModal } from '../src/features/dashboard/ApplicantDetailModal'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('ApplicantDetailModal accessibility, once loaded', () => {
  it('labels the dialog with the candidate name and moves focus inside it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('/api/job-applications')) {
          return jsonResponse({
            ok: true,
            application: {
              id: 'app-1',
              status: 'submitted',
              candidateName: 'Jane Doe',
              candidateEmail: 'jane@example.com',
              readinessScore: 80,
              matchMethod: 'keyword',
              matchRationale: '{}',
              coverNote: '',
              resumeArtifactId: null,
              employerSlaDueAt: null,
              createdAt: '2026-01-01 00:00:00',
              lastStatusChangeAt: '2026-01-01 00:00:00',
              jobId: 'job-1',
              jobTitle: 'DBA',
              company: 'Acme',
              location: 'Remote',
            },
            events: [],
          })
        }
        return jsonResponse({ ok: false }, 503)
      }),
    )

    render(<ApplicantDetailModal applicationId="app-1" onClose={() => undefined} onMoved={() => undefined} />)

    const dialog = await screen.findByRole('dialog')
    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(document.getElementById(labelledBy!)?.textContent).toBe('Jane Doe')

    // Focus trap actually moved focus into the dialog once it rendered —
    // not just present as an attribute.
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true)
    })
  })
})
