import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { BackendSession, Job } from '../../backendClient'
import { createJob, humanizeJobsFlowError, listMyJobs } from '../../backendClient'
import { formatCents } from '../../lib/format'

function salaryLabel(job: Job) {
  if (job.salaryMinCents == null && job.salaryMaxCents == null) return '—'
  const min = job.salaryMinCents == null ? '' : formatCents(job.salaryMinCents, job.salaryCurrency)
  const max = job.salaryMaxCents == null ? '' : formatCents(job.salaryMaxCents, job.salaryCurrency)
  return [min, max].filter(Boolean).join(' – ')
}

export function EmployerJobsPage({ session }: { session: BackendSession | null }) {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<Job[]>([])
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('Remote')
  const [salaryMin, setSalaryMin] = useState('')
  const [salaryMax, setSalaryMax] = useState('')
  const [skills, setSkills] = useState('')
  const [description, setDescription] = useState('')
  const [message, setMessage] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  function refresh() {
    if (!session) return
    listMyJobs()
      .then((result) => setJobs(result.jobs))
      .catch((error) => setMessage(humanizeJobsFlowError(error, 'backend')))
  }

  useEffect(refresh, [session])

  async function handlePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim()) {
      setMessage('Give the role a title before posting.')
      return
    }
    setIsBusy(true)
    setMessage('Publishing…')
    try {
      await createJob({
        title: title.trim(),
        location: location.trim() || 'Remote',
        description: description.trim(),
        requiredSkills: skills.split(',').map((skill) => skill.trim()).filter(Boolean),
        salaryMinCents: salaryMin ? Math.round(Number(salaryMin) * 100) : null,
        salaryMaxCents: salaryMax ? Math.round(Number(salaryMax) * 100) : null,
      })
      setTitle('')
      setSalaryMin('')
      setSalaryMax('')
      setSkills('')
      setDescription('')
      setMessage('Role published. Candidates can find and apply to it now.')
      refresh()
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <main className="jf-content">
      <div className="jf-page-head">
        <div>
          <h1>Jobs</h1>
          <p>Publish roles and open a candidate pipeline for each. Click a role to review its applicants.</p>
        </div>
      </div>

      {message ? <p className="jf-msg">{message}</p> : null}

      <div className="jf-page-grid">
        <div className="jf-board-wrap">
          <table className="jf-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Location</th>
                <th>Compensation</th>
                <th>Applicants</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} onClick={() => navigate(`../candidates?job=${job.id}`)}>
                  <td><strong>{job.title}</strong></td>
                  <td>{job.location}</td>
                  <td>{salaryLabel(job)}</td>
                  <td>{job.applicantCount}</td>
                  <td><span className={`jf-pill ${job.status === 'open' ? 'jf-open' : 'jf-draft'}`}>{job.status}</span></td>
                </tr>
              ))}
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ color: 'var(--jf-muted)' }}>No roles yet. Publish your first role on the right.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <form className="jf-post" onSubmit={handlePost}>
          <h3>Post a role</h3>
          <label>
            Role title *
            <input onChange={(event) => setTitle(event.target.value)} placeholder="Product Operations Manager" value={title} />
          </label>
          <div className="jf-post-row">
            <label>
              Location
              <input onChange={(event) => setLocation(event.target.value)} value={location} />
            </label>
            <label>
              Min ($)
              <input inputMode="numeric" onChange={(event) => setSalaryMin(event.target.value.replace(/\D/g, ''))} value={salaryMin} />
            </label>
            <label>
              Max ($)
              <input inputMode="numeric" onChange={(event) => setSalaryMax(event.target.value.replace(/\D/g, ''))} value={salaryMax} />
            </label>
          </div>
          <label>
            Must-have skills (comma separated)
            <input onChange={(event) => setSkills(event.target.value)} placeholder="Product operations, Healthcare SaaS" value={skills} />
          </label>
          <label>
            Description
            <textarea onChange={(event) => setDescription(event.target.value)} rows={3} value={description} />
          </label>
          <button className="jf-btn jf-btn-primary" disabled={isBusy || !title.trim()} type="submit" style={{ alignSelf: 'flex-start' }}>
            Publish role
          </button>
        </form>
      </div>
    </main>
  )
}
