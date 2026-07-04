const baseUrl = process.env.JOBSFLOW_BASE_URL ?? 'https://jobsflow.workflowfy.ai'
const bootstrapToken = process.env.JOBSFLOW_BOOTSTRAP_TOKEN

const smokeRunId = `core-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

async function readResponse(response, label) {
  const text = await response.text()
  const body = parseJson(text)

  if (!response.ok) {
    throw new Error(`${label} failed: ${response.status} ${body.error ?? body.message ?? text}`)
  }

  return body
}

function getSessionCookie(response) {
  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) {
    throw new Error('Session response did not include a set-cookie header.')
  }

  return setCookie.split(';')[0]
}

async function createSession(accountType) {
  const role = accountType === 'employer' ? 'recruiter' : 'candidate'
  const email = `smoke-${smokeRunId}-${accountType}@workflowfy.ai`
  const response = await fetch(`${baseUrl}/api/session`, {
    body: JSON.stringify({
      accountType,
      displayName: `JobsFlow ${accountType} smoke`,
      email,
      role,
      tenantName: `JobsFlow Smoke ${smokeRunId} ${accountType}`,
    }),
    headers: {
      'content-type': 'application/json',
      'x-jobsflow-bootstrap-token': bootstrapToken,
    },
    method: 'POST',
  })

  const body = await readResponse(response, `${accountType} session`)
  return {
    cookie: getSessionCookie(response),
    email: body.session.email,
    tenantId: body.session.tenantId,
  }
}

async function getJson(path, cookie, label) {
  return readResponse(
    await fetch(`${baseUrl}${path}`, {
      headers: { cookie },
    }),
    label,
  )
}

async function postJson(path, cookie, payload, label) {
  return readResponse(
    await fetch(`${baseUrl}${path}`, {
      body: JSON.stringify(payload),
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      method: 'POST',
    }),
    label,
  )
}

async function uploadSmokeResume(cookie) {
  const pdfBytes = new TextEncoder().encode(
    `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>
