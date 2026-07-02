param(
  [string]$ProjectName = "workflowfy-jobsflow",
  [string]$DatabaseName = "jobsflow-prod",
  [string]$BucketName = "jobsflow-resumes",
  [string]$CustomDomain = "https://jobsflow.workflowfy.ai"
)

$ErrorActionPreference = "Stop"

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$Command,
    [string]$Label = "command"
  )

  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

function New-Secret {
  $bytes = [byte[]]::new(48)
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  }
  finally {
    $rng.Dispose()
  }
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Get-D1DatabaseId {
  param([string]$Name)

  $raw = npx wrangler d1 list --json
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to list D1 databases."
  }

  $databases = $raw | ConvertFrom-Json
  $database = $databases | Where-Object { $_.name -eq $Name } | Select-Object -First 1
  if (-not $database) {
    return $null
  }

  foreach ($property in @("uuid", "id", "database_id")) {
    if ($database.PSObject.Properties.Name -contains $property) {
      return $database.$property
    }
  }

  return $null
}

function Update-WranglerConfig {
  param(
    [string]$DatabaseId,
    [string]$DatabaseName,
    [string]$BucketName
  )

  $config = @"
{
  "`$schema": "./node_modules/wrangler/config-schema.json",
  "name": "workflowfy-jobsflow",
  "pages_build_output_dir": "./dist",
  "compatibility_date": "2026-07-02",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "$DatabaseName",
      "database_id": "$DatabaseId"
    }
  ],
  "r2_buckets": [
    {
      "binding": "RESUME_BUCKET",
      "bucket_name": "$BucketName"
    }
  ]
}
"@

  Set-Content -LiteralPath "wrangler.jsonc" -Value $config -NoNewline
}

Write-Host "Checking Cloudflare authentication..."
Invoke-Checked -Label "wrangler whoami" -Command { npx wrangler whoami }

Write-Host "Creating or reusing D1 database: $DatabaseName"
$databaseId = Get-D1DatabaseId -Name $DatabaseName
if (-not $databaseId) {
  Invoke-Checked -Label "wrangler d1 create" -Command { npx wrangler d1 create $DatabaseName --location enam }
  $databaseId = Get-D1DatabaseId -Name $DatabaseName
}
if (-not $databaseId) {
  throw "D1 database exists or was created, but its database ID could not be detected."
}

Write-Host "Creating or reusing R2 bucket: $BucketName"
$bucketList = npx wrangler r2 bucket list
if ($LASTEXITCODE -ne 0) {
  throw "Unable to list R2 buckets."
}
if (($bucketList -join "`n") -notmatch [regex]::Escape($BucketName)) {
  Invoke-Checked -Label "wrangler r2 bucket create" -Command { npx wrangler r2 bucket create $BucketName --location enam }
}

Write-Host "Writing Cloudflare bindings to wrangler.jsonc..."
Update-WranglerConfig -DatabaseId $databaseId -DatabaseName $DatabaseName -BucketName $BucketName

Write-Host "Setting production secrets without printing them..."
$sessionSecret = New-Secret
$bootstrapToken = New-Secret
$sessionSecret | npx wrangler pages secret put AUTH_SESSION_SECRET --project-name=$ProjectName
if ($LASTEXITCODE -ne 0) {
  throw "Setting AUTH_SESSION_SECRET failed."
}
$bootstrapToken | npx wrangler pages secret put AUTH_BOOTSTRAP_TOKEN --project-name=$ProjectName
if ($LASTEXITCODE -ne 0) {
  throw "Setting AUTH_BOOTSTRAP_TOKEN failed."
}

Write-Host "Applying D1 migration..."
"y" | npx wrangler d1 migrations apply DB --remote
if ($LASTEXITCODE -ne 0) {
  throw "D1 migration failed."
}

Write-Host "Building and deploying Pages project..."
Invoke-Checked -Label "npm run build" -Command { npm run build }
Invoke-Checked -Label "wrangler pages deploy" -Command { npx wrangler pages deploy dist --project-name=$ProjectName --branch=main }

Write-Host "Validating live API health..."
$health = Invoke-RestMethod -Uri "$CustomDomain/api/health" -TimeoutSec 30
$health | ConvertTo-Json -Depth 5

if (-not $health.bindings.db -or -not $health.bindings.resumeBucket -or -not $health.bindings.sessionSecret -or -not $health.bindings.bootstrapToken -or -not $health.databaseReady) {
  throw "Deployment completed, but one or more backend readiness checks are still false."
}

Write-Host "Cloudflare backend setup complete."
