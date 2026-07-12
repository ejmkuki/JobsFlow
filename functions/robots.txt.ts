const appUrl = 'https://jobsflowai.ai'

export async function onRequestGet() {
  const body = [
    'User-agent: *',
    'Allow: /',
    'Allow: /jobs/',
    'Disallow: /candidate/',
    'Disallow: /employer/',
    'Disallow: /trust/',
    'Disallow: /api/',
    `Sitemap: ${appUrl}/sitemap.xml`,
    '',
  ].join('\n')

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  })
}
