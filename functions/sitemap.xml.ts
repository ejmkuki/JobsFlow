import type { RequestContext } from './_shared'

const appUrl = 'https://jobsflowai.ai'
const maxUrls = 5000

function xmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (character) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] ?? character,
  )
}

export async function onRequestGet({ env }: RequestContext) {
  const staticUrls = [
    { loc: `${appUrl}/`, changefreq: 'daily' },
    { loc: `${appUrl}/candidate/jobs`, changefreq: 'hourly' },
  ]

  const jobUrls: Array<{ loc: string; lastmod: string; changefreq: string }> = []
  if (env.DB) {
    const rows = await env.DB
      .prepare(`SELECT slug, updated_at AS updatedAt FROM jobs WHERE status = 'open' AND slug IS NOT NULL ORDER BY updated_at DESC LIMIT ?`)
      .bind(maxUrls - staticUrls.length)
      .all<{ slug: string; updatedAt: string }>()
    for (const row of rows.results ?? []) {
      jobUrls.push({ loc: `${appUrl}/jobs/${row.slug}`, lastmod: row.updatedAt.replace(' ', 'T') + 'Z', changefreq: 'daily' })
    }
  }

  const entries = [
    ...staticUrls.map((url) => `<url><loc>${xmlEscape(url.loc)}</loc><changefreq>${url.changefreq}</changefreq></url>`),
    ...jobUrls.map((url) => `<url><loc>${xmlEscape(url.loc)}</loc><lastmod>${url.lastmod}</lastmod><changefreq>${url.changefreq}</changefreq></url>`),
  ].join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=1800',
    },
  })
}
