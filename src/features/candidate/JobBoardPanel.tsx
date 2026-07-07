import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Search, SendHorizontal } from 'lucide-react'
import type { BackendSession, CandidateApplication, Job } from '../../backendClient'
import {
  applyToJob,
  humanizeJobsFlowError,
  listMyApplications,
  listOpenJobs,
  withdrawApplication,
} from '../../backendClient'
import { SectionHeader, StatusPill } from '../../components/ui'
import { formatCents } from '../../lib/format'
import type { Tone } from '../../types'

const statusLabels: Record<string, string> = {
  submitted: 'Submitted',
  employer_review: 'In review',
  screen: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Declined',
  withdrawn: 'Withdrawn',
}

function statusTone(status: string): Tone {
  if (status === 'offer') return 'green'
  if (status === 'rejected' || status === 'withdrawn') return 'red'
  if (status === 'interview' || status === 'screen') return 'amber'
  return 'blue'
}

function salaryLabel(job: Job) {
  if (job.salaryMinCents == null && job.salaryMaxCents == null) {
    return 'Compensation on request'
  }
  const min = job.salaryMinCents == null ? '' : formatCents(job.salaryMinCents, job.salaryCurrency)
  const max = job.salaryMaxCents == null ? '' : formatCents(job.salaryMaxCents, job.salaryCurrency)
  return [min, max].filter(Boolean).join(' - ')
}

export function JobBoardPanel({ session }: { session: BackendSession | null }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [applications, setApplications] = useState<CandidateApplication[]>([])
  const [query, setQuery] = useState('')
  const [coverNotes, setCoverNotes] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('Browse open roles and apply with one click.')
  const [isBusy, setIsBusy] = useState(false)

  const appliedJobIds = useMemo(() => new Set(applications.map((application) => application.jobId)), [applications])

  const refresh = useCallback(async (search = '') => {
    if (!session) {
      return
    }
    try {
      const [jobsResult, appsResult] = await Promise.all([listOpenJobs(search), listMyApplications()])
      setJobs(jobsResult.jobs)
      setApplications(appsResult.applications)
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    }
  }, [session])

  useEffect(() => {
    void refresh()
  }, [refresh])

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void refresh(query.trim())
  }

  async function handleApply(job: Job) {
    if (!session) {
      setMessage('Start a candidate workspace before applying.')
      return
    }
    setIsBusy(true)
    setMessage(`Applying to ${job.title}...`)
    try {
      await applyToJob({ jobId: job.id, coverNote: coverNotes[job.id]?.trim() ?? '' })
      setMessage(`Applied to ${job.title} at ${job.company}. It is now in your applications.`)
      await refresh(query.trim())
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    } finally {
      setIsBusy(false)
    }
  }

  async function handleWithdraw(applicationId: string) {
    setIsBusy(true)
    try {
      await withdrawApplication(applicationId)
      await refresh(query.trim())
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <article className="panel wide-panel">
      <SectionHeader eyebrow="Job board" title="Find and apply to real roles" />

      <form className="job-search" onSubmit={handleSearch}>
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by title, company, or skill"
          value={query}
        />
        <button disabled={isBusy} type="submit">
          <Search size={16} aria-hidden="true" />
          Search
        </button>
      </form>

      <p className="runtime-message">{message}</p>

      <div className="job-board">
        {jobs.map((job) => {
          const applied = appliedJobIds.has(job.id)
          return (
            <div className="job-card" key={job.id}>
              <div className="job-card-head">
                <div>
                  <strong>{job.title}</strong>
                  <span>{job.company} / {job.location} / {salaryLabel(job)}</span>
                </div>
                {applied ? <StatusPill tone="green">Applied</StatusPill> : null}
              </div>
              {job.requiredSkills.length ? (
                <div className="job-skills">
                  {job.requiredSkills.slice(0, 6).map((skill) => (
                    <span key={skill}>{skill}</span>
                  ))}
                </div>
              ) : null}
              {job.description ? <p className="job-description">{job.description}</p> : null}
              {!applied ? (
                <div className="job-apply">
                  <input
                    onChange={(event) => setCoverNotes((current) => ({ ...current, [job.id]: event.target.value }))}
                    placeholder="Optional note to the hiring team"
                    value={coverNotes[job.id] ?? ''}
                  />
                  <button disabled={isBusy} onClick={() => void handleApply(job)} type="button">
                    <SendHorizontal size={16} aria-hidden="true" />
                    Apply
                  </button>
                </div>
              ) : null}
            </div>
          )
        })}
        {jobs.length === 0 ? <p className="muted">No open roles match yet. Try a different search.</p> : null}
      </div>

      <div className="my-applications">
        <h4>Your applications</h4>
        {applications.length === 0 ? <p className="muted">You have not applied to any roles yet.</p> : null}
        {applications.map((application) => (
          <div className="application-row" key={application.id}>
            <div>
              <strong>{application.jobTitle}</strong>
              <span>{application.company} / {application.location}</span>
            </div>
            <div className="application-status">
              <StatusPill tone={statusTone(application.status)}>
                {statusLabels[application.status] ?? application.status}
              </StatusPill>
              {application.status !== 'withdrawn' && application.status !== 'rejected' ? (
                <button disabled={isBusy} onClick={() => void handleWithdraw(application.id)} type="button">
                  Withdraw
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </article>
  )
}
