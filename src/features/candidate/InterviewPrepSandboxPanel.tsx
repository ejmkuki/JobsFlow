import type { BackendSession, InterviewPrepState, InterviewQuestion, InterviewStage } from '../../backendClient'
import { createInterviewPrepSession, evaluateInterviewPracticeAnswer, getInterviewPrepState, humanizeJobsFlowError } from '../../backendClient'
import { EvidenceList, StatusPill } from '../../components/ui'
import { applicationPacket } from '../../data/candidate'
import { friendlyUserMessage } from '../../lib/format'
import { CalendarCheck, MessageSquareText, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

const interviewStageOptions: Array<{ key: InterviewStage; label: string }> = [
  { key: 'recruiter_screen', label: 'Recruiter screen' },
  { key: 'hiring_manager', label: 'Hiring manager' },
  { key: 'panel', label: 'Panel' },
  { key: 'case_study', label: 'Case study' },
  { key: 'final_round', label: 'Final round' },
]

export const defaultInterviewAnswer = [
  'Situation: I inherited a launch intake process that created duplicated product operations handoffs across implementation, customer success, and vendor teams.',
  'Action: I rebuilt the operating rhythm around weekly risk review, executive customer updates, and a shared readiness dashboard.',
  'Result: The handoff timeline dropped 28%, launch owners had clearer escalation rules, and quality reviews became repeatable across 18 active projects.',
  'Lesson: I now start by aligning the decision log, success metrics, and escalation owners before automating any part of the workflow.',
].join(' ')

export function findQuestionForAnswer(state: InterviewPrepState | null, questionKey: string): InterviewQuestion | null {
  for (const questionSet of state?.questionSets ?? []) {
    const question = questionSet.questions.find((item) => item.key === questionKey)
    if (question) {
      return question
    }
  }

  return null
}

export function InterviewPrepSandboxPanel({ session }: { session: BackendSession | null }) {
  const [interviewState, setInterviewState] = useState<InterviewPrepState | null>(null)
  const [stage, setStage] = useState<InterviewStage>('hiring_manager')
  const [answerText, setAnswerText] = useState(defaultInterviewAnswer)
  const [selectedQuestionKey, setSelectedQuestionKey] = useState('role-fit')
  const [message, setMessage] = useState('Start a workspace, then JobsFlow can generate targeted interview practice.')
  const [isBusy, setIsBusy] = useState(false)
  const latestSession = interviewState?.sessions[0] ?? null
  const activeQuestionSet = latestSession
    ? interviewState?.questionSets.find((questionSet) => questionSet.sessionId === latestSession.id) ?? null
    : null
  const questions = activeQuestionSet?.questions ?? []
  const selectedQuestion = questions.find((question) => question.key === selectedQuestionKey) ?? questions[0] ?? null
  const latestAnswer = interviewState?.answers[0] ?? null
  const latestAnswerQuestion = latestAnswer ? findQuestionForAnswer(interviewState, latestAnswer.questionKey) : null

  const refreshInterviewPrep = useCallback(async () => {
    if (!session) {
      setInterviewState(null)
      setMessage('Start a candidate workspace first, then JobsFlow can load interview practice.')
      return
    }

    setIsBusy(true)
    try {
      const result = await getInterviewPrepState()
      setInterviewState(result.state)
      const firstQuestion = result.state.questionSets[0]?.questions[0]
      if (firstQuestion) {
        setSelectedQuestionKey(firstQuestion.key)
      }
      setMessage(
        result.state.summary.activeSessions
          ? `${result.state.summary.activeSessions} active prep session${result.state.summary.activeSessions === 1 ? '' : 's'} ready.`
          : 'No interview prep session yet. Generate one for the target role.',
      )
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'interview-prep'))
    } finally {
      setIsBusy(false)
    }
  }, [session])

  async function createKoraPrepSession() {
    if (!session) {
      setMessage('Start a candidate workspace before generating interview prep.')
      return
    }

    setIsBusy(true)
    setMessage('Generating stage-aware interview questions and a scoring rubric...')
    try {
      const result = await createInterviewPrepSession({
        company: applicationPacket.company,
        evidence: [
          'Reduced launch handoff time by 28%',
          'Built product operations dashboards for 18 active projects',
          'Owned vendor governance and executive customer updates',
        ],
        requiredSkills: ['Product operations', 'Healthcare SaaS', 'Vendor governance', 'Executive communication'],
        stage,
        targetRole: applicationPacket.role,
      })
      setInterviewState(result.state)
      const firstQuestion = result.state.questionSets.find((questionSet) => questionSet.sessionId === result.sessionId)?.questions[0]
      if (firstQuestion) {
        setSelectedQuestionKey(firstQuestion.key)
      }
      setMessage('Interview prep session created. Questions and rubric are workspace-protected and saved to history.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'interview-prep'))
    } finally {
      setIsBusy(false)
    }
  }

  async function evaluatePracticeAnswer() {
    if (!latestSession || !selectedQuestion) {
      setMessage('Create an interview prep session first, then choose a question to evaluate.')
      return
    }

    setIsBusy(true)
    setMessage('Evaluating answer specificity, proof, structure, and risk handling...')
    try {
      const result = await evaluateInterviewPracticeAnswer({
        answerText,
        questionKey: selectedQuestion.key,
        sessionId: latestSession.id,
      })
      setInterviewState(result.state)
      setMessage('Practice answer scored. JobsFlow saved strengths, risks, and next rehearsal moves.')
    } catch (error) {
      setMessage(humanizeJobsFlowError(error, 'interview-prep'))
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    void refreshInterviewPrep()
  }, [refreshInterviewPrep])

  return (
    <article className="panel interview-prep-panel wide-panel">
      <div className="panel-title">
        <div>
          <span>Native AI Interview Prep Sandbox</span>
          <h3>Questions, answers, and role-specific scoring</h3>
        </div>
        <StatusPill tone={latestAnswer ? (latestAnswer.overallScore >= 75 ? 'green' : 'amber') : latestSession ? 'blue' : 'amber'}>
          {latestAnswer ? `${latestAnswer.overallScore}% latest answer` : latestSession ? 'Session ready' : 'No session yet'}
        </StatusPill>
      </div>
      <div className="interview-prep-controls">
        <label>
          <span>Stage</span>
          <select onChange={(event) => setStage(event.target.value as InterviewStage)} value={stage}>
            {interviewStageOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="kernel-actions">
          <button disabled={isBusy || !session} onClick={createKoraPrepSession} type="button">
            <CalendarCheck size={16} aria-hidden="true" />
            Generate prep
          </button>
          <button disabled={isBusy || !session} onClick={refreshInterviewPrep} type="button">
            <RefreshCw size={16} aria-hidden="true" />
            Refresh sandbox
          </button>
        </div>
      </div>
      <p className="runtime-message">{friendlyUserMessage(message)}</p>
      <div className="interview-prep-grid">
        <div className="interview-question-list">
          <strong>Question set</strong>
          {questions.length ? (
            questions.map((question) => (
              <button
                className={selectedQuestion?.key === question.key ? 'interview-question active' : 'interview-question'}
                key={question.key}
                onClick={() => setSelectedQuestionKey(question.key)}
                type="button"
              >
                <span>{question.category.replaceAll('_', ' ')}</span>
                <strong>{question.prompt}</strong>
                <small>{question.signal}</small>
              </button>
            ))
          ) : (
            <div className="kernel-empty">Generate prep to create a question set.</div>
          )}
        </div>
        <div className="interview-answer-box">
          <strong>{selectedQuestion?.prompt ?? 'Practice answer'}</strong>
          <textarea onChange={(event) => setAnswerText(event.target.value)} rows={9} value={answerText} />
          <button disabled={isBusy || !latestSession || !selectedQuestion} onClick={evaluatePracticeAnswer} type="button">
            <MessageSquareText size={16} aria-hidden="true" />
            {isBusy ? 'Scoring...' : 'Evaluate answer'}
          </button>
        </div>
      </div>
      {latestAnswer ? (
        <div className="interview-evaluation-grid">
          <div className="interview-score-card">
            <strong>{latestAnswer.overallScore}%</strong>
            <span>{latestAnswerQuestion?.prompt ?? latestAnswer.questionKey}</span>
          </div>
          <div>
            <strong>Strengths</strong>
            <EvidenceList items={latestAnswer.strengths} />
          </div>
          <div>
            <strong>Risks</strong>
            <EvidenceList items={latestAnswer.risks.length ? latestAnswer.risks : ['No major answer risk detected']} />
          </div>
          <div>
            <strong>Next rehearsal</strong>
            <EvidenceList items={latestAnswer.recommendations} />
          </div>
        </div>
      ) : null}
    </article>
  )
}
