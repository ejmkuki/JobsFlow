import type { BackendSession } from '../../backendClient'
import { CommandCenter, EvidenceList, MetricTile, SectionHeader, StatusPill } from '../../components/ui'
import { candidateShortlist, collaborationNotes, employerCommandCenter, employerCompany, employerEvidenceReviews, employerMarketPlays, employerMetrics, employerPipeline, employerPriorities, fairnessChecks, interviewCoordination, outreachTasks, scorecardCriteria } from '../../data/employer'
import { AtsSynchronizersPanel } from './AtsSynchronizersPanel'
import { EmployerJobsPanel } from './EmployerJobsPanel'
import { JobSyndicationPanel } from './JobSyndicationPanel'
import { PrescreeningAgentsPanel } from './PrescreeningAgentsPanel'
import { SemanticSkillMatchingPanel } from './SemanticSkillMatchingPanel'
import { BriefcaseBusiness, CalendarCheck, ClipboardCheck, Gauge, Handshake, MailCheck, MessageSquareText, Scale, UsersRound } from 'lucide-react'

export function EmployerWorkspace({ session }: { session: BackendSession | null }) {
  return (
    <section className="workspace-grid employer-workspace">
      <div className="workspace-lead">
        <SectionHeader
          copy="Role clarity, transparent evidence, and consistent decisions turn candidate volume into hiring signal."
          eyebrow="Employer workspace"
          title="See why candidates fit before outreach"
        />
        <div className="lead-actions">
          <button type="button">
            <ClipboardCheck size={18} aria-hidden="true" />
            Lock scorecard
          </button>
          <button type="button">
            <MailCheck size={18} aria-hidden="true" />
            Review outreach
          </button>
        </div>
      </div>

      <CommandCenter items={employerCommandCenter} />

      <div className="metrics-row">
        {employerMetrics.map((metric) => (
          <MetricTile key={metric.label} metric={metric} />
        ))}
      </div>

      <EmployerJobsPanel session={session} />

      <article className="panel role-panel">
        <div className="panel-title">
          <div>
            <span>Role intake</span>
            <h3>{employerCompany.role}</h3>
          </div>
          <StatusPill tone="blue">{employerCompany.team}</StatusPill>
        </div>
        <p>{employerCompany.criteria}</p>
        <div className="priority-grid">
          {employerPriorities.map((priority) => (
            <span key={priority}>{priority}</span>
          ))}
        </div>
        <p className="muted-line">{employerCompany.fairness}</p>
      </article>

      <article className="panel scorecard-panel">
        <div className="panel-title">
          <div>
            <span>Hiring criteria builder</span>
            <h3>Scorecard before ranking</h3>
          </div>
          <ClipboardCheck size={22} aria-hidden="true" />
        </div>
        <div className="scorecard-list">
          {scorecardCriteria.map((item) => (
            <div className="scorecard-row" key={item.criterion}>
              <div>
                <strong>{item.criterion}</strong>
                <span>{item.weight}</span>
              </div>
              <p>{item.evidence}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="panel shortlist-panel wide-panel">
        <div className="panel-title">
          <div>
            <span>AI-ranked shortlist</span>
            <h3>Fit evidence before the summary</h3>
          </div>
          <StatusPill tone="green">24 qualified</StatusPill>
        </div>
        <div className="candidate-table">
          {candidateShortlist.map((candidate) => (
            <div className="candidate-row" key={candidate.name}>
              <div>
                <strong>{candidate.name}</strong>
                <span>{candidate.stage}</span>
              </div>
              <div>
                <b>{candidate.fit}% fit</b>
                <span>Evidence score</span>
              </div>
              <div>
                <EvidenceList items={candidate.evidence} />
                <p className="risk-note">{candidate.risks.join(', ')}</p>
              </div>
            </div>
          ))}
        </div>
      </article>

      <SemanticSkillMatchingPanel session={session} />

      <JobSyndicationPanel session={session} />

      <PrescreeningAgentsPanel session={session} />

      <AtsSynchronizersPanel session={session} />

      <article className="panel evidence-review-panel wide-panel">
        <div className="panel-title">
          <div>
            <span>Shortlist decision review</span>
            <h3>Scorecard evidence before outreach</h3>
          </div>
          <StatusPill tone="blue">Review before contact</StatusPill>
        </div>
        <div className="employer-review-grid">
          {employerEvidenceReviews.map((review) => (
            <div className="review-card" key={review.candidate}>
              <div className="review-card-header">
                <div>
                  <strong>{review.candidate}</strong>
                  <span>{review.owner}</span>
                </div>
                <StatusPill tone={review.tone}>{review.recommendation}</StatusPill>
              </div>
              <div className="review-score">
                <b>{review.score}</b>
                <span>Evidence score</span>
              </div>
              <div className="rubric-grid">
                {review.rubric.map(([criterion, level]) => (
                  <div className="rubric-row" key={`${review.candidate}-${criterion}`}>
                    <span>{criterion}</span>
                    <strong>{level}</strong>
                  </div>
                ))}
              </div>
              <div className="review-columns">
                <div>
                  <h4>Evidence</h4>
                  <EvidenceList items={review.evidence} />
                </div>
                <div>
                  <h4>Risks</h4>
                  <ul className="plain-list">
                    {review.risks.map((risk) => (
                      <li key={risk}>{risk}</li>
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
            <span>Market-inspired employer tools</span>
            <h3>Source, invite, and build trust without hiding judgment</h3>
          </div>
          <Handshake size={22} aria-hidden="true" />
        </div>
        <div className="market-grid">
          {employerMarketPlays.map((play) => (
            <div className="market-row" key={play.pattern}>
              <span>{play.pattern}</span>
              <strong>{play.jobsFlowMove}</strong>
              <p>{play.detail}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="panel pipeline-panel">
        <div className="panel-title">
          <div>
            <span>Pipeline stages</span>
            <h3>Where the hiring motion stands</h3>
          </div>
          <BriefcaseBusiness size={22} aria-hidden="true" />
        </div>
        <div className="pipeline-bars">
          {employerPipeline.map(([stage, count]) => (
            <div className="pipeline-bar" key={stage}>
              <span>{stage}</span>
              <strong>{count}</strong>
            </div>
          ))}
        </div>
      </article>

      <article className="panel outreach-panel">
        <div className="panel-title">
          <div>
            <span>Outreach queue</span>
            <h3>Personalize before contact</h3>
          </div>
          <MessageSquareText size={22} aria-hidden="true" />
        </div>
        <div className="task-list">
          {outreachTasks.map((task) => (
            <div className="task-row" key={task.candidate}>
              <strong>{task.candidate}</strong>
              <p>{task.action}</p>
              <span>{task.owner}</span>
            </div>
          ))}
        </div>
      </article>

      <article className="panel analytics-panel">
        <div className="panel-title">
          <div>
            <span>Hiring analytics</span>
            <h3>Quality and consistency, not noise</h3>
          </div>
          <Gauge size={22} aria-hidden="true" />
        </div>
        <div className="analytics-grid">
          <div>
            <strong>42%</strong>
            <span>Inbound noise reduced</span>
          </div>
          <div>
            <strong>3.1d</strong>
            <span>Median outreach time</span>
          </div>
          <div>
            <strong>81%</strong>
            <span>Scorecard completion</span>
          </div>
        </div>
      </article>

      <article className="panel interview-panel">
        <div className="panel-title">
          <div>
            <span>Interview coordination</span>
            <h3>Panels, owners, and blockers</h3>
          </div>
          <CalendarCheck size={22} aria-hidden="true" />
        </div>
        <div className="task-list">
          {interviewCoordination.map((item) => (
            <div className="task-row" key={`${item.candidate}-${item.panel}`}>
              <strong>{item.candidate}</strong>
              <p>{item.panel}</p>
              <span>{item.status}</span>
            </div>
          ))}
        </div>
      </article>

      <article className="panel collaboration-panel">
        <div className="panel-title">
          <div>
            <span>Team collaboration</span>
            <h3>Decision notes without hidden judgment</h3>
          </div>
          <UsersRound size={22} aria-hidden="true" />
        </div>
        <div className="task-list">
          {collaborationNotes.map((item) => (
            <div className="task-row" key={item.owner}>
              <strong>{item.owner}</strong>
              <p>{item.note}</p>
              <span>Placeholder workflow</span>
            </div>
          ))}
        </div>
      </article>

      <article className="panel fairness-panel">
        <div className="panel-title">
          <div>
            <span>Fairness checklist</span>
            <h3>Make shortcuts accountable</h3>
          </div>
          <Scale size={22} aria-hidden="true" />
        </div>
        <div className="check-list">
          {fairnessChecks.map(([check, complete]) => (
            <label key={check}>
              <input checked={Boolean(complete)} readOnly type="checkbox" />
              {check}
            </label>
          ))}
        </div>
      </article>
    </section>
  )
}
