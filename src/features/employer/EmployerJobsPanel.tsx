import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Building2, Send, UsersRound } from 'lucide-react'
import type { BackendSession, Job, JobApplicant } from '../../backendClient'
import {
  advanceApplication,
  createJob,
  humanizeJobsFlowError,
  listJobApplicants,
  listMyJobs,
} from '../../backendClient'
import { SectionHeader, StatusPill } from '../../components/ui'
import { formatCents } from '../../lib/format'
import type { Tone } from '../../types'

const statusLabels: Record<string, string> = {
  submitted: 'New',
  employer_review: 'In review',
  screen: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Declined',
  withdrawn: 'Withdrawn',
}

const nextStages: Array<{ value: string; label: string; tone: Tone }> = [
  { value: 'employer_review', label: 'Review', tone: 'blue' },
  { value: 'screen', label: 'Screen', tone: 'blue' },
  { value: 'interview', label: 'Interview', tone: 'amber' },
  { value: 'offer', label: 'Offer', tone: 'green' },
  { value: 'rejected', label: 'Decline', tone: 'red' },
]

function salaryLabel(job: Job) {
  if (job.salaryMinCents == null && job.salaryMaxCents == null) {
    return 'Compensation on request'
  }
  const min = job.salaryMinCents == null ? '' : formatCents(job.salaryMinCents, job.salaryCurrency)
  const max = job.salaryMaxCents == null ? '' : formatCents(job.salaryMaxCents, job.salaryCurrency)
  return [min, max].filter(Boolean).join(' - ')
}

export function EmployerJobsPanel({ session }: { session: BackendSession | null }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [applicants, setApplicants] = useState<JobApplicant[]>([])
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('Remote')
  const [salaryMin, setSalaryMin] = useState('')
  const [salaryMax, setSalaryMax] = useState('')
  const [skills, setSkills] = useState('')
  const [description, setDescription] = useState('')
  const [message, setMessage] = useState('Post a role, then review real applicants here.')
  const [isBusy, setIsBusy] = useState(false)

  const refreshJobs = useCallback(async () => {
    if (!session) {
      return
    }
    try {
      const result = await listMyJobs()
      setJobs(result.jobs)
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    }
  }, [session])

  useEffect(() => {
    void refreshJobs()
  }, [refreshJobs])

  const loadApplicants = useCallback(async (jobId: string) => {
    setSelectedJobId(jobId)
    try {
      const result = await listJobApplicants(jobId)
      setApplicants(result.applicants)
      setMessage(
        result.applicants.length
          ? `${result.applicants.length} applicant${result.applicants.length === 1 ? '' : 's'}, ranked by readiness.`
          : 'No applicants yet. Share the role to start the pipeline.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    }
  }, [])

  async function handlePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session) {
      setMessage('Start an employer workspace before posting a role.')
      return
    }
    if (!title.trim()) {
      setMessage('Give the role a title before posting.')
      return
    }

    setIsBusy(true)
    setMessage('Publishing the role...')
    try {
      await createJob({
        title: title.trim(),
        location: location.trim() || 'Remote',
        description: description.trim(),
        requiredSkills: skills
          .split(',')
          .map((skill) => skill.trim())
          .filter(Boolean),
        salaryMinCents: salaryMin ? Math.round(Number(salaryMin) * 100) : null,
        salaryMaxCents: salaryMax ? Math.round(Number(salaryMax) * 100) : null,
      })
      setTitle('')
      setSalaryMin('')
      setSalaryMax('')
      setSkills('')
      setDescription('')
      setMessage('Role published. Candidates can now find and apply to it.')
      await refreshJobs()
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    } finally {
      setIsBusy(false)
    }
  }

  async function handleAdvance(applicationId: string, status: string) {
    setIsBusy(true)
    try {
      await advanceApplication({ applicationId, status })
      if (selectedJobId) {
        await loadApplicants(selectedJobId)
      }
      await refreshJobs()
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <article className="panel wide-panel">
      <SectionHeader eyebrow="Employer hiring" title="Post roles and review real applicants" />

      <form className="job-post-form" onSubmit={handlePost}>
        <label>
          <span>Role title *</span>
          <input onChange={(event) => setTitle(event.target.value)} placeholder="Product Operations Manager" value={title} />
        </label>
        <div className="job-post-row">
          <label>
            <span>Location</span>
            <input onChange={(event) => setLocation(event.target.value)} value={location} />
          </label>
          <label>
            <span>Salary min ($)</span>
            <input inputMode="numeric" onChange={(event) => setSalaryMin(event.target.value.replace(/\D/g, ''))} value={salaryMin} />
          </label>
          <label>
            <span>Salary max ($)</span>
            <input inputMode="numeric" onChange={(event) => setSalaryMax(event.target.value.replace(/\D/g, ''))} value={salaryMax} />
          </label>
        </div>
        <label>
          <span>Must-have skills (comma separated)</span>
          <input onChange={(event) => setSkills(event.target.value)} placeholder="Product operations, Healthcare SaaS" value={skills} />
        </label>
        <label>
          <span>Description</span>
          <textarea onChange={(event) => setDescription(event.target.value)} rows={3} value={description} />
        </label>
        <button disabled={isBusy || !title.trim()} type="submit">
          <Send size={16} aria-hidden="true" />
          Publish role
        </button>
      </form>

      <p className="runtime-message">{message}</p>

      <div className="job-list">
        {jobs.map((job) => (
          <div className={`job-card ${selectedJobId === job.id ? 'job-card-active' : ''}`} key={job.id}>
            <div className="job-card-head">
              <div>
                <strong>{job.title}</strong>
                <span>{job.location} / {salaryLabel(job)}</span>
              </div>
              <StatusPill tone={job.status === 'open' ? 'green' : 'neutral'}>{job.status}</StatusPill>
            </div>
            <button className="job-applicants-toggle" onClick={() => void loadApplicants(job.id)} type="button">
              <UsersRound size={15} aria-hidden="true" />
              {job.applicantCount} applicant{job.applicantCount === 1 ? '' : 's'}
            </button>

            {selectedJobId === job.id ? (
              <div className="applicant-list">
                {applicants.length === 0 ? <p className="muted">No applicants yet.</p> : null}
                {applicants.map((applicant) => (
                  <div className="applicant-row" key={applicant.id}>
                    <div className="applicant-head">
                      <div>
                        <strong>{applicant.candidateName}</strong>
                        <span>{applicant.candidateEmail}</span>
                      </div>
                      <StatusPill tone="blue">{statusLabels[applicant.status] ?? applicant.status}</StatusPill>
                    </div>
                    <div className="applicant-meta">
                      <span>Readiness {applicant.readinessScore}%</span>
                      {applicant.coverNote ? <p>{applicant.coverNote}</p> : null}
                    </div>
                    {applicant.status !== 'withdrawn' ? (
                      <div className="applicant-actions">
                        {nextStages.map((stage) => (
                          <button
                            disabled={isBusy || applicant.status === stage.value}
                            key={stage.value}
                            onClick={() => void handleAdvance(applicant.id, stage.value)}
                            type="button"
                          >
                            {stage.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {jobs.length === 0 ? (
          <p className="muted">
            <Building2 size={15} aria-hidden="true" /> No roles yet. Publish one above to open your pipeline.
          </p>
        ) : null}
      </div>
    </article>
  )
}
