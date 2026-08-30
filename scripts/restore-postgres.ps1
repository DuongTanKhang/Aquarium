[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"

if (!$ConfirmRestore) {
  throw "Restore replaces database data. Re-run with -ConfirmRestore after verifying the backup path."
}

$backupPath = [System.IO.Path]::GetFullPath($BackupFile)
if (!(Test-Path -LiteralPath $backupPath -PathType Leaf)) {
  throw "Backup file not found: $backupPath"
}

$databaseUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "aquarium" }
$databaseName = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "aquarium_shop" }

Write-Host "Restoring $backupPath into $databaseName..."
Get-Content -LiteralPath $backupPath -AsByteStream |
  & docker compose exec -T postgres pg_restore -U $databaseUser -d $databaseName --clean --if-exists --no-owner

if ($LASTEXITCODE -ne 0) {
  throw "PostgreSQL restore failed with exit code $LASTEXITCODE."
}

Write-Host "Restore complete."
