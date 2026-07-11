import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { BackendSession } from '../../backendClient'
import { NotificationBell } from './NotificationBell'
import './dashboard.css'

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'JF'
  )
}

const tabClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'jf-tab jf-active' : 'jf-tab')

const candidateTabs = [
  { to: '/candidate', label: 'Home', end: true },
  { to: '/candidate/jobs', label: 'Jobs', end: false },
  { to: '/candidate/applications', label: 'Applications', end: false },
  { to: '/candidate/profile', label: 'Profile', end: false },
]
const employerTabs = [
  { to: '/employer/candidates', label: 'Candidates', end: false },
  { to: '/employer/jobs', label: 'Jobs', end: false },
]

export function AppTopNav({ session, onSignOut }: { session: BackendSession | null; onSignOut: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const isHiring = location.pathname.startsWith('/employer')
  const tabs = isHiring ? employerTabs : candidateTabs
  const name = session?.displayName ?? 'JobsFlow'

  return (
    <div className="jf-app">
      <nav className="jf-nav">
        <div className="jf-nav-inner">
          <a
            className="jf-logo"
            href="/"
            onClick={(event) => {
              event.preventDefault()
              navigate(isHiring ? '/employer' : '/candidate')
            }}
          >
            <svg viewBox="0 0 64 48" aria-hidden="true">
              <path fill="#0e7490" d="M2.8 40.3h18.8c6.9 0 12.1-5.3 12.1-12.2V8.2l-8.4 7.9v11.4c0 2.8-1.8 4.6-4.6 4.6h-9.5l-8.4 8.2Z" />
              <path fill="#0284c7" d="M29.7 6.7h26.8l-5.4 7.7H39.5c-2.8 0-4.7 1.9-4.7 4.7v21.2h-9.5V18.5c0-5 1.6-8.7 4.4-11.8Z" />
              <path fill="#38bdf8" d="M34.8 22.5h18.7l-5.2 7.5H34.8v-7.5Z" />
            </svg>
            <strong>JobsFlow AI</strong>
          </a>

          <div className="jf-tabs">
            {tabs.map((tab) => (
              <NavLink className={tabClass} end={tab.end} key={tab.to} to={tab.to}>
                {tab.label}
              </NavLink>
            ))}
          </div>

          <div className="jf-nav-right">
            <div className="jf-mode" role="group" aria-label="Switch mode">
              <button className={!isHiring ? 'jf-on' : undefined} onClick={() => navigate('/candidate')} type="button">
                Find work
              </button>
              <button className={isHiring ? 'jf-on' : undefined} onClick={() => navigate('/employer')} type="button">
                Hire
              </button>
            </div>
            <NotificationBell session={session} />
            <div className="jf-account">
              <div className="jf-avatar" title={name}>{initials(name)}</div>
              <button className="jf-linkbtn" onClick={onSignOut} type="button">Sign out</button>
            </div>
          </div>
        </div>
      </nav>

      <Outlet />
    </div>
  )
}
