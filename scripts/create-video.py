#!/usr/bin/env python3
"""
Creates a branded MuscleMap short-form video (1080x1920, ~30-45s).
Fixed for Windows: uses system fonts, capped video length, better visuals.
"""

import argparse
import os
import sys
import textwrap
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import pyttsx3
from moviepy.editor import (
    AudioFileClip,
    ImageClip,
    concatenate_videoclips,
)

# ── Brand tokens ───────────────────────────────────────────────────────────
BG      = (10,  10,  11)
S1      = (20,  20,  24)
ACCENT  = (91,  141, 239)
SUCCESS = (48,  196, 138)
T1      = (237, 237, 239)
T2      = (139, 139, 150)
W, H    = 1080, 1920
FPS     = 30
MAX_SEC = 50   # hard cap — short-form content only


# ── Font loader (Windows / Mac / Linux) ────────────────────────────────────
def load_fonts():
    candidates = {
        "bold": [
            "C:/Windows/Fonts/arialbd.ttf",          # Windows Arial Bold
            "C:/Windows/Fonts/segoeuib.ttf",          # Windows Segoe UI Bold
            "C:/Windows/Fonts/calibrib.ttf",          # Windows Calibri Bold
            "/System/Library/Fonts/Helvetica.ttc",    # Mac
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",  # Linux
        ],
        "regular": [
            "C:/Windows/Fonts/arial.ttf",
            "C:/Windows/Fonts/segoeui.ttf",
            "C:/Windows/Fonts/calibri.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ],
    }

    def first_existing(paths, size):
        for p in paths:
            if os.path.exists(p):
                return ImageFont.truetype(p, size)
        return ImageFont.load_default()

    return {
        "logo":  first_existing(candidates["bold"],    56),
        "body":  first_existing(candidates["bold"],    72),
        "sub":   first_existing(candidates["regular"], 34),
        "cta":   first_existing(candidates["regular"], 30),
    }


# ── Background gradient ────────────────────────────────────────────────────
def make_bg() -> Image.Image:
    img  = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    # Subtle radial feel — slightly lighter centre
    for y in range(H):
        t = y / H
        r = int(BG[0] + (S1[0] - BG[0]) * (1 - abs(t - 0.5) * 2))
        g = int(BG[1] + (S1[1] - BG[1]) * (1 - abs(t - 0.5) * 2))
        b = int(BG[2] + (S1[2] - BG[2]) * (1 - abs(t - 0.5) * 2))
        draw.line([(0, y), (W, y)], fill=(r, g, b))
    # Accent stripe top
    for y in range(8):
        alpha = 1.0 - y / 8
        c = tuple(int(ACCENT[i] * alpha + BG[i] * (1 - alpha)) for i in range(3))
        draw.line([(0, y), (W, y)], fill=c)
    return img


# ── Single card renderer ───────────────────────────────────────────────────
def make_card(text: str, video_type: str, idx: int, total: int,
              fonts: dict, bg: Image.Image) -> Image.Image:
    img  = bg.copy()
    draw = ImageDraw.Draw(img)

    # Logo
    draw.text((60, 80), "MuscleMap", font=fonts["logo"], fill=ACCENT)
    draw.text((60, 148), video_type.replace("-", " ").title(),
              font=fonts["sub"], fill=T2)

    # Divider line
    draw.rectangle([(60, 195), (W - 60, 197)], fill=(40, 40, 48))

    # Body text — wrap at ~16 chars per line for big font
    wrapped = textwrap.fill(text.strip(), width=16)
    lines   = wrapped.split("\n")

    line_h  = 96
    total_h = len(lines) * line_h
    start_y = (H - total_h) // 2 - 60

    for i, line in enumerate(lines):
        y = start_y + i * line_h
        words = line.split()
        x = 60
        for word in words:
            is_number = any(c.isdigit() or c == "%" for c in word)
            colour    = ACCENT if is_number else T1
            draw.text((x, y), word + " ", font=fonts["body"], fill=colour)
            bb = draw.textbbox((x, y), word + " ", font=fonts["body"])
            x += bb[2] - bb[0]

    # Progress bar
    bar_y = H - 200
    draw.rectangle([(60, bar_y), (W - 60, bar_y + 5)], fill=(30, 30, 36))
    prog_w = int((W - 120) * (idx / max(total - 1, 1)))
    draw.rectangle([(60, bar_y), (60 + prog_w, bar_y + 5)], fill=ACCENT)

    # CTA
    draw.text((60, H - 150), "Track every rep. Free in your browser.",
              font=fonts["cta"], fill=T2)

    # Card counter dots
    dot_r = 5
    dot_spacing = 16
    total_dots_w = total * dot_spacing
    dot_x = (W - total_dots_w) // 2
    for i2 in range(total):
        fill = ACCENT if i2 == idx else (50, 50, 60)
        draw.ellipse(
            [(dot_x + i2 * dot_spacing - dot_r, H - 80 - dot_r),
             (dot_x + i2 * dot_spacing + dot_r, H - 80 + dot_r)],
            fill=fill
        )

    return img


# ── TTS ────────────────────────────────────────────────────────────────────
def tts_narrate(text: str, path: str) -> float:
    engine = pyttsx3.init()
    engine.setProperty("rate",   155)
    engine.setProperty("volume", 0.95)
    # prefer a natural-sounding voice
    voices = engine.getProperty("voices")
    for v in voices:
        name = v.name.lower()
        if any(x in name for x in ["david", "mark", "alex", "zira", "hazel"]):
            engine.setProperty("voice", v.id)
            break
    engine.save_to_file(text, path)
    engine.runAndWait()
    clip = AudioFileClip(path)
    dur  = clip.duration
    clip.close()
    return dur


# ── Main ───────────────────────────────────────────────────────────────────
def create_video(script_path: str, video_type: str, output_dir: str) -> str:
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    tmp = Path(output_dir) / ".tmp"
    tmp.mkdir(exist_ok=True)

    with open(script_path, encoding="utf-8") as f:
        script = f.read().strip()

    # Split into sentences and hard-cap length
    raw = [s.strip() for s in script.replace("\n", " ").split(".") if len(s.strip()) > 5]

    # Estimate WPS at 155 WPM → ~2.6 words/sec
    # Cap to MAX_SEC seconds worth of content
    sentences, word_count = [], 0
    for s in raw:
        wc = len(s.split())
        if word_count + wc > MAX_SEC * 2.6:
            break
        sentences.append(s)
        word_count += wc

    if not sentences:
        sentences = raw[:6]   # fallback: take first 6

    print(f"Using {len(sentences)} sentences (~{word_count} words)")

    fonts = load_fonts()
    bg    = make_bg()

    # TTS for full script
    short_script = ". ".join(sentences) + "."
    audio_path   = str(tmp / "narration.wav")
    print("Generating narration...")
    duration = tts_narrate(short_script, audio_path)
    per_card = duration / len(sentences)

    print(f"Building {len(sentences)} cards ({duration:.0f}s)...")
    clips = []
    for i, sentence in enumerate(sentences):
        card = make_card(sentence, video_type, i, len(sentences), fonts, bg)
        p    = str(tmp / f"card_{i:03d}.png")
        card.save(p, quality=95)
        clips.append(ImageClip(p, duration=per_card))

    from moviepy.editor import CompositeVideoClip
    video = concatenate_videoclips(clips, method="compose")
    audio = AudioFileClip(audio_path).subclip(0, video.duration)
    video = video.set_audio(audio)

    date_str = datetime.now().strftime("%Y-%m-%d")
    out_path = str(Path(output_dir) / f"{date_str}_{video_type}.mp4")

    print(f"Rendering {out_path}...")
    video.write_videofile(out_path, fps=FPS, codec="libx264",
                          audio_codec="aac", verbose=False, logger=None)

    import shutil
    shutil.rmtree(tmp, ignore_errors=True)

    (Path(output_dir) / ".last-video-path").write_text(out_path)
    print(f"Done: {out_path}")
    return out_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--script",  required=True)
    parser.add_argument("--type",    required=True)
    parser.add_argument("--output",  default="output/videos")
    args = parser.parse_args()
    create_video(args.script, args.type, args.output)
