import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import type { ApplicationPacketReview, BackendSession } from '../../backendClient'
import { createApplicationPacketReview, humanizeJobsFlowError } from '../../backendClient'
import { StatusPill } from '../../components/ui'
import { applicationPacket } from '../../data/candidate'
import type { Tone } from '../../types'

export function PacketReviewGate({ session }: { session: BackendSession | null }) {
  const [packetReviewResult, setPacketReviewResult] = useState<ApplicationPacketReview | null>(null)
  const [packetReviewMessage, setPacketReviewMessage] = useState(
    'Start a workspace, then JobsFlow can review this packet and explain whether it is ready or not yet.',
  )
  const [isReviewingPacket, setIsReviewingPacket] = useState(false)
  const packetReviewTone: Tone = packetReviewResult?.state === 'approved'
    ? 'green'
    : packetReviewResult?.state === 'blocked'
      ? 'red'
      : 'amber'

  async function handlePacketReview() {
    if (!session) {
      setPacketReviewMessage('Start a candidate workspace before running the packet review engine.')
      return
    }

    setIsReviewingPacket(true)
    setPacketReviewMessage('Checking the evidence, safeguards, and approval gates...')

    try {
      const result = await createApplicationPacketReview({
        company: applicationPacket.company,
        duplicateFound: false,
        evidence: [
          'Scaled intake workflow across 4 healthcare SaaS implementation teams',
          'Owned vendor governance process for product operations handoffs',
          'Reduced launch handoff time by 28% with a repeatable operating rhythm',
          'Managed executive stakeholder communication during cross-functional rollout',
        ],
        jobDescription:
          'Product Operations Manager role focused on healthcare SaaS delivery, vendor governance, claims operations, and cross-functional launch quality.',
        requiredSkills: [
          'Product operations',
          'Healthcare SaaS',
          'Vendor governance',
          'Claims operations',
        ],
        salaryFloorCents: 11500000,
        salaryRange: {
          currency: 'USD',
          maxCents: 13800000,
          minCents: 11800000,
        },
        sensitiveAnswers: [
          {
            approved: false,
            key: 'workday-sponsorship',
            label: 'Workday sponsorship answer',
            value: 'No current sponsorship requirement',
          },
        ],
        targetRole: applicationPacket.role,
      })

      setPacketReviewResult(result.packet)
      const reviewGateCount = result.packet.requiredReviews.length
      setPacketReviewMessage(
        reviewGateCount
          ? `JobsFlow says not yet for ${reviewGateCount} reason${reviewGateCount === 1 ? '' : 's'}. The packet is ${result.packet.readinessScore}% ready, and external action stays blocked.`
          : `JobsFlow says this packet is ready for candidate approval. External action still waits for explicit consent.`,
      )
    } catch (error) {
      setPacketReviewMessage(humanizeJobsFlowError(error, 'packet'))
    } finally {
      setIsReviewingPacket(false)
    }
  }

  return (
    <div className="review-gate-box">
      <StatusPill tone={packetReviewResult ? packetReviewTone : 'amber'}>
        {packetReviewResult ? packetReviewResult.state.replaceAll('_', ' ') : 'Review gate required'}
      </StatusPill>
      <h4>Before anything external</h4>
      <ul className="plain-list">
        {applicationPacket.blockers.map((blocker) => (
          <li key={blocker}>{blocker}</li>
        ))}
      </ul>
      <div className="backend-actions">
        <button disabled={isReviewingPacket} onClick={handlePacketReview} type="button">
          <ShieldCheck size={16} aria-hidden="true" />
          {isReviewingPacket ? 'Checking...' : 'Run review engine'}
        </button>
      </div>
      <div className="runtime-message">
        <strong>{packetReviewMessage}</strong>
        {packetReviewResult ? (
          <p>
            Skill coverage: {packetReviewResult.skillCoverageScore}% / proof strength:{' '}
            {packetReviewResult.proofStrength}. Required next action:{' '}
            {packetReviewResult.requiredReviews[0]?.requiredAction ?? 'Candidate approval can proceed.'}
          </p>
        ) : null}
      </div>
    </div>
  )
}
