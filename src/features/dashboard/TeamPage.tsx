import { useEffect, useState, type FormEvent } from 'react'
import type { BackendSession, TeamInvite, TeamMember } from '../../backendClient'
import { humanizeJobsFlowError, inviteTeamMember, listTeam, removeTeamMember, revokeTeamInvite } from '../../backendClient'

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

  function refresh() {
    if (!session) return
    listTeam()
      .then((result) => {
        setMembers(result.members)
        setInvites(result.invites)
        setIsOwner(result.isOwner)
      })
      .catch((error) => setMessage(humanizeJobsFlowError(error, 'backend')))
  }

  useEffect(refresh, [session])

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

      {isOwner ? (
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
