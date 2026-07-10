// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { humanizeJobsFlowError, JobsFlowApiError } from '../src/backendClient'

// The core-loop endpoints (jobs, job-applications, profile, match-preview)
// send specific, useful error messages. humanizeJobsFlowError has a large
// legacy switch built for older panels — any code outside that switch must
// still surface the server's real message instead of a canned fallback.
describe('humanizeJobsFlowError — unmapped codes fall back to the server message', () => {
  it('surfaces own_job instead of a generic message', () => {
    const error = new JobsFlowApiError('This is your own posting.', 400, 'own_job')
    expect(humanizeJobsFlowError(error, 'backend')).toBe('This is your own posting.')
  })

  it('surfaces already_applied instead of a generic message', () => {
    const error = new JobsFlowApiError('You have already applied to this job.', 409, 'already_applied')
    expect(humanizeJobsFlowError(error, 'backend')).toBe('You have already applied to this job.')
  })

  it('surfaces job_unavailable instead of a generic message', () => {
    const error = new JobsFlowApiError('That job is no longer accepting applications.', 404, 'job_unavailable')
    expect(humanizeJobsFlowError(error, 'backend')).toBe('That job is no longer accepting applications.')
  })

  it('falls back to the generic string only when the server sent no message', () => {
    const error = new JobsFlowApiError('', 500, 'unknown')
    expect(humanizeJobsFlowError(error, 'backend')).toBe('JobsFlow could not complete that action. Please try again.')
  })

  it('still resolves legacy-panel codes to their custom copy', () => {
    const error = new JobsFlowApiError('unauthorized', 401, 'unauthorized')
    expect(humanizeJobsFlowError(error, 'resume')).toBe('Start a workspace first, then resume upload will unlock.')
  })
})
