import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { BackendSession, Job } from '../../backendClient'
import { createJob, deleteJob, humanizeJobsFlowError, listMyJobs, suggestJobIntake, updateJob } from '../../backendClient'
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

const emptyForm = {
  title: '',
  location: 'Remote',
  salaryMin: '',
  salaryMax: '',
  skills: '',
  niceToHaveSkills: '',
  description: '',
  employmentType: 'full_time',
  workplaceType: 'remote',
  status: 'open' as 'open' | 'paused' | 'closed' | 'draft',
}

export function EmployerJobsPage({ session }: { session: BackendSession | null }) {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<Job[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [message, setMessage] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [isSuggesting, setIsSuggesting] = useState(false)
  const [shareJobId, setShareJobId] = useState<string | null>(null)
  const [copyMessage, setCopyMessage] = useState('')

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => setCopyMessage(`${label} copied.`))
      .catch(() => setCopyMessage('Could not copy — select and copy manually.'))
  }

  function set<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function refresh() {
    if (!session) return
    listMyJobs()
      .then((result) => setJobs(result.jobs))
      .catch((error) => setMessage(humanizeJobsFlowError(error, 'backend')))
  }

  useEffect(refresh, [session])

  function resetForm() {
    setEditingId(null)
    setForm(emptyForm)
  }

  function loadForEdit(job: Job) {
    setEditingId(job.id)
    setForm({
      title: job.title,
      location: job.location,
      salaryMin: job.salaryMinCents == null ? '' : String(Math.round(job.salaryMinCents / 100)),
      salaryMax: job.salaryMaxCents == null ? '' : String(Math.round(job.salaryMaxCents / 100)),
      skills: job.requiredSkills.join(', '),
      niceToHaveSkills: job.niceToHaveSkills.join(', '),
      description: job.description,
      employmentType: job.employmentType,
      workplaceType: job.workplaceType,
      status: (job.status as typeof emptyForm.status) ?? 'open',
    })
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.title.trim()) {
      setMessage('Give the role a title before saving.')
      return
    }
    setIsBusy(true)
    setMessage(editingId ? 'Saving…' : 'Publishing…')
    const payload = {
      title: form.title.trim(),
      location: form.location.trim() || 'Remote',
      description: form.description.trim(),
      requiredSkills: form.skills.split(',').map((skill) => skill.trim()).filter(Boolean),
      niceToHaveSkills: form.niceToHaveSkills.split(',').map((skill) => skill.trim()).filter(Boolean),
      salaryMinCents: form.salaryMin ? Math.round(Number(form.salaryMin) * 100) : null,
      salaryMaxCents: form.salaryMax ? Math.round(Number(form.salaryMax) * 100) : null,
      employmentType: form.employmentType,
      workplaceType: form.workplaceType,
      status: form.status,
    }
    try {
      if (editingId) {
        await updateJob(editingId, payload)
        setMessage('Changes saved.')
      } else {
        await createJob(payload)
        setMessage('Role published. Candidates can find and apply to it now.')
      }
      resetForm()
      refresh()
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    } finally {
      setIsBusy(false)
    }
  }

  async function handleSuggest() {
    if (!form.description.trim()) {
      setMessage('Paste the raw job description below, then run AI cleanup.')
      return
    }
    setIsSuggesting(true)
    setMessage('Cleaning up with AI…')
    try {
      const { suggestion } = await suggestJobIntake(form.description)
      setForm((prev) => ({
        ...prev,
        title: suggestion.title || prev.title,
        location: suggestion.location || prev.location,
        salaryMin: suggestion.salaryMinUsd != null ? String(suggestion.salaryMinUsd) : prev.salaryMin,
        salaryMax: suggestion.salaryMaxUsd != null ? String(suggestion.salaryMaxUsd) : prev.salaryMax,
        skills: suggestion.skills.length ? suggestion.skills.join(', ') : prev.skills,
        niceToHaveSkills: suggestion.niceToHaveSkills.length ? suggestion.niceToHaveSkills.join(', ') : prev.niceToHaveSkills,
        description: suggestion.description || prev.description,
      }))
      setMessage('AI suggestions applied below — review and edit before publishing.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    } finally {
      setIsSuggesting(false)
    }
  }

  async function handleDelete(job: Job) {
    const hasApplicants = job.applicantCount > 0
    const warning = hasApplicants
      ? `Delete "${job.title}"? This also removes its ${job.applicantCount} applicant${job.applicantCount === 1 ? '' : 's'} and cannot be undone.`
      : `Delete "${job.title}"? This cannot be undone.`
    if (typeof window !== 'undefined' && !window.confirm(warning)) return
    setIsBusy(true)
    try {
      await deleteJob(job.id)
      if (editingId === job.id) resetForm()
      setMessage('Role deleted.')
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
            <div className={`jf-item${editingId === job.id ? ' jf-item-editing' : ''}`} key={job.id}>
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
              {job.requiredSkills.length || job.niceToHaveSkills.length ? (
                <div className="jf-item-skills">
                  {job.requiredSkills.map((skill) => <span key={skill}>{skill}</span>)}
                  {job.niceToHaveSkills.map((skill) => <span className="jf-skill-optional" key={skill} title="Nice to have">{skill}</span>)}
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
                <span className="jf-item-btns">
                  <button className="jf-btn jf-btn-sm jf-btn-ghost" onClick={() => navigate(`../candidates?job=${job.id}`)} type="button">
                    Review applicants
                  </button>
                  {job.status === 'open' ? (
                    <button
                      className="jf-btn jf-btn-sm jf-btn-ghost"
                      onClick={() => {
                        setCopyMessage('')
                        setShareJobId((current) => (current === job.id ? null : job.id))
                      }}
                      type="button"
                    >
                      Share / Embed
                    </button>
                  ) : null}
                  <button className="jf-btn jf-btn-sm jf-btn-ghost" disabled={isBusy} onClick={() => loadForEdit(job)} type="button">
                    Edit
                  </button>
                  <button className="jf-btn jf-btn-sm jf-btn-danger" disabled={isBusy} onClick={() => handleDelete(job)} type="button">
                    Delete
                  </button>
                </span>
              </div>
              {shareJobId === job.id ? (
                <div className="jf-item" style={{ gap: 8, marginTop: 4 }}>
                  <div>
                    <p className="jf-msg" style={{ margin: '0 0 4px' }}>Public link</p>
                    <div className="jf-item-actions">
                      <input className="jf-item-note" readOnly value={`https://jobsflowai.ai/jobs/${job.slug}`} />
                      <button
                        className="jf-btn jf-btn-sm jf-btn-ghost"
                        onClick={() => copyToClipboard(`https://jobsflowai.ai/jobs/${job.slug}`, 'Link')}
                        type="button"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="jf-msg" style={{ margin: '0 0 4px' }}>Embed on your careers page</p>
                    <div className="jf-item-actions">
                      <input
                        className="jf-item-note"
                        readOnly
                        value={`<script src="https://jobsflowai.ai/embed.js" data-job="${job.slug}" async></script>`}
                      />
                      <button
                        className="jf-btn jf-btn-sm jf-btn-ghost"
                        onClick={() =>
                          copyToClipboard(
                            `<script src="https://jobsflowai.ai/embed.js" data-job="${job.slug}" async></script>`,
                            'Embed code',
                          )
                        }
                        type="button"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  {copyMessage ? <p className="jf-msg" style={{ margin: 0 }}>{copyMessage}</p> : null}
                </div>
              ) : null}
            </div>
          ))}
          {jobs.length === 0 ? <p className="jf-empty">No roles yet. Publish your first role on the right.</p> : null}
        </div>

        <form className="jf-post" onSubmit={handleSubmit}>
          <div className="jf-post-head">
            <h3>{editingId ? 'Edit role' : 'Post a role'}</h3>
            {editingId ? (
              <button className="jf-btn jf-btn-ghost" onClick={resetForm} type="button">
                Cancel
              </button>
            ) : null}
          </div>
          <label>
            Role title *
            <input onChange={(event) => set('title', event.target.value)} placeholder="Product Operations Manager" value={form.title} />
          </label>
          <div className="jf-post-row">
            <label>
              Location
              <input onChange={(event) => set('location', event.target.value)} value={form.location} />
            </label>
            <label>
              Min(US$)
              <input inputMode="numeric" onChange={(event) => set('salaryMin', event.target.value.replace(/\D/g, ''))} value={form.salaryMin} />
            </label>
            <label>
              Max(US$)
              <input inputMode="numeric" onChange={(event) => set('salaryMax', event.target.value.replace(/\D/g, ''))} value={form.salaryMax} />
            </label>
          </div>
          <div className="jf-post-row">
            <label>
              Workplace
              <select onChange={(event) => set('workplaceType', event.target.value)} value={form.workplaceType}>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">On-site</option>
              </select>
            </label>
            <label>
              Employment
              <select onChange={(event) => set('employmentType', event.target.value)} value={form.employmentType}>
                <option value="full_time">Full-time</option>
                <option value="part_time">Part-time</option>
                <option value="contract">Contract</option>
                <option value="internship">Internship</option>
              </select>
            </label>
            <label>
              Status
              <select onChange={(event) => set('status', event.target.value as typeof emptyForm.status)} value={form.status}>
                <option value="open">Open</option>
                <option value="paused">Paused</option>
                <option value="closed">Closed</option>
                <option value="draft">Draft</option>
              </select>
            </label>
          </div>
          <label>
            Must-have skills (comma separated)
            <input onChange={(event) => set('skills', event.target.value)} placeholder="Product operations, Healthcare SaaS" value={form.skills} />
          </label>
          <label>
            Nice-to-have skills (comma separated)
            <input onChange={(event) => set('niceToHaveSkills', event.target.value)} placeholder="Figma, Spanish fluency" value={form.niceToHaveSkills} />
          </label>
          <label>
            Job Description
            <textarea onChange={(event) => set('description', event.target.value)} rows={editingId ? 10 : 6} value={form.description} />
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button
              className="jf-btn jf-btn-ghost jf-btn-sm"
              disabled={isSuggesting || !form.description.trim()}
              onClick={() => void handleSuggest()}
              style={{ alignSelf: 'flex-start' }}
              type="button"
            >
              {isSuggesting ? 'Cleaning up…' : 'Clean up with AI'}
            </button>
            <span className="jf-msg" style={{ margin: 0 }}>
              Paste a raw job posting above, then run this to fill in the title, location, salary, and must-have skills, and to strip boilerplate from the description — the full role content stays, only generic filler is removed.
            </span>
          </div>
          <button className="jf-btn jf-btn-primary" disabled={isBusy || !form.title.trim()} type="submit" style={{ alignSelf: 'flex-start' }}>
            {editingId ? 'Save changes' : 'Publish role'}
          </button>
        </form>
      </div>
    </main>
  )
}