endobj
trailer
<< /Root 1 0 R >>
%%EOF
`,
  )
  const formData = new FormData()
  formData.set('resume', new Blob([pdfBytes], { type: 'application/pdf' }), `jobsflow-smoke-${smokeRunId}.pdf`)
  return readResponse(
    await fetch(`${baseUrl}/api/resumes`, {
      body: formData,
      headers: { cookie },
      method: 'POST',
    }),
    'resume upload',
  )
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function summarize(result, detail) {
  return {
    detail,
    ok: true,
    result,
  }
}

if (!bootstrapToken) {
  console.error('Set JOBSFLOW_BOOTSTRAP_TOKEN before running the core production smoke test.')
  console.error('The token is sent as a private header and is never printed by this script.')
  process.exit(1)
}

console.log(`Testing JobsFlow core production flow at ${baseUrl}`)
console.log(`Smoke run marker: ${smokeRunId}`)

const candidate = await createSession('candidate')
const employer = await createSession('employer')
const results = []

const health = await readResponse(await fetch(`${baseUrl}/api/health`), 'health')
const requiredFeatures = [
  'achievementProfiles',
  'atsSync',
  'antiGhostingPipeline',
  'interviewPrep',
  'jobSyndication',
  'passiveSourcing',
  'packetReviewEngine',
  'prescreening',
  'resumeIntelligence',
  'skillMatching',
  'transparencyBlueprint',
  'workflowKernel',
]
for (const feature of requiredFeatures) {
  assert(Boolean(health.features?.[feature]), `Feature is not ready in production health: ${feature}`)
}
results.push(summarize('health', `${requiredFeatures.length} core features ready`))

const upload = await uploadSmokeResume(candidate.cookie)
assert(upload.resume?.id, 'Resume upload did not return an artifact id.')
const resumes = await getJson('/api/resumes', candidate.cookie, 'resume list')
assert(resumes.resumes.length >= 1, 'Uploaded resume is not visible in tenant metadata.')
results.push(summarize('resume storage', `${resumes.resumes.length} tenant artifact(s)`))

const workflow = await postJson('/api/workflows', candidate.cookie, { action: 'bootstrap_core' }, 'workflow kernel')
assert(workflow.state.summary.activeDefinitions >= 10, 'Workflow kernel did not seed core definitions.')
results.push(summarize('workflow kernel', `${workflow.state.summary.activeDefinitions} definitions`))

const packetReview = await postJson(
  '/api/packet-review',
  candidate.cookie,
  {
    company: 'Kora Health',
    duplicateFound: false,
    evidence: [
      'Scaled intake workflow across 4 healthcare SaaS implementation teams',
      'Owned vendor governance process for product operations handoffs',
      'Reduced launch handoff time by 28% with a repeatable operating rhythm',
      'Managed executive stakeholder communication during cross-functional rollout',
    ],
    jobDescription:
      'Product Operations Manager role focused on healthcare SaaS delivery, vendor governance, claims operations, and cross-functional launch quality.',
    requiredSkills: ['Product operations', 'Healthcare SaaS', 'Vendor governance', 'Claims operations'],
    salaryFloorCents: 11500000,
    salaryRange: {
      currency: 'USD',
      maxCents: 13800000,
      minCents: 11800000,
    },
    sensitiveAnswers: [
      {
        approved: false,
        key: 'workday-sponsorship',
        label: 'Workday sponsorship answer',
        value: 'No current sponsorship requirement',
      },
    ],
    targetRole: 'Product Operations Manager',
  },
  'packet review',
)
assert(packetReview.packet.externalActionBlocked, 'Packet review must keep external action blocked.')
results.push(summarize('packet review', `${packetReview.packet.readinessScore}% ready`))

const resumeIntel = await postJson(
  '/api/resume-intelligence',
  candidate.cookie,
  {
    company: 'Kora Health',
    jobDescription:
      'Product Operations Manager role requiring product operations, healthcare SaaS, vendor governance, claims operations, analytics, and executive communication.',
    requiredSkills: ['Product operations', 'Healthcare SaaS', 'Vendor governance', 'Claims operations', 'Product analytics'],
    resumeText:
      'Reduced launch handoff time by 28%. Owned vendor governance. Built dashboards across 18 projects. Managed executive communication.',
    salaryRange: { currency: 'USD', maxCents: 14200000, minCents: 11800000 },
    targetRole: 'Product Operations Manager',
  },
  'resume intelligence',
)
assert(typeof resumeIntel.analysis.readinessScore === 'number', 'Resume intelligence did not return a score.')
results.push(summarize('resume tailwind', `${resumeIntel.analysis.readinessScore}% ready`))

const pipeline = await postJson(
  '/api/pipeline',
  candidate.cookie,
  {
    action: 'create_item',
    company: 'Kora Health',
    notes: `Smoke run ${smokeRunId}`,
    roleTitle: 'Product Operations Manager',
    salaryRange: { maxCents: 14200000, minCents: 11800000 },
    source: 'core_production_smoke',
    state: 'applied',
  },
  'anti-ghosting pipeline',
)
assert(pipeline.state.summary.activeApplications >= 1, 'Pipeline did not create an active application.')
results.push(summarize('anti-ghosting pipeline', `${pipeline.state.summary.activeApplications} active`))

const interview = await postJson(
  '/api/interview-prep',
  candidate.cookie,
  {
    action: 'create_session',
    company: 'Kora Health',
    evidence: ['Reduced launch handoff time by 28%', 'Built dashboards across 18 active projects'],
    requiredSkills: ['Product operations', 'Healthcare SaaS', 'Executive communication'],
    stage: 'hiring_manager',
    targetRole: 'Product Operations Manager',
  },
  'interview prep session',
)
const firstQuestion = interview.state.questionSets.find((set) => set.sessionId === interview.sessionId)?.questions[0]
assert(firstQuestion?.key, 'Interview prep did not generate a question.')
const interviewEval = await postJson(
  '/api/interview-prep',
  candidate.cookie,
  {
    action: 'evaluate_answer',
    answerText:
      'Situation: I inherited a fragmented launch workflow. Action: I aligned product operations, vendor governance, dashboards, and executive updates. Result: handoff time dropped 28% across 18 active projects. Lesson: I define decision owners and measurable launch quality before automation.',
    questionKey: firstQuestion.key,
    sessionId: interview.sessionId,
  },
  'interview answer evaluation',
)
assert(typeof interviewEval.state.summary.latestScore === 'number', 'Interview prep did not score the answer.')
results.push(summarize('interview prep', `${interviewEval.state.summary.latestScore}% latest score`))

const transparency = await postJson(
  '/api/transparency',
  candidate.cookie,
  {
    action: 'create_report',
    cultureSignals: [
      { evidence: ['Interview plan shared before scheduling'], label: 'Process clarity', sentiment: 'positive', verificationCount: 5 },
      { evidence: ['Delivery load can spike near launches'], label: 'Workload boundaries', sentiment: 'mixed', verificationCount: 2 },
    ],
    location: 'United States remote/hybrid',
    salaryRange: { currency: 'USD', maxCents: 14200000, minCents: 11800000 },
    targetCompany: 'Kora Health',
    targetRole: 'Product Operations Manager',
  },
  'transparency blueprint',
)
assert(transparency.state.summary.reports >= 1, 'Transparency report was not created.')
results.push(summarize('transparency blueprint', `${transparency.state.summary.reports} report(s)`))

const passive = await postJson(
  '/api/passive-sourcing',
  candidate.cookie,
  {
    achievements: ['Reduced launch handoff time by 28%', 'Built dashboards across 18 active projects'],
    action: 'create_card',
    headline: 'Anonymous product operations leader open to vetted healthcare SaaS roles',
    skills: ['Product operations', 'Healthcare SaaS', 'Vendor governance'],
    targetRoles: ['Product Operations Manager'],
  },
  'passive sourcing card',
)
await postJson('/api/passive-sourcing', candidate.cookie, { action: 'broadcast_card', cardId: passive.cardId }, 'passive sourcing broadcast')
const passiveRelease = await postJson(
  '/api/passive-sourcing',
  candidate.cookie,
  { action: 'request_contact_release', cardId: passive.cardId },
  'passive contact release',
)
assert(passiveRelease.state.summary.pendingReleaseRequests >= 1, 'Passive sourcing contact release request was not recorded.')
results.push(summarize('passive sourcing', `${passiveRelease.state.summary.pendingReleaseRequests} release request(s)`))

const achievement = await postJson(
  '/api/achievement-profiles',
  candidate.cookie,
  {
    action: 'create_profile',
    candidateAlias: `Candidate ${smokeRunId}`,
    resumeText:
      'Reduced launch handoff time by 28%. Built dashboards across 18 active projects. Led vendor governance reviews. Certified Scrum Product Owner credential under review.',
    sourceLabel: 'Core production smoke resume evidence',
  },
  'achievement profiles',
)
assert(achievement.state.summary.profiles >= 1, 'Achievement profile was not created.')
results.push(summarize('achievement profiles', `${achievement.state.summary.profiles} profile(s)`))

const skill = await postJson(
  '/api/skill-matching',
  employer.cookie,
  {
    action: 'run_match',
    adjacentSkills: ['Implementation operations', 'Healthtech', 'Workflow governance'],
    achievements: ['Reduced launch handoff time by 28%', 'Built dashboards across 18 active projects'],
    candidateAlias: `Candidate ${smokeRunId}`,
    candidateSkills: ['Product operations', 'Healthcare technology', 'Vendor governance', 'Operational reporting'],
    company: 'Kora Health',
    requiredSkills: ['Product operations', 'Healthcare SaaS', 'Vendor governance', 'Claims operations'],
    roleTitle: 'Product Operations Manager',
  },
  'semantic skill matching',
)
assert(typeof skill.state.summary.latestMatchScore === 'number', 'Semantic match did not return a score.')
results.push(summarize('semantic matching', `${skill.state.summary.latestMatchScore}% match`))

const syndication = await postJson(
  '/api/job-syndication',
  employer.cookie,
  {
    action: 'validate_and_queue',
    company: 'Kora Health',
    description:
      'Own product operations workflows for healthcare SaaS delivery, vendor governance, launch readiness, claims operations collaboration, executive communication, and cross-functional operating rhythm improvements. This role requires evidence-first communication, product analytics, measurable implementation quality ownership, and clear partnership with product, implementation, and customer success teams.',
    employmentType: 'full_time',
    location: 'United States remote/hybrid',
    roleTitle: 'Product Operations Manager',
    salaryRange: { currency: 'USD', maxCents: 14200000, minCents: 11800000 },
  },
  'job syndication',
)
assert(syndication.state.summary.queuedDeliveries >= 3, 'Job syndication did not queue expected delivery records.')
results.push(summarize('job syndication', `${syndication.state.summary.queuedDeliveries} queued deliveries`))

const prescreening = await postJson(
  '/api/prescreening',
  employer.cookie,
  {
    action: 'run_prescreen',
    baselineSkills: ['Product operations', 'Healthcare SaaS', 'Vendor governance'],
    candidateAlias: `Candidate ${smokeRunId}`,
    candidateSkills: ['Product operations', 'Healthcare SaaS', 'Operational reporting'],
    company: 'Kora Health',
    roleTitle: 'Product Operations Manager',
    timelineDays: 21,
    visaStatus: 'authorized',
  },
  'prescreening',
)
assert(typeof prescreening.state.summary.latestScore === 'number', 'Pre-screening did not return a score.')
results.push(summarize('prescreening', `${prescreening.state.summary.latestScore}% score`))

const atsSeed = await postJson('/api/ats-sync', employer.cookie, { action: 'seed_connections' }, 'ats seed')
const atsDryRun = await postJson('/api/ats-sync', employer.cookie, { action: 'run_dry_sync', provider: 'greenhouse' }, 'ats dry sync')
assert(atsSeed.state.summary.providers >= 3, 'ATS sync did not seed provider boundaries.')
assert(atsDryRun.state.runs[0]?.status === 'blocked', 'ATS dry sync should be blocked while OAuth is disconnected.')
results.push(summarize('ats sync', `${atsSeed.state.summary.providers} providers, latest run ${atsDryRun.state.runs[0].status}`))

const candidateAudit = await getJson('/api/audit', candidate.cookie, 'candidate audit')
const employerAudit = await getJson('/api/audit', employer.cookie, 'employer audit')
assert(candidateAudit.events.length >= 5, 'Candidate audit trail did not record smoke events.')
assert(employerAudit.events.length >= 4, 'Employer audit trail did not record smoke events.')
results.push(summarize('audit', `candidate=${candidateAudit.events.length}, employer=${employerAudit.events.length}`))

console.table(results)
console.log(`Candidate tenant: ${candidate.tenantId}`)
console.log(`Employer tenant: ${employer.tenantId}`)
console.log(`Candidate email: ${candidate.email}`)
console.log(`Employer email: ${employer.email}`)
console.log(`Smoke cleanup marker: smoke-${smokeRunId}`)
console.log('All core production smoke tests passed.')
