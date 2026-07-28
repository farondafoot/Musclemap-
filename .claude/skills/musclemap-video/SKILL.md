---
name: musclemap-video
description: >
  Make and post MuscleMap short-form videos (YouTube Shorts / Reels / TikTok).
  Use whenever the user asks for a video, a Short, a Reel, a clip, a post about
  a fitness topic, or says things like "make a video about rear delts", "do one
  on rest days", "post that", "make it viral", or "write a caption for it".
  Handles the whole loop: writing the narration, rendering with Remotion,
  showing it for review, then writing a caption and posting through Postiz.
---

# MuscleMap video

Turn one sentence from the user into a finished, posted Short. They should
never have to run a command themselves.

## The loop

**1. They name a topic** — "make a video about rear delts"

Write the narration yourself. Do not use Ollama; it's a 3B model and its copy
is the weak link this whole setup exists to avoid. Voice guide is below.

Render it:

```bash
py scripts/make-video.py --type workout-tip --text "..." --hook "rear delts" --muscles shoulders,back
```

On Linux/mac use `python3` instead of `py`.

Rendering takes several minutes. If you're unsure the copy fits the frame,
render stills first — they take seconds:

```bash
py scripts/preview-frames.py
```

Then read the PNGs in `output/previews/` with the Read tool and check the copy
actually fits before spending minutes on a full render.

**2. Show them the result**

Send the finished mp4 with SendUserFile. Say what the narration is and roughly
how long it runs. Ask if they want changes or want it posted. Don't post
without being asked.

**3. They say "post it"**

Write the captions yourself — again, not Ollama. Write
`output/captions/latest.json`:

```json
{
  "youtube":   "...",
  "instagram": "...",
  "tiktok":    "...",
  "default":   "..."
}
```

Then post:

```bash
py scripts/post-to-postiz.py --file <PATH> --privacy unlisted
```

**Default to `unlisted`.** Only use `--privacy public` when the user explicitly
says public, live, or "send it". Posting publicly is hard to walk back, and
unlisted still produces a real link they can check.

## Narration voice

Six sentences. Each under ten words. This is the format the renderer is tuned
for — one sentence per shot.

- **Open with a specific accusation, not a greeting.** "You've benched 135 for
  eight months." Never "Hey guys" or "Did you know".
- **Be concrete.** Real weights, real timeframes, real exercises. "Face pulls,
  twenty reps" beats "train your rear delts more".
- **Say the uncomfortable thing.** The good scripts point at what people
  actually do wrong, not what a textbook says.
- **Mention MuscleMap once**, in the second-to-last line, tied to what the app
  does for that specific tip.
- **Last line is always exactly:** `Track every rep. MuscleMap, free in your browser.`
- Numbers get auto-accented in the render, so include one where it's honest.

Read `content/scripts/*.json` for 21 worked examples. Match that register.

## Caption voice

Different job from narration — captions fight for the tap.

- First three words are the hook. No "In this video".
- One concrete claim or number.
- 3–5 fitness hashtags, not twenty.
- End with `Try MuscleMap free 💪`
- TikTok under 150 chars; Instagram under 2,200; YouTube can carry more.
- Don't reuse the narration verbatim as the caption.

## Content types

`--type` picks the label shown under the wordmark and the default muscle
groups: `workout-tip`, `feature-highlight`, `transformation`, `weekly-recap`.
Pick whichever fits the topic; ask only if genuinely ambiguous.

## Muscle groups

`--muscles` lights specific groups on the hero shot. Valid values:
`chest`, `shoulders`, `arms`, `abs`, `back`, `glutes`, `quads`, `calves`.
Choose the ones the topic is actually about — that's the visual payoff.

## When something breaks

- **"Remotion isn't installed"** → `cd video && npm install`
- **Render fails** → read the error; it's usually a TypeScript issue in
  `video/src/`. Fix it, don't work around it.
- **Postiz posting fails** → check it's up (`docker ps`), then that
  `config/social.env` has a valid `POSTIZ_API_KEY`. `POSTIZ_SETUP.md` has the
  full setup.
- **Post succeeds but nothing appears** → check `output/post-log.jsonl` and
  `http://localhost:4007/launches`.

Fix problems rather than reporting them back as blockers, unless the fix needs
a decision only the user can make.

## Don't

- Don't use Ollama for narration or captions. That's what this replaces.
- Don't post public unless asked.
- Don't render a full video just to check whether copy fits — use stills.
- Don't claim a video posted without checking the command actually succeeded.
