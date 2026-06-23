"""
generate_segments.py — Gemini generates 5 SEGMENTS + auto-detects category.
Reads RAW_TEXT, GEMINI_API_KEY from env.
Outputs JSON to stdout: { "category": "...", "segments": [[text, query], ...] }
"""
import json
import os
import sys
import time

import google.generativeai as genai

raw_text = os.environ["RAW_TEXT"]
genai.configure(api_key=os.environ["GEMINI_API_KEY"])

MODELS = ["gemini-1.5-flash", "gemini-1.5-flash-8b", "gemini-1.0-pro"]

prompt = f"""你是一個短影音腳本編輯，擅長把資訊轉換成口語中文影片腳本。

原始內容：
{raw_text}

任務：
1. 判斷影片類別（從下列選一個最合適的 emoji + 中文標籤）：
   ⛈️ 天氣快報 / 🤖 AI教學 / 📰 新聞摘要 / 🔥 熱門話題 / 📚 知識分享 / 📹 每日快報

2. 生成恰好 5 個段落，每段是 2-3 句口語中文（自然流暢，適合 TTS 朗讀），加上一組英文 Pexels 影片搜尋關鍵字（描述該段畫面場景）。

輸出格式（只輸出 JSON，不要任何其他文字）：
{{
  "category": "⛈️ 天氣快報",
  "segments": [
    ["第一段口語中文，2-3句。", "english pexels query"],
    ["第二段口語中文，2-3句。", "english pexels query"],
    ["第三段口語中文，2-3句。", "english pexels query"],
    ["第四段口語中文，2-3句。", "english pexels query"],
    ["第五段口語中文，2-3句。", "english pexels query"]
  ]
}}"""


def try_generate(model_name: str) -> str:
    model = genai.GenerativeModel(model_name)
    response = model.generate_content(prompt)
    return response.text.strip()


response_text = None
for model_name in MODELS:
    for attempt in range(3):
        try:
            print(f"Trying {model_name} (attempt {attempt+1})...", file=sys.stderr)
            response_text = try_generate(model_name)
            break
        except Exception as e:
            msg = str(e)
            if "429" in msg or "quota" in msg.lower() or "exhausted" in msg.lower():
                wait = 35 * (attempt + 1)
                print(f"Quota exceeded, waiting {wait}s...", file=sys.stderr)
                time.sleep(wait)
            else:
                print(f"Error: {msg}", file=sys.stderr)
                break
    if response_text:
        break

if not response_text:
    print("ERROR: all models failed", file=sys.stderr)
    sys.exit(1)

# strip code fence if present
text = response_text
if text.startswith("```"):
    lines = text.split("\n")
    text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
text = text.strip()

result = json.loads(text)

if "category" not in result or "segments" not in result:
    print("ERROR: missing category or segments", file=sys.stderr)
    sys.exit(1)
if len(result["segments"]) != 5:
    print(f"ERROR: expected 5 segments, got {len(result['segments'])}", file=sys.stderr)
    sys.exit(1)

print(json.dumps(result, ensure_ascii=False))
