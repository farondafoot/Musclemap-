#!/usr/bin/env python3
"""
Posts a video to YouTube Shorts, Instagram Reels, and TikTok.
All platforms have free tiers sufficient for daily posting.
Credentials live in config/social.env — never committed to git.
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv("config/social.env")

LOG_FILE = "output/post-log.jsonl"


def log(platform: str, status: str, url: str = "", error: str = ""):
    Path("output").mkdir(exist_ok=True)
    entry = {
        "ts":       datetime.now(timezone.utc).isoformat(),
        "platform": platform,
        "status":   status,
        "url":      url,
        "error":    error,
    }
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")
    icon = "✓" if status == "ok" else "✗"
    print(f"  [{icon}] {platform}: {url or error}")


# ── YouTube Shorts ──────────────────────────────────────────────────────────

def post_youtube(video_path: str, caption_data: dict) -> bool:
    """Upload via YouTube Data API v3 (free, 10k units/day)."""
    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload

        creds = Credentials(
            token=os.environ["YT_ACCESS_TOKEN"],
            refresh_token=os.environ["YT_REFRESH_TOKEN"],
            token_uri="https://oauth2.googleapis.com/token",
            client_id=os.environ["YT_CLIENT_ID"],
            client_secret=os.environ["YT_CLIENT_SECRET"],
        )
        youtube = build("youtube", "v3", credentials=creds)

        body = {
            "snippet": {
                "title":       "MuscleMap — " + Path(video_path).stem.replace("_", " ").title(),
                "description": caption_data.get("youtube", ""),
                "tags":        ["MuscleMap", "fitness", "workout", "fitnesstracker", "gym"],
                "categoryId":  "17",   # Sports
            },
            "status": {
                "privacyStatus":          "public",
                "selfDeclaredMadeForKids": False,
            },
        }

        media = MediaFileUpload(video_path, mimetype="video/mp4", resumable=True)
        request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)

        response = None
        while response is None:
            _, response = request.next_chunk()

        url = f"https://youtu.be/{response['id']}"
        log("youtube", "ok", url)
        return True

    except Exception as e:
        log("youtube", "failed", error=str(e))
        return False


# ── Instagram Reels ─────────────────────────────────────────────────────────

def post_instagram(video_path: str, caption_data: dict) -> bool:
    """
    Post a Reel via Instagram Graph API (free).
    Requires: Instagram Business account linked to a Facebook Page.
    """
    try:
        token    = os.environ["IG_ACCESS_TOKEN"]
        ig_id    = os.environ["IG_USER_ID"]
        video_url = os.environ.get("IG_VIDEO_HOSTING_URL", "")

        if not video_url:
            log("instagram", "skipped", error="IG_VIDEO_HOSTING_URL not set — upload video to a public URL first")
            return False

        caption = caption_data.get("instagram", "")

        # Step 1: create media container
        r = requests.post(
            f"https://graph.facebook.com/v19.0/{ig_id}/media",
            data={
                "media_type":   "REELS",
                "video_url":    video_url,
                "caption":      caption,
                "share_to_feed": "true",
                "access_token": token,
            },
            timeout=30,
        )
        r.raise_for_status()
        container_id = r.json()["id"]

        # Step 2: wait for processing (up to 2 min)
        for _ in range(12):
            time.sleep(10)
            status_r = requests.get(
                f"https://graph.facebook.com/v19.0/{container_id}",
                params={"fields": "status_code", "access_token": token},
                timeout=15,
            )
            if status_r.json().get("status_code") == "FINISHED":
                break

        # Step 3: publish
        pub_r = requests.post(
            f"https://graph.facebook.com/v19.0/{ig_id}/media_publish",
            data={"creation_id": container_id, "access_token": token},
            timeout=30,
        )
        pub_r.raise_for_status()
        media_id = pub_r.json()["id"]
        log("instagram", "ok", f"https://www.instagram.com/p/{media_id}/")
        return True

    except Exception as e:
        log("instagram", "failed", error=str(e))
        return False


# ── TikTok ──────────────────────────────────────────────────────────────────

def post_tiktok(video_path: str, caption_data: dict) -> bool:
    """Post via TikTok for Developers Content Posting API (free, 100/day)."""
    try:
        token  = os.environ["TIKTOK_ACCESS_TOKEN"]
        caption = caption_data.get("tiktok", "")

        # Init upload
        init_r = requests.post(
            "https://open.tiktokapis.com/v2/post/publish/video/init/",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type":  "application/json; charset=UTF-8",
            },
            json={
                "post_info": {
                    "title":         caption,
                    "privacy_level": "PUBLIC_TO_EVERYONE",
                    "disable_duet":  False,
                    "disable_stitch": False,
                    "disable_comment": False,
                    "video_cover_timestamp_ms": 1000,
                },
                "source_info": {
                    "source":         "FILE_UPLOAD",
                    "video_size":     Path(video_path).stat().st_size,
                    "chunk_size":     10_000_000,
                    "total_chunk_count": 1,
                },
            },
            timeout=30,
        )
        init_r.raise_for_status()
        data      = init_r.json()["data"]
        publish_id = data["publish_id"]
        upload_url = data["upload_url"]

        # Upload chunk
        with open(video_path, "rb") as f:
            video_bytes = f.read()

        upload_r = requests.put(
            upload_url,
            headers={
                "Content-Range": f"bytes 0-{len(video_bytes)-1}/{len(video_bytes)}",
                "Content-Type":  "video/mp4",
            },
            data=video_bytes,
            timeout=120,
        )
        upload_r.raise_for_status()

        log("tiktok", "ok", f"https://www.tiktok.com/ (publish_id: {publish_id})")
        return True

    except Exception as e:
        log("tiktok", "failed", error=str(e))
        return False


# ── Main ────────────────────────────────────────────────────────────────────

PLATFORM_MAP = {
    "youtube":   post_youtube,
    "instagram": post_instagram,
    "tiktok":    post_tiktok,
}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--file",      required=True, help="Path to .mp4 file")
    parser.add_argument("--caption",   default="output/captions/latest.json",
                        help="JSON file with per-platform captions")
    parser.add_argument("--platforms", default="all",
                        help="Comma-separated: youtube,instagram,tiktok or 'all'")
    args = parser.parse_args()

    if not Path(args.file).exists():
        sys.exit(f"Video not found: {args.file}")

    try:
        with open(args.caption) as f:
            captions = json.load(f)
    except Exception:
        captions = {"youtube": "", "instagram": "", "tiktok": ""}

    platforms = list(PLATFORM_MAP.keys()) if args.platforms == "all" \
                else [p.strip() for p in args.platforms.split(",")]

    print(f"\nPosting {Path(args.file).name} to: {', '.join(platforms)}")
    for platform in platforms:
        fn = PLATFORM_MAP.get(platform)
        if fn:
            fn(args.file, captions)
            time.sleep(2)   # be polite between platforms
        else:
            print(f"  Unknown platform: {platform}")

    print(f"\nLog: {LOG_FILE}")
