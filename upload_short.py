#!/usr/bin/env python3
"""
Upload a video to YouTube Shorts.

Usage:
  python upload_short.py --video path/to/video.mp4 [--title "..." --description "..."]

First-time setup:
  1. Go to https://console.cloud.google.com
  2. Create a project → Enable "YouTube Data API v3"
  3. APIs & Services → Credentials → Create OAuth client ID → Desktop app
  4. Download the JSON → save as client_secrets.json next to this script
  5. Run the script — a browser will open for one-time auth
  6. Token saved to token.json for all future runs (no browser needed again)
"""

import argparse
import os
import sys
import json
import time
import http.client
import httplib2

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
SECRETS_FILE = os.path.join(os.path.dirname(__file__), "client_secrets.json")
TOKEN_FILE = os.path.join(os.path.dirname(__file__), "token.json")

RETRIABLE_STATUS_CODES = {500, 502, 503, 504}
MAX_RETRIES = 10


def get_authenticated_service():
    creds = None

    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(SECRETS_FILE):
                print(f"\nERROR: {SECRETS_FILE} not found.")
                print("Download your OAuth credentials from Google Cloud Console")
                print("and save them as client_secrets.json next to this script.\n")
                sys.exit(1)
            flow = InstalledAppFlow.from_client_secrets_file(SECRETS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)

        with open(TOKEN_FILE, "w") as f:
            f.write(creds.to_json())
        print("Token saved to token.json")

    return build("youtube", "v3", credentials=creds)


def upload_video(youtube, video_path, title, description, tags, category_id="28"):
    # Add #Shorts to description so YouTube classifies it as a Short
    shorts_desc = description.rstrip() + "\n\n#Shorts #AI #Tech"
    if "#Shorts" not in tags:
        tags = tags + ["Shorts", "AI", "Tech"]

    body = {
        "snippet": {
            "title": title,
            "description": shorts_desc,
            "tags": tags,
            "categoryId": category_id,  # 28 = Science & Technology
            "defaultLanguage": "en",
        },
        "status": {
            "privacyStatus": "public",   # Change to "private" to review before publishing
            "selfDeclaredMadeForKids": False,
        },
    }

    media = MediaFileUpload(
        video_path,
        mimetype="video/mp4",
        resumable=True,
        chunksize=1024 * 1024,  # 1 MB chunks
    )

    insert_request = youtube.videos().insert(
        part=",".join(body.keys()),
        body=body,
        media_body=media,
    )

    print(f"\nUploading: {os.path.basename(video_path)}")
    print(f"Title: {title}")
    file_size = os.path.getsize(video_path)
    print(f"Size: {file_size / 1024 / 1024:.1f} MB\n")

    response = None
    retry = 0
    while response is None:
        try:
            status, response = insert_request.next_chunk()
            if status:
                pct = int(status.progress() * 100)
                bar = "█" * (pct // 5) + "░" * (20 - pct // 5)
                print(f"\r  [{bar}] {pct}%", end="", flush=True)
        except HttpError as e:
            if e.resp.status in RETRIABLE_STATUS_CODES:
                retry += 1
                if retry > MAX_RETRIES:
                    print(f"\nUpload failed after {MAX_RETRIES} retries: {e}")
                    sys.exit(1)
                wait = 2 ** retry
                print(f"\nRetriable error ({e.resp.status}), retrying in {wait}s...")
                time.sleep(wait)
            else:
                raise
        except (http.client.HTTPException, httplib2.HttpLib2Error) as e:
            retry += 1
            if retry > MAX_RETRIES:
                print(f"\nNetwork error after {MAX_RETRIES} retries: {e}")
                sys.exit(1)
            wait = 2 ** retry
            print(f"\nNetwork error, retrying in {wait}s...")
            time.sleep(wait)

    print()  # newline after progress bar
    video_id = response["id"]
    url = f"https://youtube.com/shorts/{video_id}"
    print(f"\nUploaded successfully!")
    print(f"Video ID : {video_id}")
    print(f"Short URL: {url}")
    return video_id, url


def main():
    parser = argparse.ArgumentParser(description="Upload a video to YouTube Shorts")
    parser.add_argument("--video", required=True, help="Path to the .mp4 file")
    parser.add_argument(
        "--title",
        default="AI news you missed this week",
        help="Video title (max 100 chars)",
    )
    parser.add_argument(
        "--description",
        default="Daily AI drops — follow for more.",
        help="Video description",
    )
    parser.add_argument(
        "--tags",
        default="AI,artificial intelligence,tech news,OpenAI,Anthropic,Claude",
        help="Comma-separated tags",
    )
    parser.add_argument(
        "--private",
        action="store_true",
        help="Upload as private (review before publishing)",
    )
    args = parser.parse_args()

    if not os.path.exists(args.video):
        print(f"ERROR: Video file not found: {args.video}")
        sys.exit(1)

    tags = [t.strip() for t in args.tags.split(",") if t.strip()]

    youtube = get_authenticated_service()
    upload_video(youtube, args.video, args.title, args.description, tags)


if __name__ == "__main__":
    main()
