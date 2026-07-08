import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, SendHorizontal } from 'lucide-react'
import type { BackendSession, CandidateApplication, Job } from '../../backendClient'
import { applyToJob, humanizeJobsFlowError, listMyApplications, listOpenJobs } from '../../backendClient'
import { formatCents } from '../../lib/format'

function salaryLabel(job: Job) {
  if (job.salaryMinCents == null && job.salaryMaxCents == null) return 'Compensation on request'
  const min = job.salaryMinCents == null ? '' : formatCents(job.salaryMinCents, job.salaryCurrency)
  const max = job.salaryMaxCents == null ? '' : formatCents(job.salaryMaxCents, job.salaryCurrency)
  return [min, max].filter(Boolean).join(' – ')
}

export function CandidateJobsPage({ session }: { session: BackendSession | null }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [jobs, setJobs] = useState<Job[]>([])
  const [applications, setApplications] = useState<CandidateApplication[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const appliedJobIds = useMemo(() => new Set(applications.map((application) => application.jobId)), [applications])

  const load = useCallback(async (search: string) => {
    if (!session) return
    try {
      const [jobsResult, appsResult] = await Promise.all([listOpenJobs(search), listMyApplications()])
      setJobs(jobsResult.jobs)
      setApplications(appsResult.applications)
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    }
  }, [session])

  useEffect(() => {
    void load(searchParams.get('q') ?? '')
  }, [load, searchParams])

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSearchParams(query.trim() ? { q: query.trim() } : {})
  }

  async function handleApply(job: Job) {
    setIsBusy(true)
    setMessage(`Applying to ${job.title}…`)
    try {
      await applyToJob({ jobId: job.id, coverNote: notes[job.id]?.trim() ?? '' })
      setMessage(`Applied to ${job.title} at ${job.company}.`)
      await load(searchParams.get('q') ?? '')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <main className="jf-page">
      <div>
        <h1>Jobs</h1>
        <p className="jf-sub">Browse open roles and apply in one click.</p>
      </div>

      <div className="jf-panel">
        <form className="jf-search-row" onSubmit={handleSearch}>
          <div className="jf-field">
            <Search size={16} aria-hidden="true" />
            <input onChange={(event) => setQuery(event.target.value)} placeholder="Search by title, company, or skill" value={query} />
          </div>
          <button className="jf-btn jf-btn-primary" disabled={isBusy} type="submit">Search</button>
        </form>
      </div>

      {message ? <p className="jf-msg">{message}</p> : null}

      <div className="jf-list">
        {jobs.map((job) => {
          const applied = appliedJobIds.has(job.id)
          return (
            <div className="jf-item" key={job.id}>
              <div className="jf-item-head">
                <div className="jf-logo-sq">{(job.company[0] ?? 'J').toUpperCase()}</div>
                <div className="jf-meta">
                  <strong>{job.title}</strong>
                  <span>{job.company} · {job.location} · {salaryLabel(job)}</span>
                </div>
                {applied ? <span className="jf-status jf-green">Applied</span> : null}
              </div>
              {job.requiredSkills.length ? (
                <div className="jf-item-skills">
                  {job.requiredSkills.slice(0, 6).map((skill) => <span key={skill}>{skill}</span>)}
                </div>
              ) : null}
              {job.description ? <p className="jf-msg" style={{ margin: 0 }}>{job.description}</p> : null}
              {!applied ? (
                <div className="jf-item-actions">
                  <input
                    className="jf-item-note"
                    onChange={(event) => setNotes((current) => ({ ...current, [job.id]: event.target.value }))}
                    placeholder="Optional note to the hiring team"
                    value={notes[job.id] ?? ''}
                  />
                  <button className="jf-btn jf-btn-primary" disabled={isBusy} onClick={() => void handleApply(job)} type="button">
                    <SendHorizontal size={15} aria-hidden="true" /> Apply
                  </button>
                </div>
              ) : null}
            </div>
          )
        })}
        {jobs.length === 0 ? <p className="jf-empty">No open roles match yet. Try a different search.</p> : null}
      </div>
    </main>
  )
}
