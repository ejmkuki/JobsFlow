import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { BackendSession, Job } from '../../backendClient'
import { createJob, humanizeJobsFlowError, listMyJobs } from '../../backendClient'
import { formatCents } from '../../lib/format'

function salaryLabel(job: Job) {
  if (job.salaryMinCents == null && job.salaryMaxCents == null) return 'Compensation on request'
  const min = job.salaryMinCents == null ? '' : formatCents(job.salaryMinCents, job.salaryCurrency)
  const max = job.salaryMaxCents == null ? '' : formatCents(job.salaryMaxCents, job.salaryCurrency)
  return [min, max].filter(Boolean).join(' – ')
}

const workplaceLabels: Record<string, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' }
const employmentLabels: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
}

function postedWhen(createdAt: string) {
  const then = new Date(`${createdAt.replace(' ', 'T')}Z`).getTime()
  const days = Math.floor((Date.now() - then) / 86_400_000)
  if (days <= 0) return 'today'
  return `${days}d ago`
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
        <div className="jf-list">
          {jobs.map((job) => (
            <div className="jf-item" key={job.id}>
              <div className="jf-item-head">
                <div className="jf-logo-sq">{(job.title[0] ?? 'J').toUpperCase()}</div>
                <div className="jf-meta">
                  <strong>{job.title}</strong>
                  <span>
                    {job.company} · {job.location} · {salaryLabel(job)} ·{' '}
                    {workplaceLabels[job.workplaceType] ?? job.workplaceType} ·{' '}
                    {employmentLabels[job.employmentType] ?? job.employmentType}
                  </span>
                </div>
                <span className={`jf-pill ${job.status === 'open' ? 'jf-open' : 'jf-draft'}`}>{job.status}</span>
              </div>
              {job.requiredSkills.length ? (
                <div className="jf-item-skills">
                  {job.requiredSkills.map((skill) => <span key={skill}>{skill}</span>)}
                </div>
              ) : null}
              {job.description ? (
                <p className="jf-desc">{job.description}</p>
              ) : (
                <p className="jf-empty">No description added.</p>
              )}
              <div className="jf-item-actions" style={{ justifyContent: 'space-between' }}>
                <span className="jf-msg">
                  {job.applicantCount} applicant{job.applicantCount === 1 ? '' : 's'} · posted {postedWhen(job.createdAt)}
                </span>
                <button className="jf-btn jf-btn-ghost" onClick={() => navigate(`../candidates?job=${job.id}`)} type="button">
                  Review applicants
                </button>
              </div>
            </div>
          ))}
          {jobs.length === 0 ? <p className="jf-empty">No roles yet. Publish your first role on the right.</p> : null}
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
