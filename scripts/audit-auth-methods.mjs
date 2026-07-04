const baseUrl = process.env.JOBSFLOW_BASE_URL ?? 'https://jobsflow.workflowfy.ai'
const explicitFrontendApi = process.env.JOBSFLOW_CLERK_FRONTEND_API?.trim()
const shouldRequireApple = process.argv.includes('--require-apple')

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function readResponse(response, label) {
  const text = await response.text()
  const body = parseJson(text)

  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}: ${body?.errors?.[0]?.message ?? text}`)
  }

  if (!body) {
    throw new Error(`${label} did not return JSON.`)
  }

  return body
}

function decodeClerkPublishableKey(publishableKey) {
  const encoded = publishableKey.replace(/^pk_(test|live)_/, '').replace(/-/g, '+').replace(/_/g, '/')
  const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')
  return Buffer.from(padded, 'base64').toString('utf8').replace(/\$$/, '')
}

async function getLivePublishableKey() {
  const html = await readResponseText(`${baseUrl}/?authAudit=${Date.now()}`, 'JobsFlow HTML')
  const assetPath = html.match(/src="([^"]*index-[^"]+\.js)"/)?.[1]

  if (!assetPath) {
    throw new Error('Could not find the live JobsFlow JavaScript asset.')
  }

  const assetUrl = assetPath.startsWith('/') ? `${baseUrl}${assetPath}` : assetPath
  const bundle = await readResponseText(assetUrl, 'JobsFlow JavaScript bundle')
  const publishableKey = bundle.match(/pk_(test|live)_[A-Za-z0-9_-]+/)?.[0]

  if (!publishableKey) {
    throw new Error('The live JobsFlow bundle does not include a Clerk publishable key.')
  }

  return publishableKey
}

async function readResponseText(url, label) {
  const response = await fetch(url, {
    headers: {
      accept: '*/*',
      'cache-control': 'no-store',
    },
  })

  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}.`)
  }

  return response.text()
}

function includesStrategy(values, strategy) {
  return Array.isArray(values) && values.includes(strategy)
}

function inspectAuthConfig(authConfig) {
  const firstFactors = Array.isArray(authConfig.first_factors) ? authConfig.first_factors : []
  const identificationStrategies = Array.isArray(authConfig.identification_strategies)
    ? authConfig.identification_strategies
    : []

  const emailAddressEnabled = authConfig.email_address === 'on'
  const passwordEnabled = authConfig.password === 'required' || authConfig.password === 'on'
  const emailIdentifierEnabled = includesStrategy(identificationStrategies, 'email_address')
  const emailFirstFactorEnabled =
    includesStrategy(firstFactors, 'password') ||
    includesStrategy(firstFactors, 'email_code') ||
    includesStrategy(firstFactors, 'email_link')
  const appleEnabled = includesStrategy(identificationStrategies, 'oauth_apple') || includesStrategy(firstFactors, 'oauth_apple')
  const googleEnabled = includesStrategy(identificationStrategies, 'oauth_google') || includesStrategy(firstFactors, 'oauth_google')

  return [
    {
      method: 'Email Sign Up',
      ok: emailAddressEnabled && passwordEnabled,
      evidence: `email_address=${authConfig.email_address ?? 'missing'}, password=${authConfig.password ?? 'missing'}`,
    },
    {
      method: 'Email Sign In',
      ok: emailIdentifierEnabled && emailFirstFactorEnabled,
      evidence: `identification_strategies=${identificationStrategies.join(',') || 'none'}, first_factors=${firstFactors.join(',') || 'none'}`,
    },
    {
      method: 'Sign In with Google',
      ok: googleEnabled,
      evidence: googleEnabled ? 'oauth_google is enabled' : 'oauth_google is missing',
    },
    {
      method: 'Sign In with Apple',
      ok: appleEnabled,
      evidence: appleEnabled ? 'oauth_apple is enabled' : 'oauth_apple is not configured in Clerk',
    },
  ]
}

const frontendApi = explicitFrontendApi ?? decodeClerkPublishableKey(await getLivePublishableKey())
const environment = await readResponse(
  await fetch(`https://${frontendApi}/v1/environment`, {
    headers: {
      accept: 'application/json',
      origin: baseUrl,
      referer: `${baseUrl}/`,
    },
  }),
  'Clerk environment',
)

const authConfig = environment.auth_config
if (!authConfig) {
  throw new Error('Clerk environment did not include auth_config.')
}

const results = inspectAuthConfig(authConfig)
console.log(`JobsFlow auth method audit for ${baseUrl}`)
console.log(`Clerk Frontend API: ${frontendApi}`)
console.table(
  results.map((result) => ({
    evidence: result.evidence,
    method: result.method,
    status: result.ok ? 'ready' : 'missing',
  })),
)

const requiredMethods = shouldRequireApple ? results : results.filter((result) => result.method !== 'Sign In with Apple')
const missingRequiredMethods = requiredMethods.filter((result) => !result.ok)

if (missingRequiredMethods.length) {
  console.error(`Missing required auth method(s): ${missingRequiredMethods.map((result) => result.method).join(', ')}`)
  process.exit(1)
}

const apple = results.find((result) => result.method === 'Sign In with Apple')
if (apple && !apple.ok) {
  console.log('Apple is not configured yet. Enable Apple in Clerk SSO connections after creating Apple Developer credentials.')
}
