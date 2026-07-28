#!/usr/bin/env python3
"""
Renders a handful of stills from the current video/src/content.json.

Stills take seconds; a full video takes minutes. Use this to check copy fit and
composition before committing to a render.

  python3 scripts/preview-frames.py
  python3 scripts/preview-frames.py --frames 40,300,780
"""

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT      = Path(__file__).resolve().parent.parent
VIDEO_DIR = ROOT / "video"
OUT_DIR   = ROOT / "output" / "previews"


def shot_midpoints():
    """Middle frame of the opening, each narration line, and the sign-off."""
    content = json.loads((VIDEO_DIR / "src" / "content.json").read_text(encoding="utf-8"))

    marks, cursor = [], 0
    for name, dur in [("brand", content["brandOpen"]), ("hero", content["hero"])]:
        marks.append((name, cursor + dur // 2))
        cursor += dur

    for i, dur in enumerate(content["perLine"]):
        marks.append((f"line{i + 1}", cursor + dur // 2))
        cursor += dur

    marks.append(("outro", cursor + content["outro"] // 2))
    return marks


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", help="Comma-separated absolute frame numbers")
    args = ap.parse_args()

    if not (VIDEO_DIR / "node_modules").exists():
        sys.exit("Remotion isn't installed. Run:  cd video && npm install")

    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if not npx:
        sys.exit("npx not found. Install Node.js from nodejs.org")

    marks = ([(f"f{f.strip()}", int(f)) for f in args.frames.split(",")]
             if args.frames else shot_midpoints())

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("*.png"):
        old.unlink()

    print(f"Rendering {len(marks)} preview frames...\n")
    written = []

    for name, frame in marks:
        out = OUT_DIR / f"{name}.png"
        result = subprocess.run(
            [npx, "remotion", "still", "src/index.ts", "DailyShort",
             str(out), f"--frame={frame}"],
            cwd=VIDEO_DIR, capture_output=True, text=True,
        )
        if result.returncode == 0 and out.exists():
            print(f"  {name:8} frame {frame}")
            written.append(out)
        else:
            print(f"  {name:8} FAILED: {result.stderr.strip()[:160]}")

    print(f"\n{len(written)} frames in {OUT_DIR}")


if __name__ == "__main__":
    main()
