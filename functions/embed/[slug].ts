import type { RequestContext } from '../_shared'

const appUrl = 'https://jobsflowai.ai'

const htmlEscapes: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => htmlEscapes[character] ?? character)
}

type PublicJobRow = {
  id: string
  slug: string
  title: string
  company: string
  location: string
  workplaceType: string
  requiredSkills: string
}

function frame(body: string, status = 200) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:16px;color:#172033;background:#fff}
.card{border:1px solid #e2e8f0;border-radius:12px;padding:16px}
h1{font-size:16px;margin:0 0 4px}
.meta{color:#6a7887;font-size:13px;margin:0 0 10px}
.skills span{display:inline-block;background:#f1f5f9;border-radius:999px;padding:2px 10px;margin:0 6px 6px 0;font-size:12px}
.cta{display:inline-block;margin-top:8px;background:#0284c7;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-weight:600;font-size:13px}
.brand{color:#6a7887;font-size:11px;margin-top:10px}
.brand a{color:inherit}
</style></head><body>${body}</body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } },
  )
}

export async function onRequestGet({ request, env }: RequestContext) {
  if (!env.DB) {
    return frame('<p>Unable to load this role.</p>', 404)
  }

  const slug = decodeURIComponent(new URL(request.url).pathname.replace(/^\/embed\//, '').replace(/\/$/, ''))
  if (!slug) {
    return frame('<p>Unable to load this role.</p>', 404)
  }

  const job = await env.DB
    .prepare(
      `SELECT id, slug, title, company, location, workplace_type AS workplaceType, required_skills AS requiredSkills
       FROM jobs WHERE slug = ? AND status = 'open' LIMIT 1`,
    )
    .bind(slug)
    .first<PublicJobRow>()

  if (!job) {
    return frame('<div class="card"><p>This role is no longer accepting applications.</p></div>', 404)
  }

  await env.DB.prepare('UPDATE jobs SET view_count = view_count + 1 WHERE id = ?').bind(job.id).run()

  const skills = JSON.parse(job.requiredSkills || '[]') as string[]
  const applyUrl = `${appUrl}/jobs/${job.slug}`

  const body = `<div class="card">
<h1>${escapeHtml(job.title)}</h1>
<p class="meta">${escapeHtml(job.company)} · ${escapeHtml(job.location)} · ${escapeHtml(job.workplaceType)}</p>
${skills.length ? `<div class="skills">${skills.map((skill) => `<span>${escapeHtml(skill)}</span>`).join('')}</div>` : ''}
<a class="cta" href="${applyUrl}" target="_top" rel="noopener">Apply now</a>
<p class="brand">Powered by <a href="${appUrl}" target="_top" rel="noopener">JobsFlow AI</a></p>
</div>`

  return frame(body)
}
