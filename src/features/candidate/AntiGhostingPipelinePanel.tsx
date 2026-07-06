import type { AntiGhostingPipelineState, BackendSession, PipelineState } from '../../backendClient'
import { advancePipelineItem, createPipelineItem, getAntiGhostingPipelineState, humanizeJobsFlowError, runPipelineStaleCheck } from '../../backendClient'
import { StatusPill } from '../../components/ui'
import { applicationPacket } from '../../data/candidate'
import { formatProductLabel, friendlyUserMessage, pipelineTone } from '../../lib/format'
import { ArrowRight, ClipboardCheck, Clock3, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

const pipelineStages: Array<{ key: PipelineState; label: string }> = [
  { key: 'packet_review', label: 'Packet' },
  { key: 'applied', label: 'Applied' },
  { key: 'employer_review', label: 'Review' },
  { key: 'recruiter_screen', label: 'Screen' },
  { key: 'interview', label: 'Interview' },
  { key: 'offer', label: 'Offer' },
]

export function AntiGhostingPipelinePanel({ session }: { session: BackendSession | null }) {
  const [pipelineState, setPipelineState] = useState<AntiGhostingPipelineState | null>(null)
  const [message, setMessage] = useState('Start a workspace, then JobsFlow can track application response SLAs.')
  const [isBusy, setIsBusy] = useState(false)
  const latestItem = pipelineState?.items[0] ?? null
  const openTasks = pipelineState?.tasks.filter((task) => task.status === 'open') ?? []

  const refreshPipeline = useCallback(async () => {
    if (!session) {
      setPipelineState(null)
      setMessage('Start a candidate workspace first, then JobsFlow can load application tracking.')
      return
    }

    setIsBusy(true)
    try {
      const result = await getAntiGhostingPipelineState()
      setPipelineState(result.state)
      setMessage(
        result.state.summary.activeApplications
          ? `${result.state.summary.activeApplications} active application${result.state.summary.activeApplications === 1 ? '' : 's'} under SLA control.`
          : 'No active applications yet. Track one to activate anti-ghosting controls.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'pipeline'))
    } finally {
      setIsBusy(false)
    }
  }, [session])

  async function trackKoraApplication() {
    if (!session) {
      setMessage('Start a candidate workspace before tracking an application.')
      return
    }

    setIsBusy(true)
    setMessage('Creating application tracker item and employer response SLA...')
    try {
      const result = await createPipelineItem({
        company: applicationPacket.company,
        notes: 'Created from JobsFlow packet review path.',
        roleTitle: applicationPacket.role,
        salaryRange: {
          maxCents: 13800000,
          minCents: 11800000,
        },
        source: 'jobsflow_packet',
        state: 'applied',
      })
      setPipelineState(result.state)
      setMessage('Application is now tracked. JobsFlow created the response SLA and any needed follow-up task.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'pipeline'))
    } finally {
      setIsBusy(false)
    }
  }

  async function advanceLatest() {
    if (!latestItem) {
      setMessage('Track an application first, then JobsFlow can advance its stage.')
      return
    }

    const currentIndex = pipelineStages.findIndex((stage) => stage.key === latestItem.state)
    const nextStage = pipelineStages[Math.min(currentIndex + 1, pipelineStages.length - 1)]?.key ?? 'employer_review'

    setIsBusy(true)
    setMessage('Advancing pipeline stage and recalculating response expectations...')
    try {
      const result = await advancePipelineItem(latestItem.id, nextStage)
      setPipelineState(result.state)
      setMessage(`Moved ${latestItem.company} to ${nextStage.replaceAll('_', ' ')} with a fresh response SLA.`)
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'pipeline'))
    } finally {
      setIsBusy(false)
    }
  }

  async function checkStaleApplications() {
    if (!session) {
      setMessage('Start a candidate workspace before checking stale applications.')
      return
    }

    setIsBusy(true)
    setMessage('Checking response SLAs and drafting fallback reminders...')
    try {
      const result = await runPipelineStaleCheck()
      setPipelineState(result.state)
      setMessage('Pipeline stale check complete. Follow-up drafts remain inside JobsFlow until approved.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'pipeline'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshPipeline()
  }, [refreshPipeline])

  return (
    <article className="panel anti-ghosting-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>Anti-Ghosting Pipeline Tracker</span>
          <h3>Response SLAs, follow-ups, and fallback motion</h3>
        </div>
        <StatusPill tone={pipelineState?.summary.overdueApplications ? 'red' : pipelineState?.summary.dueSoonApplications ? 'amber' : 'green'}>
          {pipelineState?.summary.overdueApplications
            ? `${pipelineState.summary.overdueApplications} overdue`
            : `${pipelineState?.summary.activeApplications ?? 0} active`}
        </StatusPill>
      </div>
      <div className="kernel-actions">
        <button disabled={isBusy || !session} onClick={trackKoraApplication} type="button">
          <ClipboardCheck size={16} aria-hidden="true" />
          Track Kora
        </button>
        <button disabled={isBusy || !latestItem} onClick={advanceLatest} type="button">
          <ArrowRight size={16} aria-hidden="true" />
          Advance latest
        </button>
        <button disabled={isBusy || !session} onClick={checkStaleApplications} type="button">
          <Clock3 size={16} aria-hidden="true" />
          Run stale check
        </button>
        <button disabled={isBusy || !session} onClick={refreshPipeline} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          Refresh tracker
        </button>
      </div>
      <p className="runtime-message">{friendlyUserMessage(message)}</p>
      <div className="pipeline-summary-grid">
        <div>
          <strong>{pipelineState?.summary.activeApplications ?? 0}</strong>
          <span>active</span>
        </div>
        <div>
          <strong>{pipelineState?.summary.dueSoonApplications ?? 0}</strong>
          <span>due soon</span>
        </div>
        <div>
          <strong>{pipelineState?.summary.overdueApplications ?? 0}</strong>
          <span>overdue</span>
        </div>
        <div>
          <strong>{pipelineState?.summary.openFollowUps ?? 0}</strong>
          <span>open follow-ups</span>
        </div>
      </div>
      <div className="pipeline-kanban">
        {pipelineStages.map((stage) => {
          const stageItems = pipelineState?.items.filter((item) => item.state === stage.key) ?? []
          return (
            <div className="pipeline-stage-card" key={stage.key}>
              <strong>{stage.label}</strong>
              {stageItems.length ? (
                stageItems.slice(0, 3).map((item) => (
                  <div className="pipeline-item-card" key={item.id}>
                    <p>{item.company}</p>
                    <small>{item.roleTitle}</small>
                    <StatusPill tone={pipelineTone(item.employerUpdateStatus)}>
                      {item.employerUpdateStatus.replaceAll('_', ' ')}
                    </StatusPill>
                  </div>
                ))
              ) : (
                <span>No tracked roles</span>
              )}
            </div>
          )
        })}
      </div>
      <div className="pipeline-followup-list">
        <strong>Open follow-up drafts</strong>
        {openTasks.slice(0, 3).map((task) => (
          <div className="pipeline-followup-row" key={task.id}>
            <StatusPill tone={pipelineTone(task.riskLevel)}>{task.taskType.replaceAll('_', ' ')}</StatusPill>
            <p>{task.draftText}</p>
            <small>{formatProductLabel(task.channel)} / approval required</small>
          </div>
        ))}
        {!openTasks.length ? <div className="kernel-empty">No follow-up drafts are open.</div> : null}
      </div>
    </article>
  )
}
