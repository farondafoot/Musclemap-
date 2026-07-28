#!/usr/bin/env bash
# Uses Ollama (local, free) to generate video narration scripts and captions.
# No API costs — runs 100% on your machine.

set -e

OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"
CONTENT_MODEL="${CONTENT_MODEL:-llama3.2}"
TYPE="${CONTENT_TYPE:-workout-tip}"
TOPIC="${TOPIC:-}"
MODE="${MODE:-script}"  # script | caption

usage() {
  echo "Usage: $0 [--type TYPE] [--topic TOPIC] [--mode script|caption] [--video-file FILE]"
  echo "  Types: workout-tip | feature-highlight | transformation | weekly-recap"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --type)       TYPE="$2";       shift 2 ;;
    --topic)      TOPIC="$2";      shift 2 ;;
    --mode)       MODE="$2";       shift 2 ;;
    --video-file) VIDEO_FILE="$2"; shift 2 ;;
    *) usage ;;
  esac
done

mkdir -p output/scripts output/captions

# Load template
TEMPLATE_FILE="config/content-templates/${TYPE}.txt"
if [ ! -f "$TEMPLATE_FILE" ]; then
  echo "Unknown type '$TYPE'. Available: workout-tip, feature-highlight, transformation, weekly-recap"
  exit 1
fi
TEMPLATE=$(cat "$TEMPLATE_FILE")

# Build prompt
if [ "$MODE" = "script" ]; then
  TOPIC_LINE="${TOPIC:+Topic: $TOPIC}"
  PROMPT="You are creating content for MuscleMap, a sleek dark-themed fitness tracking web app.
${TOPIC_LINE}
${TEMPLATE}

Write a punchy 30-45 second video narration script. Rules:
- Hook in first 5 words — no 'Hey guys' or 'Welcome back'
- Short sentences. Maximum 12 words each.
- Mention MuscleMap by name at least twice
- End with: 'Track every rep. MuscleMap — free in your browser.'
- Output ONLY the script text, no stage directions, no labels"

  OUTPUT_FILE="output/scripts/latest.txt"

elif [ "$MODE" = "caption" ]; then
  VIDEO_NAME="${VIDEO_FILE:-the video}"
  PROMPT="Write social media captions for a MuscleMap fitness app video: '${VIDEO_NAME}'.
MuscleMap is a free dark-themed workout tracker in the browser.

Return ONLY valid JSON with these exact keys:
{
  \"youtube\": \"caption under 5000 chars, include hashtags\",
  \"instagram\": \"caption under 2200 chars, 5 hashtags, end with 'Try MuscleMap free 💪'\",
  \"tiktok\": \"caption under 150 chars, 3 hashtags\"
}
No markdown, no explanation — just the JSON object."

  OUTPUT_FILE="output/captions/latest.json"
fi

# Call Ollama via Python helper (no jq required, handles multi-line prompts safely)
echo "Generating ${MODE} for type '${TYPE}' using ${CONTENT_MODEL}..."

TEXT=$(echo "$PROMPT" | CONTENT_MODEL="$CONTENT_MODEL" OLLAMA_URL="$OLLAMA_URL" \
  python3 "$(dirname "$0")/ollama-call.py")

if [ -z "$TEXT" ]; then
  echo "ERROR: Ollama returned empty response. Is 'ollama serve' running?"
  exit 1
fi

echo "$TEXT" > "$OUTPUT_FILE"
echo "Saved to $OUTPUT_FILE"

if [ "$MODE" = "script" ]; then
  echo ""
  echo "--- Script preview ---"
  cat "$OUTPUT_FILE"
fi
