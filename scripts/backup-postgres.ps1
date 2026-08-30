[CmdletBinding()]
param(
  [string]$OutputDirectory = ".\backups",
  [ValidateRange(1, 365)]
  [int]$KeepLatest = 14
)

$ErrorActionPreference = "Stop"

$outputPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputDirectory))
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$databaseUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "aquarium" }
$databaseName = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "aquarium_shop" }
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $outputPath "aquarium-shop-$stamp.dump"

Write-Host "Creating PostgreSQL backup at $backupPath"
& docker compose exec -T postgres pg_dump -U $databaseUser -d $databaseName -Fc |
  Set-Content -LiteralPath $backupPath -AsByteStream
$dockerExitCode = $LASTEXITCODE

if ($dockerExitCode -ne 0 -or !(Test-Path -LiteralPath $backupPath) -or (Get-Item -LiteralPath $backupPath).Length -lt 1) {
  Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
  throw "The PostgreSQL backup failed (docker exit code $dockerExitCode) or was empty."
}

Get-ChildItem -LiteralPath $outputPath -Filter "aquarium-shop-*.dump" -File |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $KeepLatest |
  Remove-Item -Force

Write-Host "Backup complete: $backupPath"
