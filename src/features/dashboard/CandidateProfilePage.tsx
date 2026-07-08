import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import type { BackendSession, ResumeArtifact } from '../../backendClient'
import { getProfile, humanizeJobsFlowError, listResumes, saveProfile, uploadResume } from '../../backendClient'

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
    setIsUploading(true)
    setFileMessage('Uploading…')
    try {
      await uploadResume(selectedFile)
      setSelectedFile(null)
      setFileMessage('Uploaded. You can attach it when you apply.')
      const files = await listResumes()
      setResumeFiles(files.resumes)
    } catch (error) {
      setFileMessage(humanizeJobsFlowError(error, 'resume'))
    } finally {
      setIsUploading(false)
    }
  }

  const chars = resumeText.trim().length

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

      <div className="jf-panel jf-profile">
        <h3 style={{ margin: 0 }}>Resume file</h3>
        <p className="jf-msg" style={{ margin: 0 }}>
          Optional — attach an actual PDF/DOCX so employers can download it. Your pasted text above is what drives matching.
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
                <span className="jf-msg">{file.filename} · {(file.sizeBytes / 1024).toFixed(1)} KB</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <p className="jf-msg">
        Your resume is only used to compute your fit for roles you choose to apply to or preview. It is never shared without you applying.
      </p>
    </main>
  )
}
