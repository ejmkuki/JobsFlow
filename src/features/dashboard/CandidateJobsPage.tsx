import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bookmark, Search, SendHorizontal } from 'lucide-react'
import type { BackendSession, CandidateApplication, Job, JobBrowseFilters, MatchResult, ResumeArtifact, SavedJob, SavedSearch } from '../../backendClient'
import {
  applyToJob,
  deleteSavedSearch,
  humanizeJobsFlowError,
  listMyApplications,
  listOpenJobs,
  listResumes,
  listSavedJobs,
  listSavedSearches,
  previewMatch,
  saveJob,
  saveSearch,
  unsaveJob,
} from '../../backendClient'
import { formatCents } from '../../lib/format'

const workplaceLabels: Record<string, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' }
const employmentLabels: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
}

function methodLabel(method: MatchResult['method']) {
  if (method === 'ai') return 'AI match'
  if (method === 'keyword') return 'Keyword match'
  return 'Not scored'
}

function salaryLabel(job: Job) {
  if (job.salaryMinCents == null && job.salaryMaxCents == null) return 'Compensation on request'
  const min = job.salaryMinCents == null ? '' : formatCents(job.salaryMinCents, job.salaryCurrency)
  const max = job.salaryMaxCents == null ? '' : formatCents(job.salaryMaxCents, job.salaryCurrency)
  return [min, max].filter(Boolean).join(' – ')
}

