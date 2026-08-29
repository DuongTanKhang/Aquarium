param(
  [int]$Port = 55432,
  [string]$Database = "aquarium_shop"
)

$ErrorActionPreference = "Stop"
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "..\..\work"))
$dataDir = Join-Path $workspaceRoot "pg-aquarium-local"

$pgBin = Get-ChildItem -LiteralPath "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending |
  ForEach-Object { Join-Path $_.FullName "bin" } |
  Where-Object { Test-Path (Join-Path $_ "initdb.exe") } |
  Select-Object -First 1

if (-not $pgBin) {
  throw "PostgreSQL was not found. Install PostgreSQL or start Docker Desktop and run docker compose up -d postgres."
}

$initdb = Join-Path $pgBin "initdb.exe"
$postgres = Join-Path $pgBin "postgres.exe"
$pgIsReady = Join-Path $pgBin "pg_isready.exe"
$psql = Join-Path $pgBin "psql.exe"
$createdb = Join-Path $pgBin "createdb.exe"

if (-not (Test-Path (Join-Path $dataDir "PG_VERSION"))) {
  New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
  & $initdb -D $dataDir -U postgres -A trust --encoding=UTF8 --no-locale | Out-Host
}

& $pgIsReady -h 127.0.0.1 -p $Port -U postgres *> $null
$pgProcess = $null
if ($LASTEXITCODE -ne 0) {
  $pgProcess = Start-Process -FilePath $postgres -ArgumentList @(
    "-D", $dataDir,
    "-p", $Port,
    "-h", "127.0.0.1"
  ) -WindowStyle Hidden -PassThru

  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 500
    & $pgIsReady -h 127.0.0.1 -p $Port -U postgres *> $null
    if ($LASTEXITCODE -eq 0) { break }
  }
}

& $pgIsReady -h 127.0.0.1 -p $Port -U postgres *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Local PostgreSQL could not start on port $Port."
}

$exists = ([string]((& $psql -h 127.0.0.1 -p $Port -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$Database'") -join "")).Trim()
if ($exists -ne "1") {
  & $createdb -h 127.0.0.1 -p $Port -U postgres $Database
}

$env:DATABASE_URL = "postgresql://postgres@127.0.0.1:${Port}/${Database}?schema=public"
$env:PORT = "4000"
$env:CORS_ORIGIN = "http://localhost:3000,http://127.0.0.1:4173,http://localhost:4173"

try {
  npm.cmd run db:deploy
  if ($LASTEXITCODE -ne 0) { throw "Database migration failed." }
  $apiListener = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue
  if ($apiListener) {
    Write-Output "API is already running on port 4000; migrations are complete."
    return
  }
  npm.cmd run start:dev
} finally {
  if ($pgProcess -and -not $pgProcess.HasExited) {
    Stop-Process -Id $pgProcess.Id -Force
  }
}
