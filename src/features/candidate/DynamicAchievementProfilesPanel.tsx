import type { AchievementProfileState, BackendSession } from '../../backendClient'
import { createAchievementProfile, getAchievementProfileState, humanizeJobsFlowError } from '../../backendClient'
import { StatusPill } from '../../components/ui'
import { defaultResumeTailwindText } from './ResumeTailwindPanel'
import { friendlyUserMessage } from '../../lib/format'
import { FileText, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

export function DynamicAchievementProfilesPanel({ session }: { session: BackendSession | null }) {
  const [achievementState, setAchievementState] = useState<AchievementProfileState | null>(null)
  const [message, setMessage] = useState('Start a candidate workspace, then JobsFlow can structure achievement cards.')
  const [isBusy, setIsBusy] = useState(false)
  const latestProfile = achievementState?.profiles[0] ?? null
  const latestCards = latestProfile
    ? achievementState?.cards.filter((card) => card.profileId === latestProfile.id).slice(0, 6) ?? []
    : []

  const refreshAchievementProfiles = useCallback(async () => {
    if (!session) {
      setAchievementState(null)
      setMessage('Start a candidate workspace first, then JobsFlow can load achievement profiles.')
      return
    }

    setIsBusy(true)
    try {
      const result = await getAchievementProfileState()
      setAchievementState(result.state)
      setMessage(
        result.state.summary.profiles
          ? `${result.state.summary.profiles} dynamic achievement profile${result.state.summary.profiles === 1 ? '' : 's'} available.`
          : 'No achievement profile yet. Transform resume evidence into cards.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'achievement-profiles'))
    } finally {
      setIsBusy(false)
    }
  }, [session])

  async function createKoraAchievementProfile() {
    if (!session) {
      setMessage('Start a candidate workspace before creating an achievement profile.')
      return
    }

    setIsBusy(true)
    setMessage('Transforming resume evidence into structured achievement cards...')
    try {
      const result = await createAchievementProfile({
        candidateAlias: 'Candidate JFC-1428',
        resumeText: [
          defaultResumeTailwindText,
          'Certified Scrum Product Owner credential under review.',
          'Led product, implementation, and customer success partners through healthcare SaaS launch risk reviews.',
        ].join('\n'),
        sourceLabel: 'Master resume evidence',
      })
      setAchievementState(result.state)
      setMessage('Achievement profile created with metric, leadership, project, and credential cards.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'achievement-profiles'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshAchievementProfiles()
  }, [refreshAchievementProfiles])

  return (
    <article className="panel achievement-profile-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>Dynamic Achievement Profiles</span>
          <h3>Structured cards instead of resume walls</h3>
        </div>
        <StatusPill tone={latestProfile ? (latestProfile.profileScore >= 70 ? 'green' : 'amber') : 'amber'}>
          {latestProfile ? `${latestProfile.profileScore}% ${latestProfile.status.replaceAll('_', ' ')}` : 'No profile yet'}
        </StatusPill>
      </div>
      <div className="kernel-actions">
        <button disabled={isBusy || !session} onClick={createKoraAchievementProfile} type="button">
          <FileText size={16} aria-hidden="true" />
          Create cards
        </button>
        <button disabled={isBusy || !session} onClick={refreshAchievementProfiles} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          Refresh profiles
        </button>
      </div>
      <p className="runtime-message">{friendlyUserMessage(message)}</p>
      <div className="achievement-profile-grid">
        <div className="achievement-summary-card">
          <strong>{latestProfile?.candidateAlias ?? 'Candidate alias pending'}</strong>
          <span>{latestProfile?.sourceLabel ?? 'Resume source pending'}</span>
          <p>{latestProfile?.summary ?? 'Create a profile to convert evidence into structured cards.'}</p>
          <small>{achievementState?.summary.pendingVerifications ?? 0} pending verification item(s)</small>
        </div>
        <div className="achievement-card-list">
          {latestCards.length ? (
            latestCards.map((card) => (
              <div className="achievement-card-row" key={card.id}>
                <StatusPill tone={card.verificationStatus === 'verified' ? 'green' : 'amber'}>
                  {card.cardType}
                </StatusPill>
                <strong>{card.title}</strong>
                <span>{card.metrics.length ? card.metrics.join(', ') : card.verificationStatus}</span>
                <p>{card.evidence[0]}</p>
              </div>
            ))
          ) : (
            <div className="kernel-empty">No achievement cards yet.</div>
          )}
        </div>
      </div>
    </article>
  )
}
