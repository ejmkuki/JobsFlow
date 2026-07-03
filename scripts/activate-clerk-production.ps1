param(
  [string]$PublishableKey = "",
  [string]$Issuer = "",
  [string]$JwksUrl = "",
  [string]$SecretKey = "",
  [SecureString]$SecretKeySecure,
  [string]$AuthorizedParties = "https://jobsflow.workflowfy.ai",
  [string]$ProjectName = "workflowfy-jobsflow",
  [string]$CustomDomain = "https://jobsflow.workflowfy.ai",
  [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"

function Assert-Value {
  param(
    [string]$Name,
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "$Name is required."
  }
}

function Read-RequiredValue {
  param(
    [string]$Name,
    [string]$Prompt,
    [string]$ExistingValue
  )

  if (-not [string]::IsNullOrWhiteSpace($ExistingValue)) {
    return $ExistingValue
  }

  $value = Read-Host $Prompt
  Assert-Value -Name $Name -Value $value
  return $value
}

function Convert-SecureStringToPlainText {
  param([SecureString]$Value)

  if (-not $Value) {
    return ""
  }

  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Read-SecretValue {
  param(
    [string]$ExistingValue,
    [SecureString]$ExistingSecureValue
  )

  if (-not [string]::IsNullOrWhiteSpace($ExistingValue)) {
    Write-Host "Using CLERK_SECRET_KEY from command input. Prefer the secure prompt next time to avoid terminal history exposure." -ForegroundColor Yellow
    return $ExistingValue
  }

  if ($ExistingSecureValue) {
    $secureValue = $ExistingSecureValue
  }
  else {
    $secureValue = Read-Host "CLERK_SECRET_KEY, starts sk_live_" -AsSecureString
  }

  $value = Convert-SecureStringToPlainText -Value $secureValue
  Assert-Value -Name "CLERK_SECRET_KEY" -Value $value
  return $value
}

function Assert-HttpsUrl {
  param(
    [string]$Name,
    [string]$Value
  )

  $uri = $null
  if (-not [System.Uri]::TryCreate($Value, [System.UriKind]::Absolute, [ref]$uri)) {
    throw "$Name must be an absolute URL."
  }

  if ($uri.Scheme -ne "https") {
    throw "$Name must use https for production."
  }
}

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

function Set-PagesSecret {
  param(
    [string]$Name,
    [string]$Value
  )

  Assert-Value -Name $Name -Value $Value
  Write-Host "Setting Cloudflare Pages secret: $Name"
  $Value | npx wrangler pages secret put $Name --project-name=$ProjectName
  if ($LASTEXITCODE -ne 0) {
    throw "Setting $Name failed."
  }
}

function Test-ClerkBackendKey {
  param([string]$Key)

  Write-Host "Validating Clerk backend key without printing it..."
  $response = Invoke-WebRequest `
    -Uri "https://api.clerk.com/v1/users?limit=1" `
    -Headers @{ Authorization = "Bearer $Key" } `
    -Method Get `
    -TimeoutSec 30 `
    -SkipHttpErrorCheck

  if ($response.StatusCode -lt 200 -or $response.StatusCode -gt 299) {
    throw "Clerk backend key validation failed with HTTP $($response.StatusCode)."
  }
}

function Test-ClerkJwks {
  param([string]$Url)

  Write-Host "Validating Clerk JWKS URL..."
  $jwks = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 30
  if (-not $jwks.keys -or $jwks.keys.Count -lt 1) {
    throw "JWKS URL responded, but no signing keys were found."
  }
}

function Get-LiveHealth {
  param([string]$BaseUrl)

  $separator = if ($BaseUrl.Contains("?")) { "&" } else { "?" }
  return Invoke-RestMethod -Uri "$BaseUrl/api/health${separator}activation=$(Get-Date -UFormat %s)" -TimeoutSec 30
}

$PublishableKey = Read-RequiredValue `
  -Name "VITE_CLERK_PUBLISHABLE_KEY" `
  -Prompt "VITE_CLERK_PUBLISHABLE_KEY, starts pk_live_" `
  -ExistingValue $PublishableKey

$Issuer = Read-RequiredValue `
  -Name "CLERK_ISSUER" `
  -Prompt "CLERK_ISSUER, use Clerk Frontend API URL" `
  -ExistingValue $Issuer

$SecretKey = Read-SecretValue -ExistingValue $SecretKey -ExistingSecureValue $SecretKeySecure

Assert-Value -Name "VITE_CLERK_PUBLISHABLE_KEY" -Value $PublishableKey
Assert-Value -Name "CLERK_ISSUER" -Value $Issuer
Assert-Value -Name "CLERK_SECRET_KEY" -Value $SecretKey
Assert-Value -Name "CLERK_AUTHORIZED_PARTIES" -Value $AuthorizedParties

if ($PublishableKey -notmatch "^pk_(test|live)_") {
  throw "VITE_CLERK_PUBLISHABLE_KEY should start with pk_test_ or pk_live_."
}

if ($SecretKey -notmatch "^sk_(test|live)_") {
  throw "CLERK_SECRET_KEY should start with sk_test_ or sk_live_."
}

$normalizedIssuer = $Issuer.TrimEnd("/")
if ([string]::IsNullOrWhiteSpace($JwksUrl)) {
  $JwksUrl = "$normalizedIssuer/.well-known/jwks.json"
}

Assert-HttpsUrl -Name "CLERK_ISSUER" -Value $normalizedIssuer
Assert-HttpsUrl -Name "CLERK_JWKS_URL" -Value $JwksUrl
Assert-HttpsUrl -Name "CustomDomain" -Value $CustomDomain

foreach ($party in $AuthorizedParties.Split(",")) {
  Assert-HttpsUrl -Name "CLERK_AUTHORIZED_PARTIES entry" -Value $party.Trim()
}

Test-ClerkJwks -Url $JwksUrl
Test-ClerkBackendKey -Key $SecretKey

Set-PagesSecret -Name "CLERK_ISSUER" -Value $normalizedIssuer
Set-PagesSecret -Name "CLERK_JWKS_URL" -Value $JwksUrl
Set-PagesSecret -Name "CLERK_SECRET_KEY" -Value $SecretKey
Set-PagesSecret -Name "CLERK_AUTHORIZED_PARTIES" -Value $AuthorizedParties

if ($SkipDeploy) {
  Write-Host "Clerk backend secrets are installed. Skipped frontend rebuild/deploy by request."
  Write-Host "Run npm run cf:deploy with VITE_CLERK_PUBLISHABLE_KEY set before expecting the SSO UI to activate."
  exit 0
}

Write-Host "Building JobsFlow with the Clerk publishable key..."
$previousPublishableKey = $env:VITE_CLERK_PUBLISHABLE_KEY
try {
  $env:VITE_CLERK_PUBLISHABLE_KEY = $PublishableKey
  Invoke-Checked -Label "npm run build" -Command { npm run build }
  Invoke-Checked -Label "wrangler pages deploy" -Command {
    npx wrangler pages deploy dist --project-name=$ProjectName --branch=main --commit-dirty=true
  }
}
finally {
  $env:VITE_CLERK_PUBLISHABLE_KEY = $previousPublishableKey
}

Write-Host "Checking live JobsFlow health for SSO readiness..."
$lastHealth = $null
for ($attempt = 1; $attempt -le 8; $attempt += 1) {
  Start-Sleep -Seconds 5
  $lastHealth = Get-LiveHealth -BaseUrl $CustomDomain
  if ($lastHealth.features.ssoProvider -eq $true) {
    $lastHealth | ConvertTo-Json -Depth 5
    Write-Host "Clerk SSO activation complete."
    exit 0
  }
  Write-Host "SSO health flag is not true yet; retry $attempt/8..."
}

$lastHealth | ConvertTo-Json -Depth 5
throw "Deployment finished, but live health did not report features.ssoProvider=true."
