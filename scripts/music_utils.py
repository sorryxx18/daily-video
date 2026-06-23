"""
music_utils.py — download background music from Jamendo by category keyword.
"""
import os
import random
import requests

JAMENDO_API = "https://api.jamendo.com/v3.0/tracks/"

CATEGORY_QUERIES = {
    "天氣": "weather ambient calm",
    "AI":   "technology electronic background",
    "新聞": "news background corporate",
    "熱門": "upbeat energetic pop",
    "知識": "calm piano acoustic",
}
DEFAULT_QUERY = "news background"


def _query_for_category(category: str) -> str:
    for key, q in CATEGORY_QUERIES.items():
        if key in category:
            return q
    return DEFAULT_QUERY


def download_jamendo_music(category: str, output_path: str) -> bool:
    """
    Search Jamendo for a track matching the video category and download it.
    Returns True on success, False on failure.
    """
    client_id = os.environ.get("JAMENDO_CLIENT_ID")
    if not client_id:
        print("          ⚠️  JAMENDO_CLIENT_ID not set, skipping BGM")
        return False

    query = _query_for_category(category)
    try:
        res = requests.get(
            JAMENDO_API,
            params={
                "client_id": client_id,
                "format": "json",
                "limit": 10,
                "search": query,
                "audioformat": "mp32",
                "order": "popularity_total",
            },
            timeout=15,
        )
        res.raise_for_status()
        tracks = res.json().get("results", [])
        tracks = [t for t in tracks if t.get("audio")]
        if not tracks:
            print(f"          ⚠️  Jamendo: no tracks found for '{query}'")
            return False

        track = random.choice(tracks[:5])
        audio_url = track["audio"]
        print(f"          🎵 BGM: {track['name']} ({track.get('duration', '?')}s)")

        r = requests.get(audio_url, timeout=60, stream=True)
        r.raise_for_status()
        with open(output_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=65536):
                f.write(chunk)
        return True

    except Exception as e:
        print(f"          ⚠️  Jamendo download failed: {e}")
        return False
