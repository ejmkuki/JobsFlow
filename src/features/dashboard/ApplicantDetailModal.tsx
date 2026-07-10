import { useEffect, useState } from 'react'
import type { ApplicationDetail, ApplicationEvent, MatchMethod } from '../../backendClient'
import {
  advanceApplication,
  getApplicationDetail,
  humanizeJobsFlowError,
  parseMatchRationale,
  resumeDownloadHref,
  withdrawApplication,
} from '../../backendClient'

const statusLabels: Record<string, string> = {
  submitted: 'Submitted',
  employer_review: 'In review',
  screen: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Not moving forward',
  withdrawn: 'Withdrawn',
}

const moveTargets: Array<{ value: string; label: string }> = [
  { value: 'employer_review', label: 'In review' },
  { value: 'screen', label: 'Screen' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'rejected', label: 'Decline' },
]

function methodLabel(method: MatchMethod) {
  if (method === 'ai') return 'AI match'
  if (method === 'keyword') return 'Keyword match'
  return 'Not scored'
}

function relativeTime(iso: string) {
  const then = new Date(`${iso.replace(' ', 'T')}Z`).getTime()
  const days = Math.floor((Date.now() - then) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

export function ApplicantDetailModal({
  applicationId,
  viewerRole = 'employer',
  onClose,
  onMoved,
}: {
  applicationId: string
  viewerRole?: 'employer' | 'candidate'
  onClose: () => void
  onMoved: () => void
}) {
  const [application, setApplication] = useState<ApplicationDetail | null>(null)
  const [events, setEvents] = useState<ApplicationEvent[]>([])
  const [message, setMessage] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  async function load() {
    try {
      const result = await getApplicationDetail(applicationId)
      setApplication(result.application)
      setEvents(result.events)
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function move(status: string) {
    setIsBusy(true)
    try {
      await advanceApplication({ applicationId, status })
      await load()
      onMoved()
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    } finally {
      setIsBusy(false)
    }
  }

  async function withdraw() {
    setIsBusy(true)
    try {
      await withdrawApplication(applicationId)
      await load()
      onMoved()
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    } finally {
      setIsBusy(false)
    }
  }

  if (!application) {
    return (
      <div className="jf-modal-overlay" onClick={onClose} role="presentation">
        <div className="jf-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
          <p className="jf-msg">{message || 'Loading applicant…'}</p>
        </div>
      </div>
    )
  }

  const rationale = parseMatchRationale(application.matchRationale)
  const closed = application.status === 'rejected' || application.status === 'withdrawn'

  return (
    <div className="jf-modal-overlay" onClick={onClose} role="presentation">
      <div className="jf-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="jf-modal-head">
          <div>
            <h2>{application.candidateName}</h2>
            <p className="jf-msg" style={{ margin: 0 }}>{application.candidateEmail}</p>
          </div>
          <button className="jf-btn jf-btn-ghost" onClick={onClose} type="button">Close</button>
        </div>

        <div className="jf-modal-row">
          <span className={`jf-status ${closed ? 'jf-red' : 'jf-blue'}`}>{statusLabels[application.status] ?? application.status}</span>
          <span className="jf-msg">Applied to {application.jobTitle} at {application.company} · {relativeTime(application.createdAt)}</span>
        </div>

        <div className="jf-fitcard">
          <div className="jf-fit-head">
            <b>{application.matchMethod === 'unscored' ? '—' : `${application.readinessScore}%`} fit</b>
            <span className="jf-chip">{methodLabel(application.matchMethod)}</span>
          </div>
          {rationale.summary ? <p className="jf-msg" style={{ margin: 0 }}>{rationale.summary}</p> : null}
          {rationale.matched.length ? (
            <div className="jf-item-skills">
              {rationale.matched.map((item) => <span key={item}>{item}</span>)}
            </div>
          ) : null}
          {rationale.gaps.length ? (
            <div className="jf-item-skills">
              {rationale.gaps.map((gap) => <span className="jf-gap" key={gap}>Missing: {gap}</span>)}
            </div>
          ) : null}
        </div>

        <div>
          <h3 className="jf-modal-subhead">Cover letter</h3>
          {application.coverNote ? <p className="jf-msg">{application.coverNote}</p> : <p className="jf-empty">No cover letter provided.</p>}
        </div>

        <div>
          <h3 className="jf-modal-subhead">Resume</h3>
          {application.resumeArtifactId ? (
            <a className="jf-btn jf-btn-ghost" href={resumeDownloadHref(application.resumeArtifactId)}>
              Download resume file
            </a>
          ) : (
            <p className="jf-empty">No resume file attached to this application.</p>
          )}
        </div>

        <div>
          <h3 className="jf-modal-subhead">Timeline</h3>
          <div className="jf-timeline">
            {events.map((event, index) => (
              <div className="jf-timeline-row" key={index}>
                <span className="jf-timeline-dot" />
                <div>
                  <strong>{statusLabels[event.toStatus] ?? event.toStatus}</strong>
                  <span className="jf-msg">
                    {event.actorType === 'employer' ? 'You' : event.actorType === 'candidate' ? 'Candidate' : 'System'} · {relativeTime(event.createdAt)}
                  </span>
                  {event.note ? <p className="jf-msg" style={{ margin: '2px 0 0' }}>{event.note}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        {message ? <p className="jf-msg">{message}</p> : null}

        {!closed && viewerRole === 'employer' ? (
          <div className="jf-modal-foot">
            <select
              className="jf-select"
              disabled={isBusy}
              onChange={(event) => {
                if (event.target.value) void move(event.target.value)
              }}
              value=""
            >
              <option value="">Move to…</option>
              {moveTargets
                .filter((target) => target.value !== application.status)
                .map((target) => (
                  <option key={target.value} value={target.value}>{target.label}</option>
                ))}
            </select>
          </div>
        ) : null}

        {!closed && viewerRole === 'candidate' ? (
          <div className="jf-modal-foot">
            <button className="jf-btn jf-btn-ghost" disabled={isBusy} onClick={() => void withdraw()} type="button">
              Withdraw application
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
