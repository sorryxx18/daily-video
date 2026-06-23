"""
render.py — Renders a video from SEGMENTS_JSON env var.
Reads SEGMENTS_JSON (from generate_segments.py output), PEXELS_API_KEY.
Outputs to output/video.mp4, then compresses to output/video-compressed.mp4.
"""
import asyncio
import json
import os
import shutil
import glob
import subprocess
import sys
from pathlib import Path

import edge_tts

SCRIPT_DIR = Path(__file__).parent.parent  # repo root
TMP = Path("/tmp/daily-video-render")
TMP.mkdir(exist_ok=True)
PUBLIC_DIR = SCRIPT_DIR / "public"
PUBLIC_DIR.mkdir(exist_ok=True)
OUTPUT_DIR = SCRIPT_DIR / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

VOICE = "zh-TW-HsiaoChenNeural"
CATEGORY = os.environ.get("CATEGORY", "📹 每日快報")
OUTPUT = OUTPUT_DIR / "video.mp4"
OUTPUT_COMPRESSED = OUTPUT_DIR / "video-compressed.mp4"

segments_raw = os.environ["SEGMENTS_JSON"]
SEGMENTS: list[list[str]] = json.loads(segments_raw)

sys.path.insert(0, str(SCRIPT_DIR / "scripts"))
from pexels_utils import download_pexels_video


async def generate_tts(text: str, path: str) -> float:
    communicate = edge_tts.Communicate(text, voice=VOICE)
    await communicate.save(path)
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", path],
        capture_output=True, text=True, check=True,
    )
    return float(json.loads(result.stdout)["format"]["duration"])


def concat_audio(audio_paths: list, output_path: str) -> None:
    list_file = str(TMP / "concat_list.txt")
    with open(list_file, "w") as fh:
        for p in audio_paths:
            fh.write(f"file '{p}'\n")
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_file, "-c", "copy", output_path],
        check=True, capture_output=True,
    )


async def main() -> None:
    print(f"📝 {len(SEGMENTS)} 個段落，開始生成...")

    audio_paths = []
    bg_names = []
    subtitles = []
    current_time = 0.0

    for i, (text, query) in enumerate(SEGMENTS):
        print(f"[{i+1}/{len(SEGMENTS)}] TTS: {text[:30]}...")
        audio_path = str(TMP / f"seg_{i:02d}.mp3")
        duration = await generate_tts(text, audio_path)
        audio_paths.append(audio_path)

        subtitles.append({
            "startSec": round(current_time, 3),
            "endSec": round(current_time + duration, 3),
            "text": text,
        })
        current_time += duration

        user_photos = glob.glob(str(PUBLIC_DIR / f"user_bg_{i:02d}.*"))
        image_exts = {'.jpg', '.jpeg', '.png', '.webp'}
        user_photo = next((p for p in user_photos if os.path.splitext(p)[1].lower() in image_exts), None)
        if user_photo:
            bg_ext = os.path.splitext(user_photo)[1].lower()
            bg_name = f"user_bg_{i:02d}{bg_ext}"
            print(f"          📷 使用用戶照片: {bg_name}")
        else:
            print(f"          Pexels [{query[:40]}]...")
            bg_tmp = str(TMP / f"bg_{i:02d}.mp4")
            download_pexels_video(query, bg_tmp)
            bg_name = f"bg_{i:02d}.mp4"
            shutil.copy(bg_tmp, PUBLIC_DIR / bg_name)
        bg_names.append(bg_name)
        print(f"          ✓ {duration:.1f}s  累計: {current_time:.1f}s")

    print("🔗 合併音軌...")
    full_audio = str(TMP / "tts_full.mp3")
    concat_audio(audio_paths, full_audio)
    shutil.copy(full_audio, PUBLIC_DIR / "tts.mp3")

    props = {
        "subtitles": subtitles,
        "audioSrc": "tts.mp3",
        "bgVideoSrcs": bg_names,
        "durationInSeconds": round(current_time + 0.5, 2),
        "category": CATEGORY,
    }

    print(f"🎬 Remotion 渲染中... (總時長 {current_time:.1f}s)")
    subprocess.run(
        ["bunx", "remotion", "render", "VideoSkill", str(OUTPUT),
         "--props", json.dumps(props), "--concurrency", "4"],
        check=True, cwd=str(SCRIPT_DIR),
    )
    print(f"✅ 原始: {OUTPUT} ({OUTPUT.stat().st_size // 1024 // 1024}MB)")

    print("🗜 壓縮中...")
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(OUTPUT),
         "-vcodec", "libx264", "-crf", "28", "-preset", "fast",
         "-vf", "scale=720:-2", "-acodec", "aac", "-b:a", "96k",
         str(OUTPUT_COMPRESSED)],
        check=True,
    )
    print(f"✅ 壓縮後: {OUTPUT_COMPRESSED} ({OUTPUT_COMPRESSED.stat().st_size // 1024 // 1024}MB)")


if __name__ == "__main__":
    asyncio.run(main())
