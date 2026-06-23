"""
generate_segments.py — Gemini API generates 5 SEGMENTS from raw text.
Reads RAW_TEXT, STYLE, GEMINI_API_KEY from env.
Outputs JSON array to stdout: [[chinese_text, pexels_query], ...]
"""
import json
import os
import sys

import google.generativeai as genai

raw_text = os.environ["RAW_TEXT"]
style = os.environ.get("STYLE", "一般")

genai.configure(api_key=os.environ["GEMINI_API_KEY"])
model = genai.GenerativeModel("gemini-2.0-flash")

prompt = f"""你是一個短影音腳本編輯，擅長把資訊轉換成適合 TTS 朗讀的口語中文腳本。

原始內容：
{raw_text}

影片風格：{style}

任務：生成恰好 5 個段落，每段是 2-3 句口語中文（自然流暢，適合 TTS 朗讀，不要條列格式），加上一組英文 Pexels 影片搜尋關鍵字（描述該段畫面場景）。

輸出格式（只輸出 JSON，不要其他文字）：
[
  ["第一段口語中文，2-3句。", "english pexels search query"],
  ["第二段口語中文，2-3句。", "english pexels search query"],
  ["第三段口語中文，2-3句。", "english pexels search query"],
  ["第四段口語中文，2-3句。", "english pexels search query"],
  ["第五段口語中文，2-3句。", "english pexels search query"]
]"""

response = model.generate_content(prompt)
text = response.text.strip()

# strip code fence if present
if text.startswith("```"):
    lines = text.split("\n")
    text = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
text = text.strip()

segments = json.loads(text)
if len(segments) != 5:
    print(f"ERROR: expected 5 segments, got {len(segments)}", file=sys.stderr)
    sys.exit(1)

print(json.dumps(segments, ensure_ascii=False))
