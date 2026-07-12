import type { RequestContext } from '../_shared'

const appUrl = 'https://jobsflowai.ai'

const htmlEscapes: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => htmlEscapes[character] ?? character)
}

function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

const employmentTypeSchema: Record<string, string> = {
  full_time: 'FULL_TIME',
  part_time: 'PART_TIME',
  contract: 'CONTRACTOR',
  internship: 'INTERN',
}

type PublicJobRow = {
  id: string
  slug: string
  title: string
  company: string
  location: string
  employmentType: string
  workplaceType: string
  description: string
  requiredSkills: string
  salaryMinCents: number | null
  salaryMaxCents: number | null
  salaryCurrency: string
  createdAt: string
}

function notFoundPage() {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Role not found | JobsFlow AI</title><meta name="robots" content="noindex"></head><body><p>That role is no longer listed. <a href="${appUrl}/candidate/jobs">Browse open roles on JobsFlow AI</a>.</p></body></html>`,
    { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return notFoundPage()
  }

  // Read the slug from the URL path rather than Cloudflare's injected
  // params — keeps this handler testable with a plain constructed Request
  // (see tests/helpers/worker.ts's callHandler) without needing the test
  // harness to simulate Pages' dynamic-route param extraction.
  const slug = decodeURIComponent(new URL(request.url).pathname.replace(/^\/jobs\//, '').replace(/\/$/, ''))
  if (!slug) {
    return notFoundPage()
  }

  const job = await env.DB
    .prepare(
      `SELECT id, slug, title, company, location, employment_type AS employmentType, workplace_type AS workplaceType,
              description, required_skills AS requiredSkills, salary_min_cents AS salaryMinCents,
              salary_max_cents AS salaryMaxCents, salary_currency AS salaryCurrency, created_at AS createdAt
       FROM jobs WHERE slug = ? AND status = 'open' LIMIT 1`,
    )
    .bind(slug)
    .first<PublicJobRow>()

  if (!job) {
    return notFoundPage()
  }

  const skills = JSON.parse(job.requiredSkills || '[]') as string[]
  const pageUrl = `${appUrl}/jobs/${job.slug}`
  const description = job.description || `${job.title} at ${job.company}. Apply on JobsFlow AI.`
  const shortDescription = description.slice(0, 200).replace(/\s+/g, ' ').trim()

  const jobPosting: Record<string, unknown> = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title,
    description: description || job.title,
    datePosted: job.createdAt.replace(' ', 'T') + 'Z',
    employmentType: employmentTypeSchema[job.employmentType] ?? 'FULL_TIME',
    hiringOrganization: { '@type': 'Organization', name: job.company },
    identifier: { '@type': 'PropertyValue', name: 'JobsFlow AI', value: job.id },
    directApply: false,
  }
  if (job.workplaceType === 'remote') {
    jobPosting.jobLocationType = 'TELECOMMUTE'
    jobPosting.applicantLocationRequirements = { '@type': 'Country', name: 'US' }
  } else {
    jobPosting.jobLocation = {
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressLocality: job.location },
    }
  }
  if (job.salaryMinCents != null || job.salaryMaxCents != null) {
    jobPosting.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: job.salaryCurrency,
      value: {
        '@type': 'QuantitativeValue',
        minValue: job.salaryMinCents != null ? job.salaryMinCents / 100 : undefined,
        maxValue: job.salaryMaxCents != null ? job.salaryMaxCents / 100 : undefined,
        unitText: 'YEAR',
      },
    }
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(job.title)} at ${escapeHtml(job.company)} | JobsFlow AI</title>
<meta name="description" content="${escapeHtml(shortDescription)}">
<link rel="canonical" href="${pageUrl}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="JobsFlow AI">
<meta property="og:title" content="${escapeHtml(job.title)} at ${escapeHtml(job.company)}">
<meta property="og:description" content="${escapeHtml(shortDescription)}">
<meta property="og:url" content="${pageUrl}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(job.title)} at ${escapeHtml(job.company)}">
<meta name="twitter:description" content="${escapeHtml(shortDescription)}">
<script type="application/ld+json">${jsonLd(jobPosting)}</script>
<style>
body{font-family:system-ui,-apple-system,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#172033;line-height:1.6}
.meta{color:#6a7887;font-size:14px}
.skills span{display:inline-block;background:#f1f5f9;border-radius:999px;padding:3px 12px;margin:3px 6px 0 0;font-size:13px}
.cta{display:inline-block;margin-top:24px;background:#0284c7;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600}
</style>
</head>
<body>
<p class="meta"><a href="${appUrl}/candidate/jobs">JobsFlow AI</a> · open roles</p>
<h1>${escapeHtml(job.title)}</h1>
<p class="meta">${escapeHtml(job.company)} · ${escapeHtml(job.location)} · ${escapeHtml(job.workplaceType)}</p>
${skills.length ? `<div class="skills">${skills.map((skill) => `<span>${escapeHtml(skill)}</span>`).join('')}</div>` : ''}
<div>${escapeHtml(description).split('\n').map((line) => `<p>${line}</p>`).join('')}</div>
<a class="cta" href="${appUrl}/candidate/jobs?job=${encodeURIComponent(job.id)}">Apply on JobsFlow AI</a>
</body>
</html>`

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  })
}