export function CandidateJobsPage({ session }: { session: BackendSession | null }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [workplaceType, setWorkplaceType] = useState(searchParams.get('workplaceType') ?? '')
  const [employmentType, setEmploymentType] = useState(searchParams.get('employmentType') ?? '')
  const [salaryMin, setSalaryMin] = useState(searchParams.get('salaryMin') ?? '')
  const [postedWithinDays, setPostedWithinDays] = useState(searchParams.get('postedWithinDays') ?? '')
  const [savedOnly, setSavedOnly] = useState(false)
  const [jobs, setJobs] = useState<Job[]>([])
  const [applications, setApplications] = useState<CandidateApplication[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [fits, setFits] = useState<Record<string, { match: MatchResult; resumeLabel: string } | 'loading'>>({})
  const [resumeFiles, setResumeFiles] = useState<ResumeArtifact[]>([])
  const [selectedResumeId, setSelectedResumeId] = useState('')
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([])
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [message, setMessage] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  // A withdrawn or declined application doesn't block reapplying — only an
  // application still in an active stage does.
  const appliedJobIds = useMemo(
    () =>
      new Set(
        applications
          .filter((application) => application.status !== 'withdrawn' && application.status !== 'rejected')
          .map((application) => application.jobId),
      ),
    [applications],
  )
  const savedJobIds = useMemo(() => new Set(savedJobs.map((saved) => saved.jobId)), [savedJobs])
  const visibleJobs = savedOnly ? jobs.filter((job) => savedJobIds.has(job.id)) : jobs

  const load = useCallback(async () => {
    if (!session) return
    const filters: JobBrowseFilters = {
      query: searchParams.get('q') ?? undefined,
      workplaceType: searchParams.get('workplaceType') ?? undefined,
      employmentType: searchParams.get('employmentType') ?? undefined,
      salaryMin: searchParams.get('salaryMin') ? Number(searchParams.get('salaryMin')) : undefined,
      postedWithinDays: searchParams.get('postedWithinDays') ? Number(searchParams.get('postedWithinDays')) : undefined,
    }
    try {
      const [jobsResult, appsResult, resumesResult, savedResult] = await Promise.all([
        listOpenJobs(filters),
        listMyApplications(),
        listResumes(),
        listSavedJobs(),
      ])
      setJobs(jobsResult.jobs)
      setApplications(appsResult.applications)
      setResumeFiles(resumesResult.resumes)
      setSavedJobs(savedResult.savedJobs)
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    }
  }, [session, searchParams])

  useEffect(() => {
    if (!session) return
    listSavedSearches()
      .then((result) => setSavedSearches(result.savedSearches))
      .catch(() => {}) // advisory panel — a failed fetch shouldn't block the page
  }, [session])

  useEffect(() => {
    void load()
  }, [load])

  function buildFilterParams() {
    const params: Record<string, string> = {}
    if (query.trim()) params.q = query.trim()
    if (workplaceType) params.workplaceType = workplaceType
    if (employmentType) params.employmentType = employmentType
    if (salaryMin) params.salaryMin = salaryMin
    if (postedWithinDays) params.postedWithinDays = postedWithinDays
    return params
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSearchParams(buildFilterParams())
  }

  async function handleToggleSaveJob(job: Job) {
    const isSaved = savedJobIds.has(job.id)
    if (isSaved) {
      setSavedJobs((prev) => prev.filter((saved) => saved.jobId !== job.id))
    } else {
      setSavedJobs((prev) => [
        {
          jobId: job.id,
          title: job.title,
          company: job.company,
          location: job.location,
          employmentType: job.employmentType,
          workplaceType: job.workplaceType,
          requiredSkills: job.requiredSkills,
          salaryMinCents: job.salaryMinCents,
          salaryMaxCents: job.salaryMaxCents,
          salaryCurrency: job.salaryCurrency,
          status: job.status,
          savedAt: new Date().toISOString(),
        },
        ...prev,
      ])
    }
    try {
      if (isSaved) await unsaveJob(job.id)
      else await saveJob(job.id)
    } catch (error) {
      await load() // resync on failure rather than leave an inconsistent optimistic state
      setMessage(humanizeJobsFlowError(error, 'backend'))
    }
  }

  async function handleSaveSearch() {
    if (!query.trim() && !workplaceType && !employmentType && !salaryMin) {
      setMessage('Add at least one filter before saving a search.')
      return
    }
    try {
      await saveSearch({
        query: query.trim() || undefined,
        workplaceType: workplaceType || undefined,
        employmentType: employmentType || undefined,
        salaryMinCents: salaryMin ? Math.round(Number(salaryMin) * 100) : undefined,
      })
      const result = await listSavedSearches()
      setSavedSearches(result.savedSearches)
      setMessage('Search saved — you\'ll get an email when new roles match it.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    }
  }

  async function handleDeleteSavedSearch(id: string) {
    setSavedSearches((prev) => prev.filter((saved) => saved.id !== id))
    try {
      await deleteSavedSearch(id)
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    }
  }

  function handleApplySavedSearch(saved: SavedSearch) {
    setQuery(saved.query)
    setWorkplaceType(saved.workplaceType ?? '')
    setEmploymentType(saved.employmentType ?? '')
    setSalaryMin(saved.salaryMinCents ? String(Math.round(saved.salaryMinCents / 100)) : '')
    setSearchParams({
      ...(saved.query ? { q: saved.query } : {}),
      ...(saved.workplaceType ? { workplaceType: saved.workplaceType } : {}),
      ...(saved.employmentType ? { employmentType: saved.employmentType } : {}),
      ...(saved.salaryMinCents ? { salaryMin: String(Math.round(saved.salaryMinCents / 100)) } : {}),
    })
  }

  async function handleCheckFit(job: Job) {
    const resumeLabel = selectedResumeId
      ? resumeFiles.find((file) => file.id === selectedResumeId)?.filename ?? 'selected resume'
      : 'your profile resume'
    setFits((current) => ({ ...current, [job.id]: 'loading' }))
    try {
      const result = await previewMatch(job.id, selectedResumeId || undefined)
      setFits((current) => ({ ...current, [job.id]: { match: result.match, resumeLabel } }))
    } catch (error) {
      setFits((current) => {
        const next = { ...current }
        delete next[job.id]
        return next
      })
      setMessage(humanizeJobsFlowError(error, 'backend'))
    }
  }

  async function handleApply(job: Job) {
    const resumeLabel = selectedResumeId
      ? resumeFiles.find((file) => file.id === selectedResumeId)?.filename ?? 'selected resume'
      : 'your profile resume'
    setIsBusy(true)
    setMessage(`Applying to ${job.title}…`)
    try {
      const result = await applyToJob({
        jobId: job.id,
        coverNote: notes[job.id]?.trim() ?? '',
        resumeArtifactId: selectedResumeId || undefined,
      })
      setFits((current) => ({ ...current, [job.id]: { match: result.match, resumeLabel } }))
      setMessage(`Applied to ${job.title} at ${job.company} — ${result.match.score}% match.`)
      await load()
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
        <form className="jf-post-row" onSubmit={handleSearch} style={{ marginTop: 12 }}>
          <label>
            Workplace
            <select onChange={(event) => setWorkplaceType(event.target.value)} value={workplaceType}>
              <option value="">Any</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On-site</option>
            </select>
          </label>
          <label>
            Employment
            <select onChange={(event) => setEmploymentType(event.target.value)} value={employmentType}>
              <option value="">Any</option>
              <option value="full_time">Full-time</option>
              <option value="part_time">Part-time</option>
              <option value="contract">Contract</option>
              <option value="internship">Internship</option>
            </select>
          </label>
          <label>
            Min salary (US$)
            <input inputMode="numeric" onChange={(event) => setSalaryMin(event.target.value.replace(/\D/g, ''))} placeholder="e.g. 130000" value={salaryMin} />
          </label>
          <label>
            Posted within
            <select onChange={(event) => setPostedWithinDays(event.target.value)} value={postedWithinDays}>
              <option value="">Any time</option>
              <option value="1">24 hours</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
            </select>
          </label>
        </form>
        <div className="jf-item-actions" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
          <button className="jf-btn jf-btn-ghost jf-btn-sm" onClick={handleSaveSearch} type="button">
            Save this search
          </button>
          <label className="jf-msg" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input checked={savedOnly} onChange={(event) => setSavedOnly(event.target.checked)} type="checkbox" />
            Saved jobs only
          </label>
        </div>
        {savedSearches.length ? (
          <div className="jf-item-skills" style={{ marginTop: 10 }}>
            {savedSearches.map((saved) => (
              <span className="jf-savedsearch" key={saved.id}>
                <button onClick={() => handleApplySavedSearch(saved)} type="button">{saved.label}</button>
                <button aria-label={`Delete saved search ${saved.label}`} className="jf-savedsearch-x" onClick={() => void handleDeleteSavedSearch(saved.id)} type="button">×</button>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {message ? <p className="jf-msg">{message}</p> : null}

      <div className="jf-list">
        {visibleJobs.map((job) => {
          const applied = appliedJobIds.has(job.id)
          const isSaved = savedJobIds.has(job.id)
          return (
            <div className="jf-item" key={job.id}>
              <div className="jf-item-head">
                <div className="jf-logo-sq">{(job.company[0] ?? 'J').toUpperCase()}</div>
                <div className="jf-meta">
                  <strong>{job.title}</strong>
                  <span>
                    {job.company} · {job.location} · {salaryLabel(job)} ·{' '}
                    {workplaceLabels[job.workplaceType] ?? job.workplaceType} · {employmentLabels[job.employmentType] ?? job.employmentType}
                  </span>
                </div>
                <button
                  aria-label={isSaved ? 'Unsave job' : 'Save job'}
                  aria-pressed={isSaved}
                  className={`jf-bookmark${isSaved ? ' jf-bookmark-on' : ''}`}
                  onClick={() => void handleToggleSaveJob(job)}
                  title={isSaved ? 'Saved' : 'Save for later'}
                  type="button"
                >
                  <Bookmark aria-hidden="true" fill={isSaved ? 'currentColor' : 'none'} size={17} />
                </button>
                {applied ? <span className="jf-status jf-green">Applied</span> : null}
              </div>
              {job.requiredSkills.length || job.niceToHaveSkills.length ? (
                <div className="jf-item-skills">
                  {job.requiredSkills.map((skill) => <span key={skill}>{skill}</span>)}
                  {job.niceToHaveSkills.map((skill) => <span className="jf-skill-optional" key={skill} title="Nice to have">{skill}</span>)}
                </div>
              ) : null}
              {job.description ? <p className="jf-desc">{job.description}</p> : null}
              {(() => {
                const fit = fits[job.id]
                if (!fit) return null
                if (fit === 'loading') return <p className="jf-msg">Checking your fit…</p>
                return (
                  <div className="jf-fitcard">
                    <div className="jf-fit-head">
                      <b>{fit.match.score}% fit</b>
                      <span className="jf-chip">{methodLabel(fit.match.method)}</span>
                      <span className="jf-msg">Scored against {fit.resumeLabel}</span>
                    </div>
                    {fit.match.summary ? <p className="jf-msg" style={{ margin: 0 }}>{fit.match.summary}</p> : null}
                    {fit.match.gaps.length ? (
                      <div className="jf-item-skills">
                        {fit.match.gaps.slice(0, 6).map((gap) => <span className="jf-gap" key={gap}>Missing: {gap}</span>)}
                      </div>
                    ) : null}
                  </div>
                )
              })()}
              {!applied ? (
                <div className="jf-item-actions">
                  <input
                    className="jf-item-note"
                    onChange={(event) => setNotes((current) => ({ ...current, [job.id]: event.target.value }))}
                    placeholder="Cover letter (optional)"
                    value={notes[job.id] ?? ''}
                  />
                  {resumeFiles.length ? (
                    <select
                      aria-label="Attach resume file"
                      className="jf-select"
                      onChange={(event) => setSelectedResumeId(event.target.value)}
                      value={selectedResumeId}
                    >
                      <option value="">No file attached (score from profile)</option>
                      {resumeFiles.map((file) => (
                        <option key={file.id} value={file.id}>
                          {file.filename}{file.hasText ? '' : ' (text not read yet)'}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <button className="jf-btn jf-btn-ghost" disabled={fits[job.id] === 'loading'} onClick={() => void handleCheckFit(job)} type="button">
                    Check fit
                  </button>
                  <button className="jf-btn jf-btn-primary" disabled={isBusy} onClick={() => void handleApply(job)} type="button">
                    <SendHorizontal size={15} aria-hidden="true" /> Apply
                  </button>
                </div>
              ) : null}
            </div>
          )
        })}
        {visibleJobs.length === 0 ? (
          <p className="jf-empty">
            {savedOnly ? 'No saved jobs among your current results yet.' : 'No open roles match yet. Try a different search.'}
          </p>
        ) : null}
      </div>
    </main>
  )
}
