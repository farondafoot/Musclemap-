#!/usr/bin/env python3
"""
Calls the Ollama REST API. Reads the prompt from stdin, writes the response to stdout.
Using Python instead of curl+jq avoids shell escaping issues with multi-line prompts.
"""
import json
import os
import sys
import urllib.error
import urllib.request

model    = os.environ.get("CONTENT_MODEL", "llama3.2")
base_url = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")
prompt   = sys.stdin.read()

if not prompt.strip():
    print("ERROR: empty prompt on stdin", file=sys.stderr)
    sys.exit(1)

payload = {
    "model":   model,
    "prompt":  prompt,
    "stream":  False,
    "options": {"temperature": 0.8, "num_predict": 180},  # short = punchy content
}

try:
    req = urllib.request.Request(
        f"{base_url}/api/generate",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())
        text = data.get("response", "").strip()
        if not text:
            print("ERROR: Ollama returned empty response", file=sys.stderr)
            sys.exit(1)
        print(text)
except urllib.error.URLError as e:
    print(f"ERROR: Could not reach Ollama at {base_url} — is 'ollama serve' running?\n{e}",
          file=sys.stderr)
    sys.exit(1)
