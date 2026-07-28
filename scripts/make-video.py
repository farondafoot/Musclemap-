#!/usr/bin/env python3
"""
Renders an Everything AI Daily short with Remotion.

The narration is written by the agent (see the everything-ai-daily skill) and
passed in as JSON or flags — there's no script library, because news is only
worth covering on the day it happens.

Usage:
  python3 scripts/make-video.py --story story.json
  python3 scripts/make-video.py --text "..." --kicker "AI SECURITY" --tone alert

story.json shape:
  {
    "kicker":   "AI SECURITY",
    "tone":     "alert",              # signal | alert | warn | good
    "source":   "OpenAI, Hugging Face, TIME",
    "headline": "An AI hacked another company to cheat on a test.",
    "stat":     {"value": "17,000", "caption": "actions across a swarm of sandboxes"},
    "text":     "Sentence one. Sentence two. ...",
    "cta":      "Follow for the daily AI briefing"
  }
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tts import narrate

ROOT      = Path(__file__).resolve().parent.parent
VIDEO_DIR = ROOT / "video"
OUT_DIR   = ROOT / "output" / "videos"

FPS             = 30
MIN_SHOT_FRAMES = 42   # ~1.4s — below this a line is gone before it can be read
MERGE_UNDER     = 5    # fragments this short get joined to a neighbour
MAX_SHOT_WORDS  = 11   # above this the copy overflows the lower-third block

VALID_TONES = ("signal", "alert", "warn", "good")


def die(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


# ── Shot budget ────────────────────────────────────────────────────────────

def split_sentences(text):
    """
    Split narration into one line per shot.

    News copy is punchy, which yields very short sentences. Giving each its own
    shot produces one-second staccato cuts, so short fragments merge into a
    neighbour — capped so the copy still fits the lower-third block.
    """
    parts = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s.strip()]
    parts = [p for p in parts if len(p) > 3]
    if not parts:
        return []

    def joinable(a, b):
        return len(a.split()) + len(b.split()) <= MAX_SHOT_WORDS

    merged = []
    for part in parts:
        short_part = len(part.split()) < MERGE_UNDER
        short_prev = bool(merged) and len(merged[-1].split()) < MERGE_UNDER
        if merged and (short_part or short_prev) and joinable(merged[-1], part):
            merged[-1] = f"{merged[-1]} {part}"
        else:
            merged.append(part)

    # A trailing fragment has no following neighbour to absorb it
    if len(merged) > 1 and len(merged[-1].split()) < MERGE_UNDER:
        merged[-2] = f"{merged[-2]} {merged.pop()}"

    return merged


def build_content(story, lines, audio_name, seg_seconds):
    """
    Size the shot table.

    When per-line audio durations are available each shot lasts exactly as long
    as its sentence takes to say, so narration and visuals stay locked together.
    Without audio, fall back to a reading-speed estimate.
    """
    has_stat = bool(story.get("stat"))

    brand_open = int(FPS * 2.2)
    hero       = int(FPS * 4.4) if has_stat else 0
    outro      = int(FPS * 3.6)

    if seg_seconds:
        # Narration drives the timing. The floor only guards against a clipped
        # word on very short lines.
        per_line = [max(int(round(s * FPS)), MIN_SHOT_FRAMES) for s in seg_seconds]
    else:
        words     = sum(len(l.split()) for l in lines)
        estimated = max(words / 2.7, 12)
        body      = max(int(estimated * FPS), len(lines) * MIN_SHOT_FRAMES)
        weights   = [max(len(l.split()), 2) for l in lines]
        total_w   = sum(weights)
        per_line  = [max(int(body * w / total_w), MIN_SHOT_FRAMES) for w in weights]

    tone = story.get("tone", "signal")
    if tone not in VALID_TONES:
        die(f"tone must be one of {VALID_TONES}, got '{tone}'")

    return {
        "kicker":    story.get("kicker", "AI NEWS").upper(),
        "date":      story.get("date") or datetime.now().strftime("%b %d %Y").upper(),
        "tone":      tone,
        "source":    story.get("source", ""),
        "headline":  story.get("headline", ""),
        "stat":      story.get("stat"),
        "lines":     lines,
        "audio":     audio_name,
        # Narration covers the line shots only, so it starts after the cold
        # open and the hero stat rather than at frame zero.
        "audioFrom": brand_open + hero,
        "fps":       FPS,
        "brandOpen": brand_open,
        "hero":      hero,
        "outro":     outro,
        "perLine":   per_line,
        "cta":       story.get("cta", "Follow for the daily AI briefing"),
    }


# ── Render ─────────────────────────────────────────────────────────────────

def render(out_file):
    if not (VIDEO_DIR / "node_modules").exists():
        die("Remotion isn't installed. Run:  cd video && npm install")

    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if not npx:
        die("npx not found. Install Node.js from nodejs.org")

    print("Rendering (Remotion renders frame by frame; expect several minutes)...\n")
    result = subprocess.run(
        [npx, "remotion", "render", "src/index.ts", "DailyShort",
         str(out_file), "--concurrency=1"],
        cwd=VIDEO_DIR,
    )
    if result.returncode != 0:
        die("Remotion render failed. See the output above.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--story", help="Path to a story JSON file (preferred)")
    ap.add_argument("--text", help="Narration, if not using --story")
    ap.add_argument("--kicker", default="AI NEWS")
    ap.add_argument("--tone", default="signal", choices=VALID_TONES)
    ap.add_argument("--source", default="")
    ap.add_argument("--headline", default="")
    ap.add_argument("--stat", help="Hero figure, e.g. '17,000'")
    ap.add_argument("--stat-caption", default="")
    ap.add_argument("--slug", default="", help="Filename slug for the output")
    args = ap.parse_args()

    if args.story:
        story = json.loads(Path(args.story).read_text(encoding="utf-8"))
    elif args.text:
        story = {
            "kicker":   args.kicker,
            "tone":     args.tone,
            "source":   args.source,
            "headline": args.headline,
            "text":     args.text,
        }
        if args.stat:
            story["stat"] = {"value": args.stat, "caption": args.stat_caption}
    else:
        die("Pass --story <file.json> or --text \"...\"")

    if not story.get("text", "").strip():
        die("Story has no text.")

    print(f"Kicker: {story.get('kicker')}  tone: {story.get('tone', 'signal')}")
    if story.get("stat"):
        print(f"Stat:   {story['stat']['value']} — {story['stat'].get('caption','')}")
    print()

    lines = split_sentences(story["text"])
    if not lines:
        die("Story text had no usable sentences.")

    audio_name = "narration.wav"
    print("Generating narration...")
    seg_seconds, total_seconds = narrate(lines, VIDEO_DIR / "public" / audio_name)
    if not seg_seconds:
        audio_name = None

    content = build_content(story, lines, audio_name, seg_seconds)
    (VIDEO_DIR / "src" / "content.json").write_text(
        json.dumps(content, indent=2), encoding="utf-8")

    frames = content["brandOpen"] + content["hero"] + sum(content["perLine"]) + content["outro"]
    print(f"{len(content['lines'])} lines, {frames} frames ({frames / FPS:.1f}s)\n")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    slug     = args.slug or re.sub(r"[^a-z0-9]+", "-", story.get("kicker", "news").lower()).strip("-")
    out_file = OUT_DIR / f"{datetime.now():%Y-%m-%d_%H%M}_{slug}.mp4"

    render(out_file)

    if not out_file.exists():
        die("Render reported success but no file was written.")

    (OUT_DIR / ".last-video-path").write_text(str(out_file), encoding="utf-8")
    print(f"\nDone: {out_file}  ({out_file.stat().st_size / 1_000_000:.1f} MB)")


if __name__ == "__main__":
    main()
