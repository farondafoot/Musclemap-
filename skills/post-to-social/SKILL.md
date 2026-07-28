# Skill: post-to-social

Auto-post MuscleMap videos to YouTube Shorts, Instagram Reels, and TikTok
through **Postiz** — a self-hosted open-source scheduler.

Postiz owns the OAuth apps for every platform, so there is no Google Cloud
Console, Facebook Developer app, or TikTok dev portal to configure. You connect
each account by clicking "Connect" in the Postiz web UI once, then everything
posts with a single API key.

First-time setup: **see `POSTIZ_SETUP.md` in the repo root.**

## Quick start

```bash
python3 scripts/post-to-postiz.py --file output/videos/<FILENAME>.mp4
```

That uploads the video once and posts it to every connected channel.

## Agent instructions

### Step 1 — Generate captions
```bash
MODE=caption VIDEO_FILE="<VIDEO_PATH>" \
  bash scripts/generate-script.sh --type <TYPE> --mode caption
```
Ollama writes per-platform captions to `output/captions/latest.json` with keys
`youtube`, `instagram`, `tiktok` — these match Postiz's provider identifiers, so
each channel gets its own copy automatically. A `default` key covers any channel
without a specific caption.

### Step 2 — Post
```bash
python3 scripts/post-to-postiz.py \
  --file <VIDEO_PATH> \
  --caption output/captions/latest.json \
  --channels all
```

### Step 3 — Confirm
Results append to `output/post-log.jsonl` (timestamp, platform, status, error).
The live queue is at `http://localhost:4007/launches`.

## Flags

| Flag | Purpose |
|---|---|
| `--file` | Path to the `.mp4` (required) |
| `--caption` | Caption JSON (default: `output/captions/latest.json`) |
| `--channels` | `all`, or comma-separated e.g. `youtube,tiktok` |
| `--when` | `now` (default) or minutes to delay, e.g. `30` |

## Caption style guide

The content model is instructed to:
- Open with a hook in the first 3 words — no "Hey guys"
- Include 3–5 fitness hashtags
- End with "Try MuscleMap free 💪"
- Stay under 150 chars for TikTok, 2,200 for Instagram

## Failure behaviour

If Postiz is unreachable or a channel rejects the post, the script logs the
error to `output/post-log.jsonl` and exits non-zero. The nightly pipeline logs a
warning and continues to the next video rather than aborting the run.

Two platform-side constraints worth knowing, independent of Postiz:
- **Instagram** only accepts API posts to a Business/Creator account.
- **TikTok** holds posts from unapproved apps as private drafts until review.
