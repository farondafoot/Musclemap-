#!/usr/bin/env bash
# One-time setup: installs all dependencies for the MuscleMap content pipeline.
# Run this once on your machine or VPS before using any other scripts.

set -e
echo "=== MuscleMap Content Pipeline — Setup ==="

# --- Ollama ---
if ! command -v ollama &>/dev/null; then
  echo "[1/5] Installing Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
else
  echo "[1/5] Ollama already installed — skipping"
fi

echo "[2/5] Pulling Ollama models..."
ollama pull llama3.2          # content generation + captions
ollama pull qwen2.5-coder:7b  # coding tasks inside Orca agents

# --- FFmpeg ---
if ! command -v ffmpeg &>/dev/null; then
  echo "[3/5] Installing FFmpeg..."
  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    sudo apt-get update -qq && sudo apt-get install -y ffmpeg
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    brew install ffmpeg
  else
    echo "  Windows: download FFmpeg from https://ffmpeg.org/download.html and add to PATH"
  fi
else
  echo "[3/5] FFmpeg already installed — skipping"
fi

# --- Python dependencies ---
echo "[4/5] Installing Python packages..."
pip3 install -q \
  moviepy==1.0.3 \
  Pillow \
  pyttsx3 \
  requests \
  google-auth \
  google-auth-oauthlib \
  google-api-python-client \
  python-dotenv

# --- Output directories ---
echo "[5/5] Creating output directories..."
mkdir -p output/videos output/scripts output/captions output/thumbnails

# --- Config ---
if [ ! -f config/social.env ]; then
  cp config/social.env.example config/social.env
  echo ""
  echo "  ACTION NEEDED: Fill in your API keys in config/social.env"
  echo "  (YouTube OAuth, Instagram token, TikTok client key)"
fi

echo ""
echo "=== Setup complete ==="
echo "Next: fill in config/social.env, then run:"
echo "  bash scripts/nightly-pipeline.sh"
