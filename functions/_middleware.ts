import type { RequestContext } from './_shared'

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self' https://clerk.workflowfy.ai",
  "img-src 'self' data: https://img.clerk.com https://images.clerk.dev",
  "script-src 'self' https://clerk.workflowfy.ai https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://clerk.workflowfy.ai https://api.clerk.com https://*.clerk.com https://*.clerk.services",
  "frame-src https://clerk.workflowfy.ai https://challenges.cloudflare.com",
].join('; ')

export async function onRequest({ next }: RequestContext & { next: () => Promise<Response> }) {
  const response = await next()
  const headers = new Headers(response.headers)
  headers.set('Content-Security-Policy', contentSecurityPolicy)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
  headers.set('X-Frame-Options', 'DENY')

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}
