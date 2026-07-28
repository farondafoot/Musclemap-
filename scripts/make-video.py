#!/usr/bin/env python3
"""
Renders a MuscleMap short with Remotion (video/), replacing the old PIL
text-card renderer.

Pipeline:
  1. Pick a narration script (hand-written library, or Ollama as fallback)
  2. Generate TTS narration locally with pyttsx3
  3. Measure it, and derive the shot budget from real audio length
  4. Write video/src/content.json
  5. Shell out to `remotion render`
  6. Copy the mp4 into output/videos/ so post-to-postiz.py can find it

Usage:
  python3 scripts/make-video.py --type workout-tip
  python3 scripts/make-video.py --type workout-tip --id wt-003
  python3 scripts/make-video.py --type workout-tip --ollama
"""

import argparse
import json
import random
import re
import shutil
import subprocess
import sys
import wave
from datetime import datetime
from pathlib import Path

ROOT      = Path(__file__).resolve().parent.parent
VIDEO_DIR = ROOT / "video"
LIBRARY   = ROOT / "content" / "scripts"
OUT_DIR   = ROOT / "output" / "videos"
USED_LOG  = ROOT / "output" / ".used-scripts.json"

FPS = 30

# Which muscle groups light up on the hero shot, per content type.
HERO_MUSCLES = {
    "workout-tip":       ["chest", "shoulders", "arms"],
    "feature-highlight": ["chest", "abs", "quads", "shoulders"],
    "transformation":    ["back", "glutes", "quads", "calves"],
    "weekly-recap":      ["calves", "abs", "back"],
}


