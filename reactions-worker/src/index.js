// Reactions API — a tiny Cloudflare Worker backing the emoji reactions bar on
// samuelomilo.com. Stores per-post counts in a KV namespace. Anonymous, no auth.
//
// Endpoints (all under /reactions):
//   GET  /reactions?slug=<post>            -> { slug, counts: { "❤️": 3, ... } }
//   POST /reactions  { slug, emoji }       -> increments one count, returns counts
//
// Keep ALLOWED_EMOJIS in sync with `params.reactions.emojis` in hugo.yml.

const ALLOWED_EMOJIS = ["❤️", "🔥", "👏"];

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/reactions") {
      return json({ error: "not found" }, 404, cors);
    }

    if (request.method === "GET") {
      const slug = cleanSlug(url.searchParams.get("slug"));
      if (!slug) return json({ error: "missing slug" }, 400, cors);
      return json({ slug, counts: await readCounts(env, slug) }, 200, cors);
    }

    if (request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad json" }, 400, cors);
      }
      const slug = cleanSlug(body && body.slug);
      const emoji = body && body.emoji;
      const delta = body && body.op === "remove" ? -1 : 1;
      if (!slug) return json({ error: "missing slug" }, 400, cors);
      if (!ALLOWED_EMOJIS.includes(emoji)) {
        return json({ error: "invalid emoji" }, 400, cors);
      }
      // Read-modify-write. KV is eventually consistent, so simultaneous writes
      // to the SAME post can lose an update — acceptable for a personal blog.
      const counts = await readCounts(env, slug);
      counts[emoji] = Math.max(0, (counts[emoji] || 0) + delta);
      await env.REACTIONS.put(keyFor(slug), JSON.stringify(counts));
      return json({ slug, counts }, 200, cors);
    }

    return json({ error: "method not allowed" }, 405, cors);
  },
};

function keyFor(slug) {
  return `reactions:${slug}`;
}

async function readCounts(env, slug) {
  const raw = await env.REACTIONS.get(keyFor(slug));
  return raw ? JSON.parse(raw) : {};
}

function cleanSlug(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 200);
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
