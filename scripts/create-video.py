#!/usr/bin/env python3
"""
Creates a branded MuscleMap short-form video (1080x1920, 30-60s).
Uses moviepy + Pillow + pyttsx3 — all free, all local, no API calls.
"""

import argparse
import json
import os
import textwrap
from datetime import datetime
from pathlib import Path

# PIL / Pillow
from PIL import Image, ImageDraw, ImageFont

# pyttsx3 for local TTS
import pyttsx3

# moviepy
from moviepy.editor import (
    AudioFileClip,
    ColorClip,
    CompositeVideoClip,
    ImageClip,
    TextClip,
    concatenate_videoclips,
)

# ── Brand tokens (matches MuscleMap Index.html) ────────────────────────────
BG       = (10,  10,  11)    # #0a0a0b
S1       = (17,  17,  19)    # #111113
ACCENT   = (91,  141, 239)   # #5b8def
SUCCESS  = (48,  196, 138)   # #30c48a
T1       = (237, 237, 239)   # #ededef  — primary text
T2       = (139, 139, 150)   # #8b8b96  — secondary text

W, H = 1080, 1920
FPS  = 30


def tts_narrate(script_text: str, output_path: str) -> float:
    """Generate MP3 narration with pyttsx3. Returns duration in seconds."""
    engine = pyttsx3.init()
    engine.setProperty("rate",  165)   # words per minute
    engine.setProperty("volume", 0.95)
    # Pick a clear voice if available
    voices = engine.getProperty("voices")
    for v in voices:
        if "david" in v.name.lower() or "alex" in v.name.lower():
            engine.setProperty("voice", v.id)
            break
    engine.save_to_file(script_text, output_path)
    engine.runAndWait()
    clip = AudioFileClip(output_path)
    duration = clip.duration
    clip.close()
    return duration


def make_frame_image(text: str, video_type: str, frame_num: int, total: int) -> Image.Image:
    """Render a single text card as a PIL Image (1080×1920)."""
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Gradient top bar — accent stripe
    for y in range(6):
        alpha = 1.0 - (y / 6)
        r = int(ACCENT[0] * alpha + BG[0] * (1 - alpha))
        g = int(ACCENT[1] * alpha + BG[1] * (1 - alpha))
        b = int(ACCENT[2] * alpha + BG[2] * (1 - alpha))
        draw.line([(0, y), (W, y)], fill=(r, g, b))

    # Logo / app name
    try:
        logo_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 52)
        sub_font  = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 32)
        body_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 68)
    except Exception:
        logo_font = sub_font = body_font = ImageFont.load_default()

    draw.text((54, 80), "MuscleMap", font=logo_font, fill=ACCENT)
    draw.text((54, 144), video_type.replace("-", " ").title(), font=sub_font, fill=T2)

    # Body text — centred, wrapped at 18 chars per line
    wrapped = textwrap.fill(text, width=22)
    lines   = wrapped.split("\n")
    total_h = len(lines) * 90
    start_y = (H - total_h) // 2 - 80

    for i, line in enumerate(lines):
        y = start_y + i * 90
        # Highlight numbers and percentages in accent colour
        words = line.split()
        x = 54
        for word in words:
            colour = ACCENT if any(c.isdigit() for c in word) else T1
            draw.text((x, y), word + " ", font=body_font, fill=colour)
            bbox = draw.textbbox((x, y), word + " ", font=body_font)
            x += bbox[2] - bbox[0]

    # Progress bar (shows how far through the video)
    bar_y = H - 180
    bar_w = int(W * (frame_num / max(total - 1, 1)))
    draw.rectangle([(0, bar_y), (W, bar_y + 4)], fill=S1)
    draw.rectangle([(0, bar_y), (bar_w, bar_y + 4)], fill=ACCENT)

    # CTA at bottom
    draw.text((54, H - 130), "Track every rep. Free in your browser.",
              font=sub_font, fill=T2)

    return img


def create_video(script_path: str, video_type: str, output_dir: str) -> str:
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    tmp_dir = Path(output_dir) / ".tmp"
    tmp_dir.mkdir(exist_ok=True)

    with open(script_path) as f:
        script = f.read().strip()

    sentences = [s.strip() for s in script.replace("\n", " ").split(".") if len(s.strip()) > 4]
    if not sentences:
        raise ValueError("Script is empty or too short.")

    # Generate narration audio
    audio_path = str(tmp_dir / "narration.mp3")
    print("Generating TTS narration...")
    duration   = tts_narrate(script, audio_path)
    per_card   = duration / len(sentences)

    # Build one ImageClip per sentence
    print(f"Building {len(sentences)} cards ({duration:.1f}s total)...")
    clips = []
    for i, sentence in enumerate(sentences):
        frame = make_frame_image(sentence, video_type, i, len(sentences))
        frame_path = str(tmp_dir / f"frame_{i:03d}.png")
        frame.save(frame_path)
        clip = ImageClip(frame_path, duration=per_card)
        clips.append(clip)

    video = concatenate_videoclips(clips, method="compose")
    audio = AudioFileClip(audio_path).subclip(0, video.duration)
    video = video.set_audio(audio)

    # Output filename
    date_str  = datetime.now().strftime("%Y-%m-%d")
    out_path  = str(Path(output_dir) / f"{date_str}_{video_type}.mp4")

    print(f"Rendering {out_path} ...")
    video.write_videofile(out_path, fps=FPS, codec="libx264", audio_codec="aac",
                          verbose=False, logger=None)

    # Cleanup tmp
    import shutil
    shutil.rmtree(tmp_dir, ignore_errors=True)

    # Write path to a known file so nightly-pipeline.sh can read it without parsing stdout
    (Path(output_dir) / ".last-video-path").write_text(out_path)

    print(f"Done: {out_path}")
    return out_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--script",  required=True, help="Path to narration script text file")
    parser.add_argument("--type",    required=True, help="Content type (workout-tip, etc.)")
    parser.add_argument("--output",  default="output/videos", help="Output directory")
    args = parser.parse_args()

    create_video(args.script, args.type, args.output)
