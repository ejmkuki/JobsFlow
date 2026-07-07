import type { BackendSession } from '../../backendClient'
import { CommandCenter, EvidenceList, MetricTile, SectionHeader, StatusPill } from '../../components/ui'
import { applicationPacket, applications, automationModes, candidateCommandCenter, candidateEvidenceReviews, candidateGuardrails, candidateMarketPlays, candidateMetrics, candidateProfile, jobMatches, prepItems, resumeSignals, savedResponses } from '../../data/candidate'
import { AntiGhostingPipelinePanel } from './AntiGhostingPipelinePanel'
import { JobBoardPanel } from './JobBoardPanel'
import { PacketReviewGate } from './PacketReviewGate'
import { DynamicAchievementProfilesPanel } from './DynamicAchievementProfilesPanel'
import { InterviewPrepSandboxPanel } from './InterviewPrepSandboxPanel'
import { PassiveSourcingCardsPanel } from './PassiveSourcingCardsPanel'
import { ResumeTailwindPanel } from './ResumeTailwindPanel'
import { TransparencyBlueprintPanel } from './TransparencyBlueprintPanel'
import { Bell, CalendarCheck, Clock3, FileCheck2, Gauge, Globe2, NotebookTabs, SearchCheck, ShieldCheck } from 'lucide-react'

