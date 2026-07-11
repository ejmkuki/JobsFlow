// Pre-apply resume quality signal, independent of any single job. Runs
// entirely client-side against the profile's own resume text (no server
// round-trip needed — nothing here depends on other tenants' data or must
// be authoritative/stored). Deterministic, not AI-scored: every check is a
// plain, explainable rule so the candidate always knows exactly why a box
// is checked or not, matching the same "honest, no black-box scores"
// promise the per-job match summary makes.

export type ResumeHealthCheck = {
  id: string
  label: string
  detail: string
  done: boolean
}

export type ResumeHealthResult = {
  checks: ResumeHealthCheck[]
  done: number
  total: number
}

const SECTION_HEADERS = ['experience', 'education', 'skills', 'summary', 'projects', 'certification']
const METRIC_PATTERN = /\d+(\.\d+)?\s*%|\$\s?\d[\d,]*|\b\d+\+?\s*(years?|yrs?)\b|\b\d{1,3}(,\d{3})+\b/gi
const CONTACT_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+|linkedin\.com\/in\/|github\.com\//i

export function evaluateResumeHealth(resumeText: string): ResumeHealthResult {
  const text = resumeText.trim()
  const lower = text.toLowerCase()

  const sectionsFound = SECTION_HEADERS.filter((header) => lower.includes(header)).length
  const metricCount = (text.match(METRIC_PATTERN) ?? []).length

  const checks: ResumeHealthCheck[] = [
    {
      id: 'length',
      label: 'Enough detail to score well',
      detail: text.length >= 600 ? `${text.length.toLocaleString()} characters` : 'Add more about your experience — most solid resumes run 1,500+ characters',
      done: text.length >= 600,
    },
    {
      id: 'sections',
      label: 'Clear sections (experience, education, skills)',
      detail: sectionsFound >= 2 ? `${sectionsFound} of ${SECTION_HEADERS.length} common sections found` : 'Add headings like "Experience" and "Skills" so matching can parse your background',
      done: sectionsFound >= 2,
    },
    {
      id: 'metrics',
      label: 'Quantified impact',
      detail: metricCount >= 2 ? `${metricCount} numbers/metrics found` : 'Add specifics — "$2M pipeline", "40% faster", "5 years" — numbers make a resume verifiable',
      done: metricCount >= 2,
    },
    {
      id: 'contact',
      label: 'Contact or professional link',
      detail: CONTACT_PATTERN.test(text) ? 'Found' : 'Add an email address or LinkedIn/GitHub link so employers can follow up',
      done: CONTACT_PATTERN.test(text),
    },
  ]

  return {
    checks,
    done: checks.filter((check) => check.done).length,
    total: checks.length,
  }
}
