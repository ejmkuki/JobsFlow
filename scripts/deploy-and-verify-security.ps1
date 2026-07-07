<#
.SYNOPSIS
  Deploy JobsFlow to Cloudflare Pages and verify the Phase 0 auth fix in
  production (forged Cloudflare Access header must be rejected with 403).

.DESCRIPTION
  Steps:
    1. Load CLOUDFLARE_API_TOKEN from .cloudflare.local.ps1 (if present).
    2. Apply remote D1 migrations (includes 0014 rate_limit; required or the
       rate-limited endpoints error).
    3. Optionally set/rotate Cloudflare Pages secrets (-SetSecrets).
    4. Build + deploy via npm run cf:deploy.
    5. Verify /api/health.
    6. Attack check: POST /api/session with a forged
       cf-access-authenticated-user-email header and assert HTTP 403.

.EXAMPLE
  # First deploy (private beta, no Clerk SSO), set the two required secrets:
  ./scripts/deploy-and-verify-security.ps1 -SetSecrets -AllowSsoDisabled

.EXAMPLE
  # Redeploy without touching secrets, verify against the primary domain:
  ./scripts/deploy-and-verify-security.ps1 -BaseUrl "https://www.jobsflowai.ai" -AllowSsoDisabled

.NOTES
  Requires PowerShell 7+ (uses -SkipHttpErrorCheck). Run from the repo root.

  IMPORTANT: Cloudflare Pages binds environment variables and secrets to a
  deployment at deploy time. Changing a secret with `wrangler pages secret put`
  does NOT affect the already-live deployment — you must redeploy (run this
  script, or `npm run cf:deploy`) for the new value to take effect.
#>
[CmdletBinding()]
param(
  [string]$BaseUrl = "https://www.jobsflowai.ai",
  [string]$ProjectName = "workflowfy-jobsflow",
  [string]$D1Database = "jobsflow-prod",
  [switch]$SetSecrets,
  [switch]$AllowSsoDisabled,
  [switch]$SkipMigrations,
  [string]$ClerkPublishableKey
)

$ErrorActionPreference = "Stop"
$env:NODE_OPTIONS = "--use-system-ca"   # Windows: trust the system CA chain for Cloudflare

function Set-PagesSecret {
  param([string]$Name, [securestring]$Value)
  $plain = [System.Net.NetworkCredential]::new("", $Value).Password
  if ([string]::IsNullOrWhiteSpace($plain)) { Write-Host "  (skipped $Name — empty)"; return }
  $plain | npx wrangler pages secret put $Name --project-name=$ProjectName
  if ($LASTEXITCODE -ne 0) { throw "Failed to set secret $Name" }
}

# 1. Cloudflare API token ----------------------------------------------------
$localAuth = Join-Path $PSScriptRoot "..\.cloudflare.local.ps1"
if (Test-Path $localAuth) { . $localAuth }
if (-not $env:CLOUDFLARE_API_TOKEN) {
  throw "CLOUDFLARE_API_TOKEN is not set. Put it in .cloudflare.local.ps1 or the environment."
}
Write-Host "==> Cloudflare API token loaded." -ForegroundColor Cyan

# 2. Remote D1 migrations ----------------------------------------------------
if (-not $SkipMigrations) {
  Write-Host "==> Applying remote D1 migrations ($D1Database)..." -ForegroundColor Cyan
  npx wrangler d1 migrations apply $D1Database --remote
  if ($LASTEXITCODE -ne 0) { throw "D1 migration apply failed." }
}

# 3. Secrets (opt-in) --------------------------------------------------------
if ($SetSecrets) {
  Write-Host "==> Setting Cloudflare Pages secrets for $ProjectName" -ForegroundColor Cyan

  # AUTH_SESSION_SECRET: generate a strong value (rotating it invalidates
  # existing sessions). Not printed.
  $genBytes = [byte[]]::new(48)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($genBytes)
  $sessionSecret = ([Convert]::ToBase64String($genBytes)) | ConvertTo-SecureString -AsPlainText -Force
  Set-PagesSecret -Name "AUTH_SESSION_SECRET" -Value $sessionSecret
  Write-Host "  AUTH_SESSION_SECRET set (generated, not displayed)."

  # AUTH_BOOTSTRAP_TOKEN: you choose it (needed for smoke tests / first admin).
  $bootstrap = Read-Host "  Enter AUTH_BOOTSTRAP_TOKEN (private beta invite code)" -AsSecureString
  Set-PagesSecret -Name "AUTH_BOOTSTRAP_TOKEN" -Value $bootstrap

  # Optional: Cloudflare Access. Leave blank to skip.
  $accessTeam = Read-Host "  CF_ACCESS_TEAM_DOMAIN (optional, e.g. https://team.cloudflareaccess.com)" -AsSecureString
  Set-PagesSecret -Name "CF_ACCESS_TEAM_DOMAIN" -Value $accessTeam
  $accessAud = Read-Host "  CF_ACCESS_AUD (optional, Access application AUD tag)" -AsSecureString
  Set-PagesSecret -Name "CF_ACCESS_AUD" -Value $accessAud

  # Optional: Resend transactional email.
  $resend = Read-Host "  RESEND_API_KEY (optional)" -AsSecureString
  Set-PagesSecret -Name "RESEND_API_KEY" -Value $resend
}

# 4. Deploy ------------------------------------------------------------------
Write-Host "==> Deploying to Cloudflare Pages..." -ForegroundColor Cyan
if ($ClerkPublishableKey) { $env:VITE_CLERK_PUBLISHABLE_KEY = $ClerkPublishableKey }
if ($AllowSsoDisabled)     { $env:JOBSFLOW_ALLOW_SSO_DISABLED_DEPLOY = "1" }
npm run cf:deploy
if ($LASTEXITCODE -ne 0) { throw "Deploy failed." }

# 5. Health ------------------------------------------------------------------
Write-Host "==> Health check: $BaseUrl/api/health" -ForegroundColor Cyan
$health = Invoke-RestMethod -Uri "$BaseUrl/api/health?ts=$(Get-Date -UFormat %s)" -Headers @{ "cache-control" = "no-store" }
Write-Host ("  db={0} resumeBucket={1} sessionSecret={2} bootstrapToken={3} ssoProvider={4}" -f `
  $health.bindings.db, $health.bindings.resumeBucket, $health.bindings.sessionSecret, `
  $health.bindings.bootstrapToken, $health.features.ssoProvider)
if (-not $health.bindings.sessionSecret) { throw "AUTH_SESSION_SECRET is not configured in production." }

# 6. Forged-header attack check (Phase 0 DoD) --------------------------------
Write-Host "==> Security check: forged Cloudflare Access header must be rejected..." -ForegroundColor Cyan
$attack = Invoke-WebRequest -Uri "$BaseUrl/api/session" -Method POST -SkipHttpErrorCheck `
  -Headers @{ "cf-access-authenticated-user-email" = "victim@example.com"; "content-type" = "application/json" } `
  -Body "{}"
if ($attack.StatusCode -eq 403) {
  Write-Host "  PASS: forged Access header returned 403." -ForegroundColor Green
} else {
  throw "SECURITY FAIL: forged Access header returned HTTP $($attack.StatusCode), expected 403."
}

$cookie = $attack.Headers["set-cookie"]
if ($cookie) { throw "SECURITY FAIL: forged request received a session cookie." }

Write-Host "==> Deploy verified. Phase 0 auth fix confirmed in production." -ForegroundColor Green
