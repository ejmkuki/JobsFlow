import { CheckCircle2 } from 'lucide-react'
import type { Metric, Tone } from '../types'
import { toneClass } from '../lib/format'
import { workspaces } from '../data/workspaces'

export function JobsFlowLogoMark({ className = 'brand-mark' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox="0 0 64 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        className="brand-mark-jf-j-base"
        d="M2.8 40.3h18.8c6.9 0 12.1-5.3 12.1-12.2V8.2l-8.4 7.9v11.4c0 2.8-1.8 4.6-4.6 4.6h-9.5l-8.4 8.2Z"
      />
      <path
        className="brand-mark-jf-j"
        d="M5.4 36.7h16.1c4.7 0 8.1-3.4 8.1-8.3V6.7l-8.3 7.7v13.2c0 2.9-1.8 4.8-4.7 4.8H9.2l-3.8 4.3Z"
      />
      <path
        className="brand-mark-jf-f"
        d="M29.7 6.7h26.8l-5.4 7.7H39.5c-2.8 0-4.7 1.9-4.7 4.7v21.2h-9.5V18.5c0-5 1.6-8.7 4.4-11.8Z"
      />
      <path className="brand-mark-jf-accent" d="M34.8 22.5h18.7l-5.2 7.5H34.8v-7.5Z" />
      <path className="brand-mark-jf-highlight" d="M21.3 14.4 29.6 6.7v21.5c0 4.9-3.4 8.3-8.1 8.3H8c4-1.5 13.3-3.9 13.3-8.4V14.4Z" />
    </svg>
  )
}

export function StatusPill({ children, tone = 'neutral' }: { children: string; tone?: Tone }) {
  return <span className={`status-pill ${toneClass(tone)}`}>{children}</span>
}

export function MetricTile({ metric }: { metric: Metric }) {
  return (
    <article className="metric-tile">
      <span>{metric.label}</span>
      <strong>{metric.value}</strong>
      <p>{metric.detail}</p>
    </article>
  )
}

export function SectionHeader({
  eyebrow,
  title,
  copy,
}: {
  eyebrow: string
  title: string
  copy?: string
}) {
  return (
    <div className="section-header">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      {copy ? <p>{copy}</p> : null}
    </div>
  )
}

export function EvidenceList({ items }: { items: string[] }) {
  return (
    <ul className="evidence-list">
      {items.map((item) => (
        <li key={item}>
          <CheckCircle2 size={15} aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  )
}

export function WorkspaceButton({
  workspace,
  active,
  onClick,
}: {
  workspace: (typeof workspaces)[number]
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      className={active ? 'header-nav-link active' : 'header-nav-link'}
      onClick={onClick}
      type="button"
    >
      <span>{workspace.label}</span>
    </button>
  )
}

export function CommandCenter({ items }: { items: Array<{ label: string; value: string; detail: string }> }) {
  return (
    <div className="command-center">
      {items.map((item) => (
        <div className="command-item" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <p>{item.detail}</p>
        </div>
      ))}
    </div>
  )
}
