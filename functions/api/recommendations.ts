// Candidate-side proactive "roles you'd match on" feed. Keyword-tier only
// (lib/match.ts's free, deterministic tier) — this runs automatically on
// every Home page load across every open job, so it deliberately never
// spends the paid AI tier without the candidate asking for it via Check Fit.

import type { RequestContext } from '../_shared'
import { getSession, json, missingConfig } from '../_shared'
import { keywordMatch, type JobForMatch } from '../lib/match'

const matchThreshold = 70
const maxJobsScanned = 100
const maxRecommendations = 10

type JobRow = {
  id: string
  title: string
  company: string
  location: string
  description: string
  requiredSkills: string
  workplaceType: string
  employmentType: string
  salaryMinCents: number | null
  salaryMaxCents: number | null
  salaryCurrency: string
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return missingConfig('DB')
  }

  const session = await getSession(request, env)
  if (!session) {
    return json({ ok: false, error: 'unauthorized', message: 'Sign in to see recommendations.' }, 401)
  }

  const profile = await env.DB
    .prepare('SELECT resume_text AS resumeText FROM candidate_resume_profiles WHERE tenant_id = ? LIMIT 1')
    .bind(session.tenantId)
    .first<{ resumeText: string }>()
  const resumeText = profile?.resumeText ?? ''

  if (!resumeText.trim()) {
    return json({ ok: true, recommendations: [], reason: 'no_resume' })
  }

  const rows = await env.DB
    .prepare(
      `SELECT j.id, j.title, j.company, j.location, j.description, j.required_skills AS requiredSkills,
              j.workplace_type AS workplaceType, j.employment_type AS employmentType,
              j.salary_min_cents AS salaryMinCents, j.salary_max_cents AS salaryMaxCents,
              j.salary_currency AS salaryCurrency
       FROM jobs j
       WHERE j.status = 'open' AND j.employer_tenant_id != ?
         AND j.id NOT IN (SELECT job_id FROM job_applications WHERE candidate_tenant_id = ?)
       ORDER BY j.created_at DESC
       LIMIT ?`,
    )
    .bind(session.tenantId, session.tenantId, maxJobsScanned)
    .all<JobRow>()

  const recommendations = (rows.results ?? [])
    .map((row) => {
      const jobForMatch: JobForMatch = {
        title: row.title,
        company: row.company,
        description: row.description,
        requiredSkills: JSON.parse(row.requiredSkills || '[]') as string[],
      }
      return { row, match: keywordMatch(resumeText, jobForMatch) }
    })
    .filter(({ match }) => match.score > matchThreshold)
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, maxRecommendations)
    .map(({ row, match }) => ({
      id: row.id,
      title: row.title,
      company: row.company,
      location: row.location,
      workplaceType: row.workplaceType,
      employmentType: row.employmentType,
      salaryMinCents: row.salaryMinCents,
      salaryMaxCents: row.salaryMaxCents,
      salaryCurrency: row.salaryCurrency,
      score: match.score,
    }))

  return json({ ok: true, recommendations })
}
