import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import type { BackendSession } from '../../backendClient'
import './dashboard.css'

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'JF'
}

const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'jf-active' : undefined)

export function DashboardShell({ session, onSignOut }: { session: BackendSession | null; onSignOut: () => void }) {
  const navigate = useNavigate()
  const name = session?.displayName ?? 'JobsFlow'

  return (
    <div className="jf-shell">
      <aside className="jf-rail">
        <a
          className="jf-brand"
          href="/"
          onClick={(event) => {
            event.preventDefault()
            navigate('/')
          }}
        >
          <svg viewBox="0 0 64 48" aria-hidden="true">
            <path fill="#0e7490" d="M2.8 40.3h18.8c6.9 0 12.1-5.3 12.1-12.2V8.2l-8.4 7.9v11.4c0 2.8-1.8 4.6-4.6 4.6h-9.5l-8.4 8.2Z" />
            <path fill="#0284c7" d="M29.7 6.7h26.8l-5.4 7.7H39.5c-2.8 0-4.7 1.9-4.7 4.7v21.2h-9.5V18.5c0-5 1.6-8.7 4.4-11.8Z" />
            <path fill="#38bdf8" d="M34.8 22.5h18.7l-5.2 7.5H34.8v-7.5Z" />
          </svg>
          <strong>JobsFlow AI</strong>
        </a>

        <nav className="jf-nav" aria-label="Employer sections">
          <NavLink className={navClass} to="candidates">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="9" cy="8" r="3.2" />
              <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
              <path d="M17 8h4M17 12h4M17 16h4" />
            </svg>
            Candidates
          </NavLink>
          <NavLink className={navClass} to="jobs">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="2" y="7" width="20" height="14" rx="2" />
              <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Jobs
          </NavLink>
        </nav>

        <div className="jf-rail-foot">
          <div className="jf-avatar">{initials(name)}</div>
          <div>
            <strong>{name}</strong>
            <small>{session?.email}</small>
          </div>
        </div>
      </aside>

      <div className="jf-main">
        <header className="jf-topbar">
          <div className="jf-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            Search candidates, jobs, or skills
          </div>
          <div className="jf-top-actions">
            <button className="jf-btn jf-btn-primary" onClick={() => navigate('jobs')} type="button">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Post a role
            </button>
            <button className="jf-btn jf-btn-ghost" onClick={onSignOut} type="button">
              Sign out
            </button>
          </div>
        </header>

        <Outlet />
      </div>
    </div>
  )
}
