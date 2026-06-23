/**
 * Cloudflare Worker — daily-video proxy
 *
 * POST /preview  { raw_text }          → generate segments via Gemini
 * POST /         { segments_json }     → trigger GitHub Actions with segments
 *
 * Secrets: GITHUB_PAT, GEMINI_API_KEY
 */

const REPO = "sorryxx18/daily-video";
const WORKFLOW = "render.yml";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODELS = [
  "gemini-3-flash-preview",
  "gemini-2.5-flash-preview-05-20",
  "gemini-1.5-flash",
];

async function callGemini(apiKey, prompt) {
  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    const data = await res.json();
    if (res.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
      return { ok: true, text: data.candidates[0].content.parts[0].text, model };
    }
    const err = data.error?.message || JSON.stringify(data.error || data);
    if (!err.includes("429") && !err.includes("quota") && !err.includes("RESOURCE_EXHAUSTED")) {
      return { ok: false, error: `${model}: ${err}` };
    }
    // quota exceeded — try next model
  }
  return { ok: false, error: "All models quota exceeded" };
}

function makePrompt(rawText) {
  return `你是一個短影音腳本編輯，擅長把資訊轉換成口語中文影片腳本。

原始內容：
${rawText}

任務：
1. 判斷影片類別（從下列選一個最合適的 emoji + 中文標籤）：
   ⛈️ 天氣快報 / 🤖 AI教學 / 📰 新聞摘要 / 🔥 熱門話題 / 📚 知識分享 / 📹 每日快報

2. 生成恰好 5 個段落，每段是 2-3 句口語中文（自然流暢，適合 TTS 朗讀），加上一組英文 Pexels 影片搜尋關鍵字（描述該段畫面場景）。

輸出格式（只輸出 JSON，不要任何其他文字）：
{
  "category": "⛈️ 天氣快報",
  "segments": [
    ["第一段口語中文，2-3句。", "english pexels query"],
    ["第二段口語中文，2-3句。", "english pexels query"],
    ["第三段口語中文，2-3句。", "english pexels query"],
    ["第四段口語中文，2-3句。", "english pexels query"],
    ["第五段口語中文，2-3句。", "english pexels query"]
  ]
}`;
}

function parseGeminiJSON(text) {
  let t = text.trim();
  if (t.startsWith("```")) {
    const lines = t.split("\n");
    t = lines.slice(1, lines[lines.length - 1].trim() === "```" ? -1 : lines.length).join("\n");
  }
  return JSON.parse(t.trim());
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST") return new Response("POST only", { status: 405, headers: CORS });

    const url = new URL(request.url);
    let body;
    try { body = await request.json(); } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });
    }

    // ── /preview — generate segments ──────────────────────────────────────────
    if (url.pathname === "/preview") {
      const rawText = body.raw_text?.trim();
      if (!rawText || rawText.length < 10) {
        return new Response(JSON.stringify({ error: "raw_text too short" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });
      }

      const result = await callGemini(env.GEMINI_API_KEY, makePrompt(rawText));
      if (!result.ok) {
        return new Response(JSON.stringify({ error: result.error }), { status: 500, headers: { "Content-Type": "application/json", ...CORS } });
      }

      try {
        const parsed = parseGeminiJSON(result.text);
        return new Response(JSON.stringify({ ...parsed, model: result.model }), {
          headers: { "Content-Type": "application/json", ...CORS }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Failed to parse AI response", raw: result.text }), {
          status: 500, headers: { "Content-Type": "application/json", ...CORS }
        });
      }
    }

    // ── / — trigger render ────────────────────────────────────────────────────
    const segmentsJson = body.segments_json;
    const category = body.category || "📹 每日快報";
    if (!segmentsJson) {
      return new Response(JSON.stringify({ error: "segments_json required" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });
    }

    const triggerTime = new Date().toISOString();
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GITHUB_PAT}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "daily-video-worker/2.0",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: { segments_json: segmentsJson, category },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: err }), { status: res.status, headers: { "Content-Type": "application/json", ...CORS } });
    }

    return new Response(JSON.stringify({ triggered: true, trigger_time: triggerTime }), {
      headers: { "Content-Type": "application/json", ...CORS }
    });
  },
};
