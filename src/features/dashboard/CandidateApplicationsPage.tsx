import { useCallback, useEffect, useState } from 'react'
import type { BackendSession, CandidateApplication } from '../../backendClient'
import { humanizeJobsFlowError, listMyApplications, withdrawApplication } from '../../backendClient'

const statusLabels: Record<string, string> = {
  submitted: 'Submitted',
  employer_review: 'In review',
  screen: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Declined',
  withdrawn: 'Withdrawn',
}
function statusTone(status: string) {
  if (status === 'offer') return 'jf-green'
  if (status === 'rejected' || status === 'withdrawn') return 'jf-red'
  if (status === 'interview' || status === 'screen') return 'jf-amber'
  return 'jf-blue'
}

export function CandidateApplicationsPage({ session }: { session: BackendSession | null }) {
  const [applications, setApplications] = useState<CandidateApplication[]>([])
  const [message, setMessage] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const load = useCallback(async () => {
    if (!session) return
    try {
      const result = await listMyApplications()
      setApplications(result.applications)
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    }
  }, [session])

  useEffect(() => {
    void load()
  }, [load])

  async function withdraw(applicationId: string) {
    setIsBusy(true)
    try {
      await withdrawApplication(applicationId)
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
        <h1>Applications</h1>
        <p className="jf-sub">Every role you have applied to, with its live status.</p>
      </div>

      {message ? <p className="jf-msg">{message}</p> : null}

      <div className="jf-panel">
        {applications.length === 0 ? (
          <p className="jf-empty">You have not applied to any roles yet.</p>
        ) : (
          <div className="jf-list">
            {applications.map((application) => (
              <div className="jf-item" key={application.id}>
                <div className="jf-item-head">
                  <div className="jf-logo-sq">{(application.company[0] ?? 'J').toUpperCase()}</div>
                  <div className="jf-meta">
                    <strong>{application.jobTitle}</strong>
                    <span>{application.company} · {application.location}</span>
                  </div>
                  <span className={`jf-status ${statusTone(application.status)}`}>
                    {statusLabels[application.status] ?? application.status}
                  </span>
                </div>
                {application.status !== 'withdrawn' && application.status !== 'rejected' ? (
                  <div className="jf-item-actions" style={{ justifyContent: 'flex-end' }}>
                    <button className="jf-btn jf-btn-ghost" disabled={isBusy} onClick={() => void withdraw(application.id)} type="button">
                      Withdraw
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
