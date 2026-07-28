# Skill: create-musclemap-video

Create short-form vertical videos (Reels / Shorts / TikTok) promoting MuscleMap —
the dark-themed fitness tracker at `Index.html`. Videos are 30–60 seconds, portrait
(1080×1920), and end with a CTA to try MuscleMap.

## Quick start

```
bash scripts/create-video.sh --type <TYPE> [--topic "<TOPIC>"]
```

Types: `workout-tip` | `feature-highlight` | `transformation` | `weekly-recap`

## What happens

1. Ollama (`llama3.2`) writes the narration script using the template in
   `config/content-templates/<TYPE>.txt`.
2. `scripts/create-video.py` assembles the video:
   - Dark gradient background matching MuscleMap's `#0a0a0b` palette
   - White Inter-bold text, accent color `#5b8def` for highlights
   - Animated progress bars and muscle diagrams pulled from the app's own CSS
   - Text-to-speech narration via `pyttsx3` (100% local, no API)
   - Beat-synced cuts timed to narration length
3. Output saved to `output/videos/YYYY-MM-DD_<TYPE>.mp4`

## Agent instructions

When asked to create a video, run these steps in order:

### Step 1 — Generate script
```bash
bash scripts/generate-script.sh --type <TYPE> --topic "<TOPIC>"
# Writes: output/scripts/latest.txt
```

### Step 2 — Build video
```bash
python3 scripts/create-video.py \
  --script output/scripts/latest.txt \
  --type <TYPE> \
  --output output/videos/
```

### Step 3 — Review (optional)
Open `output/videos/` in the Orca browser panel to preview before posting.

### Step 4 — Post
```bash
bash scripts/post-to-social.sh --file output/videos/<FILENAME>.mp4 --platforms all
```

## Branding rules

| Token | Value |
|---|---|
| Background | `#0a0a0b` |
| Text primary | `#ededef` |
| Text secondary | `#8b8b96` |
| Accent blue | `#5b8def` |
| Success green | `#30c48a` |
| Font | Inter (system fallback: -apple-system, sans-serif) |

Always end videos with: **"Track every rep. MuscleMap — free in your browser."**

## Dependencies

Run `bash scripts/setup.sh` once to install all dependencies.
