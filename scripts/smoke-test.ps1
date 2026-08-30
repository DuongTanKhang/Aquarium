[CmdletBinding()]
param(
  [string]$ApiBaseUrl = "http://localhost:4001/api/v1",
  [string]$AdminUrl = "http://localhost:4173/",
  [string]$CustomerUrl = "http://localhost:4174/shop",
  [ValidateRange(1, 120)]
  [int]$TimeoutSeconds = 10
)

$ErrorActionPreference = "Stop"

function Invoke-SmokeRequest {
  param([Parameter(Mandatory = $true)][string]$Uri)

  try {
    return Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec $TimeoutSeconds
  } catch {
    throw "Smoke check failed for $Uri`: $($_.Exception.Message)"
  }
}

$health = Invoke-SmokeRequest -Uri "$($ApiBaseUrl.TrimEnd('/'))/health/ready"
if ($health.StatusCode -ne 200) {
  throw "API readiness returned HTTP $($health.StatusCode)."
}

$healthBody = $health.Content | ConvertFrom-Json
if ($healthBody.status -ne "ready") {
  throw "API readiness returned an unexpected status: $($healthBody.status)"
}

$requestId = [string]$health.Headers["X-Request-Id"]
if ([string]::IsNullOrWhiteSpace($requestId)) {
  throw "API readiness response did not include X-Request-Id."
}

foreach ($surface in @(
  @{ Name = "admin"; Uri = $AdminUrl },
  @{ Name = "customer"; Uri = $CustomerUrl }
)) {
  $response = Invoke-SmokeRequest -Uri $surface.Uri
  if ($response.StatusCode -ne 200) {
    throw "$($surface.Name) host returned HTTP $($response.StatusCode)."
  }
}

Write-Host "Smoke test passed: API ready ($requestId), admin and customer hosts returned HTTP 200."
