PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS interview_prep_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_role TEXT NOT NULL,
  company TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('recruiter_screen', 'hiring_manager', 'panel', 'case_study', 'final_round')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  context_json TEXT NOT NULL DEFAULT '{}',
  scorecard_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS interview_question_sets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES interview_prep_sessions(id) ON DELETE CASCADE,
  generator_version TEXT NOT NULL,
  questions_json TEXT NOT NULL DEFAULT '[]',
  rubric_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS interview_practice_answers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES interview_prep_sessions(id) ON DELETE CASCADE,
  question_key TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  overall_score INTEGER NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  rubric_scores_json TEXT NOT NULL DEFAULT '[]',
  strengths_json TEXT NOT NULL DEFAULT '[]',
  risks_json TEXT NOT NULL DEFAULT '[]',
  recommendations_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_tenant_created
  ON interview_prep_sessions(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_tenant_status
  ON interview_prep_sessions(tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_interview_questions_session
  ON interview_question_sets(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interview_answers_session
  ON interview_practice_answers(session_id, created_at DESC);