def die(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


# ── 1. Script selection ────────────────────────────────────────────────────

def load_used():
    if USED_LOG.exists():
        try:
            return json.loads(USED_LOG.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_used(used):
    USED_LOG.parent.mkdir(parents=True, exist_ok=True)
    USED_LOG.write_text(json.dumps(used, indent=2), encoding="utf-8")


def pick_script(content_type, script_id=None):
    """
    Take the least-recently-used script from the library so the feed doesn't
    repeat itself. Falls back to a random pick once everything has been used.
    """
    path = LIBRARY / f"{content_type}.json"
    if not path.exists():
        die(f"No script library for '{content_type}'. Looked in {path}")

    scripts = json.loads(path.read_text(encoding="utf-8"))["scripts"]
    if not scripts:
        die(f"{path} has no scripts in it.")

    if script_id:
        for s in scripts:
            if s["id"] == script_id:
                return s
        die(f"No script with id '{script_id}' in {path}")

    used  = load_used()
    seen  = used.get(content_type, {})
    fresh = [s for s in scripts if s["id"] not in seen]

    chosen = random.choice(fresh) if fresh else min(scripts, key=lambda s: seen.get(s["id"], 0))

    seen[chosen["id"]] = seen.get(chosen["id"], 0) + 1
    used[content_type] = seen
    save_used(used)

    return chosen


def script_from_ollama(content_type):
    """Fallback: generate with the local model. Lower quality; opt-in."""
    template = ROOT / "config" / "content-templates" / f"{content_type}.txt"
    if not template.exists():
        die(f"No template at {template}")

    helper = ROOT / "scripts" / "ollama-call.py"
    prompt = template.read_text(encoding="utf-8") + (
        "\n\nWrite exactly 6 sentences. Each under 10 words. "
        "Final sentence must be: Track every rep. MuscleMap, free in your browser. "
        "Output only the narration."
    )
    result = subprocess.run(
        [sys.executable, str(helper)],
        input=prompt, capture_output=True, text=True,
    )
    if result.returncode != 0:
        die(f"Ollama failed: {result.stderr.strip()}")

    return {"id": "ollama", "hook": content_type, "text": result.stdout.strip()}


# ── 2. Narration ───────────────────────────────────────────────────────────

def narrate(text, out_path):
    """Local TTS via pyttsx3. Returns duration in seconds."""
    try:
        import pyttsx3
    except ImportError:
        die("pyttsx3 not installed. Run: pip install pyttsx3")

    engine = pyttsx3.init()
    engine.setProperty("rate", 158)
    engine.setProperty("volume", 0.95)
    for v in engine.getProperty("voices"):
        if any(n in v.name.lower() for n in ("david", "mark", "alex", "zira", "hazel")):
            engine.setProperty("voice", v.id)
            break

    out_path.parent.mkdir(parents=True, exist_ok=True)
    engine.save_to_file(text, str(out_path))
    engine.runAndWait()

    if not out_path.exists() or out_path.stat().st_size == 0:
        die(f"TTS produced no audio at {out_path}")

    with wave.open(str(out_path), "rb") as w:
        return w.getnframes() / float(w.getframerate())


# ── 3. Shot budget ─────────────────────────────────────────────────────────

MIN_SHOT_FRAMES = 42   # ~1.4s — below this a line is gone before it can be read
MERGE_UNDER     = 5    # fragments this short get joined to a neighbour
MAX_SHOT_WORDS  = 11   # above this the copy overflows the lower-third block


def split_sentences(text):
    """
    Split narration into one line per shot.

    Punchy writing produces very short sentences ("Face pulls." "Twenty reps.")
    and giving each its own shot yields one-second cuts that read as staccato
    rather than emphatic. Short fragments are merged with a neighbour so every
    shot carries enough to be read, which also keeps the closing CTA
    ("Track every rep. MuscleMap, free in your browser.") on a single card.
    """
    parts = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s.strip()]
    parts = [p for p in parts if len(p) > 3]
    if not parts:
        return []

    def joinable(existing: str, addition: str) -> bool:
        """Merge only while the result still fits on one card."""
        return len(existing.split()) + len(addition.split()) <= MAX_SHOT_WORDS

    merged: list[str] = []
    for part in parts:
        short_part = len(part.split()) < MERGE_UNDER
        short_prev = bool(merged) and len(merged[-1].split()) < MERGE_UNDER

        if merged and (short_part or short_prev) and joinable(merged[-1], part):
            merged[-1] = f"{merged[-1]} {part}"
        else:
            merged.append(part)

    # A trailing fragment has no following neighbour to absorb it. Accept going
    # slightly over the cap here rather than leaving a one-word final shot.
    if len(merged) > 1 and len(merged[-1].split()) < MERGE_UNDER:
        merged[-2] = f"{merged[-2]} {merged.pop()}"

    return merged


def build_content(content_type, script, audio_name, audio_seconds):
    """
    Distribute the audio duration across shots, weighting each narration line by
    its word count so longer sentences stay on screen longer.
    """
    lines = split_sentences(script["text"])
    if not lines:
        die("Script had no usable sentences.")

    total_frames = max(int(audio_seconds * FPS), 300)

    # Fixed budgets for the framing shots (the arc guide's proportions)
    brand_open = int(FPS * 2.2)   # stamp + a full second held on
    hero       = int(FPS * 3.4)   # slowest shot, one complete arc
    outro      = int(FPS * 3.6)   # peak, plus a held sign-off

    body = total_frames - brand_open - hero - outro
    if body < len(lines) * MIN_SHOT_FRAMES:
        # Narration is short; give the framing shots less room
        brand_open = int(FPS * 1.6)
        hero       = int(FPS * 2.4)
        outro      = int(FPS * 2.6)
        body       = max(total_frames - brand_open - hero - outro,
                         len(lines) * MIN_SHOT_FRAMES)

    weights   = [max(len(l.split()), 2) for l in lines]
    total_w   = sum(weights)
    per_line  = [max(int(body * w / total_w), MIN_SHOT_FRAMES) for w in weights]

    # Absorb rounding drift into the longest shot
    drift = body - sum(per_line)
    if drift:
        per_line[per_line.index(max(per_line))] += drift

    return {
        "label":         content_type.replace("-", " "),
        "hook":          script.get("hook", ""),
        "lines":         lines,
        "audio":         audio_name,
        "fps":           FPS,
        "brandOpen":     brand_open,
        "hero":          hero,
        "outro":         outro,
        "perLine":       per_line,
        "activeMuscles": HERO_MUSCLES.get(content_type, ["chest", "shoulders", "arms"]),
    }


# ── 4. Render ──────────────────────────────────────────────────────────────

def render(out_file):
    if not (VIDEO_DIR / "node_modules").exists():
        die(f"Remotion isn't installed. Run:  cd video && npm install")

    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if not npx:
        die("npx not found. Install Node.js from nodejs.org")

    cmd = [
        npx, "remotion", "render", "src/index.ts",
        "MuscleMapShort", str(out_file),
        "--concurrency=1",
    ]
    print(f"Rendering (this takes a while — Remotion renders frame by frame)...")
    print(f"  {' '.join(cmd)}\n")

    result = subprocess.run(cmd, cwd=VIDEO_DIR)
    if result.returncode != 0:
        die("Remotion render failed. See the output above.")


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--type", default="workout-tip",
                    choices=["workout-tip", "feature-highlight", "transformation", "weekly-recap"])
    ap.add_argument("--id", help="Render a specific script id, e.g. wt-003")
    ap.add_argument("--ollama", action="store_true",
                    help="Generate with the local model instead of the written library")
    ap.add_argument("--text",
                    help="Narration to render, instead of picking from the library. "
                         "Sentences are split on punctuation, one per shot.")
    ap.add_argument("--text-file",
                    help="Read the narration from a file (avoids shell quoting pain).")
    ap.add_argument("--hook", default="",
                    help="Short label shown under the wordmark on the opening shot.")
    ap.add_argument("--muscles",
                    help="Comma-separated groups to light on the hero shot, e.g. "
                         "back,glutes,quads. Defaults per content type.")
    args = ap.parse_args()

    if args.text_file:
        body = Path(args.text_file).read_text(encoding="utf-8").strip()
        if not body:
            die(f"{args.text_file} is empty")
        script = {"id": "custom", "hook": args.hook, "text": body}
    elif args.text:
        script = {"id": "custom", "hook": args.hook, "text": args.text.strip()}
    elif args.ollama:
        script = script_from_ollama(args.type)
    else:
        script = pick_script(args.type, args.id)
    print(f"Script: {script['id']} — {script.get('hook', '')}")
    print(f"  {script['text'][:110]}...\n")

    audio_name = "narration.wav"
    audio_path = VIDEO_DIR / "public" / audio_name
    print("Generating narration...")
    seconds = narrate(script["text"], audio_path)
    print(f"  {seconds:.1f}s\n")

    content = build_content(args.type, script, audio_name, seconds)
    if args.muscles:
        content["activeMuscles"] = [m.strip() for m in args.muscles.split(",") if m.strip()]
    (VIDEO_DIR / "src" / "content.json").write_text(
        json.dumps(content, indent=2), encoding="utf-8")

    frames = content["brandOpen"] + content["hero"] + sum(content["perLine"]) + content["outro"]
    print(f"{len(content['lines'])} lines, {frames} frames ({frames / FPS:.1f}s)\n")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp    = datetime.now().strftime("%Y-%m-%d_%H%M")
    out_file = OUT_DIR / f"{stamp}_{args.type}.mp4"

    render(out_file)

    if not out_file.exists():
        die("Render reported success but no file was written.")

    (OUT_DIR / ".last-video-path").write_text(str(out_file), encoding="utf-8")

    size_mb = out_file.stat().st_size / 1_000_000
    print(f"\nDone: {out_file}  ({size_mb:.1f} MB)")
    print(f"\nPost it with:")
    print(f"  py scripts\\post-to-postiz.py --file \"{out_file}\" --privacy unlisted")


if __name__ == "__main__":
    main()
