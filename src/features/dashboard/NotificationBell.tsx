import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import type { BackendSession, NotificationItem } from '../../backendClient'
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../../backendClient'

const pollIntervalMs = 60_000

function relativeTime(createdAt: string) {
  const then = new Date(`${createdAt.replace(' ', 'T')}Z`).getTime()
  const minutes = Math.floor((Date.now() - then) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function NotificationBell({ session }: { session: BackendSession | null }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!session) return

    let cancelled = false
    async function refresh() {
      try {
        const result = await listNotifications()
        if (!cancelled) {
          setItems(result.notifications)
          setUnreadCount(result.unreadCount)
        }
      } catch {
        // Notifications are advisory — a failed poll isn't worth a page-level error.
      }
    }

    void refresh()
    const interval = setInterval(() => void refresh(), pollIntervalMs)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [session])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleOpenItem(item: NotificationItem) {
    setOpen(false)
    if (!item.readAt) {
      const readAt = new Date().toISOString()
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, readAt } : n)))
      setUnreadCount((prev) => Math.max(0, prev - 1))
      void markNotificationRead(item.id)
    }
    if (item.linkPath) navigate(item.linkPath)
  }

  function handleMarkAll() {
    const readAt = new Date().toISOString()
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? readAt })))
    setUnreadCount(0)
    void markAllNotificationsRead()
  }

  if (!session) return null

  return (
    <div className="jf-notif" ref={rootRef}>
      <button aria-label="Notifications" className="jf-notif-btn" onClick={() => setOpen((value) => !value)} type="button">
        <Bell aria-hidden="true" size={18} />
        {unreadCount > 0 ? <span className="jf-notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span> : null}
      </button>
      {open ? (
        <div className="jf-notif-panel">
          <div className="jf-notif-head">
            <strong>Notifications</strong>
            {unreadCount > 0 ? (
              <button className="jf-linkbtn" onClick={handleMarkAll} type="button">
                Mark all read
              </button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="jf-notif-empty">No notifications yet.</p>
          ) : (
            <div className="jf-notif-list">
              {items.map((item) => (
                <button
                  className={`jf-notif-item${item.readAt ? '' : ' jf-unread'}`}
                  key={item.id}
                  onClick={() => handleOpenItem(item)}
                  type="button"
                >
                  <span className="jf-notif-dot" />
                  <span className="jf-notif-body">
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                    <small>{relativeTime(item.createdAt)}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
