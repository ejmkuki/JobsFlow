import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import type { BackendSession, ResumeArtifact } from '../../backendClient'
import { deleteAccount, deleteResume, exportAccountData, getProfile, humanizeJobsFlowError, listResumes, saveProfile, uploadResume } from '../../backendClient'
import { evaluateResumeHealth } from '../../lib/resumeHealth'

export function CandidateProfilePage({ session }: { session: BackendSession | null }) {
  const [headline, setHeadline] = useState('')
  const [resumeText, setResumeText] = useState('')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const [resumeFiles, setResumeFiles] = useState<ResumeArtifact[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [fileMessage, setFileMessage] = useState('')

  const [dataMessage, setDataMessage] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  const load = useCallback(async () => {
    if (!session) return
    try {
      const [profile, files] = await Promise.all([getProfile(), listResumes()])
      setHeadline(profile.profile.headline)
      setResumeText(profile.profile.resumeText)
      setUpdatedAt(profile.profile.updatedAt)
      setResumeFiles(files.resumes)
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    }
  }, [session])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsBusy(true)
    setMessage('Saving…')
    try {
      await saveProfile({ resumeText: resumeText.trim(), headline: headline.trim() })
      setMessage('Saved. Your match scores now use this resume.')
      await load()
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    } finally {
      setIsBusy(false)
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null)
  }

  async function handleFileUpload() {
    if (!selectedFile) {
      setFileMessage('Choose a PDF or DOCX file first.')
      return
    }
    const file = selectedFile
    setIsUploading(true)
    setFileMessage('Uploading…')
    try {
      const { resume } = await uploadResume(file)
      setSelectedFile(null)

      // The server already extracted this file's text once (falling back to
      // OCR for a scanned/unreadable PDF) — reuse that result rather than
      // re-running extraction client-side. Never overwrite text the
      // candidate already saved.
      if (resume.extractedText && !resumeText.trim()) {
        await saveProfile({ resumeText: resume.extractedText, headline: headline.trim() })
        await load()
        setFileMessage(
          resume.textSource === 'ocr'
            ? 'Uploaded and read via OCR (this looked like a scanned PDF) — the extracted text now drives your match scores. Double-check it below.'
            : 'Uploaded and extracted your resume text below — it now drives your match scores.',
        )
        return
      }

      if (!resumeText.trim() && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') || file.name.toLowerCase().endsWith('.docx'))) {
        setFileMessage('Uploaded, but could not read text from this file automatically — paste your resume text above.')
        await load()
        return
      }

      await load()
      setFileMessage('Uploaded.')
    } catch (error) {
      setFileMessage(humanizeJobsFlowError(error, 'resume'))
    } finally {
      setIsUploading(false)
    }
  }

  async function handleFileDelete(file: ResumeArtifact) {
    if (typeof window !== 'undefined' && !window.confirm(`Delete "${file.filename}"? This cannot be undone.`)) return
    setFileMessage('Deleting…')
    try {
      await deleteResume(file.id)
      setFileMessage('Deleted.')
      await load()
    } catch (error) {
      setFileMessage(humanizeJobsFlowError(error, 'resume'))
    }
  }

  async function handleExport() {
    setIsExporting(true)
    setDataMessage('Preparing your export…')
    try {
      const result = await exportAccountData()
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `jobsflow-data-export-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      setDataMessage('Downloaded.')
    } catch (error) {
      setDataMessage(humanizeJobsFlowError(error, 'backend'))
    } finally {
      setIsExporting(false)
    }
  }

  async function handleDelete() {
    setIsDeleting(true)
    setDataMessage('')
    try {
      await deleteAccount(deleteConfirmEmail.trim())
      window.location.href = '/auth'
    } catch (error) {
      setDataMessage(humanizeJobsFlowError(error, 'backend'))
      setIsDeleting(false)
    }
  }

  const chars = resumeText.trim().length
  const health = useMemo(() => evaluateResumeHealth(resumeText), [resumeText])

  return (
    <main className="jf-page">
      <div>
        <h1>Profile</h1>
        <p className="jf-sub">Paste your resume once. JobsFlow uses it to score how well you match each role — honestly, not by keyword stuffing.</p>
      </div>

      {message ? <p className="jf-msg">{message}</p> : null}

      <form className="jf-panel jf-profile" onSubmit={handleSave}>
        <label>
          Headline
          <input
            onChange={(event) => setHeadline(event.target.value)}
            placeholder="Senior Database Engineer · 8y Oracle & MongoDB"
            value={headline}
          />
        </label>
        <label>
          Resume text
          <textarea
            onChange={(event) => setResumeText(event.target.value)}
            placeholder="Paste your full resume here — experience, skills, achievements. Plain text is fine."
            rows={16}
            value={resumeText}
          />
        </label>
        <div className="jf-profile-foot">
          <span className="jf-msg">
            {chars > 0 ? `${chars.toLocaleString()} characters` : 'No resume yet — add one to get scored.'}
            {updatedAt ? ` · saved` : ''}
          </span>
          <button className="jf-btn jf-btn-primary" disabled={isBusy} type="submit">
            Save profile
          </button>
        </div>
      </form>

      {chars > 0 ? (
        <div className="jf-panel jf-profile">
          <h3 style={{ margin: 0 }}>Resume health</h3>
          <p className="jf-msg" style={{ margin: 0 }}>
            A quick, deterministic check of your resume text — not job-specific, and not AI-scored. Same honesty rule as everywhere else: every box is checked by a plain rule you can see below.
          </p>
          <div className="jf-progress"><i style={{ width: `${(health.done / health.total) * 100}%` }} /></div>
          <p className="jf-msg" style={{ marginTop: -6, marginBottom: 8 }}>{health.done} of {health.total} checks pass</p>
          {health.checks.map((check) => (
            <div className="jf-check" key={check.id}>
              <span className={`jf-tick ${check.done ? 'done' : 'todo'}`}>
                {check.done ? (
                  <svg aria-hidden="true" fill="none" height="12" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" width="12"><path d="M20 6 9 17l-5-5" /></svg>
                ) : null}
              </span>
              <div className="jf-ck-body">
                <strong>{check.label}</strong>
                <span>{check.detail}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="jf-panel jf-profile">
        <h3 style={{ margin: 0 }}>Resume file</h3>
        <p className="jf-msg" style={{ margin: 0 }}>
          Attach a PDF/DOCX so employers can download it. JobsFlow reads its text automatically if the field above is empty —
          scanned PDFs are read via OCR if a direct text read fails. The rare file that still can't be read needs a manual paste.
        </p>
        <div className="jf-item-actions" style={{ justifyContent: 'flex-start' }}>
          <input accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFileChange} type="file" />
          <button className="jf-btn jf-btn-primary" disabled={isUploading} onClick={() => void handleFileUpload()} type="button">
            {isUploading ? 'Uploading…' : 'Upload file'}
          </button>
        </div>
        {fileMessage ? <p className="jf-msg" style={{ margin: 0 }}>{fileMessage}</p> : null}
        {resumeFiles.length ? (
          <div className="jf-list">
            {resumeFiles.map((file) => (
              <div className="jf-item" key={file.id} style={{ padding: '10px 14px' }}>
                <div className="jf-item-actions" style={{ justifyContent: 'space-between' }}>
                  <span className="jf-msg">{file.filename} · {(file.sizeBytes / 1024).toFixed(1)} KB</span>
                  <button className="jf-btn jf-btn-sm jf-btn-danger" onClick={() => void handleFileDelete(file)} type="button">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <p className="jf-msg">
        Your resume is only used to compute your fit for roles you choose to apply to or preview. It is never shared without you applying.
      </p>

      <div className="jf-panel jf-profile">
        <h3 style={{ margin: 0 }}>Your data</h3>
        <p className="jf-msg" style={{ margin: 0 }}>
          Download everything JobsFlow holds about you, or permanently delete your account and every trace of it.
        </p>
        {dataMessage ? <p className="jf-msg">{dataMessage}</p> : null}
        <div className="jf-item-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="jf-btn jf-btn-ghost" disabled={isExporting} onClick={() => void handleExport()} type="button">
            {isExporting ? 'Preparing…' : 'Export my data (JSON)'}
          </button>
          {!showDeleteConfirm ? (
            <button className="jf-btn jf-btn-danger" onClick={() => setShowDeleteConfirm(true)} type="button">
              Delete my account
            </button>
          ) : null}
        </div>
        {showDeleteConfirm ? (
          <div className="jf-item" style={{ gap: 8 }}>
            <p className="jf-msg" style={{ margin: 0 }}>
              This permanently deletes your profile, resumes, applications, saved jobs, and notifications. It cannot be undone.
              Type <strong>{session?.email}</strong> to confirm.
            </p>
            <input
              className="jf-item-note"
              onChange={(event) => setDeleteConfirmEmail(event.target.value)}
              placeholder={session?.email ?? 'your email'}
              value={deleteConfirmEmail}
            />
            <div className="jf-item-actions" style={{ justifyContent: 'flex-start' }}>
              <button
                className="jf-btn jf-btn-danger"
                disabled={isDeleting || deleteConfirmEmail.trim().toLowerCase() !== (session?.email ?? '').toLowerCase()}
                onClick={() => void handleDelete()}
                type="button"
              >
                {isDeleting ? 'Deleting…' : 'Permanently delete my account'}
              </button>
              <button className="jf-btn jf-btn-ghost" disabled={isDeleting} onClick={() => setShowDeleteConfirm(false)} type="button">
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  )
}
