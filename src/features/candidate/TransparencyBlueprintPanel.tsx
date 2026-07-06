import type { BackendSession, TransparencyBlueprintState } from '../../backendClient'
import { createTransparencyReport, getTransparencyBlueprintState, humanizeJobsFlowError } from '../../backendClient'
import { EvidenceList, StatusPill } from '../../components/ui'
import { applicationPacket } from '../../data/candidate'
import { formatCents, friendlyUserMessage } from '../../lib/format'
import { RefreshCw, Scale } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

export function TransparencyBlueprintPanel({ session }: { session: BackendSession | null }) {
  const [transparencyState, setTransparencyState] = useState<TransparencyBlueprintState | null>(null)
  const [message, setMessage] = useState('Start a workspace, then JobsFlow can load salary and culture transparency.')
  const [isBusy, setIsBusy] = useState(false)
  const latestReport = transparencyState?.reports[0] ?? null
  const latestSalary = transparencyState?.salaries[0] ?? null
  const cultureSignals = transparencyState?.cultureSignals.slice(0, 4) ?? []

  const refreshTransparency = useCallback(async () => {
    if (!session) {
      setTransparencyState(null)
      setMessage('Start a workspace first, then JobsFlow can read transparency blueprints.')
      return
    }

    setIsBusy(true)
    try {
      const result = await getTransparencyBlueprintState()
      setTransparencyState(result.state)
      setMessage(
        result.state.summary.reports
          ? `${result.state.summary.reports} transparency blueprint${result.state.summary.reports === 1 ? '' : 's'} available.`
          : 'No transparency blueprint yet. Create one for the target role.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'transparency'))
    } finally {
      setIsBusy(false)
    }
  }, [session])

  async function createKoraBlueprint() {
    if (!session) {
      setMessage('Start a workspace before creating a transparency blueprint.')
      return
    }

    setIsBusy(true)
    setMessage('Building anonymized salary and culture blueprint...')
    try {
      const result = await createTransparencyReport({
        cultureSignals: [
          {
            evidence: ['Interview plan shared before scheduling', 'Recruiter outlined response expectations'],
            label: 'Process clarity',
            sentiment: 'positive',
            verificationCount: 5,
          },
          {
            evidence: ['Product and implementation teams use weekly risk review', 'Launch readiness ownership is visible'],
            label: 'Operating rhythm',
            sentiment: 'positive',
            verificationCount: 4,
          },
          {
            evidence: ['Delivery load can spike around enterprise launches'],
            label: 'Workload boundaries',
            sentiment: 'mixed',
            verificationCount: 2,
          },
        ],
        location: 'United States remote/hybrid',
        salaryRange: {
          currency: 'USD',
          maxCents: 14200000,
          minCents: 11800000,
        },
        targetCompany: applicationPacket.company,
        targetRole: applicationPacket.role,
      })
      setTransparencyState(result.state)
      setMessage('Transparency blueprint created with salary bands, anonymity floors, and culture risks.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'transparency'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshTransparency()
  }, [refreshTransparency])

  return (
    <article className="panel transparency-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>Transparency Blueprint Portal</span>
          <h3>Verified salary bands and anonymized culture signals</h3>
        </div>
        <StatusPill tone={latestReport ? 'green' : 'amber'}>
          {latestReport ? `${transparencyState?.summary.latestConfidenceScore ?? 0}% confidence` : 'No blueprint yet'}
        </StatusPill>
      </div>
      <div className="kernel-actions">
        <button disabled={isBusy || !session} onClick={createKoraBlueprint} type="button">
          <Scale size={16} aria-hidden="true" />
          Create blueprint
        </button>
        <button disabled={isBusy || !session} onClick={refreshTransparency} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          Refresh transparency
        </button>
      </div>
      <p className="runtime-message">{friendlyUserMessage(message)}</p>
      <div className="transparency-grid">
        <div className="transparency-salary-card">
          <strong>{latestReport?.targetRole ?? applicationPacket.role}</strong>
          <span>{latestReport?.targetCompany ?? applicationPacket.company}</span>
          <div className="salary-band">
            <b>{formatCents(latestReport?.salaryPercentiles.p25 ?? latestSalary?.salaryMinCents, latestReport?.salaryPercentiles.currency ?? latestSalary?.currency)}</b>
            <b>{formatCents(latestReport?.salaryPercentiles.p50, latestReport?.salaryPercentiles.currency ?? latestSalary?.currency)}</b>
            <b>{formatCents(latestReport?.salaryPercentiles.p75 ?? latestSalary?.salaryMaxCents, latestReport?.salaryPercentiles.currency ?? latestSalary?.currency)}</b>
          </div>
          <small>P25 / midpoint / P75, stored as anonymized workspace evidence</small>
        </div>
        <div className="transparency-risk-card">
          <strong>Risk flags</strong>
          <EvidenceList items={latestReport?.riskFlags ?? ['Create a blueprint to reveal negotiation and culture risk.']} />
        </div>
        <div className="transparency-culture-list">
          <strong>Culture conditions</strong>
          {cultureSignals.length ? (
            cultureSignals.map((signal) => (
              <div className="transparency-culture-row" key={signal.id}>
                <StatusPill tone={signal.sentiment === 'positive' ? 'green' : signal.sentiment === 'negative' ? 'red' : 'amber'}>
                  {signal.sentiment}
                </StatusPill>
                <div>
                  <strong>{signal.signalLabel}</strong>
                  <span>
                    {signal.verificationCount} confirmation{signal.verificationCount === 1 ? '' : 's'} /{' '}
                    {signal.anonymityFloorMet ? 'anonymity floor met' : 'masked'}
                  </span>
                  <p>{signal.evidence[0]}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="kernel-empty">No culture blueprint signals yet.</div>
          )}
        </div>
      </div>
    </article>
  )
}
