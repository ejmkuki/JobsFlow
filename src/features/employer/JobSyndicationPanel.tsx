import type { BackendSession, JobSyndicationState } from '../../backendClient'
import { createJobSyndicationPost, getJobSyndicationState, humanizeJobsFlowError } from '../../backendClient'
import { EvidenceList, StatusPill } from '../../components/ui'
import { applicationPacket } from '../../data/candidate'
import { formatCents, friendlyUserMessage } from '../../lib/format'
import { Globe2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

export function JobSyndicationPanel({ session }: { session: BackendSession | null }) {
  const [syndicationState, setSyndicationState] = useState<JobSyndicationState | null>(null)
  const [message, setMessage] = useState('Start an employer workspace, then JobsFlow can prepare jobs for publishing review.')
  const [isBusy, setIsBusy] = useState(false)
  const latestPost = syndicationState?.posts[0] ?? null
  const latestDeliveries = latestPost
    ? syndicationState?.deliveries.filter((delivery) => delivery.postId === latestPost.id) ?? []
    : []

  const refreshSyndication = useCallback(async () => {
    if (!session) {
      setSyndicationState(null)
      setMessage('Start an employer workspace first, then JobsFlow can load job publishing drafts.')
      return
    }

    setIsBusy(true)
    try {
      const result = await getJobSyndicationState()
      setSyndicationState(result.state)
      setMessage(
        result.state.summary.syndicationPosts
          ? `${result.state.summary.syndicationPosts} job publishing draft${result.state.summary.syndicationPosts === 1 ? '' : 's'} recorded.`
          : 'No job publishing drafts yet. Validate and queue the first role.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'job-syndication'))
    } finally {
      setIsBusy(false)
    }
  }, [session])

  async function queueKoraJob() {
    if (!session) {
      setMessage('Start an employer workspace before queueing a job for publishing review.')
      return
    }

    setIsBusy(true)
    setMessage('Validating job content, salary band, search listing details, and partner-ready drafts...')
    try {
      const result = await createJobSyndicationPost({
        company: applicationPacket.company,
        description:
          'Own product operations workflows for healthcare SaaS delivery, vendor governance, launch readiness, claims operations collaboration, executive communication, and cross-functional operating rhythm improvements. This role requires evidence-first communication, product analytics, measurable implementation quality ownership, and clear partnership with product, implementation, and customer success teams.',
        employmentType: 'full_time',
        location: 'United States remote/hybrid',
        roleTitle: applicationPacket.role,
        salaryRange: {
          currency: 'USD',
          maxCents: 14200000,
          minCents: 11800000,
        },
      })
      setSyndicationState(result.state)
      setMessage('Job publishing drafts are queued inside JobsFlow. External publishing remains review-gated.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'job-syndication'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshSyndication()
  }, [refreshSyndication])

  return (
    <article className="panel job-syndication-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>One-click job publishing</span>
          <h3>Validated drafts before external publishing</h3>
        </div>
        <StatusPill tone={latestPost?.status === 'queued' ? 'green' : latestPost?.status === 'blocked' ? 'red' : 'amber'}>
          {latestPost?.status ?? 'No post yet'}
        </StatusPill>
      </div>
      <div className="kernel-actions">
        <button disabled={isBusy || !session} onClick={queueKoraJob} type="button">
          <Globe2 size={16} aria-hidden="true" />
          Validate and queue
        </button>
        <button disabled={isBusy || !session} onClick={refreshSyndication} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          Refresh drafts
        </button>
      </div>
      <p className="runtime-message">{friendlyUserMessage(message)}</p>
      <div className="syndication-grid">
        <div className="syndication-post-card">
          <strong>{latestPost?.roleTitle ?? applicationPacket.role}</strong>
          <span>{latestPost?.company ?? applicationPacket.company}</span>
          <p>
            {formatCents(latestPost?.salary.minCents, latestPost?.salary.currency)} -{' '}
            {formatCents(latestPost?.salary.maxCents, latestPost?.salary.currency)}
          </p>
          <small>{latestPost ? 'Search listing draft ready' : 'Search listing draft pending'}</small>
        </div>
        <div>
          <strong>Validation</strong>
          <EvidenceList items={latestPost?.validationErrors.length ? latestPost.validationErrors : ['Draft passes local publishing checks']} />
        </div>
        <div>
          <strong>Delivery records</strong>
          {latestDeliveries.length ? (
            latestDeliveries.map((delivery) => (
              <div className="syndication-delivery-row" key={delivery.id}>
                <StatusPill tone={delivery.status === 'queued' ? 'blue' : delivery.status === 'blocked' ? 'red' : 'green'}>
                  {delivery.status}
                </StatusPill>
                <span>{delivery.destination.replaceAll('_', ' ')}</span>
              </div>
            ))
          ) : (
            <div className="kernel-empty">No delivery records yet.</div>
          )}
        </div>
      </div>
    </article>
  )
}
