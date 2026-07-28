# Skill: post-to-social

Auto-post MuscleMap videos to YouTube Shorts, Instagram Reels, and TikTok.
All posting is done via official free-tier APIs — no paid services.

## Quick start

```bash
python3 scripts/post-to-social.py \
  --file output/videos/<FILENAME>.mp4 \
  --platforms youtube,instagram,tiktok \
  --caption-style auto          # Ollama writes the caption
```

## Platform setup (one-time)

Copy `config/social.env.example` → `config/social.env` and fill in your keys.
**Never commit `social.env` — it's in `.gitignore`.**

| Platform | What you need | Free tier limit |
|---|---|---|
| YouTube | Google Cloud project, OAuth2 credentials | 10,000 units/day |
| Instagram | Facebook Developer App, Instagram Business account | 200 calls/hour |
| TikTok | TikTok for Developers app | 100 videos/day |

## Agent instructions

### Step 1 — Generate caption
```bash
bash scripts/generate-script.sh --mode caption --video-file <FILE>
# Ollama reads the video title/type and writes platform-optimised captions
# Output: output/captions/latest.json  (keys: youtube, instagram, tiktok)
```

### Step 2 — Post to all platforms
```bash
python3 scripts/post-to-social.py \
  --file <VIDEO_FILE> \
  --caption output/captions/latest.json \
  --platforms all
```

### Step 3 — Log result
Results are appended to `output/post-log.jsonl` with timestamp, platform,
post ID, and URL. Check this file to confirm success.

## Caption style guide (Ollama prompt)

The content model (`llama3.2`) is instructed to:
- Open with a hook in the first 3 words (no "Hey guys!")
- Include 3–5 relevant fitness hashtags
- End with "Try MuscleMap free 💪" on its own line
- Keep it under 150 chars for TikTok, 2,200 for Instagram

## Error handling

If a platform post fails, the script retries once after 30 seconds, then logs
the error to `output/post-log.jsonl` with `status: failed`. The nightly
pipeline will skip failed platforms and continue to the next.
