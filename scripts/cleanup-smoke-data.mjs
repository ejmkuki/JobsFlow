import { spawnSync } from 'node:child_process'

const databaseName = process.env.JOBSFLOW_D1_DATABASE ?? 'jobsflow-prod'
const resumeBucketName = process.env.JOBSFLOW_RESUME_BUCKET ?? 'jobsflow-resumes'
const shouldConfirm = process.argv.includes('--confirm')
const shouldSkipR2 = process.argv.includes('--skip-r2')
const shouldIncludeNamedSmokeTenants = process.argv.includes('--include-smoke-named-tenants')

const syntheticSmokeEmailWhere = `
  (
    users.email LIKE 'smoke-%@workflowfy.ai'
    OR users.email LIKE 'prod-candidate-%@workflowfy.ai'
    OR users.email LIKE 'prod-employer-%@workflowfy.ai'
  )
`

const smokeTenantNameWhere = `
  (
    tenants.name LIKE 'JobsFlow Smoke %'
    OR tenants.name LIKE 'JobsFlow candidate validation %'
    OR tenants.name LIKE 'JobsFlow employer validation %'
  )
`

const smokeWhere = shouldIncludeNamedSmokeTenants
  ? `
  (
    ${syntheticSmokeEmailWhere}
    OR ${smokeTenantNameWhere}
  )
`
  : syntheticSmokeEmailWhere

const protectedSmokeNamedWhere = `
  ${smokeTenantNameWhere}
  AND NOT EXISTS (
    SELECT 1
    FROM users synthetic_users
    WHERE synthetic_users.tenant_id = tenants.id
      AND (
        synthetic_users.email LIKE 'smoke-%@workflowfy.ai'
        OR synthetic_users.email LIKE 'prod-candidate-%@workflowfy.ai'
        OR synthetic_users.email LIKE 'prod-employer-%@workflowfy.ai'
      )
  )
`

function quotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function runPowerShell(command, { allowFailure = false } = {}) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      [
        `PowerShell command failed with exit code ${result.status ?? 'unknown'}.`,
        result.error?.message,
        result.stdout?.trim(),
        result.stderr?.trim(),
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }

  return {
    ok: result.status === 0,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  }
}

function executeD1(command) {
  const compactCommand = command.replace(/\s+/g, ' ').trim()
  const result = runPowerShell(
    [
      '$ErrorActionPreference = "Stop"',
      `npx wrangler d1 execute ${quotePowerShell(databaseName)} --remote --json --command ${quotePowerShell(compactCommand)}`,
    ].join('\n'),
  )
  const jsonMatch = result.stdout.match(/(\[\s*\{[\s\S]*\}\s*\])\s*$/)
  if (!jsonMatch) {
    throw new Error(`Could not parse D1 JSON output: ${result.stdout}`)
  }

  const parsed = JSON.parse(jsonMatch[1])
  if (!Array.isArray(parsed) || !parsed[0]?.success) {
    throw new Error(`D1 command did not report success: ${result.stdout}`)
  }

  return parsed[0].results ?? []
}

function quoteSql(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

if (!process.env.CLOUDFLARE_API_TOKEN) {
  console.error('Set CLOUDFLARE_API_TOKEN before running smoke cleanup.')
  console.error('The cleanup uses Wrangler against remote D1/R2 and never prints token values.')
  process.exit(1)
}

const tenants = executeD1(
  `
  SELECT
    tenants.id AS tenantId,
    tenants.name AS tenantName,
    tenants.type AS tenantType,
    users.email AS email
  FROM tenants
  INNER JOIN users ON users.tenant_id = tenants.id
  WHERE ${smokeWhere}
  ORDER BY tenants.created_at DESC
  LIMIT 250
  `,
)
const tenantIds = unique(tenants.map((tenant) => tenant.tenantId))
const protectedSmokeNamedTenants = executeD1(
  `
  SELECT
    tenants.id AS tenantId,
    tenants.name AS tenantName,
    tenants.type AS tenantType,
    users.email AS email
  FROM tenants
  INNER JOIN users ON users.tenant_id = tenants.id
  WHERE ${protectedSmokeNamedWhere}
  ORDER BY tenants.created_at DESC
  LIMIT 100
  `,
)

if (!tenantIds.length) {
  console.log('No smoke tenants found. Nothing to clean.')
  if (protectedSmokeNamedTenants.length) {
    console.log('Protected smoke-named tenants with non-synthetic email addresses were found and left untouched:')
    console.table(
      protectedSmokeNamedTenants.map((tenant) => ({
        email: tenant.email,
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        tenantType: tenant.tenantType,
      })),
    )
    console.log('Pass --include-smoke-named-tenants only when you explicitly want to delete those named tenants too.')
  }
  process.exit(0)
}

const tenantListSql = tenantIds.map(quoteSql).join(', ')
const resumeKeys = executeD1(
  `
  SELECT object_key AS objectKey
  FROM resume_artifacts
  WHERE tenant_id IN (${tenantListSql})
  ORDER BY created_at DESC
  LIMIT 500
  `,
).map((row) => row.objectKey)

console.log(`Smoke cleanup candidate tenants: ${tenantIds.length}`)
console.table(
  tenants.slice(0, 25).map((tenant) => ({
    email: tenant.email,
    tenantId: tenant.tenantId,
    tenantName: tenant.tenantName,
    tenantType: tenant.tenantType,
  })),
)
if (tenants.length > 25) {
  console.log(`Showing first 25 of ${tenants.length} matching user rows.`)
}
console.log(`Matching R2 resume objects: ${resumeKeys.length}`)
if (protectedSmokeNamedTenants.length && !shouldIncludeNamedSmokeTenants) {
  console.log('Protected smoke-named tenants with non-synthetic email addresses were found and left untouched:')
  console.table(
    protectedSmokeNamedTenants.map((tenant) => ({
      email: tenant.email,
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      tenantType: tenant.tenantType,
    })),
  )
  console.log('Pass --include-smoke-named-tenants only when you explicitly want to delete those named tenants too.')
}

if (!shouldConfirm) {
  console.log('Dry run only. Re-run with --confirm to delete these smoke tenants and their R2 resume objects.')
  process.exit(0)
}

if (!shouldSkipR2) {
  for (const objectKey of resumeKeys) {
    const objectPath = `${resumeBucketName}/${objectKey}`
    const result = runPowerShell(
      ['$ErrorActionPreference = "Stop"', `npx wrangler r2 object delete ${quotePowerShell(objectPath)} --remote --force`].join('; '),
      { allowFailure: true },
    )
    if (result.ok) {
      console.log(`Deleted R2 object: ${objectKey}`)
    } else {
      console.warn(`Could not delete R2 object ${objectKey}. Continuing with D1 cleanup.`)
      if (result.stderr.trim()) {
        console.warn(result.stderr.trim())
      }
    }
  }
} else {
  console.log('Skipping R2 object deletion because --skip-r2 was provided.')
}

executeD1(
  `
  PRAGMA foreign_keys = ON;
  DELETE FROM tenants
  WHERE id IN (${tenantListSql});
  `,
)

const remaining = executeD1(
  `
  SELECT COUNT(*) AS count
  FROM tenants
  WHERE id IN (${tenantListSql})
  `,
)

console.log(`Deleted smoke tenants: ${tenantIds.length - Number(remaining[0]?.count ?? 0)}`)
console.log('Smoke cleanup complete.')
