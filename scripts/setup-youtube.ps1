<#
  Wires YouTube OAuth credentials into your running Postiz stack.

  Everything here is scriptable; the only part you must do by hand is creating
  the Google OAuth app, because that requires your Google login and consent.

  Usage:
      .\scripts\setup-youtube.ps1

  Safe to re-run. If credentials are already saved it offers to reuse them
  rather than making you paste again.
#>

$ErrorActionPreference = "Stop"

function Info($m) { Write-Host "[*] $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[+] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "[!] $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "[x] $m" -ForegroundColor Red; exit 1 }

<#
  Two PowerShell quirks make raw docker calls unreliable, so everything goes
  through this helper:

  1. The Docker CLI writes progress to stderr even on success. Piping that under
     ErrorActionPreference=Stop turns ordinary output into a terminating
     NativeCommandError. So the preference is relaxed for the call's duration.

  2. Arguments like -d and --tail would be parsed as PowerShell parameter names
     if passed bare. The caller therefore passes ONE array, whose elements are
     always treated as plain strings, and it's splatted onto docker here.

  Call it as:  Invoke-Docker $someArray
#>
function Invoke-Docker {
    param([string[]]$DockerArgs)

    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        # ToString() renders merged stderr as plain text; without it PowerShell
        # re-displays those lines as red NativeCommandError records.
        $output = & docker @DockerArgs 2>&1 |
                  ForEach-Object { $_.ToString() } |
                  Out-String
        $code   = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prev
    }
    return [pscustomobject]@{ Output = $output; ExitCode = $code }
}

<#
  Is the backend actually serving? This asks the API directly instead of
  grepping logs, which is unreliable: "Backend started successfully" scrolls out
  of any fixed --tail window once the app logs anything else. A 401 counts as
  ready - it means the API answered and simply wants credentials.
#>
function Test-BackendReady {
    param([string]$BaseUrl = "http://localhost:4007")

    try {
        $r = Invoke-WebRequest -Uri "$BaseUrl/api/public/v1/integrations" `
                               -Method Get -TimeoutSec 10 `
                               -UseBasicParsing -ErrorAction Stop
        return $true
    } catch {
        $status = $null
        if ($_.Exception.Response) { $status = $_.Exception.Response.StatusCode.value__ }
        # 401/403 => API is alive and rejecting an unauthenticated call.
        if ($status -eq 401 -or $status -eq 403) { return $true }
        return $false
    }
}

# ── 1. Locate the running Postiz stack ─────────────────────────────────────
Info "Locating your Postiz stack..."

$cmd     = @('inspect', 'postiz')
$inspect = Invoke-Docker $cmd
if ($inspect.ExitCode -ne 0) {
    Fail "No container named 'postiz' found, or Docker isn't running.`n$($inspect.Output)"
}

try {
    $meta = $inspect.Output | ConvertFrom-Json
} catch {
    Fail "Couldn't parse docker inspect output."
}

$workingDir = $meta[0].Config.Labels."com.docker.compose.project.working_dir"
if (-not $workingDir)             { Fail "Postiz isn't managed by docker compose; can't add env vars automatically." }
if (-not (Test-Path $workingDir)) { Fail "Compose directory no longer exists: $workingDir" }

Ok "Found stack at: $workingDir"

$overridePath = Join-Path $workingDir "docker-compose.override.yml"

# ── 2. Credentials: reuse if already present ───────────────────────────────
$clientId     = $null
$clientSecret = $null

