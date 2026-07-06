import type { AtsProvider, AtsSyncState, BackendSession } from '../../backendClient'
import { getAtsSyncState, humanizeJobsFlowError, runAtsDrySync, seedAtsSyncConnections } from '../../backendClient'
import { EvidenceList, StatusPill } from '../../components/ui'
import { formatProductLabel, friendlyUserMessage } from '../../lib/format'
import { Clock3, DatabaseZap, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

export function AtsSynchronizersPanel({ session }: { session: BackendSession | null }) {
  const [atsState, setAtsState] = useState<AtsSyncState | null>(null)
  const [provider, setProvider] = useState<AtsProvider>('greenhouse')
  const [message, setMessage] = useState('Start an employer workspace, then JobsFlow can prepare hiring-system connections.')
  const [isBusy, setIsBusy] = useState(false)
  const latestRun = atsState?.runs[0] ?? null
  const latestEvents = latestRun ? (atsState?.events ?? []).filter((event) => event.syncRunId === latestRun.id).slice(0, 5) : []

  const refreshAtsSync = useCallback(async () => {
    if (!session) {
      setAtsState(null)
      setMessage('Start an employer workspace first, then JobsFlow can load hiring-system connections.')
      return
    }

    setIsBusy(true)
    try {
      const result = await getAtsSyncState()
      setAtsState(result.state)
      setMessage(
        result.state.summary.providers
          ? `${result.state.summary.providers} hiring-system connection${result.state.summary.providers === 1 ? '' : 's'} ready.`
          : 'No hiring-system connections are ready yet.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'ats-sync'))
    } finally {
      setIsBusy(false)
    }
  }, [session])

  async function seedProviders() {
    if (!session) {
      setMessage('Start an employer workspace before preparing hiring-system connections.')
      return
    }

    setIsBusy(true)
    setMessage('Preparing hiring-system connections and field maps...')
    try {
      const result = await seedAtsSyncConnections()
      setAtsState(result.state)
      setMessage('Hiring-system connections are ready. External sync remains off until you connect an account.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'ats-sync'))
    } finally {
      setIsBusy(false)
    }
  }

  async function runDrySyncPlan() {
    if (!session) {
      setMessage('Start an employer workspace before checking the hiring-system sync plan.')
      return
    }

    setIsBusy(true)
    setMessage('Checking the sync plan without changing external hiring systems...')
    try {
      const result = await runAtsDrySync(provider)
      setAtsState(result.state)
      setMessage('Sync plan checked. External updates remain blocked until a connection is approved.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'ats-sync'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshAtsSync()
  }, [refreshAtsSync])

  return (
    <article className="panel ats-sync-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>Hiring-system connections</span>
          <h3>Connection rules, field maps, and test events</h3>
        </div>
        <StatusPill tone={atsState?.summary.connectedProviders ? 'green' : latestRun?.status === 'blocked' ? 'amber' : 'blue'}>
          {atsState?.summary.connectedProviders ? `${atsState.summary.connectedProviders} connected` : 'Not connected'}
        </StatusPill>
      </div>
      <div className="ats-sync-controls">
        <label>
          <span>System</span>
          <select onChange={(event) => setProvider(event.target.value as AtsProvider)} value={provider}>
            <option value="greenhouse">Greenhouse</option>
            <option value="lever">Lever</option>
            <option value="workday">Workday</option>
          </select>
        </label>
        <div className="kernel-actions">
          <button disabled={isBusy || !session} onClick={seedProviders} type="button">
            <DatabaseZap size={16} aria-hidden="true" />
            Prepare connections
          </button>
          <button disabled={isBusy || !session} onClick={runDrySyncPlan} type="button">
            <RefreshCw size={16} aria-hidden="true" />
            Run dry sync
          </button>
          <button disabled={isBusy || !session} onClick={refreshAtsSync} type="button">
            <Clock3 size={16} aria-hidden="true" />
            Refresh systems
          </button>
        </div>
      </div>
      <p className="runtime-message">{friendlyUserMessage(message)}</p>
      <div className="ats-sync-grid">
        <div>
          <strong>Connections</strong>
          {(atsState?.connections ?? []).length ? (
            atsState?.connections.map((connection) => (
              <div className="ats-connection-row" key={connection.id}>
                <StatusPill tone={connection.oauthStatus === 'connected' ? 'green' : 'amber'}>
                  {connection.oauthStatus === 'connected' ? 'connected' : 'not connected'}
                </StatusPill>
                <div>
                  <strong>{connection.accountLabel}</strong>
                  <span>{formatProductLabel(connection.provider)} / {connection.scopes.length} permission areas</span>
                </div>
              </div>
            ))
          ) : (
            <div className="kernel-empty">No hiring-system connections yet.</div>
          )}
        </div>
        <div>
          <strong>Field maps</strong>
          <EvidenceList
            items={
              atsState?.mappings.length
                ? atsState.mappings.slice(0, 5).map((mapping) => `${mapping.localEntity} -> ${mapping.remoteEntity} (${mapping.direction})`)
                : ['Prepare connections to create field maps']
            }
          />
        </div>
        <div>
          <strong>Latest sync events</strong>
          {latestEvents.length ? (
            latestEvents.map((event) => (
              <div className="ats-event-row" key={event.id}>
                <StatusPill tone={event.status === 'blocked' ? 'amber' : 'green'}>{event.status}</StatusPill>
                <div>
                  <strong>{event.eventType.replaceAll('_', ' ')}</strong>
                  <span>{formatProductLabel(event.remoteRecordRef)}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="kernel-empty">No sync events yet.</div>
          )}
        </div>
      </div>
    </article>
  )
}
