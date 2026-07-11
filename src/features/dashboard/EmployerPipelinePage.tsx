import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { BackendSession, Job, JobApplicant, MatchMethod } from '../../backendClient'
import {
  advanceApplication,
  getOverdueApplicationsCount,
  humanizeJobsFlowError,
  listJobApplicants,
  listMyJobs,
  parseMatchRationale,
} from '../../backendClient'
import { formatCents } from '../../lib/format'
import { ApplicantDetailModal } from './ApplicantDetailModal'

const workplaceLabels: Record<string, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' }
const employmentLabels: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
}

function salaryLabel(job: Job) {
  if (job.salaryMinCents == null && job.salaryMaxCents == null) return 'Compensation on request'
  const min = job.salaryMinCents == null ? '' : formatCents(job.salaryMinCents, job.salaryCurrency)
  const max = job.salaryMaxCents == null ? '' : formatCents(job.salaryMaxCents, job.salaryCurrency)
  return [min, max].filter(Boolean).join(' – ')
}

function methodLabel(method: MatchMethod) {
  if (method === 'ai') return 'AI match'
  if (method === 'keyword') return 'Keyword match'
  return 'Not scored'
}

type Column = { status: string; label: string; color: string; extra?: string[] }

const columns: Column[] = [
  { status: 'submitted', label: 'New', color: '#0284c7' },
  { status: 'employer_review', label: 'In review', color: '#0e7490' },
  { status: 'screen', label: 'Screen', color: '#0e7490' },
  { status: 'interview', label: 'Interview', color: '#b45309' },
  { status: 'offer', label: 'Offer', color: '#15803d' },
  { status: 'rejected', label: 'Not moving forward', color: '#6a7887', extra: ['withdrawn'] },
]

const moveTargets: Array<{ value: string; label: string }> = [
  { value: 'employer_review', label: 'In review' },
  { value: 'screen', label: 'Screen' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'rejected', label: 'Decline' },
]

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

type Sla = { klass: string; label: string } | null

function slaState(dueAt: string | null, status: string): Sla {
  if (!dueAt || status === 'offer' || status === 'rejected' || status === 'withdrawn') {
    return null
  }
  const due = new Date(`${dueAt.replace(' ', 'T')}Z`).getTime()
  const now = Date.now()
  const days = (due - now) / 86_400_000
  if (days < 0) return { klass: 'jf-over', label: `Overdue ${Math.ceil(-days)}d` }
  if (days <= 2) return { klass: 'jf-due', label: `Reply due ${Math.max(1, Math.ceil(days))}d` }
  return { klass: 'jf-ok', label: 'On track' }
}

function relativeDay(createdAt: string) {
  const then = new Date(`${createdAt.replace(' ', 'T')}Z`).getTime()
  const days = Math.floor((Date.now() - then) / 86_400_000)
  if (days <= 0) return 'Applied today'
  return `Applied ${days}d ago`
}

