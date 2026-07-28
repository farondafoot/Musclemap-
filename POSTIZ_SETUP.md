# Postiz Setup — posting without Google Cloud Console

Postiz is a self-hosted, open-source social scheduler (AGPL-3.0, ~32k stars).
Your pipeline posts to every connected channel with a single API key.

## What self-hosting does and doesn't save you

**It does not skip the developer consoles.** Postiz Cloud has OAuth apps
pre-registered, but a self-hosted instance cannot use them — the OAuth redirect
URI has to point at *your* address, so each provider needs its own app
registered by you. YouTube still means Google Cloud Console. Provider setup
guides live at <https://docs.postiz.com/providers/>.

**What it does save**, and why it's still worth running:

- Token refresh is handled — no re-authing dead credentials every few weeks
- One upload fans out to every platform; no per-network posting code
- Instagram needs no public video-hosting URL, since Postiz stores the file
- Scheduling, retries, and a queue UI you can actually inspect

The OAuth setup is one-time per platform. Everything after is one API call.

---

## 1. Install Docker Desktop

Download from <https://www.docker.com/products/docker-desktop/>, install, launch
it, and wait for the whale icon in your system tray to go steady. Verify:

```powershell
docker --version
```

## 2. Get the official compose file

Postiz's services and env vars change between releases, so pull the compose file
from their repo rather than pinning a copy here:

```powershell
cd $HOME
git clone https://github.com/gitroomhq/postiz-docker-compose
cd postiz-docker-compose
```

Open `postiz.env` in that folder and set these. `DATABASE_URL` and `REDIS_URL`
already point at the bundled Postgres/Redis containers — leave them alone.

| Variable | Value for local use |
|---|---|
| `FRONTEND_URL` | `http://localhost:4007` |
| `NEXT_PUBLIC_BACKEND_URL` | `http://localhost:4007/api` |
| `BACKEND_INTERNAL_URL` | `http://localhost:3000` |
| `JWT_SECRET` | any long random string |

`FRONTEND_URL` and `NEXT_PUBLIC_BACKEND_URL` are what your *browser* uses;
`BACKEND_INTERNAL_URL` is how the frontend container reaches the backend inside
Docker's network, which is why it stays on port 3000.

Then start it:

```powershell
docker compose up -d
```

First boot pulls a few GB and takes a couple of minutes. Check progress with
`docker compose logs -f`.

## 3. Create your account

Open <http://localhost:4007>. Register — the first account on a fresh
self-hosted instance is the owner. There's no email confirmation step locally.

## 4. Register an OAuth app per platform

Each provider needs its own app, and its credentials go in `postiz.env`
before the "Add Channel" button will work. Restart with
`docker compose up -d` after editing.

### YouTube

1. <https://console.cloud.google.com> → new project
2. **APIs & Services → Library** → enable **YouTube Data API v3**,
   **YouTube Analytics API**, and **YouTube Reporting API**
3. **OAuth consent screen** → External → add yourself as a **Test user**
   (required — the connect flow fails without it)
4. **Credentials → Create Credentials → OAuth client ID → Web application**
5. Authorized redirect URI — must match the port your browser uses:
   ```
   http://localhost:4007/integrations/social/youtube
   ```
   Adding the `:5000` variant too is harmless and covers the default compose
   port mapping.
6. Put the result in `postiz.env`:
   ```
   YOUTUBE_CLIENT_ID=...
   YOUTUBE_CLIENT_SECRET=...
   ```

Then **Add Channel → YouTube** in the Postiz UI.

### Platform constraints worth knowing up front

These come from the platforms, not from Postiz:

- **Instagram** only accepts API posts to a **Business or Creator** account
  linked to a Facebook Page. Personal accounts cannot connect. Switch it in the
  Instagram app under Settings → Account type.
- **TikTok** keeps unapproved apps in sandbox, where posts arrive as private
  drafts until TikTok reviews the app. Uploads still work; you publish from the
  app until approval lands.

## 5. Copy your API key

In Postiz: **Settings → Public API → Generate**. Copy the key.

Then in this repo:

```powershell
Copy-Item config\social.env.example config\social.env
notepad config\social.env
```

Fill in:

```
POSTIZ_URL=http://localhost:4007/api
POSTIZ_API_KEY=<the key you just copied>
```

`POSTIZ_URL` must match `NEXT_PUBLIC_BACKEND_URL` from step 2 — the script
appends `/public/v1` to it. If posting returns 404, that value is wrong; check
it against your Postiz `.env`.

## 6. Test it

```powershell
py scripts\post-to-postiz.py --file output\videos\2026-07-28_workout-tip.mp4
```

It lists your connected channels, uploads the video once, and posts to all of
them. Watch it land at <http://localhost:4007/launches>.

Useful flags:

```powershell
# One platform only
py scripts\post-to-postiz.py --file <video> --channels youtube

# Schedule 30 minutes out instead of posting immediately
py scripts\post-to-postiz.py --file <video> --when 30
```

---

## Running it overnight

Docker Desktop must be running for Postiz to accept posts, so the nightly
pipeline needs your machine awake. Two options:

- **Local:** leave the PC on with sleep disabled, and let Orca's 11pm automation
  fire. Simplest, costs nothing.
- **VPS:** run the same compose file on a cheap Linux box (2GB RAM, 2 vCPU is
  Postiz's tested minimum) so it posts whether or not your PC is on. Set
  `MAIN_URL` to that server's address instead of localhost.

## Limits

- Uploads cap at **50 MB** per file. Your ~30s videos land well under that.
- Post creation is rate limited to **90 requests/hour** — far above 2-3 videos
  a night.
