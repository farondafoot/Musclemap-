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

# --- System packages (FFmpeg + TTS engine) ---
echo "[3/5] Installing system packages..."
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
  sudo apt-get update -qq
  # ffmpeg: video encoding
  # espeak-ng: local TTS engine used by pyttsx3 on Linux
  sudo apt-get install -y ffmpeg espeak-ng libespeak-ng-dev
elif [[ "$OSTYPE" == "darwin"* ]]; then
  brew install ffmpeg
  # macOS uses built-in NSSpeechSynthesizer — no extra TTS package needed
else
  echo "  Windows: install FFmpeg (https://ffmpeg.org/download.html) and add to PATH"
  echo "  Windows: pyttsx3 uses SAPI5 which is built in — no extra install needed"
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
