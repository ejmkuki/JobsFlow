import type { BackendSession, SkillMatchingState } from '../../backendClient'
import { getSkillMatchingState, humanizeJobsFlowError, runSemanticSkillMatch } from '../../backendClient'
import { EvidenceList, StatusPill } from '../../components/ui'
import { applicationPacket } from '../../data/candidate'
import { friendlyUserMessage } from '../../lib/format'
import { RefreshCw, SearchCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

export function SemanticSkillMatchingPanel({ session }: { session: BackendSession | null }) {
  const [skillState, setSkillState] = useState<SkillMatchingState | null>(null)
  const [message, setMessage] = useState('Start an employer workspace, then JobsFlow can match role needs to candidate evidence.')
  const [isBusy, setIsBusy] = useState(false)
  const latestRun = skillState?.matchRuns[0] ?? null
  const latestCandidate = latestRun
    ? skillState?.candidateProfiles.find((profile) => profile.id === latestRun.candidateProfileId) ?? null
    : null
  const latestRole = latestRun ? skillState?.roleRequirements.find((role) => role.id === latestRun.roleRequirementId) ?? null : null

  const refreshSkillMatching = useCallback(async () => {
    if (!session) {
      setSkillState(null)
      setMessage('Start an employer workspace first, then JobsFlow can load skill matches.')
      return
    }

    setIsBusy(true)
    try {
      const result = await getSkillMatchingState()
      setSkillState(result.state)
      setMessage(
        result.state.summary.matchRuns
          ? `${result.state.summary.matchRuns} skill match${result.state.summary.matchRuns === 1 ? '' : 'es'} ready.`
          : 'No skill match yet. Run the matcher for the current role.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'skill-matching'))
    } finally {
      setIsBusy(false)
    }
  }, [session])

  async function runKoraSemanticMatch() {
    if (!session) {
      setMessage('Start an employer workspace before matching skills to the role.')
      return
    }

    setIsBusy(true)
    setMessage('Preparing role requirements, skill groups, candidate evidence, and match scoring...')
    try {
      const result = await runSemanticSkillMatch({
        adjacentSkills: ['Implementation operations', 'Healthtech', 'Workflow governance'],
        achievements: [
          'Reduced launch handoff time by 28%',
          'Built readiness dashboards for 18 active projects',
          'Owned executive customer communication during workflow rollout',
        ],
        candidateAlias: 'Candidate JFC-1428',
        candidateSkills: [
          'Product operations',
          'Healthcare technology',
          'Vendor governance',
          'Operational reporting',
          'Stakeholder management',
        ],
        company: applicationPacket.company,
        minimumSignals: ['Quantified impact', 'Cross-functional launch ownership'],
        requiredSkills: [
          'Product operations',
          'Healthcare SaaS',
          'Vendor governance',
          'Claims operations',
          'Executive communication',
        ],
        roleTitle: applicationPacket.role,
      })
      setSkillState(result.state)
      setMessage('Skill match complete. Adjacent evidence is separated from direct proof for reviewer control.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'skill-matching'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshSkillMatching()
  }, [refreshSkillMatching])

  return (
    <article className="panel semantic-match-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>Skill matching</span>
          <h3>Related skills without keyword tunnel vision</h3>
        </div>
        <StatusPill tone={latestRun ? (latestRun.matchScore >= 75 ? 'green' : 'amber') : 'amber'}>
          {latestRun ? `${latestRun.matchScore}% match` : 'No match yet'}
        </StatusPill>
      </div>
      <div className="kernel-actions">
        <button disabled={isBusy || !session} onClick={runKoraSemanticMatch} type="button">
          <SearchCheck size={16} aria-hidden="true" />
          Run skill match
        </button>
        <button disabled={isBusy || !session} onClick={refreshSkillMatching} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          Refresh matches
        </button>
      </div>
      <p className="runtime-message">{friendlyUserMessage(message)}</p>
      <div className="semantic-match-grid">
        <div className="semantic-score-card">
          <strong>{latestRun?.matchScore ?? 0}%</strong>
          <span>{latestCandidate?.candidateAlias ?? 'Candidate profile pending'}</span>
          <p>{latestRole ? `${latestRole.roleTitle} at ${latestRole.company}` : 'Run a match to create the employer role requirement.'}</p>
        </div>
        <div>
          <strong>Direct proof</strong>
          <EvidenceList items={latestRun?.matchedSkills.length ? latestRun.matchedSkills : ['No direct matched skills yet']} />
        </div>
        <div>
          <strong>Adjacent bridges</strong>
          <EvidenceList
            items={
              latestRun?.adjacentMatches.length
                ? latestRun.adjacentMatches.map((match) => `${match.candidateSkill} bridges ${match.requiredSkill}`)
                : ['No adjacent skill bridges yet']
            }
          />
        </div>
        <div>
          <strong>Review gaps</strong>
          <EvidenceList items={latestRun?.gaps.length ? latestRun.gaps : ['No gaps recorded yet']} />
        </div>
      </div>
    </article>
  )
}
