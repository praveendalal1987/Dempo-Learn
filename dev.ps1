# dev.ps1 - start Dempo locally (API + web) against the shared .env
#
# Usage:  right-click -> "Run with PowerShell", or in a terminal:
#           powershell -ExecutionPolicy Bypass -File .\dev.ps1
#
# Opens TWO new PowerShell windows:
#   - API server  -> http://localhost:8080
#   - Web app     -> http://localhost:5173
# Close those windows (or press Ctrl+C in them) to stop the servers.
#
# Prereqs (one-time): Node 24+, `corepack pnpm install` already run, and a
# filled-in .env at the repo root (DATABASE_URL, CLERK_* keys).

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$envFile = Join-Path $root ".env"

if (-not (Test-Path $envFile)) {
  Write-Error ".env not found at $envFile - create it from artifacts/api-server/.env.example first."
  exit 1
}

# Load .env into this process; the child windows inherit these variables.
Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
    $i = $line.IndexOf('=')
    $k = $line.Substring(0, $i).Trim()
    $v = $line.Substring($i + 1).Trim()
    if ($k) { Set-Item -Path "Env:$k" -Value $v }
  }
}

# Warn (do not fail) if key config is missing.
foreach ($req in 'DATABASE_URL', 'CLERK_SECRET_KEY', 'CLERK_PUBLISHABLE_KEY', 'VITE_CLERK_PUBLISHABLE_KEY') {
  $val = (Get-Item "Env:$req" -ErrorAction SilentlyContinue).Value
  if (-not $val) { Write-Warning "$req is empty in .env - the app may not work until it is set." }
}

# The web build config requires BASE_PATH; default to root for local dev.
if (-not $env:BASE_PATH) { $env:BASE_PATH = "/" }

# Git Bash provides `sh` (repo preinstall guard) and the build toolchain.
$gitBin = "C:\Program Files\Git\bin"
if (Test-Path $gitBin) { $env:PATH = "$gitBin;" + $env:PATH }

Write-Host "Building the API server..." -ForegroundColor Cyan
Push-Location $root
corepack pnpm --filter '@workspace/api-server' run build
Pop-Location

# API on 8080, web on 5173. Each child overrides PORT for itself.
$apiCmd = "`$env:PORT='8080'; Set-Location '$root\artifacts\api-server'; " +
          "Write-Host 'Dempo API -> http://localhost:8080  (Ctrl+C to stop)' -ForegroundColor Green; " +
          "node --enable-source-maps ./dist/index.mjs"

$webCmd = "`$env:PORT='5173'; Set-Location '$root'; " +
          "Write-Host 'Dempo Web -> http://localhost:5173  (Ctrl+C to stop)' -ForegroundColor Green; " +
          "corepack pnpm --filter '@workspace/dempo' run dev"

Start-Process powershell -ArgumentList "-NoExit", "-Command", $apiCmd
Start-Process powershell -ArgumentList "-NoExit", "-Command", $webCmd

Write-Host ""
Write-Host "Dempo is starting in two new windows:" -ForegroundColor Green
Write-Host "  API : http://localhost:8080"
Write-Host "  Web : http://localhost:5173  (open this in your browser)"
Write-Host ""
Write-Host "Tip: if a port is 'in use', close old Dempo windows first."
