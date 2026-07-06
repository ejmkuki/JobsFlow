import type { BackendSession, PassiveSourcingState } from '../../backendClient'
import { broadcastPassiveSourcingCard, createPassiveSourcingCard, getPassiveSourcingState, humanizeJobsFlowError, requestPassiveSourcingContactRelease } from '../../backendClient'
import { EvidenceList, StatusPill } from '../../components/ui'
import { applicationPacket } from '../../data/candidate'
import { friendlyUserMessage } from '../../lib/format'
import { Globe2, Handshake, LockKeyhole, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

export function PassiveSourcingCardsPanel({ session }: { session: BackendSession | null }) {
  const [passiveState, setPassiveState] = useState<PassiveSourcingState | null>(null)
  const [message, setMessage] = useState('Start a candidate workspace, then JobsFlow can create anonymous sourcing cards.')
  const [isBusy, setIsBusy] = useState(false)
  const latestCard = passiveState?.cards[0] ?? null
  const latestBroadcast = passiveState?.broadcasts[0] ?? null
  const pendingRequest = passiveState?.releaseRequests.find((request) => request.status === 'pending') ?? null

  const refreshPassiveSourcing = useCallback(async () => {
    if (!session) {
      setPassiveState(null)
      setMessage('Start a candidate workspace first, then JobsFlow can load passive sourcing cards.')
      return
    }

    setIsBusy(true)
    try {
      const result = await getPassiveSourcingState()
      setPassiveState(result.state)
      setMessage(
        result.state.summary.activeCards
          ? `${result.state.summary.activeCards} anonymous card${result.state.summary.activeCards === 1 ? '' : 's'} visible to vetted recruiters.`
          : 'No public passive sourcing card yet. Create and broadcast one when ready.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'passive-sourcing'))
    } finally {
      setIsBusy(false)
    }
  }, [session])

  async function createAnonymousCard() {
    if (!session) {
      setMessage('Start a candidate workspace before creating a passive sourcing card.')
      return
    }

    setIsBusy(true)
    setMessage('Creating anonymous card with contact and employer redactions...')
    try {
      const result = await createPassiveSourcingCard({
        achievements: [
          'Reduced launch handoff time by 28%',
          'Built readiness reporting across 18 active projects',
          'Owned vendor governance without exposing current employer details',
        ],
        headline: 'Anonymous product operations leader open to vetted healthcare SaaS roles',
        skills: ['Product operations', 'Healthcare SaaS', 'Vendor governance', 'Executive communication'],
        targetRoles: [applicationPacket.role, 'Implementation Operations Lead'],
      })
      setPassiveState(result.state)
      setMessage('Anonymous sourcing card created. Contact release remains locked until candidate approval.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'passive-sourcing'))
    } finally {
      setIsBusy(false)
    }
  }

  async function broadcastLatestCard() {
    if (!latestCard) {
      setMessage('Create an anonymous card first, then JobsFlow can queue a redacted broadcast.')
      return
    }

    setIsBusy(true)
    setMessage('Preparing the redacted card for recruiter marketplace review...')
    try {
      const result = await broadcastPassiveSourcingCard(latestCard.id)
      setPassiveState(result.state)
      setMessage('Broadcast queued with name, email, phone, current employer, and resume file redacted.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'passive-sourcing'))
    } finally {
      setIsBusy(false)
    }
  }

  async function simulateReleaseRequest() {
    if (!latestCard) {
      setMessage('Create an anonymous card first, then JobsFlow can record contact release requests.')
      return
    }

    setIsBusy(true)
    setMessage('Recording recruiter contact-release request for candidate approval...')
    try {
      const result = await requestPassiveSourcingContactRelease(latestCard.id)
      setPassiveState(result.state)
      setMessage('Contact-release request recorded. Candidate identity remains locked.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'passive-sourcing'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshPassiveSourcing()
  }, [refreshPassiveSourcing])

  return (
    <article className="panel passive-sourcing-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>Passive Sourcing Cards</span>
          <h3>Anonymous demand generation with contact release gates</h3>
        </div>
        <StatusPill tone={latestCard?.visibility === 'recruiter_marketplace' ? 'green' : latestCard ? 'blue' : 'amber'}>
          {latestCard?.visibility.replaceAll('_', ' ') ?? 'No card yet'}
        </StatusPill>
      </div>
      <div className="kernel-actions">
        <button disabled={isBusy || !session} onClick={createAnonymousCard} type="button">
          <LockKeyhole size={16} aria-hidden="true" />
          Create card
        </button>
        <button disabled={isBusy || !latestCard} onClick={broadcastLatestCard} type="button">
          <Globe2 size={16} aria-hidden="true" />
          Broadcast redacted card
        </button>
        <button disabled={isBusy || !latestCard} onClick={simulateReleaseRequest} type="button">
          <Handshake size={16} aria-hidden="true" />
          Request release
        </button>
        <button disabled={isBusy || !session} onClick={refreshPassiveSourcing} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          Refresh cards
        </button>
      </div>
      <p className="runtime-message">{friendlyUserMessage(message)}</p>
      <div className="passive-grid">
        <div className="passive-card-preview">
          <span>{latestCard?.anonymousHandle ?? 'Anonymous handle pending'}</span>
          <strong>{latestCard?.headline ?? 'Create a card to generate masked recruiter-facing signal.'}</strong>
          <EvidenceList items={latestCard?.maskedSkills ?? ['Skills are visible; contact and current employer are not.']} />
          <small>{latestCard ? `Expires ${latestCard.expiresAt}` : 'Cards default to private until broadcast.'}</small>
        </div>
        <div className="passive-safeguard-list">
          <strong>Redactions</strong>
          <EvidenceList
            items={
              latestBroadcast?.contactRedactions.map((item) => item.replaceAll('_', ' ')) ?? [
                'candidate name',
                'email',
                'phone',
                'current employer',
              ]
            }
          />
        </div>
        <div className="passive-release-card">
          <strong>Contact release</strong>
          {pendingRequest ? (
            <>
              <StatusPill tone="amber">{pendingRequest.status}</StatusPill>
              <p>{pendingRequest.requesterCompany}</p>
              <span>{pendingRequest.reason}</span>
            </>
          ) : (
            <>
              <StatusPill tone={latestCard?.contactReleaseStatus === 'locked' ? 'blue' : 'amber'}>
                {latestCard?.contactReleaseStatus ?? 'locked'}
              </StatusPill>
              <p>No recruiter request is waiting for approval.</p>
            </>
          )}
        </div>
      </div>
    </article>
  )
}
