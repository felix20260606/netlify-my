// Cloudflare Pages 版的视频字幕接口（原 netlify/functions/cap.mjs，数据存在 KV，绑定名 CAPTIONS）
// 路径沿用 /.netlify/functions/cap，这样网页、书签小工具、浏览器扩展都不用改接口地址；/api/cap 是同一个接口
//   GET    ?list=1   → { ok, items:[{v,title,author,n,tr,dur,at}] }
//   GET    ?v=<ID>   → { ok, v, title, author, cues:[{s,e,t,r}] }
//   POST             → 写入（需要 X-Key）
//   DELETE ?v=<ID>   → 删除（需要 X-Key）
//   POST   ?migrate=1 → 从旧的 Netlify 站点搬字幕过来，每次最多 20 个（需要 X-Key）
const KEY_SHA = "c4599543d020223762a97f5ab87a7ce9fb17af6f6128d7bbb05ceb9602b7b45b"; // 同步密钥的 SHA-256，只用来校验写入
const OLD_API = "https://ruilearning-my.netlify.app/.netlify/functions/cap";
const API_PATHS = ["/.netlify/functions/cap", "/api/cap"];
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,x-key", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" } });
const sha256 = async s => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, "0")).join("");
const authed = async req => (await sha256(req.headers.get("x-key") || "")) === KEY_SHA;
const okId = v => /^[\w-]{11}$/.test(v || "");
// 列表信息放在每条记录的 metadata 里（上限 1024 字节，所以这里把标题、作者截短；完整标题在记录正文里）
const meta = d => { const last = d.cues[d.cues.length - 1]; return { title: [...d.title].slice(0, 100).join(""), author: [...d.author].slice(0, 50).join(""), n: d.cues.length, tr: d.cues.filter(c => c.r).length, dur: Math.round(last.e || last.s), at: d.at }; };
const clean = (b, at) => ({ v: b.v, title: String(b.title || "").slice(0, 300), author: String(b.author || "").slice(0, 120), lang: String(b.lang || "en").slice(0, 12), tl: String(b.tl || "").slice(0, 12), at: at || Date.now(), cues: b.cues.slice(0, 6000).map(c => ({ s: +c.s || 0, e: +c.e || 0, t: String(c.t || "").slice(0, 600), r: String(c.r || "").slice(0, 600) })).filter(c => c.t) });
const put = (kv, d) => kv.put("v/" + d.v, JSON.stringify(d), { metadata: meta(d) });
async function listAll(kv) {
  const out = []; let cursor;
  do { const r = await kv.list({ prefix: "v/", cursor }); for (const k of r.keys) out.push(Object.assign({ v: k.name.slice(2) }, k.metadata || {})); cursor = r.list_complete ? null : r.cursor; } while (cursor);
  return out.sort((a, b) => (b.at || 0) - (a.at || 0));
}

async function cap(req, env, u) {
  if (req.method === "OPTIONS") return json({ ok: true });
  const kv = env.CAPTIONS;
  if (!kv) return json({ ok: false, error: "KV binding CAPTIONS is missing" }, 500);
  try {
    if (req.method === "GET") {
      if (u.searchParams.get("list")) return json({ ok: true, items: (await listAll(kv)).slice(0, 300) });
      const v = u.searchParams.get("v"); if (!okId(v)) return json({ ok: false, error: "bad id" }, 400);
      const d = await kv.get("v/" + v, "json");
      return d ? json(Object.assign({ ok: true }, d)) : json({ ok: false, error: "not found" }, 404);
    }
    if (!(await authed(req))) return json({ ok: false, error: "unauthorized" }, 401);
    if (req.method === "DELETE") {
      const v = u.searchParams.get("v"); if (!okId(v)) return json({ ok: false, error: "bad id" }, 400);
      await kv.delete("v/" + v);
      return json({ ok: true });
    }
    if (req.method === "POST" && u.searchParams.get("migrate")) {
      const src = await (await fetch(OLD_API + "?list=1")).json();
      if (!src || !src.ok) return json({ ok: false, error: "old site unavailable" }, 502);
      const have = new Set((await listAll(kv)).map(x => x.v));
      const todo = src.items.filter(x => okId(x.v) && !have.has(x.v));
      let moved = 0; const failed = [];
      for (const it of todo.slice(0, 20)) {
        try { const d = await (await fetch(OLD_API + "?v=" + it.v)).json(); if (!d || !d.ok || !Array.isArray(d.cues) || !d.cues.length) throw new Error("bad doc"); const doc = clean(d, d.at || it.at); if (!doc.cues.length) throw new Error("no cues"); await put(kv, doc); moved++; }
        catch (e) { failed.push(it.v); }
      }
      return json({ ok: true, source: src.items.length, moved, failed, left: todo.length - moved - failed.length });
    }
    if (req.method === "POST") {
      const raw = await req.text(); if (raw.length > 2000000) return json({ ok: false, error: "too large" }, 413);
      const b = JSON.parse(raw); if (!okId(b.v) || !Array.isArray(b.cues) || !b.cues.length) return json({ ok: false, error: "bad body" }, 400);
      const doc = clean(b); if (!doc.cues.length) return json({ ok: false, error: "bad body" }, 400);
      await put(kv, doc);
      return json({ ok: true, n: doc.cues.length });
    }
    return json({ ok: false, error: "method" }, 405);
  } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 500); }
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (API_PATHS.includes(u.pathname)) return cap(req, env, u);
    return env.ASSETS.fetch(req);
  }
};
