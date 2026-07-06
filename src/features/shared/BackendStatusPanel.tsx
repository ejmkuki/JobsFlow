import type { AuditEvent, BackendHealth, BackendSession } from '../../backendClient'
import { getBackendHealth, getBackendSession, humanizeJobsFlowError, listAuditEvents, sendEmailTest } from '../../backendClient'
import { StatusPill } from '../../components/ui'
import { formatProductLabel, friendlyUserMessage } from '../../lib/format'
import { DatabaseZap, MailCheck, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

export function BackendStatusPanel({
  session,
  onSessionChange,
}: {
  session: BackendSession | null
  onSessionChange: (session: BackendSession | null) => void
}) {
  const [health, setHealth] = useState<BackendHealth | null>(null)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [message, setMessage] = useState('Checking whether JobsFlow is ready to protect real workspace data...')
  const [isBusy, setIsBusy] = useState(false)

  const refreshBackend = useCallback(async () => {
    setIsBusy(true)
    try {
      const nextHealth = await getBackendHealth()
      setHealth(nextHealth)
      setMessage(
        nextHealth.databaseReady
          ? 'JobsFlow is online. Workspace data, packet review, and activity history are ready.'
          : 'JobsFlow is online, but one workspace area still needs attention.',
      )

      try {
        const nextSession = await getBackendSession()
        onSessionChange(nextSession.session)
      } catch {
        onSessionChange(null)
      }
    } catch (error) {
      setHealth(null)
      onSessionChange(null)
      setMessage(humanizeJobsFlowError(error, 'backend'))
    } finally {
      setIsBusy(false)
    }
  }, [onSessionChange])

  async function loadAuditEvents() {
    setIsBusy(true)
    try {
      const result = await listAuditEvents()
      setAuditEvents(result.events)
      setMessage(`${result.events.length} activity item${result.events.length === 1 ? '' : 's'} loaded for this workspace.`)
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'audit'))
    } finally {
      setIsBusy(false)
    }
  }

  async function sendOutboundEmailTest() {
    if (!session) {
      setMessage('Start a workspace first, then JobsFlow can send a test email to the signed-in address.')
      return
    }

    setIsBusy(true)
    try {
      const result = await sendEmailTest()
      setMessage(`Test email sent to ${result.recipient}. Check your inbox in a moment.`)
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'email'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshBackend()
  }, [refreshBackend])

  const bindingRows: Array<[string, boolean]> = health
    ? [
        ['Workspace data', health.bindings.db],
        ['Resume storage', health.bindings.resumeBucket],
        ['Secure sessions', health.bindings.sessionSecret],
        ['Invite access', health.bindings.bootstrapToken],
        ['Account sign-in', Boolean(health.features?.ssoProvider)],
        ['Outbound email', Boolean(health.features?.outboundEmail || health.bindings.emailProvider)],
        ['Packet review engine', Boolean(health.features?.packetReviewEngine)],
      ]
    : []

  return (
    <article className="panel backend-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>Live workspace readiness</span>
          <h3>Secure workspaces, resume storage, and activity trails</h3>
        </div>
        <StatusPill tone={health?.databaseReady ? 'green' : 'amber'}>
          {health ? 'Ready' : 'Checking'}
        </StatusPill>
      </div>
      <div className="backend-grid">
        <div className="backend-card">
          <strong>JobsFlow services</strong>
          <p>{friendlyUserMessage(message)}</p>
          <div className="backend-actions">
            <button disabled={isBusy} onClick={refreshBackend} type="button">
              <RefreshCw size={16} aria-hidden="true" />
              Refresh
            </button>
            <button disabled={isBusy} onClick={loadAuditEvents} type="button">
              <DatabaseZap size={16} aria-hidden="true" />
              Load activity history
            </button>
            <button
              disabled={isBusy || !session || !(health?.features?.outboundEmail || health?.bindings.emailProvider)}
              onClick={sendOutboundEmailTest}
              type="button"
            >
              <MailCheck size={16} aria-hidden="true" />
              Send email test
            </button>
          </div>
        </div>
        <div className="backend-card">
          <strong>Readiness</strong>
          <div className="binding-grid">
            {bindingRows.length ? (
              bindingRows.map(([label, ready]) => (
                <div className="binding-row" key={label}>
                  <span>{label}</span>
                  <StatusPill tone={ready ? 'green' : 'amber'}>{ready ? 'Ready' : 'Needs attention'}</StatusPill>
                </div>
              ))
            ) : (
              <p>Open the deployed app to inspect live readiness.</p>
            )}
          </div>
        </div>
        <div className="backend-card">
          <strong>Active session</strong>
          {session ? (
            <div className="session-summary">
              <span>{session.email}</span>
              <small>
                {session.role} workspace
              </small>
            </div>
          ) : (
            <p>No active JobsFlow workspace.</p>
          )}
        </div>
      </div>
      <div className="audit-preview">
        {auditEvents.map((event) => (
          <div className="audit-preview-row" key={event.id}>
            <span>{formatProductLabel(event.eventType)}</span>
            <strong>{formatProductLabel(event.action)}</strong>
            <small>{formatProductLabel(event.riskLevel)} risk</small>
          </div>
        ))}
      </div>
    </article>
  )
}
