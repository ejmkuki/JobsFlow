import type { BackendSession } from '../../backendClient'
import { CommandCenter, EvidenceList, SectionHeader, StatusPill } from '../../components/ui'
import { abusePreventionRules, auditEvents, complianceLedger, dataOwnershipControls, integrations, trustCommandCenter, trustControls } from '../../data/trust'
import { WorkflowKernelPanel } from '../candidate/WorkflowKernelPanel'
import { BackendStatusPanel } from '../shared/BackendStatusPanel'
import { formatProductLabel } from '../../lib/format'
import { CheckCircle2, CreditCard, DatabaseZap, Globe2, Handshake, LayoutDashboard, ListChecks, LockKeyhole, RefreshCw, Scale, ShieldCheck } from 'lucide-react'
import { billingChecklist, consentGateMatrix, implementationRoadmap, planEntitlements, productStates, productionEntities, providerReadiness } from '../../productModel'
import { useState } from 'react'

export function TrustWorkspace({
  session,
  onSessionChange,
}: {
  session: BackendSession | null
  onSessionChange: (session: BackendSession | null) => void
}) {
  const [gateState, setGateState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(consentGateMatrix.map((gate) => [gate.key, gate.defaultEnabled])),
  )

  return (
    <section className="workspace-grid trust-workspace">
      <div className="workspace-lead">
        <SectionHeader
          copy="Automation earns trust when users can see, limit, approve, export, delete, and audit the actions around their data."
          eyebrow="Trust & platform"
          title="Every promise needs a product control"
        />
        <div className="lead-actions">
          <button type="button">
            <LockKeyhole size={18} aria-hidden="true" />
            Review controls
          </button>
          <button type="button">
            <CreditCard size={18} aria-hidden="true" />
            Stripe-ready plans
          </button>
        </div>
      </div>

      <CommandCenter items={trustCommandCenter} />

      <BackendStatusPanel session={session} onSessionChange={onSessionChange} />

      <WorkflowKernelPanel session={session} />

      <article className="panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Trust controls</span>
            <h3>Control before scale</h3>
          </div>
          <StatusPill tone="green">No external submission behavior</StatusPill>
        </div>
        <div className="trust-grid">
          {trustControls.map((control) => (
            <div className="trust-control" key={control.title}>
              <strong>{control.title}</strong>
              <StatusPill tone={control.status === 'Planned' ? 'amber' : 'green'}>
                {control.status}
              </StatusPill>
              <p>{control.detail}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="panel ownership-panel">
        <div className="panel-title">
          <div>
            <span>Data ownership model</span>
            <h3>Export, deletion, and privacy are product features</h3>
          </div>
          <LockKeyhole size={22} aria-hidden="true" />
        </div>
        <div className="ownership-list">
          {dataOwnershipControls.map((control) => (
            <div className="ownership-row" key={control.title}>
              <strong>{control.title}</strong>
              <p>{control.detail}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="panel consent-panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Consent gate matrix</span>
            <h3>Human approval stays visible</h3>
          </div>
          <StatusPill tone="blue">Local controls only</StatusPill>
        </div>
        <div className="consent-grid">
          {consentGateMatrix.map((gate) => (
            <label className="consent-row" key={gate.key}>
              <input
                checked={Boolean(gateState[gate.key])}
                onChange={(event) =>
                  setGateState((current) => ({
                    ...current,
                    [gate.key]: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>
                <strong>{gate.action}</strong>
                <small>{gate.requiredApproval}</small>
              </span>
              <StatusPill tone={gateState[gate.key] ? 'green' : 'amber'}>
                {gateState[gate.key] ? 'Allowed in prototype' : 'Blocked'}
              </StatusPill>
              <p>{gate.risk}</p>
              <code>{gate.auditEvent}</code>
            </label>
          ))}
        </div>
      </article>

      <article className="panel states-panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Product states</span>
            <h3>Empty, loading, error, and blocked states are part of trust</h3>
          </div>
          <ListChecks size={22} aria-hidden="true" />
        </div>
        <div className="states-grid">
          {productStates.map((state) => (
            <div className="state-row" key={`${state.state}-${state.surface}`}>
              <StatusPill
                tone={
                  state.state === 'Error'
                    ? 'red'
                    : state.state === 'Blocked'
                      ? 'amber'
                      : 'blue'
                }
              >
                {state.state}
              </StatusPill>
              <strong>{state.surface}</strong>
              <p>{state.message}</p>
              <small>{state.recovery}</small>
            </div>
          ))}
        </div>
      </article>

      <article className="panel compliance-panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Compliance readiness ledger</span>
            <h3>Controls that must exist before scale</h3>
          </div>
          <StatusPill tone="amber">Beta hardening</StatusPill>
        </div>
        <div className="ledger-grid">
          {complianceLedger.map((item) => (
            <div className="ledger-row" key={item.control}>
              <div>
                <strong>{item.control}</strong>
                <span>{item.owner}</span>
              </div>
              <StatusPill tone={item.tone}>{item.status}</StatusPill>
              <p>{item.proof}</p>
              <small>{item.next}</small>
            </div>
          ))}
        </div>
      </article>

      <article className="panel audit-panel">
        <div className="panel-title">
          <div>
            <span>AI action history</span>
            <h3>Owner, limit, and record</h3>
          </div>
          <DatabaseZap size={22} aria-hidden="true" />
        </div>
        <div className="audit-list">
          {auditEvents.map((event) => (
            <div className="audit-row" key={`${event.event}-${event.time}`}>
              <span>{event.time}</span>
              <strong>{event.event}</strong>
              <p>{event.owner}</p>
              <small>{event.limit}</small>
            </div>
          ))}
        </div>
      </article>

      <article className="panel abuse-panel">
        <div className="panel-title">
          <div>
            <span>Abuse and spam prevention</span>
            <h3>Signal protection before scale</h3>
          </div>
          <ShieldCheck size={22} aria-hidden="true" />
        </div>
        <ul className="action-list">
          {abusePreventionRules.map((rule) => (
            <li key={rule}>
              <CheckCircle2 size={16} aria-hidden="true" />
              {rule}
            </li>
          ))}
        </ul>
      </article>

      <article className="panel integrations-panel">
        <div className="panel-title">
          <div>
            <span>Integration roadmap</span>
            <h3>Coverage without unsafe shortcuts</h3>
          </div>
          <Globe2 size={22} aria-hidden="true" />
        </div>
        <div className="integration-grid">
          {integrations.map(([name, status]) => (
            <div key={name}>
              <strong>{name}</strong>
              <span>{status}</span>
            </div>
          ))}
        </div>
      </article>

      <article className="panel schema-panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Launch data areas</span>
            <h3>Workspace-safe data areas for launch</h3>
          </div>
          <DatabaseZap size={22} aria-hidden="true" />
        </div>
        <div className="schema-grid">
          {productionEntities.map((entity) => (
            <div className="schema-row" key={entity.name}>
              <div>
                <strong>{entity.name}</strong>
                <span>{entity.workspace} workspace</span>
              </div>
              <p>{entity.purpose}</p>
              <ul>
                {entity.keyFields.map((field) => (
                  <li key={field}>{formatProductLabel(field)}</li>
                ))}
              </ul>
              <small>{entity.launchNote}</small>
            </div>
          ))}
        </div>
      </article>

      <article className="panel readiness-panel">
        <div className="panel-title">
          <div>
            <span>Service readiness</span>
            <h3>Real services without unsafe shortcuts</h3>
          </div>
          <LockKeyhole size={22} aria-hidden="true" />
        </div>
        <div className="readiness-grid">
          {providerReadiness.map((provider) => (
            <div className="readiness-row" key={provider.area}>
              <strong>{provider.area}</strong>
              <span>{provider.provider}</span>
              <StatusPill tone="neutral">{provider.phase}</StatusPill>
              <p>{provider.requirement}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="panel billing-ops-panel">
        <div className="panel-title">
          <div>
            <span>Stripe launch checklist</span>
            <h3>Billing must protect affordability</h3>
          </div>
          <CreditCard size={22} aria-hidden="true" />
        </div>
        <div className="billing-checklist">
          {billingChecklist.map((item) => (
            <div className="billing-check-row" key={item.item}>
              <strong>{item.item}</strong>
              <StatusPill tone={item.status === 'Needs policy' ? 'amber' : 'blue'}>
                {item.status}
              </StatusPill>
              <p>{item.detail}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="panel pricing-panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Affordable plans</span>
            <h3>Stripe-ready billing that keeps access broad</h3>
          </div>
          <CreditCard size={22} aria-hidden="true" />
        </div>
        <div className="pricing-grid">
          {planEntitlements.map((plan) => (
            <div className="pricing-row" key={plan.plan}>
              <strong>{plan.plan}</strong>
              <b>{plan.monthlyPrice}</b>
              <p>{plan.audience}</p>
              <EvidenceList items={plan.included} />
              <div className="entitlement-notes">
                <small>{plan.limits.join(' / ')}</small>
                <small>{plan.safeguards.join(' / ')}</small>
              </div>
            </div>
          ))}
        </div>
        <p className="fine-print">
          Production billing should use Stripe Checkout or Stripe Billing, with hardship pricing and transparent cancellation before launch.
        </p>
      </article>

      <article className="panel platform-panel">
        <div className="panel-title">
          <div>
            <span>Production gates</span>
            <h3>What must exist before real automation</h3>
          </div>
          <ListChecks size={22} aria-hidden="true" />
        </div>
        <ul className="action-list">
          <li>
            <ShieldCheck size={16} aria-hidden="true" />
            Auth, encryption, and retention controls
          </li>
          <li>
            <Handshake size={16} aria-hidden="true" />
            Candidate consent receipts
          </li>
          <li>
            <RefreshCw size={16} aria-hidden="true" />
            Duplicate and abuse monitoring
          </li>
          <li>
            <Scale size={16} aria-hidden="true" />
            Employer fairness review flow
          </li>
        </ul>
      </article>

      <article className="panel roadmap-panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Execution roadmap</span>
            <h3>From trusted prototype to paid beta</h3>
          </div>
          <ListChecks size={22} aria-hidden="true" />
        </div>
        <div className="roadmap-grid">
          {implementationRoadmap.map((phase) => (
            <div className="roadmap-row" key={phase.phase}>
              <strong>{phase.phase}</strong>
              <p>{phase.outcome}</p>
              <EvidenceList items={phase.deliverables} />
            </div>
          ))}
        </div>
      </article>

      <article className="panel system-panel">
        <div className="panel-title">
          <div>
            <span>Admin health</span>
            <h3>Future operating console</h3>
          </div>
          <LayoutDashboard size={22} aria-hidden="true" />
        </div>
        <div className="analytics-grid">
          <div>
            <strong>0</strong>
            <span>External submissions in prototype</span>
          </div>
          <div>
            <strong>100%</strong>
            <span>Actions require review</span>
          </div>
          <div>
            <strong>Draft</strong>
            <span>Compliance posture</span>
          </div>
        </div>
      </article>
    </section>
  )
}
