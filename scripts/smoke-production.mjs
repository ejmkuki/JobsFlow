const baseUrl = process.env.JOBSFLOW_BASE_URL ?? 'https://jobsflow.workflowfy.ai'
const bootstrapToken = process.env.JOBSFLOW_BOOTSTRAP_TOKEN

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

async function readResponse(response) {
  const text = await response.text()
  const body = parseJson(text)

  if (!response.ok) {
    throw new Error(body.message ?? body.error ?? `Request failed with ${response.status}`)
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

async function getJson(path, cookie) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      cookie,
    },
  })

  return readResponse(response)
}

if (!bootstrapToken) {
  console.error('Set JOBSFLOW_BOOTSTRAP_TOKEN in this terminal before running the production smoke test.')
  console.error('The token is sent as a private header and is never printed by this script.')
  process.exit(1)
}

const runId = Date.now()

console.log(`Testing JobsFlow production flow at ${baseUrl}`)

const sessionResponse = await fetch(`${baseUrl}/api/session`, {
  body: JSON.stringify({
    accountType: 'candidate',
    displayName: 'JobsFlow Smoke Test',
    email: `smoke-${runId}@workflowfy.ai`,
    role: 'candidate',
    tenantName: 'JobsFlow Smoke Test Workspace',
  }),
  headers: {
    'content-type': 'application/json',
    'x-jobsflow-bootstrap-token': bootstrapToken,
  },
  method: 'POST',
})

const session = await readResponse(sessionResponse)
const cookie = getSessionCookie(sessionResponse)
console.log(`Session created for ${session.session.email}`)

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
formData.set(
  'resume',
  new Blob([pdfBytes], { type: 'application/pdf' }),
  `jobsflow-smoke-${runId}.pdf`,
)

const uploadResponse = await fetch(`${baseUrl}/api/resumes`, {
  body: formData,
  headers: {
    cookie,
  },
  method: 'POST',
})

const upload = await readResponse(uploadResponse)
console.log(`Resume uploaded: ${upload.resume.filename}`)

const resumes = await getJson('/api/resumes', cookie)
console.log(`Resume metadata rows visible to tenant: ${resumes.resumes.length}`)

const packetReviewResponse = await fetch(`${baseUrl}/api/packet-review`, {
  body: JSON.stringify({
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
    requiredSkills: [
      'Product operations',
      'Healthcare SaaS',
      'Vendor governance',
      'Claims operations',
    ],
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
  }),
  headers: {
    'content-type': 'application/json',
    cookie,
  },
  method: 'POST',
})

const packetReview = await readResponse(packetReviewResponse)
console.log(
  `Packet reviewed: ${packetReview.packet.readinessScore}% ready, ${packetReview.packet.requiredReviews.length} review gates, external action blocked=${packetReview.packet.externalActionBlocked}`,
)

const audit = await getJson('/api/audit', cookie)
console.log(`Audit events visible to tenant: ${audit.events.length}`)

console.log('Production session, R2 upload, packet review, D1 metadata, and audit flow passed.')
