// 看视频学英语：保存 / 读取视频字幕（由电脑上的浏览器扩展上传，手机网页读取）
//   GET    /.netlify/functions/cap?list=1   → { ok, items:[{v,title,author,n,dur,at}] }
//   GET    /.netlify/functions/cap?v=<ID>   → { ok, v, title, author, cues:[{s,e,t,r}] }
//   POST   /.netlify/functions/cap          → 写入（需要 X-Key）
//   DELETE /.netlify/functions/cap?v=<ID>   → 删除（需要 X-Key）
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";
const KEY_SHA = "c4599543d020223762a97f5ab87a7ce9fb17af6f6128d7bbb05ceb9602b7b45b"; // 同步密钥的 SHA-256，只用来校验写入
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,x-key", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" } });
const authed = req => createHash("sha256").update(req.headers.get("x-key") || "").digest("hex") === KEY_SHA;
const okId = v => /^[\w-]{11}$/.test(v || "");
export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  const store = getStore("captions"), u = new URL(req.url);
  try {
    if (req.method === "GET") {
      if (u.searchParams.get("list")) return json({ ok: true, items: (await store.get("index", { type: "json" })) || [] });
      const v = u.searchParams.get("v"); if (!okId(v)) return json({ ok: false, error: "bad id" }, 400);
      const d = await store.get("v/" + v, { type: "json" });
      return d ? json(Object.assign({ ok: true }, d)) : json({ ok: false, error: "not found" }, 404);
    }
    if (!authed(req)) return json({ ok: false, error: "unauthorized" }, 401);
    let idx = (await store.get("index", { type: "json" })) || [];
    if (req.method === "DELETE") {
      const v = u.searchParams.get("v"); if (!okId(v)) return json({ ok: false, error: "bad id" }, 400);
      await store.delete("v/" + v); idx = idx.filter(x => x.v !== v); await store.setJSON("index", idx);
      return json({ ok: true, n: idx.length });
    }
    if (req.method === "POST") {
      const raw = await req.text(); if (raw.length > 2000000) return json({ ok: false, error: "too large" }, 413);
      const b = JSON.parse(raw); if (!okId(b.v) || !Array.isArray(b.cues) || !b.cues.length) return json({ ok: false, error: "bad body" }, 400);
      const cues = b.cues.slice(0, 6000).map(c => ({ s: +c.s || 0, e: +c.e || 0, t: String(c.t || "").slice(0, 600), r: String(c.r || "").slice(0, 600) })).filter(c => c.t);
      const doc = { v: b.v, title: String(b.title || "").slice(0, 300), author: String(b.author || "").slice(0, 120), lang: String(b.lang || "en").slice(0, 12), tl: String(b.tl || "").slice(0, 12), at: Date.now(), cues };
      await store.setJSON("v/" + b.v, doc);
      const last = cues[cues.length - 1];
      idx = [{ v: doc.v, title: doc.title, author: doc.author, n: cues.length, tr: cues.filter(c => c.r).length, dur: Math.round(last.e || last.s), at: doc.at }].concat(idx.filter(x => x.v !== b.v)).slice(0, 300);
      await store.setJSON("index", idx);
      return json({ ok: true, n: cues.length, total: idx.length });
    }
    return json({ ok: false, error: "method" }, 405);
  } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 500); }
};
