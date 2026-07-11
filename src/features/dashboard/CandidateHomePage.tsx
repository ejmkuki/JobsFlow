import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Sparkles } from 'lucide-react'
import type { BackendSession, CandidateApplication, JobRecommendation } from '../../backendClient'
import { getProfile, humanizeJobsFlowError, listMyApplications, listRecommendations, listResumes } from '../../backendClient'
import { formatCents } from '../../lib/format'

function salaryLabel(job: JobRecommendation) {
  if (job.salaryMinCents == null && job.salaryMaxCents == null) return null
  const min = job.salaryMinCents == null ? '' : formatCents(job.salaryMinCents, job.salaryCurrency)
  const max = job.salaryMaxCents == null ? '' : formatCents(job.salaryMaxCents, job.salaryCurrency)
  return [min, max].filter(Boolean).join(' – ')
}

const statusLabels: Record<string, string> = {
  submitted: 'Submitted',
  employer_review: 'In review',
  screen: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Declined',
  withdrawn: 'Withdrawn',
}
function statusTone(status: string) {
  if (status === 'offer') return 'jf-green'
  if (status === 'rejected' || status === 'withdrawn') return 'jf-red'
  if (status === 'interview' || status === 'screen') return 'jf-amber'
  return 'jf-blue'
}

type Check = { label: string; detail: string; done: boolean }

export function CandidateHomePage({ session }: { session: BackendSession | null }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [applications, setApplications] = useState<CandidateApplication[]>([])
  const [hasResume, setHasResume] = useState(false)
  const [recommendations, setRecommendations] = useState<JobRecommendation[]>([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!session) return
    Promise.all([listMyApplications(), listResumes(), getProfile(), listRecommendations()])
      .then(([apps, resumes, profile, recs]) => {
        setApplications(apps.applications)
        setHasResume(resumes.resumes.length > 0 || profile.profile.resumeText.trim().length > 0)
        setRecommendations(recs.recommendations)
      })
      .catch((error) => setMessage(humanizeJobsFlowError(error, 'backend')))
  }, [session])

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    navigate(query.trim() ? `/candidate/jobs?q=${encodeURIComponent(query.trim())}` : '/candidate/jobs')
  }

  const checks: Check[] = [
    { label: 'Account created', detail: session?.email ?? '', done: true },
    { label: 'Email confirmed', detail: 'Verified at sign-in', done: true },
    { label: 'Upload a resume', detail: hasResume ? 'On file' : 'Add one to strengthen your matches', done: hasResume },
    { label: 'Apply to your first role', detail: applications.length ? `${applications.length} in progress` : 'Browse open roles', done: applications.length > 0 },
  ]
  const done = checks.filter((check) => check.done).length

  return (
    <main className="jf-page">
      <section className="jf-hero">
        <div className="jf-hero-body">
          <span className="jf-eyebrow"><Sparkles size={13} aria-hidden="true" /> Signal over volume</span>
          <h1>Apply with precision, not volume</h1>
          <p>Find roles that fit your evidence, apply in one click, and track every response — no ghosting, no black-box scores.</p>
          <button className="jf-btn jf-btn-primary" onClick={() => navigate('/candidate/jobs')} type="button">
            Browse open roles
          </button>
        </div>
      </section>

      <div className="jf-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div className="jf-panel">
            <div className="jf-panel-head"><h2>Find your next role</h2></div>
            <form className="jf-search-row" onSubmit={handleSearch}>
              <div className="jf-field">
                <Search size={16} aria-hidden="true" />
                <input onChange={(event) => setQuery(event.target.value)} placeholder="Search by title, company, or skill" value={query} />
              </div>
              <button className="jf-btn jf-btn-primary" type="submit">Search</button>
            </form>
          </div>

          <div className="jf-panel">
            <div className="jf-panel-head">
              <h2>Active applications</h2>
              <button className="jf-seeall" onClick={() => navigate('/candidate/applications')} type="button">See all</button>
            </div>
            {message ? <p className="jf-msg">{message}</p> : null}
            {applications.length === 0 ? (
              <p className="jf-empty">No applications yet. Browse open roles to get started.</p>
            ) : (
              <div className="jf-list">
                {applications.slice(0, 4).map((application) => (
                  <div className="jf-item" key={application.id}>
                    <div className="jf-item-head">
                      <div className="jf-logo-sq">{(application.company[0] ?? 'J').toUpperCase()}</div>
                      <div className="jf-meta">
                        <strong>{application.jobTitle}</strong>
                        <span>{application.company} · {application.location}</span>
                      </div>
                      <span className={`jf-status ${statusTone(application.status)}`}>
                        {statusLabels[application.status] ?? application.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {recommendations.length > 0 ? (
            <div className="jf-panel">
              <div className="jf-panel-head">
                <h2>Roles you'd match well on</h2>
                <button className="jf-seeall" onClick={() => navigate('/candidate/jobs')} type="button">Browse all</button>
              </div>
              <div className="jf-list">
                {recommendations.slice(0, 5).map((job) => (
                  <div
                    className="jf-item jf-item-clickable"
                    key={job.id}
                    onClick={() => navigate(`/candidate/jobs?q=${encodeURIComponent(job.title)}`)}
                  >
                    <div className="jf-item-head">
                      <div className="jf-logo-sq">{(job.company[0] ?? 'J').toUpperCase()}</div>
                      <div className="jf-meta">
                        <strong>{job.title}</strong>
                        <span>{job.company} · {job.location}{salaryLabel(job) ? ` · ${salaryLabel(job)}` : ''}</span>
                      </div>
                      <div className="jf-fit">
                        <b>{job.score}%</b>
                        <small>Match</small>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="jf-panel">
          <div className="jf-panel-head"><h2>Profile checklist</h2></div>
          <div className="jf-progress"><i style={{ width: `${(done / checks.length) * 100}%` }} /></div>
          <p className="jf-msg" style={{ marginTop: -6, marginBottom: 8 }}>{done} of {checks.length} complete</p>
          {checks.map((check) => (
            <div className="jf-check" key={check.label}>
              <span className={`jf-tick ${check.done ? 'done' : 'todo'}`}>
                {check.done ? (
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                ) : null}
              </span>
              <div className="jf-ck-body">
                <strong>{check.label}</strong>
                <span>{check.detail}</span>
              </div>
              {!check.done ? (
                <button
                  className="jf-edit"
                  onClick={() => navigate(check.label === 'Upload a resume' ? '/candidate/profile' : '/candidate/jobs')}
                  type="button"
                >
                  Add
                </button>
              ) : null}
            </div>
          ))}
        </aside>
      </div>
    </main>
  )
}
