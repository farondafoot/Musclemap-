#!/usr/bin/env python3
"""
Narration for Everything AI Daily.

Synthesizes each line as its own clip and reports per-line durations, so the
renderer can give every shot exactly as long as its sentence takes to say.
Distributing shot time by word-count guesswork drifts out of sync within a few
lines.

Engines, in order of preference:
  1. Piper  — local neural TTS, clearly the best of the three
  2. pyttsx3 — OS voices (SAPI5 on Windows, NSSpeech on macOS)
  3. silent  — render without narration rather than failing

Piper setup (once):
    pip install piper-tts
    python3 -m piper.download_voices en_US-ryan-high
Put the resulting .onnx next to it in video/voices/, or set PIPER_VOICE.
"""

import os
import struct
import wave
from pathlib import Path

ROOT       = Path(__file__).resolve().parent.parent
VOICES_DIR = ROOT / "video" / "voices"
GAP_S      = 0.28   # breath between lines; also keeps cuts off the word boundary


def _find_piper_voice():
    """Locate a Piper .onnx voice: PIPER_VOICE, video/voices/, then cwd."""
    env = os.environ.get("PIPER_VOICE")
    if env and Path(env).exists():
        return Path(env)

    for directory in (VOICES_DIR, Path.cwd()):
        if directory.exists():
            found = sorted(directory.glob("*.onnx"))
            if found:
                return found[0]
    return None


def _concat_wavs(clips, out_path, gap_s=GAP_S):
    """Join clips into one wav with silence between. Returns total seconds."""
    if not clips:
        return 0.0

    with wave.open(str(clips[0]), "rb") as first:
        params = first.getparams()

    gap_frames = int(params.framerate * gap_s)
    silence    = b"\x00" * (gap_frames * params.sampwidth * params.nchannels)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out_path), "wb") as out:
        out.setparams(params)
        for i, clip in enumerate(clips):
            with wave.open(str(clip), "rb") as w:
                out.writeframes(w.readframes(w.getnframes()))
            if i < len(clips) - 1:
                out.writeframes(silence)

    with wave.open(str(out_path), "rb") as w:
        return w.getnframes() / float(w.getframerate())


def _duration(path):
    with wave.open(str(path), "rb") as w:
        return w.getnframes() / float(w.getframerate())


def synth_piper(lines, out_path, tmp_dir):
    voice_path = _find_piper_voice()
    if not voice_path:
        return None

    try:
        from piper import PiperVoice
    except ImportError:
        return None

    try:
        voice = PiperVoice.load(str(voice_path))
    except Exception as e:
        print(f"  piper: couldn't load {voice_path.name} ({e})")
        return None

    tmp_dir.mkdir(parents=True, exist_ok=True)
    clips, durations = [], []

    for i, line in enumerate(lines):
        clip = tmp_dir / f"line_{i:02d}.wav"
        with wave.open(str(clip), "wb") as w:
            voice.synthesize_wav(line, w)
        clips.append(clip)
        durations.append(_duration(clip) + GAP_S)

    total = _concat_wavs(clips, out_path)
    for clip in clips:
        clip.unlink(missing_ok=True)

    print(f"  piper ({voice_path.stem}): {total:.1f}s")
    return durations, total


def synth_pyttsx3(lines, out_path, tmp_dir):
    try:
        import pyttsx3
    except ImportError:
        return None

    try:
        engine = pyttsx3.init()
        engine.setProperty("rate", 162)
        engine.setProperty("volume", 0.95)
        for v in engine.getProperty("voices"):
            if any(n in v.name.lower() for n in ("david", "mark", "alex", "zira", "hazel")):
                engine.setProperty("voice", v.id)
                break

        tmp_dir.mkdir(parents=True, exist_ok=True)
        clips, durations = [], []

        for i, line in enumerate(lines):
            clip = tmp_dir / f"line_{i:02d}.wav"
            engine.save_to_file(line, str(clip))
            engine.runAndWait()
            if not clip.exists() or clip.stat().st_size == 0:
                return None
            clips.append(clip)
            durations.append(_duration(clip) + GAP_S)

        total = _concat_wavs(clips, out_path)
        for clip in clips:
            clip.unlink(missing_ok=True)

        print(f"  pyttsx3: {total:.1f}s")
        return durations, total
    except Exception as e:
        print(f"  pyttsx3 failed: {e}")
        return None


def narrate(lines, out_path, tmp_dir=None):
    """
    Synthesize `lines` into one wav.

    Returns (per_line_seconds, total_seconds), or (None, None) if every engine
    is unavailable — callers render silent rather than failing.
    """
    out_path = Path(out_path)
    tmp_dir  = Path(tmp_dir or out_path.parent / ".tts")

    for engine in (synth_piper, synth_pyttsx3):
        result = engine(lines, out_path, tmp_dir)
        if result:
            return result

    print("  no TTS engine available — rendering silent")
    return None, None


if __name__ == "__main__":
    import sys
    demo = sys.argv[1:] or ["This is a test.", "The second line is longer than the first."]
    per, total = narrate(demo, Path("out.wav"))
    print(f"per-line: {per}\ntotal: {total}")
