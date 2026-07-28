# Skill: nightly-pipeline

Runs the full MuscleMap content pipeline overnight — creates 2–3 videos,
posts them across all platforms, and logs everything. Zero human input required
once set up. Designed to run on a VPS via Orca's scheduled automations.

## What it does (in order)

| Step | Action | Tool |
|---|---|---|
| 1 | Pick today's content type + topic | Ollama (`llama3.2`) |
| 2 | Generate narration script | `scripts/generate-script.sh` |
| 3 | Build the video | `scripts/create-video.py` |
| 4 | Generate platform captions | Ollama |
| 5 | Post to YouTube Shorts, Instagram, TikTok | `scripts/post-to-social.py` |
| 6 | Log results | `output/post-log.jsonl` |
| 7 | Repeat for next video type | (loops 2–3 times) |

## Agent instructions

Run the master pipeline script:

```bash
bash scripts/nightly-pipeline.sh
```

That's it. The script handles the full loop. Check `output/post-log.jsonl`
in the morning to see what posted.

## Content rotation schedule

Ollama rotates through these types so your feed stays varied:

| Day | Video type |
|---|---|
| Mon | Workout tip (exercise form breakdown) |
| Tue | Feature highlight (MuscleMap UI walkthrough) |
| Wed | Workout tip |
| Thu | Weekly muscle-group focus |
| Fri | Transformation motivation |
| Sat | Weekend workout challenge |
| Sun | Weekly recap / what's new |

You can override by setting `CONTENT_TYPE` env var before running:
```bash
CONTENT_TYPE=feature-highlight bash scripts/nightly-pipeline.sh
```

## Orca automation config

This skill is wired to the nightly automation in `.orca/config.yaml`.
Orca will start a new OpenCode worktree each night at 11pm, run this skill,
and report results to your mobile app.

## Monitoring

```bash
tail -f output/post-log.jsonl | python3 -c "
import sys, json
for line in sys.stdin:
    r = json.loads(line)
    print(f\"{r['ts']} [{r['platform']}] {r['status']} — {r.get('url','')}\")
"
```
