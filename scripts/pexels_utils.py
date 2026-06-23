"""Pexels video downloader with used-ID tracking to avoid daily repeats."""

import json
import os
import random
import subprocess
from pathlib import Path

import requests

USED_IDS_FILE = Path(__file__).parent / "used_video_ids.json"
REMOTION_DIR = Path(__file__).parent


def _load_used_ids() -> set[int]:
    if USED_IDS_FILE.exists():
        return set(json.loads(USED_IDS_FILE.read_text()))
    return set()


def _save_used_ids(ids: set[int]) -> None:
    USED_IDS_FILE.write_text(json.dumps(sorted(ids)))


def download_pexels_video(query: str, path: str, orientation: str = "portrait") -> None:
    api_key = os.environ["PEXELS_API_KEY"]
    used_ids = _load_used_ids()

    resp = requests.get(
        "https://api.pexels.com/videos/search",
        params={"query": query, "per_page": 50, "orientation": orientation},
        headers={"Authorization": api_key},
        timeout=15,
    ).json()
    videos = resp.get("videos", [])
    if not videos:
        raise RuntimeError(f"No Pexels results for: {query}")

    fresh = [v for v in videos if v["id"] not in used_ids]
    if not fresh:
        # All used up — reset for this query and use any
        print(f"          ⚠️  [{query[:30]}] 所有影片已用過，重置輪替")
        fresh = videos

    video = random.choice(fresh)
    files = video["video_files"]
    best = max(files, key=lambda f: f.get("width", 0))

    raw_path = path + ".raw.mp4"
    r = requests.get(best["link"], stream=True, timeout=60)
    with open(raw_path, "wb") as fh:
        for chunk in r.iter_content(chunk_size=8192):
            fh.write(chunk)

    subprocess.run(
        ["ffmpeg", "-y", "-i", raw_path,
         "-vcodec", "libx264", "-preset", "fast", "-crf", "23",
         "-vf", "scale=720:-2",
         "-an", path],
        check=True, capture_output=True,
    )
    os.remove(raw_path)

    used_ids.add(video["id"])
    _save_used_ids(used_ids)
    print(f"          ✓ video_id={video['id']} (pool: {len(fresh)} fresh / {len(videos)} total)")
