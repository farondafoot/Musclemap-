#!/usr/bin/env bash
# MuscleMap nightly content pipeline.
# Runs 2-3 videos through the full create → post loop.
# Designed to run unattended on a VPS via Orca automations.

set -euo pipefail

LOG="output/pipeline.log"
mkdir -p output

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

# ── Content rotation — day-of-week schedule ────────────────────────────────
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

# Allow manual override
if [ -n "${CONTENT_TYPE:-}" ]; then
  TYPES=("$CONTENT_TYPE")
fi

log "=== MuscleMap Nightly Pipeline — $(date '+%Y-%m-%d') ==="
log "Videos to create: ${TYPES[*]}"

# ── Verify Ollama is running ───────────────────────────────────────────────
if ! curl -sf http://localhost:11434/api/tags > /dev/null; then
  log "ERROR: Ollama not running. Start it with: ollama serve"
  exit 1
fi

FAILED=0

for TYPE in "${TYPES[@]}"; do
  log ""
  log "--- Processing: $TYPE ---"

  # Step 1: generate script
  log "Generating narration script..."
  if ! bash scripts/generate-script.sh --type "$TYPE" >> "$LOG" 2>&1; then
    log "WARN: Script generation failed for $TYPE — skipping"
    FAILED=$((FAILED+1))
    continue
  fi

  # Step 2: build video
  log "Building video..."
  rm -f output/videos/.last-video-path
  set +e
  python3 scripts/create-video.py \
    --script output/scripts/latest.txt \
    --type "$TYPE" \
    --output output/videos >> "$LOG" 2>&1
  VIDEO_EXIT=$?
  set -e

  VIDEO_PATH=$(cat output/videos/.last-video-path 2>/dev/null || echo "")
  if [ $VIDEO_EXIT -ne 0 ] || [ -z "$VIDEO_PATH" ] || [ ! -f "$VIDEO_PATH" ]; then
    log "WARN: Video not created for $TYPE — skipping"
    FAILED=$((FAILED+1))
    continue
  fi
  log "Video ready: $VIDEO_PATH"

  # Step 3: generate captions
  log "Generating captions..."
  MODE=caption VIDEO_FILE="$VIDEO_PATH" \
    bash scripts/generate-script.sh --type "$TYPE" --mode caption >> "$LOG" 2>&1 || true

  # Step 4: post to all connected channels via Postiz
  log "Posting to social media..."
  python3 scripts/post-to-postiz.py \
    --file "$VIDEO_PATH" \
    --caption output/captions/latest.json \
    --channels all >> "$LOG" 2>&1 || log "WARN: posting failed for $TYPE (see $LOG)"

  log "Done: $TYPE"
  sleep 5   # brief pause between videos
done

log ""
log "=== Pipeline complete. Failed: $FAILED / ${#TYPES[@]} ==="
log "Results: output/post-log.jsonl"

# Send a push notification to Orca mobile app if CLI is available
if command -v orca &>/dev/null; then
  SUMMARY="MuscleMap: created ${#TYPES[@]} videos, $FAILED failed. Check post-log.jsonl."
  orca terminal send --name "pipeline" "echo '$SUMMARY'" 2>/dev/null || true
fi
