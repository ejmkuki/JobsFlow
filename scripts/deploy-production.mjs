import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const baseUrl = process.env.JOBSFLOW_BASE_URL ?? 'https://jobsflow.workflowfy.ai'
const branch = process.env.JOBSFLOW_PAGES_BRANCH ?? 'main'
const projectName = process.env.JOBSFLOW_PAGES_PROJECT ?? 'workflowfy-jobsflow'
const publishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY?.trim() ?? ''
const allowSsoDisabledDeploy = process.env.JOBSFLOW_ALLOW_SSO_DISABLED_DEPLOY === '1'

function run(command, args, label) {
  const commandLine = [command, ...args].join(' ')
  const result = spawnSync(process.platform === 'win32' ? commandLine : command, process.platform === 'win32' ? [] : args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    if (result.error) {
      throw result.error
    }
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}.`)
  }
}

async function getLiveSsoProviderState() {
  const response = await fetch(`${baseUrl}/api/health?deployGuard=${Date.now()}`, {
    headers: {
      accept: 'application/json',
      'cache-control': 'no-store',
    },
  })

  if (!response.ok) {
    throw new Error(`Live health check failed with HTTP ${response.status}.`)
  }

  const body = await response.json()
  return Boolean(body.features?.ssoProvider)
}

function verifyClerkPublishableKey() {
  if (!publishableKey) {
    return
  }

  if (!/^pk_(test|live)_[A-Za-z0-9_-]+$/.test(publishableKey)) {
    throw new Error('VITE_CLERK_PUBLISHABLE_KEY must be a Clerk publishable key that starts with pk_test_ or pk_live_.')
  }
}

function verifyBuiltBundleIncludesClerkKey() {
  if (!publishableKey) {
    return
  }

  const assetsDir = join(process.cwd(), 'dist', 'assets')
  const jsAssets = readdirSync(assetsDir).filter((file) => file.endsWith('.js'))
  const keyFound = jsAssets.some((file) => readFileSync(join(assetsDir, file), 'utf8').includes(publishableKey))

  if (!keyFound) {
    throw new Error('The production bundle does not include VITE_CLERK_PUBLISHABLE_KEY. Refusing to deploy locked SSO UI.')
  }
}

verifyClerkPublishableKey()

if (!publishableKey && !allowSsoDisabledDeploy) {
  const liveSsoProviderEnabled = await getLiveSsoProviderState()
  if (liveSsoProviderEnabled) {
    console.error('Refusing to deploy without VITE_CLERK_PUBLISHABLE_KEY because production backend SSO is configured.')
    console.error('Set VITE_CLERK_PUBLISHABLE_KEY for the build, or set JOBSFLOW_ALLOW_SSO_DISABLED_DEPLOY=1 for an intentional private-beta-only deploy.')
    process.exit(1)
  }
}

run('npm', ['run', 'build'], 'npm run build')
verifyBuiltBundleIncludesClerkKey()
run(
  'npx',
  ['wrangler', 'pages', 'deploy', 'dist', `--project-name=${projectName}`, `--branch=${branch}`, '--commit-dirty=true'],
  'wrangler pages deploy',
)
