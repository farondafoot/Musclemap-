#!/usr/bin/env bash
# Convenience wrapper: generate narration script then build the video in one command.
# Usage: bash scripts/create-video.sh --type TYPE [--topic "TOPIC"]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TYPE="${CONTENT_TYPE:-workout-tip}"
TOPIC=""

usage() {
  echo "Usage: $0 --type TYPE [--topic TOPIC]"
  echo "  Types: workout-tip | feature-highlight | transformation | weekly-recap"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --type)  TYPE="$2";  shift 2 ;;
    --topic) TOPIC="$2"; shift 2 ;;
    *) usage ;;
  esac
done

echo "=== MuscleMap Video Creator ==="
echo "Type: $TYPE"
[ -n "$TOPIC" ] && echo "Topic: $TOPIC"
echo ""

# Step 1: generate narration script
TOPIC_ARG="${TOPIC:+--topic "$TOPIC"}"
bash "$SCRIPT_DIR/generate-script.sh" --type "$TYPE" $TOPIC_ARG

# Step 2: build video
echo ""
echo "Building video..."
python3 "$SCRIPT_DIR/create-video.py" \
  --script output/scripts/latest.txt \
  --type "$TYPE" \
  --output output/videos

VIDEO_PATH=$(cat output/videos/.last-video-path 2>/dev/null || echo "")
if [ -z "$VIDEO_PATH" ] || [ ! -f "$VIDEO_PATH" ]; then
  echo "ERROR: video file not found after creation"
  exit 1
fi

echo ""
echo "=== Done ==="
echo "Video: $VIDEO_PATH"
echo ""
echo "To post now:"
echo "  python3 scripts/post-to-social.py --file \"$VIDEO_PATH\" --platforms all"
