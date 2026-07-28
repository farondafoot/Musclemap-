#!/usr/bin/env bash
# MuscleMap nightly content pipeline.
# Renders videos with Remotion and posts them through Postiz.
# Designed to run unattended overnight.

set -uo pipefail

LOG="output/pipeline.log"
mkdir -p output

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

# Windows installs the launcher as `py`; Linux/mac use python3.
PY=$(command -v py || command -v python3 || command -v python)
[ -z "$PY" ] && { log "ERROR: no python found"; exit 1; }

# ── Content rotation ───────────────────────────────────────────────────────
DOW=$(date +%u)   # 1=Mon ... 7=Sun
case "$DOW" in
  1) TYPES=("workout-tip"       "feature-highlight") ;;
  2) TYPES=("feature-highlight" "transformation")    ;;
  3) TYPES=("workout-tip"       "weekly-recap")      ;;
  4) TYPES=("transformation"    "workout-tip")       ;;
  5) TYPES=("feature-highlight" "workout-tip")       ;;
  6) TYPES=("workout-tip"       "transformation")    ;;
  7) TYPES=("weekly-recap"      "feature-highlight") ;;
  *) TYPES=("workout-tip")                           ;;
esac

[ -n "${CONTENT_TYPE:-}" ] && TYPES=("$CONTENT_TYPE")

# Videos go out unlisted unless PRIVACY says otherwise.
PRIVACY="${PRIVACY:-unlisted}"

log "=== MuscleMap Nightly — $(date '+%Y-%m-%d') ==="
log "Types: ${TYPES[*]}  (privacy: $PRIVACY)"

# ── Preflight ──────────────────────────────────────────────────────────────
if [ ! -d video/node_modules ]; then
  log "ERROR: Remotion not installed. Run:  cd video && npm install"
  exit 1
fi

if ! curl -sf "${POSTIZ_URL:-http://localhost:4007/api}/public/v1/integrations" \
       -H "Authorization: ${POSTIZ_API_KEY:-x}" -o /dev/null; then
  log "WARN: Postiz didn't answer. Videos will render but posting may fail."
fi

FAILED=0

for TYPE in "${TYPES[@]}"; do
  log ""
  log "--- $TYPE ---"

  # Render. make-video.py picks a script from the written library, generates
  # narration, sizes the shot table to the audio, and drives Remotion.
  log "Rendering (Remotion; expect several minutes)..."
  if ! "$PY" scripts/make-video.py --type "$TYPE" >> "$LOG" 2>&1; then
    log "WARN: render failed for $TYPE — skipping"
    FAILED=$((FAILED + 1))
    continue
  fi

  VIDEO_PATH=$(cat output/videos/.last-video-path 2>/dev/null || echo "")
  if [ -z "$VIDEO_PATH" ] || [ ! -f "$VIDEO_PATH" ]; then
    log "WARN: no video produced for $TYPE — skipping"
    FAILED=$((FAILED + 1))
    continue
  fi
  log "Rendered: $VIDEO_PATH"

  # Captions
  log "Writing captions..."
  MODE=caption VIDEO_FILE="$VIDEO_PATH" \
    bash scripts/generate-script.sh --type "$TYPE" --mode caption >> "$LOG" 2>&1 || true

  # Post
  log "Posting ($PRIVACY)..."
  if "$PY" scripts/post-to-postiz.py \
        --file "$VIDEO_PATH" \
        --caption output/captions/latest.json \
        --privacy "$PRIVACY" \
        --channels all >> "$LOG" 2>&1; then
    log "Posted: $TYPE"
  else
    log "WARN: posting failed for $TYPE (see $LOG)"
    FAILED=$((FAILED + 1))
  fi
done

log ""
log "=== Done. Failures: $FAILED ==="
log "Results: output/post-log.jsonl"
