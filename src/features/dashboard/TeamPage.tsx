import { useEffect, useState, type FormEvent } from 'react'
import type { BackendSession, BillingStatus, TeamInvite, TeamMember } from '../../backendClient'
import {
  getBillingStatus,
  humanizeJobsFlowError,
  inviteTeamMember,
  listTeam,
  openBillingPortal,
  removeTeamMember,
  revokeTeamInvite,
  startUpgradeCheckout,
} from '../../backendClient'

const roleLabels: Record<string, string> = {
  recruiter: 'Recruiter',
  hiring_manager: 'Hiring manager',
  platform_admin: 'Owner',
}

export function TeamPage({ session }: { session: BackendSession | null }) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [invites, setInvites] = useState<TeamInvite[]>([])
  const [isOwner, setIsOwner] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('recruiter')
  const [message, setMessage] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [billing, setBilling] = useState<BillingStatus | null>(null)
  const [isBillingBusy, setIsBillingBusy] = useState(false)

  function refresh() {
    if (!session) return
    listTeam()
      .then((result) => {
        setMembers(result.members)
        setInvites(result.invites)
        setIsOwner(result.isOwner)
      })
      .catch((error) => setMessage(humanizeJobsFlowError(error, 'backend')))
    getBillingStatus()
      .then(setBilling)
      .catch(() => {}) // advisory panel — a failed fetch shouldn't block the rest of the page
  }

  useEffect(refresh, [session])

  async function upgrade() {
    setIsBillingBusy(true)
    setMessage('')
    try {
      const result = await startUpgradeCheckout()
      window.location.href = result.url
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
      setIsBillingBusy(false)
    }
  }

  async function manageBilling() {
    setIsBillingBusy(true)
    setMessage('')
    try {
      const result = await openBillingPortal()
      window.location.href = result.url
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
      setIsBillingBusy(false)
    }
  }

  async function submitInvite(event: FormEvent) {
    event.preventDefault()
    if (!email.trim()) return
    setIsBusy(true)
    setMessage('')
    try {
      await inviteTeamMember({ email: email.trim(), role })
      setEmail('')
      refresh()
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    } finally {
      setIsBusy(false)
    }
  }

  async function revoke(inviteId: string) {
    setIsBusy(true)
    try {
      await revokeTeamInvite(inviteId)
      refresh()
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    } finally {
      setIsBusy(false)
    }
  }

  async function remove(userId: string) {
    setIsBusy(true)
    try {
      await removeTeamMember(userId)
      refresh()
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'backend'))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <main className="jf-content">
      <div className="jf-page-head">
        <div>
          <h1>Team</h1>
          <p>Invite recruiters and hiring managers into this workspace. Everyone shares the same pipeline.</p>
        </div>
      </div>

      {message ? <p className="jf-msg">{message}</p> : null}

      {isOwner && billing ? (
        <section className="jf-panel">
          <div className="jf-panel-head">
            <h2>Plan</h2>
            <span className={`jf-status ${billing.isPaid ? 'jf-green' : 'jf-blue'}`}>{billing.isPaid ? 'Pro' : 'Free'}</span>
          </div>
          {billing.isPaid ? (
            <>
              <p className="jf-msg">Unlimited open roles, AI-assisted matching, team seats, and structured scorecards.</p>
              <button className="jf-btn jf-btn-ghost" disabled={isBillingBusy} onClick={() => void manageBilling()} type="button">
                Manage billing
              </button>
            </>
          ) : (
            <>
              <p className="jf-msg">
                Free plan: up to 3 open roles at once, keyword-only matching. Upgrade for unlimited roles, AI-assisted
                matching, team seats, and structured scorecards.
              </p>
              <button className="jf-btn jf-btn-primary" disabled={isBillingBusy} onClick={() => void upgrade()} type="button">
                Upgrade to Pro
              </button>
            </>
          )}
        </section>
      ) : null}

      {isOwner && billing?.isPaid ? (
        <section className="jf-panel">
          <div className="jf-panel-head">
            <h2>Invite a teammate</h2>
          </div>
          <form onSubmit={(event) => void submitInvite(event)} className="jf-item-actions">
            <input
              className="jf-item-note"
              type="email"
              placeholder="teammate@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <select className="jf-select" value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="recruiter">Recruiter</option>
              <option value="hiring_manager">Hiring manager</option>
            </select>
            <button className="jf-btn jf-btn-primary" disabled={isBusy} type="submit">
              Send invite
            </button>
          </form>
        </section>
      ) : null}

      <section className="jf-panel">
        <div className="jf-panel-head">
          <h2>Members</h2>
        </div>
        {members.length === 0 ? (
          <p className="jf-empty">No members yet.</p>
        ) : (
          <div className="jf-timeline">
            {members.map((member) => (
              <div className="jf-timeline-row" key={member.userId}>
                <span className="jf-timeline-dot" />
                <div className="jf-item-actions" style={{ justifyContent: 'space-between', width: '100%' }}>
                  <div>
                    <strong>{member.displayName}</strong>
                    <span className="jf-msg"> · {member.email} · {member.isOwner ? 'Owner' : roleLabels[member.role] ?? member.role}</span>
                  </div>
                  {isOwner && !member.isOwner ? (
                    <button className="jf-btn jf-btn-sm jf-btn-danger" disabled={isBusy} onClick={() => void remove(member.userId)} type="button">
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {isOwner && invites.length > 0 ? (
        <section className="jf-panel">
          <div className="jf-panel-head">
            <h2>Pending invites</h2>
          </div>
          <div className="jf-timeline">
            {invites.map((invite) => (
              <div className="jf-timeline-row" key={invite.id}>
                <span className="jf-timeline-dot" />
                <div className="jf-item-actions" style={{ justifyContent: 'space-between', width: '100%' }}>
                  <div>
                    <strong>{invite.invitedEmail}</strong>
                    <span className="jf-msg"> · {roleLabels[invite.role] ?? invite.role}</span>
                  </div>
                  <button className="jf-btn jf-btn-sm jf-btn-ghost" disabled={isBusy} onClick={() => void revoke(invite.id)} type="button">
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}
