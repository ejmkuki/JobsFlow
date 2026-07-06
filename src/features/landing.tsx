import { EvidenceList, JobsFlowLogoMark, StatusPill } from '../components/ui'
import { signalDecisions } from '../data/signals'
import { ArrowRight, MapPin, Search } from 'lucide-react'
import { onboardingSteps } from '../productModel'
import type { FormEvent } from 'react'
import { useState } from 'react'
import type { LandingSearchIntent, Workspace } from '../types'

export function LandingHero({
  onGetStarted,
  onSearch,
}: {
  onGetStarted: () => void
  onSearch: (intent: LandingSearchIntent) => void
}) {
  const [role, setRole] = useState('')
  const [location, setLocation] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSearch({
      location: location.trim(),
      role: role.trim(),
    })
  }

  return (
    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-hero-inner">
        <div className="hero-wordmark" aria-label="JobsFlow AI">
          <JobsFlowLogoMark className="brand-mark hero-brand-mark" />
          <span>JobsFlow AI</span>
        </div>

        <h1 id="landing-title">
          JobsFlow AI turns resumes, jobs, and hiring signals into evidence-based matches.
        </h1>
        <p>
          Optimize your profile, track applications, prep for interviews, and help
          employers find verified-fit candidates faster.
        </p>

        <form className="landing-search" aria-label="Start a JobsFlow match" onSubmit={handleSubmit}>
          <label className="landing-search-field">
            <span className="visually-hidden">Role or keyword</span>
            <Search size={22} aria-hidden="true" />
            <input
              autoComplete="off"
              onChange={(event) => setRole(event.target.value)}
              placeholder="Job title, skill, or company"
              type="search"
              value={role}
            />
          </label>
          <label className="landing-search-field">
            <span className="visually-hidden">Location</span>
            <MapPin size={22} aria-hidden="true" />
            <input
              autoComplete="address-level2"
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Location or remote"
              type="search"
              value={location}
            />
          </label>
          <button type="submit">
            Start match
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </form>

        <div className="hero-secondary-actions">
          <button type="button" onClick={onGetStarted}>
            Get started
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  )
}

export function ProductOnboarding({
  activeStep,
  onStepChange,
}: {
  activeStep: string
  onStepChange: (step: string) => void
}) {
  const selectedStep =
    onboardingSteps.find((step) => step.key === activeStep) ?? onboardingSteps[0]

  return (
    <section className="onboarding-panel" aria-label="Product onboarding">
      <div className="onboarding-copy">
        <span>Guided setup</span>
        <h2>Turn intent into trusted workflow</h2>
        <p>
          JobsFlow starts by clarifying signal, consent, ownership, and affordability before
          any automation is allowed to act.
        </p>
      </div>
      <div className="onboarding-steps" role="tablist" aria-label="Onboarding steps">
        {onboardingSteps.map((step, index) => (
          <button
            aria-selected={step.key === activeStep}
            className={step.key === activeStep ? 'onboarding-step active' : 'onboarding-step'}
            key={step.key}
            onClick={() => onStepChange(step.key)}
            role="tab"
            type="button"
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{step.title}</strong>
          </button>
        ))}
      </div>
      <article className="onboarding-detail">
        <StatusPill tone="blue">{`${selectedStep.owner} workspace`}</StatusPill>
        <h3>{selectedStep.outcome}</h3>
        <p>{selectedStep.proof}</p>
      </article>
    </section>
  )
}

export function SignalOperationsLayer({
  activeWorkspace,
  onWorkspaceChange,
}: {
  activeWorkspace: Workspace
  onWorkspaceChange: (workspace: Workspace) => void
}) {
  const activeDecision = signalDecisions.find((decision) => decision.workspace === activeWorkspace)
  const relatedDecisions = signalDecisions.filter((decision) => decision.workspace !== activeWorkspace)

  return (
    <section className="ops-layer" aria-label="Signal operations layer">
      <div className="ops-copy">
        <span>Signal operations</span>
        <h2>Run the next reviewed decision</h2>
        <p>
          JobsFlow keeps each workspace focused on what changed, why it matters,
          and which evidence-backed action should happen next.
        </p>
      </div>

      {activeDecision ? (
        <article className="ops-decision primary-decision">
          <div className="decision-topline">
            <StatusPill tone={activeDecision.tone}>{activeDecision.status}</StatusPill>
            <span>{activeDecision.owner}</span>
          </div>
          <strong>{activeDecision.title}</strong>
          <div className="decision-flow">
            <div>
              <span>Changed</span>
              <p>{activeDecision.changed}</p>
            </div>
            <div>
              <span>Matters</span>
              <p>{activeDecision.matters}</p>
            </div>
            <div>
              <span>Next</span>
              <p>{activeDecision.next}</p>
            </div>
          </div>
          <EvidenceList items={activeDecision.evidence} />
        </article>
      ) : null}

      <aside className="ops-router" aria-label="Other workspace decisions">
        {relatedDecisions.map((decision) => (
          <button
            key={decision.label}
            onClick={() => onWorkspaceChange(decision.workspace)}
            type="button"
          >
            <span>{decision.label}</span>
            <strong>{decision.title}</strong>
            <small>{decision.next}</small>
          </button>
        ))}
      </aside>
    </section>
  )
}
