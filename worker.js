/**
 * Cloudflare Worker — daily-video proxy
 *
 * POST /preview  { raw_text }          → generate segments via Gemini
 * POST /assign   { segments, photos }  → AI photo-to-segment assignment via Gemini Vision
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

    // ── /assign — AI photo assignment via Gemini Vision ───────────────────────
    if (url.pathname === "/assign") {
      const segments = body.segments;
      const photos = body.photos;
      if (!segments || !photos || photos.length === 0) {
        return new Response(JSON.stringify({ error: "segments and photos required" }), {
          status: 400, headers: { "Content-Type": "application/json", ...CORS },
        });
      }

      const segmentText = segments.map((s, i) => `${i}: ${s[0]}`).join("\n");
      const parts = [
        {
          text: `以下有 ${photos.length} 張照片（編號 0 到 ${photos.length - 1}）和 5 個影片段落。請為每個段落（0 到 4）選出最合適的照片編號。照片可重複使用。\n\n段落：\n${segmentText}\n\n只輸出 JSON，格式：{"0":數字,"1":數字,"2":數字,"3":數字,"4":數字}`,
        },
        ...photos.map((p) => ({
          inline_data: {
            mime_type: `image/${p.ext === "jpg" ? "jpeg" : p.ext}`,
            data: p.data.includes(",") ? p.data.split(",")[1] : p.data,
          },
        })),
      ];

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;
      const geminiRes = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts }] }),
      });
      const geminiData = await geminiRes.json();
      const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!geminiRes.ok || !text) {
        return new Response(
          JSON.stringify({ error: geminiData.error?.message || "Gemini Vision failed" }),
          { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
        );
      }

      try {
        const assignments = parseGeminiJSON(text);
        return new Response(JSON.stringify({ assignments }), {
          headers: { "Content-Type": "application/json", ...CORS },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Failed to parse AI assignments", raw: text }), {
          status: 500, headers: { "Content-Type": "application/json", ...CORS },
        });
      }
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
    const photos = body.photos || [];
    if (!segmentsJson) {
      return new Response(JSON.stringify({ error: "segments_json required" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });
    }

    // Commit user photos to repo before triggering Actions
    if (photos.length > 0) {
      for (const photo of photos) {
        const { index, data, ext } = photo;
        const path = `public/user_bg_${String(index).padStart(2, "0")}.${ext}`;
        const base64 = data.includes(",") ? data.split(",")[1] : data;

        // GET existing sha to avoid 422 conflict on update
        let sha;
        const getRes = await fetch(
          `https://api.github.com/repos/${REPO}/contents/${path}`,
          {
            headers: {
              Authorization: `Bearer ${env.GITHUB_PAT}`,
              Accept: "application/vnd.github+json",
              "User-Agent": "daily-video-worker/2.0",
            },
          }
        );
        if (getRes.ok) {
          const existing = await getRes.json();
          sha = existing.sha;
        }

        const putBody = {
          message: `upload user photo seg ${index} (${new Date().toISOString()})`,
          content: base64,
          committer: { name: "daily-video-worker", email: "worker@daily-video" },
        };
        if (sha) putBody.sha = sha;

        const putRes = await fetch(
          `https://api.github.com/repos/${REPO}/contents/${path}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${env.GITHUB_PAT}`,
              Accept: "application/vnd.github+json",
              "Content-Type": "application/json",
              "User-Agent": "daily-video-worker/2.0",
            },
            body: JSON.stringify(putBody),
          }
        );

        if (!putRes.ok) {
          const err = await putRes.text();
          return new Response(JSON.stringify({ error: `Failed to commit photo ${index}: ${err}` }), {
            status: 500, headers: { "Content-Type": "application/json", ...CORS },
          });
        }
      }
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
