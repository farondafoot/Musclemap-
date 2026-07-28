---
name: everything-ai-daily
description: >
  Research, script, render and post daily AI-news shorts for the Everything AI
  Daily channel (YouTube Shorts / Reels / TikTok). Use whenever the user asks
  for a video, a Short, today's AI news, "what happened in AI today", "make one
  about <company/model>", "post it", or "write a caption". Covers the whole
  loop: researching the story, verifying it, writing the narration, rendering
  with Remotion, showing it for review, then captioning and posting via Postiz.
---

# Everything AI Daily

The channel covers day-to-day AI news. Every video starts with real reporting,
not a topic guess. The user should only have to say what they want covered —
or nothing at all, and get the day's best story.

## The loop

### 1. Research first — always

Never write narration from memory. Model knowledge is stale and this is a news
channel; being wrong is the one unrecoverable mistake.

- `WebSearch` for the last 24–48 hours. Try a few angles: model releases,
  funding, security, regulation, research results.
- Pick the story with genuine tension — conflict, a surprising number, a
  reversal. "Company ships model" is weak unless something about it is strange.
- **Corroborate before scripting.** Get a second independent source, and prefer
  primary ones: the company's own post, the research paper, the filing. If only
  one outlet has it, either say so in the script or pick another story.
- Note the source names. They go on screen.

If the user names a topic, research that. If they don't, bring the strongest
story you found and say why you picked it.

### 2. Write the story JSON

Write to `output/story.json`:

```json
{
  "kicker":   "AI SECURITY",
  "tone":     "alert",
  "source":   "OpenAI, Hugging Face, TIME",
  "headline": "An AI hacked another company to cheat on a test.",
  "stat":     {"value": "17,000", "caption": "actions across a swarm of sandboxes"},
  "text":     "Sentence one. Sentence two. ...",
  "cta":      "Follow for the daily AI briefing"
}
```

`tone` sets the whole colour scheme, so match it to the story:

| tone | colour | use for |
|---|---|---|
| `signal` | cyan | default, launches, research |
| `alert` | rose | breaches, failures, lawsuits, safety |
| `warn` | amber | funding, regulation, policy |
| `good` | green | genuine wins, open-source releases |

`stat` is the single number the story turns on — it counts up on the hero shot
and it's the most memorable second of the video. Pick a real, checkable figure.
Omit `stat` entirely if the story has no honest number; the hero shot is skipped.

### 3. Render

```bash
py scripts/make-video.py --story output/story.json --slug openai-huggingface
```

Use `python3` on Linux/mac. Takes several minutes — Remotion renders frame by
frame in a browser.

Unsure the copy fits? Render stills first; they take seconds:

```bash
py scripts/preview-frames.py
```

Then Read the PNGs in `output/previews/` and check before spending the minutes.

### 4. Show it

Send the mp4 with SendUserFile. Say what the story is, the sources, and roughly
how long it runs. Ask whether to change anything or post. **Never post
unprompted.**

### 5. Post when asked

Write the captions yourself into `output/captions/latest.json`:

```json
{"youtube": "...", "instagram": "...", "tiktok": "...", "default": "..."}
```

```bash
py scripts/post-to-postiz.py --file <PATH> --privacy unlisted
```

Default to `unlisted`. Only use `--privacy public` when the user explicitly says
public, live, or "send it".

## Narration voice

Five to seven sentences, each under about eleven words — one sentence per shot.

- **Open with the strangest true fact**, stated flat. "OpenAI was testing a
  model on a cybersecurity benchmark." Then turn it. No "Today we're looking
  at", no "You won't believe".
- **Lead with the concrete.** Names, numbers, dates. "Nine days passed" beats
  "it took a while".
- **One idea per sentence.** The renderer gives each its own shot.
- **Let the facts carry it.** The OpenAI story needs no adjectives — a model
  escaped its sandbox to cheat on a test. Reaching for "shocking" or "insane"
  makes it sound less credible, not more.
- **Don't editorialise beyond the reporting.** If something is alleged or
  single-sourced, say so.

## Caption voice

- First three words are the hook. No "In this video".
- Include the one number.
- 3–5 hashtags: `#AI #OpenAI #TechNews` style, not twenty.
- TikTok under 150 chars; Instagram under 2,200; YouTube can take more.
- Don't paste the narration in as the caption.

## When something breaks

- **"Remotion isn't installed"** → `cd video && npm install`
- **Render fails** → read the error; usually TypeScript in `video/src/`. Fix it.
- **Posting fails** → check Postiz is up (`docker ps`), then `POSTIZ_API_KEY` in
  `config/social.env`. Full setup is in `POSTIZ_SETUP.md`.
- **Silent video** → pyttsx3 needs a system voice; Windows SAPI5 works out of
  the box, Linux needs `espeak-ng`. The renderer falls back to silent rather
  than failing.

Fix problems rather than handing them back, unless the fix needs a decision
only the user can make.

## Don't

- Don't script from memory. Research every time.
- Don't run a story on one source without saying it's single-sourced.
- Don't post public unless asked.
- Don't render a full video just to check copy fit — use stills.
- Don't claim something posted without checking the command succeeded.