if (Test-Path $overridePath) {
    $existing    = Get-Content $overridePath -Raw
    $idMatch     = [regex]::Match($existing, 'YOUTUBE_CLIENT_ID:\s*"([^"]+)"')
    $secretMatch = [regex]::Match($existing, 'YOUTUBE_CLIENT_SECRET:\s*"([^"]+)"')

    if ($idMatch.Success -and $secretMatch.Success) {
        $shown = $idMatch.Groups[1].Value
        if ($shown.Length -gt 24) { $shown = $shown.Substring(0, 24) + "..." }
        Write-Host ""
        Info "Credentials are already saved (Client ID: $shown)"
        $reuse = Read-Host "    Reuse them? [Y/n]"
        if ($reuse -eq "" -or $reuse -match "^[Yy]") {
            $clientId     = $idMatch.Groups[1].Value
            $clientSecret = $secretMatch.Groups[1].Value
            Ok "Reusing saved credentials."
        }
    }
}

if (-not $clientId) {
    Write-Host ""
    Write-Host "Paste the two values from Google Cloud Console" -ForegroundColor White
    Write-Host "(Google Auth Platform -> Clients -> your OAuth client)" -ForegroundColor DarkGray
    Write-Host ""

    $clientId     = (Read-Host "  Client ID").Trim()
    $clientSecret = (Read-Host "  Client Secret").Trim()

    if (-not $clientId -or -not $clientSecret) { Fail "Both values are required." }
    if ($clientId -notmatch "\.apps\.googleusercontent\.com$") {
        Warn "That Client ID doesn't end in .apps.googleusercontent.com - double check the field you copied."
    }

    if (Test-Path $overridePath) {
        $backup = "$overridePath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Copy-Item $overridePath $backup
        Warn "Backed up the previous override to: $backup"
    }
}

# ── 3. Write the compose override ──────────────────────────────────────────
# An override works regardless of how the base compose file declares env
# (inline block, env_file, or variable substitution), so we don't have to guess.
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
Info "Restarting Postiz with the new credentials..."

Push-Location $workingDir
try {
    $cmd = @('compose', 'up', '-d', 'postiz')
    $up  = Invoke-Docker $cmd
    Write-Host $up.Output -ForegroundColor DarkGray
    if ($up.ExitCode -ne 0) { Fail "docker compose failed. See output above." }
} finally {
    Pop-Location
}

# ── 5. Wait for the backend to actually come up ────────────────────────────
Info "Waiting for the backend to finish booting (this takes a minute or two)..."

$logCmd        = @('logs', 'postiz', '--tail', '200')
$ready         = $false
$temporalFixed = $false

foreach ($i in 1..40) {
    Start-Sleep -Seconds 5

    # Ground truth: can the API actually be reached?
    if (Test-BackendReady) { $ready = $true; break }

    $logs = (Invoke-Docker $logCmd).Output

    # Postiz needs Temporal; if those containers are down the backend won't boot.
    if (-not $temporalFixed -and $logs -match "Name resolution failed for target dns:temporal") {
        Warn "Backend can't reach Temporal. Starting those containers in order..."

        $c = @('start', 'temporal-postgresql', 'temporal-elasticsearch')
        Invoke-Docker $c | Out-Null
        Start-Sleep -Seconds 20

        $c = @('start', 'temporal')
        Invoke-Docker $c | Out-Null
        Start-Sleep -Seconds 20

        $c = @('restart', 'postiz')
        Invoke-Docker $c | Out-Null

        $temporalFixed = $true
        Info "Temporal started. Waiting on the backend again..."
        continue
    }

    Write-Host "    still booting... ($($i * 5)s)" -ForegroundColor DarkGray
}

Write-Host ""
if ($ready) {
    Ok "Postiz backend is up with your YouTube credentials."
    Write-Host ""
    Write-Host "Next:" -ForegroundColor White
    Write-Host "  1. Open http://localhost:4007"
    Write-Host "  2. Add Channel -> YouTube -> approve the Google popup"
    Write-Host "  3. Settings -> Public API -> Generate, then run:"
    Write-Host "       .\scripts\setup-postiz-key.ps1" -ForegroundColor Cyan
} else {
    Warn "The API didn't respond within ~3 minutes."
    Warn "See what the container is doing with:"
    Warn "    docker logs postiz --tail 60"
    Warn "If the last lines look healthy, just open http://localhost:4007 anyway."
}