export function CandidateWorkspace({
  automationMode,
  onModeChange,
  session,
}: {
  automationMode: string
  onModeChange: (mode: string) => void
  session: BackendSession | null
}) {
  return (
    <section className="workspace-grid candidate-workspace">
      <div className="workspace-lead">
        <SectionHeader
          copy="Today’s focus: review two high-fit packets, strengthen one proof gap, and keep every external action under candidate approval."
          eyebrow="Candidate workspace"
          title="Apply with precision, not volume"
        />
        <div className="lead-actions">
          <button type="button">
            <FileCheck2 size={18} aria-hidden="true" />
            Review packets
          </button>
          <button type="button">
            <SearchCheck size={18} aria-hidden="true" />
            Tune matches
          </button>
        </div>
      </div>

      <CommandCenter items={candidateCommandCenter} />

      <div className="metrics-row">
        {candidateMetrics.map((metric) => (
          <MetricTile key={metric.label} metric={metric} />
        ))}
      </div>

      <JobBoardPanel session={session} />

      <article className="panel profile-panel">
        <div className="panel-title">
          <div>
            <span>Profile health</span>
            <h3>{candidateProfile.name}</h3>
          </div>
          <StatusPill tone="green">{`${candidateProfile.health}% ready`}</StatusPill>
        </div>
        <p className="profile-headline">{candidateProfile.headline}</p>
        <p className="muted-line">{candidateProfile.target}</p>
        <div className="progress-track" aria-label="Profile health">
          <span style={{ width: `${candidateProfile.health}%` }}></span>
        </div>
        <div className="two-column-list">
          <div>
            <h4>Verified signals</h4>
            <EvidenceList items={candidateProfile.verifiedSignals} />
          </div>
          <div>
            <h4>Needs review</h4>
            <ul className="plain-list">
              {candidateProfile.needsReview.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </article>

      <article className="panel resume-panel">
        <div className="panel-title">
          <div>
            <span>Resume intelligence</span>
            <h3>Evidence before recommendation</h3>
          </div>
          <Gauge size={22} aria-hidden="true" />
        </div>
        <div className="signal-stack">
          {resumeSignals.map((signal) => (
            <div className="signal-row" key={signal.label}>
              <span>{signal.label}</span>
              <strong>{signal.value}</strong>
              <p>{signal.detail}</p>
            </div>
          ))}
        </div>
      </article>

      <ResumeTailwindPanel session={session} />

      <TransparencyBlueprintPanel session={session} />

      <PassiveSourcingCardsPanel session={session} />

      <DynamicAchievementProfilesPanel session={session} />

      <article className="panel packet-panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Application packet builder</span>
            <h3>
              {applicationPacket.role} at {applicationPacket.company}
            </h3>
          </div>
          <StatusPill tone="green">{`${applicationPacket.readiness}% packet ready`}</StatusPill>
        </div>
        <div className="packet-grid">
          <div>
            <div className="progress-track" aria-label="Application packet readiness">
              <span style={{ width: `${applicationPacket.readiness}%` }}></span>
            </div>
            <div className="packet-checklist">
              {applicationPacket.sections.map(([section, status]) => (
                <div className="packet-row" key={section}>
                  <strong>{section}</strong>
                  <span>{status}</span>
                </div>
              ))}
            </div>
          </div>
          <PacketReviewGate session={session} />
        </div>
      </article>

      <AntiGhostingPipelinePanel session={session} />

      <InterviewPrepSandboxPanel session={session} />

      <article className="panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Job match queue</span>
            <h3>Roles worth human attention</h3>
          </div>
          <StatusPill tone="blue">6 review-ready</StatusPill>
        </div>
        <div className="match-table">
          {jobMatches.map((match) => (
            <div className="match-row" key={`${match.company}-${match.role}`}>
              <div>
                <strong>{match.role}</strong>
                <span>{match.company}</span>
              </div>
              <div>
                <b>{match.fit}%</b>
                <span>{match.salary}</span>
              </div>
              <div>
                <StatusPill tone={match.status === 'Watchlist' ? 'amber' : 'green'}>
                  {match.status}
                </StatusPill>
              </div>
              <div>
                <EvidenceList items={match.evidence} />
                <p className="risk-note">{match.gaps.join(', ')}</p>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="panel evidence-review-panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Fit evidence review</span>
            <h3>Decide with proof, gaps, and guardrails visible</h3>
          </div>
          <StatusPill tone="amber">Human approval required</StatusPill>
        </div>
        <div className="evidence-review-grid">
          {candidateEvidenceReviews.map((review) => (
            <div className="review-card" key={`${review.company}-${review.role}`}>
              <div className="review-card-header">
                <div>
                  <strong>{review.role}</strong>
                  <span>{review.company}</span>
                </div>
                <StatusPill tone={review.tone}>{review.decision}</StatusPill>
              </div>
              <div className="review-score">
                <b>{review.fit}</b>
                <span>{review.gate}</span>
              </div>
              <div className="review-columns">
                <div>
                  <h4>Evidence</h4>
                  <EvidenceList items={review.evidence} />
                </div>
                <div>
                  <h4>Gaps and safeguards</h4>
                  <ul className="plain-list">
                    {[...review.gaps, ...review.safeguards].map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="next-action">{review.next}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="panel market-panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Market-inspired candidate tools</span>
            <h3>Keep the reach, remove the noise</h3>
          </div>
          <Globe2 size={22} aria-hidden="true" />
        </div>
        <div className="market-grid">
          {candidateMarketPlays.map((play) => (
            <div className="market-row" key={play.pattern}>
              <span>{play.pattern}</span>
              <strong>{play.jobsFlowMove}</strong>
              <p>{play.detail}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="panel applications-panel">
        <div className="panel-title">
          <div>
            <span>Application tracker</span>
            <h3>What changed, what matters, what is next</h3>
          </div>
          <Clock3 size={22} aria-hidden="true" />
        </div>
        <div className="timeline-list">
          {applications.map((application) => (
            <div className="timeline-row" key={application.company}>
              <span>{application.age}</span>
              <div>
                <strong>{application.company}</strong>
                <p>{application.stage}</p>
              </div>
              <div>
                <b>{application.next}</b>
                <p>{application.owner}</p>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="panel controls-panel">
        <div className="panel-title">
          <div>
            <span>Automation controls</span>
            <h3>Owner, limit, and log for every mode</h3>
          </div>
          <ShieldCheck size={22} aria-hidden="true" />
        </div>
        <div className="mode-selector">
          {automationModes.map((mode) => (
            <button
              className={automationMode === mode.name ? 'mode-option active' : 'mode-option'}
              key={mode.name}
              onClick={() => onModeChange(mode.name)}
              type="button"
            >
              <strong>{mode.name}</strong>
              <span>{mode.detail}</span>
              <small>
                {mode.owner} / {mode.limit} / {mode.log}
              </small>
            </button>
          ))}
        </div>
      </article>

      <article className="panel guardrail-panel">
        <div className="panel-title">
          <div>
            <span>Reputation guardrails</span>
            <h3>Rules that protect the candidate first</h3>
          </div>
          <ShieldCheck size={22} aria-hidden="true" />
        </div>
        <div className="guardrail-grid">
          {candidateGuardrails.map((guardrail) => (
            <div className="guardrail-row" key={guardrail.label}>
              <strong>{guardrail.label}</strong>
              <b>{guardrail.value}</b>
              <p>{guardrail.detail}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="panel compact-panel">
        <div className="panel-title">
          <div>
            <span>Saved responses</span>
            <h3>Reusable, but never generic</h3>
          </div>
          <NotebookTabs size={22} aria-hidden="true" />
        </div>
        <div className="response-list">
          {savedResponses.map((response) => (
            <div className="response-row" key={response.prompt}>
              <strong>{response.prompt}</strong>
              <span>{response.status}</span>
              <p>{response.detail}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="panel compact-panel">
        <div className="panel-title">
          <div>
            <span>Interview and follow-up prep</span>
            <h3>Next actions under control</h3>
          </div>
          <CalendarCheck size={22} aria-hidden="true" />
        </div>
        <ul className="action-list">
          {prepItems.map((item) => (
            <li key={item}>
              <Bell size={16} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </article>
    </section>
  )
}
