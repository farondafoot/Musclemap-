# Voiceover setup

The renderer narrates with a local neural TTS. No API, no per-video cost.

## Piper (recommended)

Piper is a local neural text-to-speech engine. It sounds markedly better than
the built-in Windows SAPI5 voices, which are the fallback.

```powershell
py -m pip install piper-tts
```

Then download a voice and put it in `video\voices\`:

```powershell
cd video
mkdir voices
cd voices
py -m piper.download_voices en_US-ryan-high
cd ..\..
```

That's it. `make-video.py` finds any `.onnx` in `video/voices/` automatically.

The voice file is ~120 MB and is gitignored — download it once per machine
rather than committing it.

### Choosing a voice

Browse samples at <https://rhasspy.github.io/piper-samples/>. Any `en_US` voice
works; swap the name in the download command. Some worth trying for a news
read:

| Voice | Character |
|---|---|
| `en_US-ryan-high` | Measured male read. Default here. |
| `en_US-lessac-high` | Warmer, slightly softer |
| `en_US-joe-medium` | Faster, more casual |
| `en_GB-alan-medium` | British male |

To use a voice stored elsewhere, set `PIPER_VOICE` to its full path.

## Fallbacks

If Piper isn't installed, narration falls back automatically:

1. **Piper** — best quality
2. **pyttsx3** — OS voices. Works out of the box on Windows (SAPI5) and macOS.
   On Linux it needs `espeak-ng`, which sounds robotic.
3. **Silent** — the video still renders, just without narration. The pipeline
   warns rather than failing, so a missing voice never costs you a render.

## How timing works

Each sentence is synthesized as its own clip and measured, then its shot is
sized to that exact duration. So the visuals stay locked to the voice no matter
how long a given line takes to say.

Narration starts after the cold open and the hero stat — those two shots play
against the visuals alone, which gives the number a beat to land.

## Checking the audio

```powershell
ffprobe -v error -show_entries stream=codec_type,codec_name -of default=nw=1 output\videos\<FILE>.mp4
```

Two streams (`video` and `audio`) means narration is embedded. One means it
rendered silent — check the TTS warnings in the render output.
