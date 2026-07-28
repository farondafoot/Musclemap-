#!/usr/bin/env python3
"""
Posts a MuscleMap video to every connected social channel via Postiz.

Why Postiz instead of the raw platform APIs:
  - One API key instead of three separate OAuth apps
  - No Google Cloud Console, no Facebook Developer app, no TikTok dev portal
  - No public video-hosting URL needed (Postiz stores the upload)
  - You connect accounts by clicking "Connect" in the Postiz web UI

Setup:
  1. Run Postiz (see POSTIZ_SETUP.md)
  2. Connect your YouTube / Instagram / TikTok accounts in its UI
  3. Settings -> Public API -> copy the key into config/social.env as POSTIZ_API_KEY
"""

import argparse
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv("config/social.env")
except ImportError:
    # Minimal fallback so the script runs without python-dotenv installed
    _env = Path("config/social.env")
    if _env.exists():
        for _line in _env.read_text(encoding="utf-8").splitlines():
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _, _v = _line.partition("=")
                os.environ.setdefault(_k.strip(), _v.strip())

API_KEY  = os.environ.get("POSTIZ_API_KEY", "").strip()
BASE_URL = os.environ.get("POSTIZ_URL", "http://localhost:5000").rstrip("/")
API_BASE = f"{BASE_URL}/public/v1"
LOG_FILE = "output/post-log.jsonl"

# Postiz settings.__type per platform. Only channels whose provider appears
# here get a tailored settings block; anything else posts with defaults.
PLATFORM_SETTINGS = {
    "youtube":   {"__type": "youtube",   "title": "", "type": "public"},
    "instagram": {"__type": "instagram", "post_type": "reel"},
    # (privacy for YouTube is overridden per-run by --privacy)
    "tiktok": {
        "__type":              "tiktok",
        "privacy_level":       "PUBLIC_TO_EVERYONE",
        "disable_comment":     False,
        "disable_duet":        False,
        "disable_stitch":      False,
        "brand_content_toggle": False,
        "brand_organic_toggle": False,
        "content_posting_method": "DIRECT_POST",
    },
}


def log(platform, status, url="", error=""):
    Path("output").mkdir(exist_ok=True)
    entry = {
        "ts":       datetime.now(timezone.utc).isoformat(),
        "platform": platform,
        "status":   status,
        "url":      url,
        "error":    error,
    }
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")
    print(f"  [{'ok' if status == 'ok' else 'xx'}] {platform}: {url or error}")


def api(method, path, body=None, raw=None, content_type=None):
    """Call the Postiz API. Returns parsed JSON."""
    headers = {"Authorization": API_KEY}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    else:
        data = raw
        if content_type:
            headers["Content-Type"] = content_type

    req = urllib.request.Request(f"{API_BASE}{path}", data=data,
                                 headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            text = resp.read().decode()
            return json.loads(text) if text.strip() else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:400]
        raise RuntimeError(f"HTTP {e.code} on {method} {path}: {detail}") from None
    except urllib.error.URLError as e:
        raise RuntimeError(
            f"Cannot reach Postiz at {BASE_URL} — is it running? ({e.reason})"
        ) from None


def upload_video(video_path):
    """Upload the .mp4 to Postiz. Returns the media object {id, path}."""
    path = Path(video_path)
    size_mb = path.stat().st_size / 1_000_000
    if size_mb > 50:
        raise RuntimeError(f"{path.name} is {size_mb:.0f}MB — Postiz caps uploads at 50MB")

    boundary = uuid.uuid4().hex
    mime = mimetypes.guess_type(path.name)[0] or "video/mp4"

    body = b"".join([
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="file"; filename="{path.name}"\r\n'.encode(),
        f"Content-Type: {mime}\r\n\r\n".encode(),
        path.read_bytes(),
        f"\r\n--{boundary}--\r\n".encode(),
    ])

    print(f"Uploading {path.name} ({size_mb:.1f}MB)...")
    return api("POST", "/upload", raw=body,
               content_type=f"multipart/form-data; boundary={boundary}")


def get_channels():
    """
    List connected social accounts.

    Postiz returns {"value": [...], "Count": n}. Older/other builds have been
    seen returning a bare list or an "integrations" key, so accept all shapes
    rather than depending on one.
    """
    result = api("GET", "/integrations")
    if isinstance(result, list):
        channels = result
    else:
        channels = []
        for key in ("value", "integrations", "data"):
            if isinstance(result.get(key), list):
                channels = result[key]
                break
    # Disabled channels will reject posts; don't bother sending to them.
    return [c for c in channels if not c.get("disabled")]


