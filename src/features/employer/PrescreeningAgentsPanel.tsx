import type { BackendSession, PrescreeningState } from '../../backendClient'
import { getPrescreeningState, humanizeJobsFlowError, runPrescreeningSession } from '../../backendClient'
import { EvidenceList, StatusPill } from '../../components/ui'
import { applicationPacket } from '../../data/candidate'
import { friendlyUserMessage } from '../../lib/format'
import { MessageSquareText, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

export function PrescreeningAgentsPanel({ session }: { session: BackendSession | null }) {
  const [prescreeningState, setPrescreeningState] = useState<PrescreeningState | null>(null)
  const [message, setMessage] = useState('Start an employer workspace, then JobsFlow can run conversational pre-screening.')
  const [isBusy, setIsBusy] = useState(false)
  const latestSession = prescreeningState?.sessions[0] ?? null
  const latestDecision = latestSession
    ? prescreeningState?.decisions.find((decision) => decision.sessionId === latestSession.id) ?? null
    : null
  const transcript = latestSession
    ? (prescreeningState?.messages ?? []).filter((item) => item.sessionId === latestSession.id).slice().reverse()
    : []

  const refreshPrescreening = useCallback(async () => {
    if (!session) {
      setPrescreeningState(null)
      setMessage('Start an employer workspace first, then JobsFlow can load pre-screening sessions.')
      return
    }

    setIsBusy(true)
    try {
      const result = await getPrescreeningState()
      setPrescreeningState(result.state)
      setMessage(
        result.state.summary.sessions
          ? `${result.state.summary.sessions} pre-screening session${result.state.summary.sessions === 1 ? '' : 's'} recorded.`
          : 'No pre-screening sessions yet. Run one against the minimum criteria.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'prescreening'))
    } finally {
      setIsBusy(false)
    }
  }, [session])

  async function runKoraPrescreen() {
    if (!session) {
      setMessage('Start an employer workspace before running pre-screening.')
      return
    }

    setIsBusy(true)
    setMessage('Running criteria-bound conversational pre-screening...')
    try {
      const result = await runPrescreeningSession({
        baselineSkills: ['Product operations', 'Healthcare SaaS', 'Vendor governance'],
        candidateAlias: 'Candidate JFC-1428',
        candidateSkills: ['Product operations', 'Healthcare SaaS', 'Operational reporting'],
        company: applicationPacket.company,
        knockoutCriteria: ['Needs sponsorship immediately', 'Cannot start within 90 days'],
        roleTitle: applicationPacket.role,
        timelineDays: 21,
        visaStatus: 'authorized',
      })
      setPrescreeningState(result.state)
      setMessage('Pre-screening complete. Transcript and decision are saved before scheduling.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'prescreening'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshPrescreening()
  }, [refreshPrescreening])

  return (
    <article className="panel prescreening-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>Conversational Pre-Screening Agents</span>
          <h3>Minimum criteria before scheduling</h3>
        </div>
        <StatusPill tone={latestSession?.status === 'qualified' ? 'green' : latestSession?.status === 'disqualified' ? 'red' : 'amber'}>
          {latestSession ? `${latestSession.score}% ${latestSession.status.replaceAll('_', ' ')}` : 'No session yet'}
        </StatusPill>
      </div>
      <div className="kernel-actions">
        <button disabled={isBusy || !session} onClick={runKoraPrescreen} type="button">
          <MessageSquareText size={16} aria-hidden="true" />
          Run pre-screen
        </button>
        <button disabled={isBusy || !session} onClick={refreshPrescreening} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          Refresh sessions
        </button>
      </div>
      <p className="runtime-message">{friendlyUserMessage(message)}</p>
      <div className="prescreening-grid">
        <div className="prescreening-score-card">
          <strong>{latestSession?.score ?? 0}%</strong>
          <span>{latestSession?.candidateAlias ?? 'Candidate pending'}</span>
          <p>{latestDecision?.recommendation ?? 'Run pre-screening to create a scheduling decision.'}</p>
        </div>
        <div>
          <strong>Criteria passed</strong>
          <EvidenceList items={latestDecision?.minimumCriteria.length ? latestDecision.minimumCriteria : ['No criteria checked yet']} />
        </div>
        <div>
          <strong>Risks</strong>
          <EvidenceList items={latestDecision?.risks.length ? latestDecision.risks : ['No knockout risk recorded']} />
        </div>
        <div>
          <strong>Transcript</strong>
          <div className="prescreening-transcript">
            {transcript.length ? (
              transcript.map((item) => (
                <div className="prescreening-message-row" key={item.id}>
                  <span>{item.sender}</span>
                  <p>{item.messageText}</p>
                </div>
              ))
            ) : (
              <div className="kernel-empty">No transcript yet.</div>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
