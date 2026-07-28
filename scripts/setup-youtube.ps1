<#
  Wires YouTube OAuth credentials into your running Postiz stack.

  Everything here is scriptable; the only part you must do by hand is creating
  the Google OAuth app, because that requires your Google login and consent.

  Usage:
      py -3 --version   # (unrelated, just checking you're in PowerShell)
      .\scripts\setup-youtube.ps1

  It will prompt for the Client ID and Secret, then handle the rest:
  locating your compose project, adding the env vars, restarting Postiz, and
  waiting until the backend is actually healthy again.
#>

$ErrorActionPreference = "Stop"

function Info($m)  { Write-Host "[*] $m" -ForegroundColor Cyan }
function Ok($m)    { Write-Host "[+] $m" -ForegroundColor Green }
function Warn($m)  { Write-Host "[!] $m" -ForegroundColor Yellow }
function Fail($m)  { Write-Host "[x] $m" -ForegroundColor Red; exit 1 }

# ── 1. Locate the running Postiz stack ─────────────────────────────────────
Info "Locating your Postiz stack..."

try {
    $raw = docker inspect postiz 2>$null | ConvertFrom-Json
} catch {
    Fail "Can't inspect the 'postiz' container. Is Docker Desktop running?"
}
if (-not $raw) { Fail "No container named 'postiz' found. Is Docker Desktop running?" }

$labels     = $raw[0].Config.Labels
$workingDir = $labels."com.docker.compose.project.working_dir"
$configFile = $labels."com.docker.compose.project.config_files"

if (-not $workingDir) { Fail "Postiz isn't managed by docker compose; can't add env vars automatically." }
if (-not (Test-Path $workingDir)) { Fail "Compose directory no longer exists: $workingDir" }

Ok "Found stack at: $workingDir"

# ── 2. Collect credentials ─────────────────────────────────────────────────
Write-Host ""
Write-Host "Paste the two values from Google Cloud Console" -ForegroundColor White
Write-Host "(APIs & Services -> Credentials -> your OAuth 2.0 Client ID)" -ForegroundColor DarkGray
Write-Host ""

$clientId     = (Read-Host "  Client ID").Trim()
$clientSecret = (Read-Host "  Client Secret").Trim()

if (-not $clientId -or -not $clientSecret) { Fail "Both values are required." }
if ($clientId -notmatch "\.apps\.googleusercontent\.com$") {
    Warn "That Client ID doesn't end in .apps.googleusercontent.com - double check you copied the right field."
}

# ── 3. Write a compose override ────────────────────────────────────────────
# An override file works no matter how the base compose file declares env
# (inline block, env_file, or variable substitution), so we don't have to guess.
$overridePath = Join-Path $workingDir "docker-compose.override.yml"

if (Test-Path $overridePath) {
    $backup = "$overridePath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item $overridePath $backup
    Warn "An override already existed. Backed it up to:"
    Warn "    $backup"
    Warn "Review it afterwards if Postiz behaves unexpectedly."
}

$override = @"
# Added by MuscleMap setup-youtube.ps1
# Compose merges this on top of the base file automatically.
services:
  postiz:
    environment:
      YOUTUBE_CLIENT_ID: "$clientId"
      YOUTUBE_CLIENT_SECRET: "$clientSecret"
"@

Set-Content -Path $overridePath -Value $override -Encoding UTF8
Ok "Wrote $overridePath"

# ── 4. Recreate the container with the new env ─────────────────────────────
Info "Restarting Postiz with the new credentials (this takes a minute)..."

Push-Location $workingDir
try {
    docker compose up -d postiz 2>&1 | Out-String | Write-Host
    if ($LASTEXITCODE -ne 0) { Fail "docker compose failed. See output above." }
} finally {
    Pop-Location
}

# ── 5. Wait for the backend to actually come up ────────────────────────────
Info "Waiting for the backend to finish booting..."

$ready = $false
foreach ($i in 1..40) {
    Start-Sleep -Seconds 5
    $logs = docker logs postiz --tail 40 2>&1 | Out-String

    if ($logs -match "Backend started successfully") { $ready = $true; break }

    if ($logs -match "Name resolution failed for target dns:temporal") {
        Warn "Backend can't reach Temporal. Starting those containers..."
        docker start temporal-postgresql temporal-elasticsearch 2>&1 | Out-Null
        Start-Sleep -Seconds 15
        docker start temporal 2>&1 | Out-Null
        Start-Sleep -Seconds 15
        docker restart postiz 2>&1 | Out-Null
    }

    Write-Host "    still booting... ($($i * 5)s)" -ForegroundColor DarkGray
}

Write-Host ""
if ($ready) {
    Ok "Postiz backend is up."
    Write-Host ""
    Write-Host "Next:" -ForegroundColor White
    Write-Host "  1. Open http://localhost:4007"
    Write-Host "  2. Add Channel -> YouTube -> approve the Google popup"
    Write-Host "  3. Settings -> Public API -> Generate, then run:"
    Write-Host "       .\scripts\setup-postiz-key.ps1" -ForegroundColor Cyan
} else {
    Warn "Backend didn't report ready within ~3 minutes."
    Warn "Check what it's doing with:  docker logs postiz --tail 40"
}
