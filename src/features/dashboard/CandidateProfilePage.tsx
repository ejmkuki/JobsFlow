import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { BackendSession } from '../../backendClient'
import { getProfile, humanizeJobsFlowError, saveProfile } from '../../backendClient'

export function CandidateProfilePage({ session }: { session: BackendSession | null }) {
  const [headline, setHeadline] = useState('')
  const [resumeText, setResumeText] = useState('')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const load = useCallback(async () => {
    if (!session) return
    try {
      const result = await getProfile()
      setHeadline(result.profile.headline)
      setResumeText(result.profile.resumeText)
      setUpdatedAt(result.profile.updatedAt)
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

      <p className="jf-msg">
        Your resume is only used to compute your fit for roles you choose to apply to or preview. It is never shared without you applying.
      </p>
    </main>
  )
}
