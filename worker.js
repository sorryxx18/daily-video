/**
 * Cloudflare Worker — daily-video trigger proxy
 * Stores GITHUB_PAT as a secret env var.
 * POST { raw_text: string } → triggers GitHub Actions → returns { run_search_time }
 *
 * Deploy:
 *   npx wrangler deploy worker.js --name daily-video-trigger
 *   npx wrangler secret put GITHUB_PAT
 */

const REPO = "sorryxx18/daily-video";
const WORKFLOW = "render.yml";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type" };

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== "POST") {
      return new Response("POST only", { status: 405, headers: CORS });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400, headers: CORS });
    }

    const rawText = body.raw_text;
    if (!rawText || rawText.trim().length < 10) {
      return new Response(JSON.stringify({ error: "raw_text too short" }), {
        status: 400, headers: { "Content-Type": "application/json", ...CORS }
      });
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
          "User-Agent": "daily-video-worker/1.0",
        },
        body: JSON.stringify({ ref: "main", inputs: { raw_text: rawText } }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: err }), {
        status: res.status, headers: { "Content-Type": "application/json", ...CORS }
      });
    }

    return new Response(JSON.stringify({ triggered: true, trigger_time: triggerTime }), {
      status: 200, headers: { "Content-Type": "application/json", ...CORS }
    });
  },
};