export function EmployerPipelinePage({ session }: { session: BackendSession | null }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const jobParam = searchParams.get('job')
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string>(jobParam ?? '')
  const [applicants, setApplicants] = useState<JobApplicant[]>([])
  const [message, setMessage] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [openApplicationId, setOpenApplicationId] = useState<string | null>(null)
  const [overdueAcrossJobs, setOverdueAcrossJobs] = useState(0)

  useEffect(() => {
    if (!session) return
    getOverdueApplicationsCount()
      .then((result) => setOverdueAcrossJobs(result.overdueCount))
      .catch(() => {}) // advisory rollup — a failed fetch here shouldn't block the page
  }, [session])

  useEffect(() => {
    if (!session) return
    listMyJobs()
      .then((result) => {
        setJobs(result.jobs)
        const preferred = jobParam && result.jobs.some((job) => job.id === jobParam) ? jobParam : ''
        setSelectedJobId((current) => preferred || current || result.jobs[0]?.id || '')
      })
      .catch((error) => setMessage(humanizeJobsFlowError(error, 'backend')))
  }, [session, jobParam])

  const loadApplicants = useCallback(async (jobId: string) => {
    if (!jobId) {
      setApplicants([])
      return
    }
    try {
      const result = await listJobApplicants(jobId)
      setApplicants(result.applicants)
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    }
  }, [])

  useEffect(() => {
    void loadApplicants(selectedJobId)
  }, [selectedJobId, loadApplicants])

  async function move(applicationId: string, status: string) {
    setIsBusy(true)
    try {
      await advanceApplication({ applicationId, status })
      await loadApplicants(selectedJobId)
      void getOverdueApplicationsCount().then((result) => setOverdueAcrossJobs(result.overdueCount))
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    } finally {
      setIsBusy(false)
    }
  }

  const activeJob = jobs.find((job) => job.id === selectedJobId)
  const grouped = useMemo(() => {
    const map: Record<string, JobApplicant[]> = {}
    for (const column of columns) {
      map[column.status] = applicants.filter(
        (applicant) => applicant.status === column.status || column.extra?.includes(applicant.status),
      )
    }
    return map
  }, [applicants])

  const activeCount = applicants.filter((a) => !['rejected', 'withdrawn'].includes(a.status)).length
  const interviewing = applicants.filter((a) => a.status === 'interview').length
  const overdue = applicants.filter((a) => slaState(a.employerSlaDueAt, a.status)?.klass === 'jf-over').length

  return (
    <main className="jf-content">
      <div className="jf-page-head">
        <div>
          <h1>Candidates</h1>
          <p>Move applicants through your pipeline. Every stage change is logged and starts a response clock.</p>
        </div>
        <div className="jf-head-actions">
          {jobs.length > 0 ? (
            <select className="jf-select" onChange={(event) => setSelectedJobId(event.target.value)} value={selectedJobId}>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title} · {job.applicantCount} applicant{job.applicantCount === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          ) : null}
          <button className="jf-btn jf-btn-primary" onClick={() => navigate('../jobs')} type="button">
            + New role
          </button>
        </div>
      </div>

      {overdueAcrossJobs > 0 ? (
        <div className="jf-banner jf-banner-warn">
          <strong>{overdueAcrossJobs}</strong> applicant{overdueAcrossJobs === 1 ? '' : 's'} overdue across your open roles — reply soon to avoid ghosting candidates.
        </div>
      ) : null}

      <section className="jf-tiles">
        <div className="jf-tile"><div className="jf-k">Open roles</div><div className="jf-v">{jobs.filter((j) => j.status === 'open').length}</div><div className="jf-d">across your team</div></div>
        <div className="jf-tile"><div className="jf-k">Active candidates</div><div className="jf-v">{activeCount}</div><div className="jf-d">in this pipeline</div></div>
        <div className="jf-tile"><div className="jf-k">Interviewing</div><div className="jf-v">{interviewing}</div><div className="jf-d">this role</div></div>
        <div className="jf-tile"><div className="jf-k">Overdue replies</div><div className="jf-v">{overdue}</div><div className="jf-d">this role — {overdueAcrossJobs} total above</div></div>
      </section>

      {activeJob ? (
        <details className="jf-job-summary">
          <summary>
            <strong>{activeJob.title}</strong>
            <span className="jf-msg">
              {activeJob.company} · {activeJob.location} · {salaryLabel(activeJob)} ·{' '}
              {workplaceLabels[activeJob.workplaceType] ?? activeJob.workplaceType} ·{' '}
              {employmentLabels[activeJob.employmentType] ?? activeJob.employmentType}
            </span>
          </summary>
          {activeJob.requiredSkills.length || activeJob.niceToHaveSkills.length ? (
            <div className="jf-item-skills">
              {activeJob.requiredSkills.map((skill) => <span key={skill}>{skill}</span>)}
              {activeJob.niceToHaveSkills.map((skill) => <span className="jf-skill-optional" key={skill} title="Nice to have">{skill}</span>)}
            </div>
          ) : null}
          {activeJob.description ? <p className="jf-desc">{activeJob.description}</p> : <p className="jf-empty">No description added.</p>}
        </details>
      ) : null}

      {message ? <p className="jf-msg">{message}</p> : null}

      {jobs.length === 0 ? (
        <p className="jf-msg">No roles yet. Post a role from the Jobs tab to open your first pipeline.</p>
      ) : (
        <div className="jf-board-wrap">
          <div className="jf-board">
            {columns.map((column) => (
              <div className="jf-col" key={column.status}>
                <div className="jf-col-head">
                  <span className="jf-swatch" style={{ background: column.color }} />
                  <strong>{column.label}</strong>
                  <span className="jf-n">{grouped[column.status]?.length ?? 0}</span>
                </div>
                <div className="jf-col-body">
                  {(grouped[column.status] ?? []).length === 0 ? (
                    <p className="jf-col-empty">Empty</p>
                  ) : null}
                  {(grouped[column.status] ?? []).map((applicant) => {
                    const sla = slaState(applicant.employerSlaDueAt, applicant.status)
                    const closed = applicant.status === 'rejected' || applicant.status === 'withdrawn'
                    return (
                      <div
                        className="jf-card jf-card-clickable"
                        key={applicant.id}
                        onClick={() => setOpenApplicationId(applicant.id)}
                        style={closed ? { opacity: 0.72 } : undefined}
                      >
                        <div className="jf-card-top">
                          <div className="jf-avatar" style={closed ? { background: '#6a7887' } : undefined}>
                            {initials(applicant.candidateName)}
                          </div>
                          <div className="jf-who">
                            <strong>{applicant.candidateName}</strong>
                            <span>{applicant.candidateEmail}</span>
                          </div>
                          <div className="jf-fit">
                            <b>{applicant.matchMethod === 'unscored' ? '—' : `${applicant.readinessScore}%`}</b>
                            <small>Match</small>
                          </div>
                        </div>
                        <div className="jf-chips">
                          <span className="jf-chip">{methodLabel(applicant.matchMethod)}</span>
                          {(() => {
                            const gap = parseMatchRationale(applicant.matchRationale).gaps[0]
                            return gap ? <span className="jf-chip jf-gap">Missing: {gap}</span> : null
                          })()}
                          {applicant.coverNote ? <span className="jf-chip jf-evi">Note</span> : null}
                          {applicant.resumeArtifactId ? <span className="jf-chip jf-evi">Resume</span> : null}
                        </div>
                        <div className="jf-card-foot">
                          <span className="jf-when">{relativeDay(applicant.createdAt)}</span>
                          {sla ? (
                            <span className={`jf-sla ${sla.klass}`}>
                              <span className="jf-sdot" />
                              {sla.label}
                            </span>
                          ) : null}
                        </div>
                        {!closed ? (
                          <select
                            className="jf-move"
                            disabled={isBusy}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              if (event.target.value) void move(applicant.id, event.target.value)
                            }}
                            value=""
                          >
                            <option value="">Move to…</option>
                            {moveTargets
                              .filter((target) => target.value !== applicant.status)
                              .map((target) => (
                                <option key={target.value} value={target.value}>
                                  {target.label}
                                </option>
                              ))}
                          </select>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="jf-msg">
        <strong style={{ color: 'var(--jf-teal)' }}>Match</strong> is computed from each candidate's resume against {activeJob?.title ?? 'this role'} —
        AI-scored when available, keyword-scored otherwise. Not a black box.
      </p>

      {openApplicationId ? (
        <ApplicantDetailModal
          applicationId={openApplicationId}
          onClose={() => setOpenApplicationId(null)}
          onMoved={() => void loadApplicants(selectedJobId)}
        />
      ) : null}
    </main>
  )
}
