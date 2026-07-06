import { LogOut, RefreshCw } from 'lucide-react'
import type { BackendSession } from '../../backendClient'
import { StatusPill } from '../../components/ui'
import { friendlyUserMessage } from '../../lib/format'
import { employerActivationPreview } from '../../data/employer'
import { ResumeStoragePanel } from '../shared/ResumeStoragePanel'

type WorkspaceReadyViewProps = {
  session: BackendSession
  accountType: 'candidate' | 'employer'
  selectedChecklist: Array<{ step: string; detail: string }>
  message: string
  isBusy: boolean
  onRefresh: () => void
  onSignOut: () => void
}

export function WorkspaceReadyView({
  session,
  accountType,
  selectedChecklist,
  message,
  isBusy,
  onRefresh,
  onSignOut,
}: WorkspaceReadyViewProps) {
  return (
    <section className="auth-panel auth-panel-ready" aria-label="JobsFlow activation center">
      <div className="auth-copy">
        <span>Private workspace</span>
        <h2>Open JobsFlow, then decide what leaves the room</h2>
        <p>
          Sign in once. Upload evidence, review matches, and keep every employer-facing
          action behind consent.
        </p>
        <div className="activation-path">
          {selectedChecklist.slice(0, 3).map((item, index) => (
            <div className="activation-item" key={item.step}>
              <b>{String(index + 1).padStart(2, '0')}</b>
              <div>
                <strong>{item.step}</strong>
                <p>{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="auth-workspace-card">
        <StatusPill tone="green">Workspace ready</StatusPill>
        <h3>Your JobsFlow workspace is open</h3>
        <strong>{session.displayName}</strong>
        <span>{session.email}</span>
        <p>
          Resume upload, packet review, and the consent gate are unlocked for this
          signed session.
        </p>
      </div>

      <div className="auth-state">
        <StatusPill tone="green">Workspace open</StatusPill>
        <div className="session-summary">
          <strong>{session.displayName}</strong>
          <span>{session.email}</span>
          <small>{session.role} workspace</small>
        </div>
        <p className="runtime-message">{friendlyUserMessage(message)}</p>
        <div className="auth-actions">
          <button disabled={isBusy} onClick={onRefresh} type="button">
            <RefreshCw size={16} aria-hidden="true" />
            Refresh status
          </button>
          <button disabled={isBusy} onClick={onSignOut} type="button">
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </div>

      <div className="activation-next">
        {accountType === 'candidate' ? (
          <>
            <div className="activation-next-copy">
              <span>Candidate first action</span>
              <h3>Upload the resume that becomes your evidence base</h3>
              <p>
                The best candidate experience starts with one concrete action. Once
                signed in, store your resume here, then JobsFlow can build profile
                health, match evidence, and packet review around it.
              </p>
            </div>
            {session ? (
              <ResumeStoragePanel session={session} variant="activation" />
            ) : (
              <div className="activation-placeholder">
                <StatusPill tone="amber">Session needed</StatusPill>
                <strong>Start a workspace to unlock secure resume upload.</strong>
                <p>
                  Resume storage uses your signed-in workspace so files and metadata stay
                  protected.
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="activation-next-copy">
              <span>Employer first action</span>
              <h3>Clarify the role before JobsFlow ranks anyone</h3>
              <p>
                The employer path starts with role criteria, scorecard weights, and
                compensation visibility. Better shortlists begin with better intake.
              </p>
            </div>
            <div className="employer-activation-preview">
              {employerActivationPreview.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
