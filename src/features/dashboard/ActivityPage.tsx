import { useEffect, useState } from 'react'
import type { AuditEvent, BackendSession } from '../../backendClient'
import { humanizeJobsFlowError, listAuditEvents } from '../../backendClient'

const riskClass: Record<string, string> = { low: 'jf-blue', medium: 'jf-amber', high: 'jf-red' }

function relativeTime(iso: string) {
  const then = new Date(`${iso.replace(' ', 'T')}Z`).getTime()
  const minutes = Math.floor((Date.now() - then) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function ActivityPage({ session }: { session: BackendSession | null }) {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!session) return
    listAuditEvents()
      .then((result) => setEvents(result.events))
      .catch((error) => setMessage(humanizeJobsFlowError(error, 'audit')))
  }, [session])

  return (
    <main className="jf-content">
      <div className="jf-page-head">
        <div>
          <h1>Activity</h1>
          <p>Every account and workspace action, logged as it happens. Nothing here is hidden from you.</p>
        </div>
      </div>

      {message ? <p className="jf-msg">{message}</p> : null}

      <section className="jf-panel">
        {events.length === 0 ? (
          <p className="jf-empty">No activity yet.</p>
        ) : (
          <div className="jf-timeline">
            {events.map((event) => (
              <div className="jf-timeline-row" key={event.id}>
                <span className="jf-timeline-dot" />
                <div>
                  <strong>{event.action}</strong>
                  <span className={`jf-status ${riskClass[event.riskLevel] ?? 'jf-blue'}`} style={{ marginLeft: 8 }}>
                    {event.eventType}
                  </span>
                  <span className="jf-msg"> · {event.actorType === 'user' ? 'You' : 'System'} · {relativeTime(event.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
