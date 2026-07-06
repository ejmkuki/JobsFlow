import type { BackendSession, WorkflowKernelState } from '../../backendClient'
import { bootstrapWorkflowKernel, getWorkflowKernelState, humanizeJobsFlowError, startWorkflowRun } from '../../backendClient'
import { StatusPill } from '../../components/ui'
import { formatProductLabel, friendlyUserMessage, textFromRecord, workflowTone } from '../../lib/format'
import { DatabaseZap, FileCheck2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

export function WorkflowKernelPanel({ session }: { session: BackendSession | null }) {
  const [kernelState, setKernelState] = useState<WorkflowKernelState | null>(null)
  const [message, setMessage] = useState(
    'Start a workspace, then turn on guided automation.',
  )
  const [isBusy, setIsBusy] = useState(false)
  const latestRun = kernelState?.runs[0] ?? null
  const pendingReceipts = kernelState?.receipts.filter((receipt) => receipt.status === 'pending') ?? []
  const pillarDefinitions =
    kernelState?.definitions.filter((definition) => definition.key !== 'platform.workflow_kernel') ?? []
  const activeDefinitions = kernelState?.summary.activeDefinitions ?? 0

  const refreshKernel = useCallback(async () => {
    if (!session) {
      setKernelState(null)
      setMessage('Start a workspace first, then JobsFlow can load guided automation.')
      return
    }

    setIsBusy(true)
    try {
      const result = await getWorkflowKernelState()
      setKernelState(result.state)
      setMessage(
        result.state.summary.activeDefinitions
          ? `${result.state.summary.activeDefinitions} automation workflow${result.state.summary.activeDefinitions === 1 ? '' : 's'} ready.`
          : 'Guided automation is ready to activate.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'workflow'))
    } finally {
      setIsBusy(false)
    }
  }, [session])

  async function activateKernel() {
    if (!session) {
      setMessage('Start a workspace first, then JobsFlow can turn on guided automation.')
      return
    }

    setIsBusy(true)
    setMessage('Preparing automation rules, safety checks, and approval records...')
    try {
      const result = await bootstrapWorkflowKernel()
      setKernelState(result.state)
      setMessage(
        result.createdRun
          ? 'Guided automation is ready. External actions remain blocked until reviewed and approved.'
          : 'Guided automation is ready. Existing approval boundaries remain intact.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'workflow'))
    } finally {
      setIsBusy(false)
    }
  }

  async function startResumeWorkflow() {
    if (!session) {
      setMessage('Start a workspace before preparing resume automation.')
      return
    }

    setIsBusy(true)
    setMessage('Preparing a guarded resume optimization plan...')
    try {
      if (!kernelState?.definitions.some((definition) => definition.key === 'resume.tailwind_optimization')) {
        await bootstrapWorkflowKernel()
      }

      const result = await startWorkflowRun({
        input: {
          targetCompany: 'Kora Health',
          targetRole: 'Product Operations Manager',
          source: 'trust_workspace_activation',
        },
        priority: 4,
        subjectId: 'first-resume-artifact',
        subjectType: 'resume_artifact',
        workflowKey: 'resume.tailwind_optimization',
      })
      setKernelState(result.state)
      setMessage('Resume optimization plan created behind a review gate.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'workflow'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshKernel()
  }, [refreshKernel])

  return (
    <article className="panel workflow-kernel-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>Guided automation</span>
          <h3>Durable state before automation</h3>
        </div>
        <StatusPill tone={activeDefinitions ? 'green' : 'amber'}>
          {activeDefinitions ? 'Ready' : 'Needs activation'}
        </StatusPill>
      </div>
      <p className="muted-line">
        JobsFlow records every automation plan, approval, and delivery event before any external action can happen.
      </p>
      <div className="kernel-actions">
        <button disabled={isBusy} onClick={refreshKernel} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          Refresh automation
        </button>
        <button disabled={isBusy || !session} onClick={activateKernel} type="button">
          <DatabaseZap size={16} aria-hidden="true" />
          Activate automation
        </button>
        <button disabled={isBusy || !session} onClick={startResumeWorkflow} type="button">
          <FileCheck2 size={16} aria-hidden="true" />
          Start resume workflow
        </button>
      </div>
      <p className="runtime-message">{friendlyUserMessage(message)}</p>
      <div className="kernel-metrics">
        <div>
          <strong>{kernelState?.summary.activeDefinitions ?? 0}</strong>
          <span>ready automations</span>
        </div>
        <div>
          <strong>{kernelState?.summary.activeRuns ?? 0}</strong>
          <span>active plans</span>
        </div>
        <div>
          <strong>{kernelState?.summary.pendingReceipts ?? 0}</strong>
          <span>pending approvals</span>
        </div>
        <div>
          <strong>{kernelState?.summary.enabledPolicies ?? 0}</strong>
          <span>active safeguards</span>
        </div>
      </div>
      <div className="kernel-grid">
        <div className="kernel-column">
          <strong>Core pillar workflows</strong>
          <div className="kernel-list">
            {pillarDefinitions.slice(0, 10).map((definition) => (
              <div className="kernel-row" key={definition.id}>
                <span>{definition.workspace}</span>
                <p>{definition.name}</p>
                <small>{formatProductLabel(definition.triggerEvent)}</small>
              </div>
            ))}
            {!pillarDefinitions.length ? (
              <div className="kernel-empty">Activate automation to prepare the ten JobsFlow pillar workflows.</div>
            ) : null}
          </div>
        </div>
        <div className="kernel-column">
          <strong>Latest runs and receipts</strong>
          <div className="kernel-list">
            {latestRun ? (
              <div className="kernel-row">
                <StatusPill tone={workflowTone(latestRun.state)}>{formatProductLabel(latestRun.state)}</StatusPill>
                <p>{formatProductLabel(latestRun.workflowKey)}</p>
                <small>{formatProductLabel(latestRun.currentStep)}</small>
              </div>
            ) : (
              <div className="kernel-empty">No automation plans yet.</div>
            )}
            {pendingReceipts.slice(0, 3).map((receipt) => (
              <div className="kernel-row" key={receipt.id}>
                <StatusPill tone="amber">{formatProductLabel(receipt.status)}</StatusPill>
                <p>{formatProductLabel(receipt.action)}</p>
                <small>{textFromRecord(receipt.preview, 'title', 'Consent preview recorded')}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="kernel-column">
          <strong>Connection boundaries</strong>
          <div className="kernel-list">
            {(kernelState?.integrations ?? []).slice(0, 6).map((integration) => (
              <div className="kernel-row" key={integration.id}>
                <span>{formatProductLabel(integration.status)}</span>
                <p>{integration.accountLabel}</p>
                <small>{formatProductLabel(integration.provider)}</small>
              </div>
            ))}
            {!kernelState?.integrations.length ? (
              <div className="kernel-empty">No connection boundaries are ready yet.</div>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}
