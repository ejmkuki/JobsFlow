import type { BackendSession, ResumeArtifact } from '../../backendClient'
import { humanizeJobsFlowError, listResumes, uploadResume } from '../../backendClient'
import { friendlyUserMessage } from '../../lib/format'
import { DatabaseZap, FileCheck2, FileText, RefreshCw } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'

export function ResumeStoragePanel({
  session,
  variant = 'panel',
}: {
  session: BackendSession | null
  variant?: 'panel' | 'activation'
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [resumes, setResumes] = useState<ResumeArtifact[]>([])
  const [status, setStatus] = useState('Choose a PDF or DOCX resume. JobsFlow will keep it private to this workspace.')
  const [isUploading, setIsUploading] = useState(false)
  const isActivation = variant === 'activation'

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    setSelectedFile(file)
    setStatus(file ? `${file.name} is ready to store privately.` : 'Choose a PDF or DOCX resume. JobsFlow will keep it private to this workspace.')
  }

  async function handleUpload() {
    if (!session) {
      setStatus('Start a workspace first, then resume storage will unlock.')
      return
    }

    if (!selectedFile) {
      setStatus('Choose a resume first, then JobsFlow can store it safely.')
      return
    }

    setIsUploading(true)
    setStatus('Storing this resume inside the active workspace...')

    try {
      const result = await uploadResume(selectedFile)
      setStatus(
        `${result.resume.filename} is stored privately. JobsFlow recorded the activity history.`,
      )
      const nextResumes = await listResumes()
      setResumes(nextResumes.resumes)
    } catch (error) {
      setStatus(humanizeJobsFlowError(error, 'resume'))
    } finally {
      setIsUploading(false)
    }
  }

  const refreshResumes = useCallback(async () => {
    if (!session) {
      setResumes([])
      setStatus('Start a workspace first, then JobsFlow can show stored resume metadata.')
      return
    }

    setIsUploading(true)
    try {
      const result = await listResumes()
      setResumes(result.resumes)
      setStatus(`${result.resumes.length} resume file${result.resumes.length === 1 ? '' : 's'} visible in this workspace.`)
    } catch (error) {
      setStatus(humanizeJobsFlowError(error, 'resume'))
    } finally {
      setIsUploading(false)
    }
  }, [session])

  useEffect(() => {
    if (session) {
      void refreshResumes()
    } else {
      setResumes([])
    }
  }, [refreshResumes, session])

  return (
    <article className={isActivation ? 'resume-storage-panel activation-resume' : 'panel resume-storage-panel'}>
      <div className="panel-title">
        <div>
          <span>Secure resume storage</span>
          <h3>{isActivation ? 'Upload resume and begin' : 'Private resume workspace'}</h3>
        </div>
        <DatabaseZap size={22} aria-hidden="true" />
      </div>
      <p className="muted-line">
        Your file stays private to this workspace. JobsFlow stores the resume, keeps
        metadata workspace-protected, and records the action for review history.
      </p>
      <div className="upload-control">
        <input
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileChange}
          type="file"
        />
        <button disabled={isUploading} onClick={handleUpload} type="button">
          <FileCheck2 size={16} aria-hidden="true" />
          {isUploading ? 'Uploading...' : 'Upload resume'}
        </button>
        <button disabled={isUploading} onClick={refreshResumes} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
      </div>
      <p className="runtime-message">{friendlyUserMessage(status)}</p>
      <div className="resume-artifact-list">
        {resumes.map((resume) => (
          <div className="resume-artifact-row" key={resume.id}>
            <FileText size={16} aria-hidden="true" />
            <div>
              <strong>{resume.filename}</strong>
              <span>
                {(resume.sizeBytes / 1024).toFixed(1)} KB / {resume.approvalStatus}
              </span>
            </div>
          </div>
        ))}
      </div>
    </article>
  )
}
