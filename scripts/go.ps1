<#
  One short command for the whole loop: write a script with Ollama, render the
  video, and optionally post it.

  Deliberately terse, because long pasted commands get mangled by terminals that
  duplicate clipboard text.

  Examples:
      .\scripts\go.ps1                      # workout-tip, render only
      .\scripts\go.ps1 feature-highlight    # a different content type
      .\scripts\go.ps1 workout-tip -Post    # render, then post unlisted
      .\scripts\go.ps1 workout-tip -Post -Public
#>

param(
    [Parameter(Position = 0)]
    [ValidateSet("workout-tip", "feature-highlight", "transformation", "weekly-recap")]
    [string]$Type = "workout-tip",

    [switch]$Post,      # upload after rendering
    [switch]$Public,    # go public instead of unlisted
    [switch]$SkipScript # reuse the existing narration, just re-render
)

$ErrorActionPreference = "Stop"

function Info($m) { Write-Host "[*] $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[+] $m" -ForegroundColor Green }
function Fail($m) { Write-Host "[x] $m" -ForegroundColor Red; exit 1 }

Set-Location (Split-Path -Parent $PSScriptRoot)

New-Item -ItemType Directory -Force -Path output\scripts, output\videos, output\captions | Out-Null

# ── 1. Narration script ────────────────────────────────────────────────────
if (-not $SkipScript) {
    Info "Writing narration with Ollama ($Type)..."
    Get-Content "config\content-templates\$Type.txt" |
        py scripts\ollama-call.py |
        Out-File -Encoding utf8 output\scripts\latest.txt

    if ($LASTEXITCODE -ne 0) { Fail "Ollama failed. Is it running?  ollama serve" }

    $script = Get-Content output\scripts\latest.txt -Raw
    if (-not $script.Trim()) { Fail "Ollama returned an empty script." }

    Write-Host ""
    Write-Host "--- narration ---" -ForegroundColor DarkGray
    Write-Host $script.Trim()
    Write-Host "-----------------" -ForegroundColor DarkGray
    Write-Host ""
}

# ── 2. Render ──────────────────────────────────────────────────────────────
Info "Rendering video..."
py scripts\create-video.py --script output\scripts\latest.txt --type $Type --output output\videos
if ($LASTEXITCODE -ne 0) { Fail "Rendering failed. See the error above." }

$videoPath = Get-Content output\videos\.last-video-path -ErrorAction SilentlyContinue
if (-not $videoPath -or -not (Test-Path $videoPath)) { Fail "Couldn't find the rendered video." }

$sizeMb = [math]::Round((Get-Item $videoPath).Length / 1MB, 1)
Ok "Video ready: $videoPath  ($sizeMb MB)"

# ── 3. Post ────────────────────────────────────────────────────────────────
if (-not $Post) {
    Write-Host ""
    Write-Host "Watch it, then post with:" -ForegroundColor White
    Write-Host "  .\scripts\go.ps1 $Type -Post -SkipScript" -ForegroundColor Cyan
    exit 0
}

$privacy = if ($Public) { "public" } else { "unlisted" }

Write-Host ""
Info "Writing captions..."
$env:MODE = "caption"
$env:VIDEO_FILE = $videoPath
bash scripts/generate-script.sh --type $Type --mode caption 2>$null
Remove-Item Env:\MODE, Env:\VIDEO_FILE -ErrorAction SilentlyContinue

Info "Posting as $privacy..."
py scripts\post-to-postiz.py --file $videoPath --privacy $privacy
if ($LASTEXITCODE -ne 0) { Fail "Posting failed. See the error above." }

Write-Host ""
Ok "Done. Check http://localhost:4007/launches"
if (-not $Public) {
    Write-Host "Happy with it? Re-post publicly:" -ForegroundColor White
    Write-Host "  .\scripts\go.ps1 $Type -Post -Public -SkipScript" -ForegroundColor Cyan
}
