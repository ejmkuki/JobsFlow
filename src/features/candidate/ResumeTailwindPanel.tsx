import type { BackendSession, ResumeIntelligenceState } from '../../backendClient'
import { createResumeTailwindAnalysis, getResumeIntelligenceState, humanizeJobsFlowError } from '../../backendClient'
import { EvidenceList, StatusPill } from '../../components/ui'
import { applicationPacket } from '../../data/candidate'
import { friendlyUserMessage } from '../../lib/format'
import { RefreshCw, SearchCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

export const defaultResumeTailwindText = [
  'Scaled intake workflow across 4 healthcare SaaS implementation teams and reduced launch handoff time by 28%.',
  'Owned vendor governance process for product operations handoffs, executive stakeholder updates, and launch quality reviews.',
  'Built repeatable operating rhythm for cross-functional product, implementation, and customer success teams.',
  'Managed executive customer communication during complex workflow rollouts for healthcare accounts.',
  'Created reporting dashboards for launch readiness, risk flags, and delivery quality across 18 active projects.',
].join('\n')

export const defaultResumeTailwindJob = [
  'Product Operations Manager role focused on healthcare SaaS delivery, vendor governance, claims operations, and cross-functional launch quality.',
  'Own product operations workflows, coordinate claims workflow improvements, translate customer and implementation signals into product-facing priorities, and communicate clearly with executive stakeholders.',
  'The role requires product operations, healthcare SaaS, vendor governance, claims operations, product analytics, and executive communication.',
].join(' ')

export function ResumeTailwindPanel({ session }: { session: BackendSession | null }) {
  const [targetRole, setTargetRole] = useState(applicationPacket.role)
  const [company, setCompany] = useState(applicationPacket.company)
  const [resumeText, setResumeText] = useState(defaultResumeTailwindText)
  const [jobDescription, setJobDescription] = useState(defaultResumeTailwindJob)
  const [resumeIntelState, setResumeIntelState] = useState<ResumeIntelligenceState | null>(null)
  const [message, setMessage] = useState('Start a workspace, then JobsFlow can optimize this resume for a target role.')
  const [isBusy, setIsBusy] = useState(false)
  const latestAnalysis = resumeIntelState?.analyses[0] ?? null

  const refreshResumeIntelligence = useCallback(async () => {
    if (!session) {
      setResumeIntelState(null)
      setMessage('Start a candidate workspace first, then JobsFlow can load resume optimization results.')
      return
    }

    setIsBusy(true)
    try {
      const result = await getResumeIntelligenceState()
      setResumeIntelState(result.state)
      setMessage(
        result.state.summary.analyses
          ? `${result.state.summary.analyses} resume optimization result${result.state.summary.analyses === 1 ? '' : 's'} ready.`
          : 'No resume analyses yet. Run the optimizer to create one.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'resume-intelligence'))
    } finally {
      setIsBusy(false)
    }
  }, [session])

  async function runResumeTailwind() {
    if (!session) {
      setMessage('Start a candidate workspace before optimizing this resume.')
      return
    }

    setIsBusy(true)
    setMessage('Reading resume facts, role requirements, proof gaps, and match signals...')
    try {
      const result = await createResumeTailwindAnalysis({
        company,
        jobDescription,
        requiredSkills: ['Product operations', 'Healthcare SaaS', 'Vendor governance', 'Claims operations', 'Product analytics'],
        resumeText,
        salaryRange: {
          currency: 'USD',
          maxCents: 13800000,
          minCents: 11800000,
        },
        targetRole,
      })
      setResumeIntelState(result.state)
      setMessage(
        `Resume Tailwind Optimization complete: ${result.analysis.readinessScore}% ready with ${result.analysis.missingSkills.length} gap${result.analysis.missingSkills.length === 1 ? '' : 's'}.`,
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'resume-intelligence'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshResumeIntelligence()
  }, [refreshResumeIntelligence])

  return (
    <article className="panel resume-tailwind-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>Resume optimization</span>
          <h3>Proof gaps before tailored variants</h3>
        </div>
        <StatusPill tone={latestAnalysis ? 'green' : 'amber'}>
          {latestAnalysis ? `${latestAnalysis.readinessScore}% ready` : 'No analysis yet'}
        </StatusPill>
      </div>
      <div className="tailwind-form">
        <label>
          <span>Target role</span>
          <input onChange={(event) => setTargetRole(event.target.value)} type="text" value={targetRole} />
        </label>
        <label>
          <span>Company</span>
          <input onChange={(event) => setCompany(event.target.value)} type="text" value={company} />
        </label>
        <label className="tailwind-textarea">
          <span>Master resume evidence</span>
          <textarea onChange={(event) => setResumeText(event.target.value)} rows={7} value={resumeText} />
        </label>
        <label className="tailwind-textarea">
          <span>Target job description</span>
          <textarea onChange={(event) => setJobDescription(event.target.value)} rows={7} value={jobDescription} />
        </label>
      </div>
      <div className="kernel-actions">
        <button disabled={isBusy || !session} onClick={runResumeTailwind} type="button">
          <SearchCheck size={16} aria-hidden="true" />
          {isBusy ? 'Analyzing...' : 'Run optimizer'}
        </button>
        <button disabled={isBusy || !session} onClick={refreshResumeIntelligence} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          Refresh analyses
        </button>
      </div>
      <p className="runtime-message">{friendlyUserMessage(message)}</p>
      {latestAnalysis ? (
        <>
          <div className="tailwind-score-grid">
            <div>
              <strong>{latestAnalysis.readinessScore}%</strong>
              <span>readiness</span>
            </div>
            <div>
              <strong>{latestAnalysis.skillCoverageScore}%</strong>
              <span>skill coverage</span>
            </div>
            <div>
              <strong>{latestAnalysis.semanticOverlapScore}%</strong>
              <span>role overlap</span>
            </div>
            <div>
              <strong>{latestAnalysis.proofStrength}</strong>
              <span>proof strength</span>
            </div>
          </div>
          <div className="tailwind-results-grid">
            <div className="tailwind-result-box">
              <strong>Matched skills</strong>
              <EvidenceList items={latestAnalysis.matchedSkills.length ? latestAnalysis.matchedSkills : ['No matched skills detected yet']} />
            </div>
            <div className="tailwind-result-box">
              <strong>Missing skills</strong>
              <EvidenceList items={latestAnalysis.missingSkills.length ? latestAnalysis.missingSkills : ['No required skill gaps detected']} />
            </div>
            <div className="tailwind-result-box">
              <strong>Recommendations</strong>
              <EvidenceList
                items={
                  latestAnalysis.recommendations.length
                    ? latestAnalysis.recommendations.map((recommendation) => recommendation.title)
                    : ['Resume evidence is ready for candidate review']
                }
              />
            </div>
            <div className="tailwind-result-box">
              <strong>Prepared evidence</strong>
              <EvidenceList
                items={[
                  `${latestAnalysis.vectorDocuments.length} evidence note${latestAnalysis.vectorDocuments.length === 1 ? '' : 's'} ready`,
                  `${resumeIntelState?.summary.pendingVectorDocuments ?? 0} insight${resumeIntelState?.summary.pendingVectorDocuments === 1 ? '' : 's'} waiting to be prepared`,
                ]}
              />
            </div>
          </div>
        </>
      ) : null}
    </article>
  )
}