def provider_of(channel):
    """
    The platform name for a channel, e.g. "youtube".

    Postiz calls this `identifier`; some responses use `providerIdentifier`
    or `provider`, so check each in turn.
    """
    for key in ("identifier", "providerIdentifier", "provider"):
        value = channel.get(key)
        if value:
            return str(value).lower()
    return ""


def build_post(channel, media, captions, video_name, privacy="public"):
    """Build one entry in the `posts` array for a single channel."""
    provider = provider_of(channel)
    caption  = captions.get(provider) or captions.get("default") or ""

    settings = dict(PLATFORM_SETTINGS.get(provider, {}))
    if provider == "youtube":
        settings["title"] = f"MuscleMap — {video_name}"[:95]
        settings["type"]  = privacy
    elif provider == "tiktok" and privacy != "public":
        # TikTok's equivalent of unlisted/private
        settings["privacy_level"] = "SELF_ONLY"

    return {
        "integration": {"id": channel["id"]},
        "value": [{
            "content": caption,
            "image":   [{"id": media["id"], "path": media["path"]}],
        }],
        "settings": settings,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True, help="Path to the .mp4")
    parser.add_argument("--caption", default="output/captions/latest.json")
    parser.add_argument("--channels", default="all",
                        help="Comma-separated provider names, or 'all'")
    parser.add_argument("--when", default="now",
                        help="'now' or minutes from now, e.g. '30'")
    parser.add_argument("--privacy", default="public",
                        choices=["public", "unlisted", "private"],
                        help="Visibility on upload. Use 'unlisted' to check a "
                             "video on the platform before anyone sees it.")
    args = parser.parse_args()

    if not API_KEY:
        sys.exit("POSTIZ_API_KEY is not set in config/social.env.\n"
                 "Get it from Postiz -> Settings -> Public API.")

    video = Path(args.file)
    if not video.exists():
        sys.exit(f"Video not found: {video}")

    # Captions — generated by Ollama, falls back to a sane default
    try:
        captions = json.loads(Path(args.caption).read_text(encoding="utf-8"))
    except Exception:
        captions = {}
    captions.setdefault("default", "New MuscleMap workout drop. Track every rep — free in your browser. #fitness #gym #workout")

    # 1. Which channels are connected?
    print(f"Connecting to Postiz at {BASE_URL}...")
    channels = get_channels()
    if not channels:
        sys.exit("No channels connected. Open Postiz and click 'Add Channel' first.")

    if args.channels != "all":
        wanted  = {c.strip().lower() for c in args.channels.split(",")}
        channels = [
            c for c in channels
            if provider_of(c) in wanted
        ]
        if not channels:
            sys.exit(f"None of the connected channels match: {args.channels}")

    names = [f"{c.get('name', '?')} ({provider_of(c) or '?'})" for c in channels]
    print(f"Posting to {len(channels)} channel(s): {', '.join(names)}")

    # 2. Upload the video once — all channels reference the same media
    media = upload_video(video)
    print(f"Uploaded: {media['path']}")

    # 3. Schedule
    if args.when == "now":
        post_type = "now"
        when = datetime.now(timezone.utc)
    else:
        post_type = "schedule"
        when = datetime.now(timezone.utc) + timedelta(minutes=int(args.when))

    video_name = video.stem.replace("_", " ").replace("-", " ").title()
    payload = {
        "type":      post_type,
        "date":      when.isoformat(),
        "shortLink": False,
        "tags":      [],
        "posts":     [build_post(c, media, captions, video_name, args.privacy)
                      for c in channels],
    }

    print(f"Creating post ({post_type}, {args.privacy})...")
    try:
        result = api("POST", "/posts", body=payload)
        for c in channels:
            log(provider_of(c) or "unknown", "ok", f"{BASE_URL}/launches")
        print(f"\nDone. Check {BASE_URL}/launches to see it.")
        if isinstance(result, dict) and result:
            print(f"Response: {json.dumps(result)[:300]}")
    except RuntimeError as e:
        for c in channels:
            log(provider_of(c) or "unknown", "failed", error=str(e))
        sys.exit(f"\nPost failed: {e}")


if __name__ == "__main__":
    main()
