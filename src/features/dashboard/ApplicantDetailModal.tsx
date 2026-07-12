import { useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '../../lib/useFocusTrap'
import type {
  ApplicantNote,
  ApplicationDetail,
  ApplicationEvent,
  InterviewProposal,
  MatchMethod,
  ScorecardCriterion,
  ScorecardSubmission,
  ScorecardTemplate,
} from '../../backendClient'
import {
  addApplicantNote,
  advanceApplication,
  cancelInterviewProposal,
  confirmInterviewTime,
  getApplicationDetail,
  humanizeJobsFlowError,
  listApplicantNotes,
  listInterviewProposals,
  listScorecardSubmissions,
  parseMatchRationale,
  proposeInterviewTimes,
  resumeDownloadHref,
  saveScorecardTemplate,
  submitScorecard,
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

const recommendationLabels: Record<string, string> = {
  strong_yes: 'Strong yes',
  yes: 'Yes',
  no: 'No',
  strong_no: 'Strong no',
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
  const modalRef = useRef<HTMLDivElement>(null)
  useFocusTrap(modalRef, true, onClose)

  const [application, setApplication] = useState<ApplicationDetail | null>(null)
  const [events, setEvents] = useState<ApplicationEvent[]>([])
  const [message, setMessage] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const [notes, setNotes] = useState<ApplicantNote[]>([])
  const [noteDraft, setNoteDraft] = useState('')

  const [scorecardTemplate, setScorecardTemplate] = useState<ScorecardTemplate | null>(null)
  const [scorecardSubmissions, setScorecardSubmissions] = useState<ScorecardSubmission[]>([])
  const [scorecardAggregate, setScorecardAggregate] = useState<number | null>(null)
  const [scorecardTally, setScorecardTally] = useState<Record<string, number>>({})
  const [scoreDraft, setScoreDraft] = useState<Record<string, number>>({})
  const [recommendationDraft, setRecommendationDraft] = useState('')
  const [templateCriteria, setTemplateCriteria] = useState<ScorecardCriterion[]>([{ key: '', label: '', weight: 1 }])
  const [showTemplateForm, setShowTemplateForm] = useState(false)

  const [proposals, setProposals] = useState<InterviewProposal[]>([])
  const [slotDrafts, setSlotDrafts] = useState<string[]>(['', ''])
  const [location, setLocation] = useState('')

  async function load() {
    try {
      const result = await getApplicationDetail(applicationId)
      setApplication(result.application)
      setEvents(result.events)
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    }
  }

  async function loadNotes() {
    try {
      const result = await listApplicantNotes(applicationId)
      setNotes(result.notes)
    } catch {
      // Notes are supplementary — a load failure here shouldn't block the rest of the modal.
    }
  }

  async function loadScorecard() {
    try {
      const result = await listScorecardSubmissions(applicationId)
      setScorecardTemplate(result.template)
      setScorecardSubmissions(result.submissions)
      setScorecardAggregate(result.aggregateScore)
      setScorecardTally(result.recommendationTally)
    } catch {
      // Same as notes: secondary panel, don't surface a load error over the main detail.
    }
  }

  async function loadProposals() {
    try {
      const result = await listInterviewProposals(applicationId)
      setProposals(result.proposals)
    } catch {
      // Secondary panel.
    }
  }

  useEffect(() => {
    void load()
    void loadNotes()
    void loadScorecard()
    void loadProposals()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId])

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

  async function addNote() {
    const body = noteDraft.trim()
    if (!body) return
    setIsBusy(true)
    try {
      await addApplicantNote({ applicationId, body })
      setNoteDraft('')
      await loadNotes()
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    } finally {
      setIsBusy(false)
    }
  }

  async function saveTemplate() {
    const criteria = templateCriteria.filter((c) => c.key.trim() && c.label.trim())
    if (criteria.length === 0) {
      setMessage('Add at least one criterion.')
      return
    }
    setIsBusy(true)
    try {
      await saveScorecardTemplate({ jobId: application?.jobId, name: `${application?.jobTitle ?? 'Role'} scorecard`, criteria })
      setShowTemplateForm(false)
      await loadScorecard()
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    } finally {
      setIsBusy(false)
    }
  }

  async function saveMyScorecard() {
    if (!recommendationDraft) {
      setMessage('Choose a recommendation before saving.')
      return
    }
    setIsBusy(true)
    try {
      await submitScorecard({ applicationId, scores: scoreDraft, recommendation: recommendationDraft })
      setScoreDraft({})
      setRecommendationDraft('')
      await loadScorecard()
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    } finally {
      setIsBusy(false)
    }
  }

  async function proposeTimes() {
    const slots = slotDrafts
      .filter((value) => value)
      .map((value) => {
        const start = new Date(value)
        const end = new Date(start.getTime() + 30 * 60 * 1000)
        return { start: start.toISOString(), end: end.toISOString() }
      })
    if (slots.length === 0) {
      setMessage('Propose at least one time.')
      return
    }
    setIsBusy(true)
    try {
      await proposeInterviewTimes({ applicationId, slots, location })
      setSlotDrafts(['', ''])
      setLocation('')
      await loadProposals()
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    } finally {
      setIsBusy(false)
    }
  }

  async function confirmSlot(proposalId: string, slotIndex: number) {
    setIsBusy(true)
    try {
      await confirmInterviewTime({ proposalId, slotIndex })
      await loadProposals()
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    } finally {
      setIsBusy(false)
    }
  }

  async function cancelProposal(proposalId: string) {
    setIsBusy(true)
    try {
      await cancelInterviewProposal(proposalId)
      await loadProposals()
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    } finally {
      setIsBusy(false)
    }
  }

  if (!application) {
    return (
      <div className="jf-modal-overlay" onClick={onClose} role="presentation">
        <div className="jf-modal" onClick={(event) => event.stopPropagation()} ref={modalRef} role="dialog" aria-modal="true" tabIndex={-1}>
          <p className="jf-msg" aria-live="polite" role="status">{message || 'Loading applicant…'}</p>
        </div>
      </div>
    )
  }

  const rationale = parseMatchRationale(application.matchRationale)
  const closed = application.status === 'rejected' || application.status === 'withdrawn'

  return (
    <div className="jf-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="jf-modal"
        onClick={(event) => event.stopPropagation()}
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="applicant-modal-heading"
        tabIndex={-1}
      >
        <div className="jf-modal-head">
          <div>
            <h2 id="applicant-modal-heading">{application.candidateName}</h2>
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

        <div>
          <h3 className="jf-modal-subhead">Interview scheduling</h3>
          {proposals.length === 0 ? <p className="jf-empty">No interview times proposed yet.</p> : null}
          {proposals.map((proposal) => (
            <div className="jf-fitcard" key={proposal.id} style={{ marginBottom: 10 }}>
              <div className="jf-fit-head">
                <span className={`jf-status ${proposal.status === 'confirmed' ? 'jf-green' : proposal.status === 'cancelled' ? 'jf-red' : 'jf-amber'}`}>
                  {proposal.status === 'confirmed' ? 'Confirmed' : proposal.status === 'cancelled' ? 'Withdrawn' : 'Awaiting response'}
                </span>
                {proposal.location ? <span className="jf-msg">{proposal.location}</span> : null}
              </div>
              {proposal.status === 'confirmed' && proposal.confirmedStart ? (
                <p className="jf-msg">{new Date(proposal.confirmedStart).toLocaleString()}</p>
              ) : null}
              {proposal.status === 'pending' ? (
                <div className="jf-item-skills">
                  {proposal.slots.map((slot, index) =>
                    viewerRole === 'candidate' ? (
                      <button
                        key={index}
                        className="jf-btn jf-btn-sm jf-btn-ghost"
                        disabled={isBusy}
                        onClick={() => void confirmSlot(proposal.id, index)}
                        type="button"
                      >
                        {new Date(slot.start).toLocaleString()}
                      </button>
                    ) : (
                      <span key={index}>{new Date(slot.start).toLocaleString()}</span>
                    ),
                  )}
                </div>
              ) : null}
              {proposal.status === 'pending' && viewerRole === 'employer' ? (
                <button className="jf-btn jf-btn-sm jf-btn-ghost" disabled={isBusy} onClick={() => void cancelProposal(proposal.id)} type="button">
                  Withdraw these times
                </button>
              ) : null}
            </div>
          ))}
          {!closed && viewerRole === 'employer' ? (
            <div className="jf-item" style={{ gap: 8 }}>
              <span className="jf-msg">Propose interview times (30 min each)</span>
              {slotDrafts.map((value, index) => (
                <input
                  key={index}
                  type="datetime-local"
                  className="jf-item-note"
                  aria-label={`Proposed time ${index + 1}`}
                  value={value}
                  onChange={(event) => setSlotDrafts((prev) => prev.map((v, i) => (i === index ? event.target.value : v)))}
                />
              ))}
              <input
                type="text"
                className="jf-item-note"
                placeholder="Location or video link (optional)"
                aria-label="Location or video link (optional)"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
              <button className="jf-btn jf-btn-sm jf-btn-primary" disabled={isBusy} onClick={() => void proposeTimes()} type="button">
                Send proposal
              </button>
            </div>
          ) : null}
        </div>

        {viewerRole === 'employer' ? (
          <div>
            <h3 className="jf-modal-subhead">Interview scorecard</h3>
            {scorecardTemplate ? (
              <>
                {scorecardAggregate !== null ? (
                  <div className="jf-fitcard" style={{ marginBottom: 10 }}>
                    <div className="jf-fit-head">
                      <b>{scorecardAggregate} / 5</b>
                      <span className="jf-chip">
                        {scorecardSubmissions.length} scorecard{scorecardSubmissions.length === 1 ? '' : 's'} filed
                      </span>
                    </div>
                    <div className="jf-item-skills">
                      {Object.entries(scorecardTally)
                        .filter(([, count]) => count > 0)
                        .map(([key, count]) => (
                          <span key={key}>{recommendationLabels[key] ?? key}: {count}</span>
                        ))}
                    </div>
                  </div>
                ) : null}
                <div className="jf-timeline">
                  {scorecardSubmissions.map((submission) => (
                    <div className="jf-timeline-row" key={submission.id}>
                      <span className="jf-timeline-dot" />
                      <div>
                        <strong>{submission.interviewerName}</strong>
                        <span className="jf-msg">
                          {' '}· {recommendationLabels[submission.recommendation] ?? submission.recommendation} · {relativeTime(submission.createdAt)}
                        </span>
                        {submission.notes ? <p className="jf-msg" style={{ margin: '2px 0 0' }}>{submission.notes}</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
                {!closed ? (
                  <div className="jf-item" style={{ gap: 8, marginTop: 10 }}>
                    <span className="jf-msg">File your scorecard</span>
                    {scorecardTemplate.criteria.map((criterion) => (
                      <label key={criterion.key} className="jf-msg" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {criterion.label}
                        <select
                          className="jf-select"
                          value={scoreDraft[criterion.key] ?? ''}
                          onChange={(event) => setScoreDraft((prev) => ({ ...prev, [criterion.key]: Number(event.target.value) }))}
                        >
                          <option value="">—</option>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                    <select
                      className="jf-select"
                      aria-label="Recommendation"
                      value={recommendationDraft}
                      onChange={(event) => setRecommendationDraft(event.target.value)}
                    >
                      <option value="">Recommendation…</option>
                      <option value="strong_yes">Strong yes</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                      <option value="strong_no">Strong no</option>
                    </select>
                    <button className="jf-btn jf-btn-sm jf-btn-primary" disabled={isBusy} onClick={() => void saveMyScorecard()} type="button">
                      Save scorecard
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <div>
                <p className="jf-empty">No scorecard template yet for this role.</p>
                {!showTemplateForm ? (
                  <button className="jf-btn jf-btn-sm jf-btn-ghost" onClick={() => setShowTemplateForm(true)} type="button">
                    Set up scorecard criteria
                  </button>
                ) : (
                  <div className="jf-item" style={{ gap: 8 }}>
                    {templateCriteria.map((criterion, index) => (
                      <div key={index} className="jf-item-actions">
                        <input
                          className="jf-item-note"
                          placeholder="Key (e.g. sql)"
                          aria-label="Criterion key"
                          value={criterion.key}
                          onChange={(event) =>
                            setTemplateCriteria((prev) => prev.map((c, i) => (i === index ? { ...c, key: event.target.value } : c)))
                          }
                        />
                        <input
                          className="jf-item-note"
                          placeholder="Label (e.g. SQL depth)"
                          aria-label="Criterion label"
                          value={criterion.label}
                          onChange={(event) =>
                            setTemplateCriteria((prev) => prev.map((c, i) => (i === index ? { ...c, label: event.target.value } : c)))
                          }
                        />
                        <input
                          className="jf-item-note"
                          style={{ maxWidth: 70 }}
                          type="number"
                          min={1}
                          max={10}
                          placeholder="Weight"
                          aria-label="Criterion weight"
                          value={criterion.weight}
                          onChange={(event) =>
                            setTemplateCriteria((prev) =>
                              prev.map((c, i) => (i === index ? { ...c, weight: Number(event.target.value) || 1 } : c)),
                            )
                          }
                        />
                      </div>
                    ))}
                    <button
                      className="jf-btn jf-btn-sm jf-btn-ghost"
                      onClick={() => setTemplateCriteria((prev) => [...prev, { key: '', label: '', weight: 1 }])}
                      type="button"
                    >
                      + Add criterion
                    </button>
                    <button className="jf-btn jf-btn-sm jf-btn-primary" disabled={isBusy} onClick={() => void saveTemplate()} type="button">
                      Save template
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}

        {viewerRole === 'employer' ? (
          <div>
            <h3 className="jf-modal-subhead">Team notes</h3>
            {notes.length === 0 ? <p className="jf-empty">No notes yet. Never visible to the candidate.</p> : null}
            <div className="jf-timeline">
              {notes.map((note) => (
                <div className="jf-timeline-row" key={note.id}>
                  <span className="jf-timeline-dot" />
                  <div>
                    <strong>{note.authorName}</strong>
                    <span className="jf-msg"> · {relativeTime(note.createdAt)}</span>
                    <p className="jf-msg" style={{ margin: '2px 0 0' }}>{note.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="jf-item-actions" style={{ marginTop: 8 }}>
              <input
                className="jf-item-note"
                placeholder="Add a note… use @Name to notify a teammate"
                aria-label="Add a note"
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void addNote()
                }}
              />
              <button className="jf-btn jf-btn-sm jf-btn-primary" disabled={isBusy || !noteDraft.trim()} onClick={() => void addNote()} type="button">
                Add
              </button>
            </div>
          </div>
        ) : null}

        {message ? <p className="jf-msg" aria-live="polite" role="status">{message}</p> : null}

        {!closed && viewerRole === 'employer' ? (
          <div className="jf-modal-foot">
            <select
              className="jf-select"
              aria-label="Move applicant to stage"
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
