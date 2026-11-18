// 网站后台接口（Cloudflare Pages），数据存在 KV，绑定名 CAPTIONS
//
// 一、视频字幕 /.netlify/functions/cap（沿用 Netlify 时期的路径；/api/cap 是同一个接口）
//   GET    ?list=1   → { ok, items:[{v,title,author,n,tr,dur,at}] }
//   GET    ?v=<ID>   → { ok, v, title, author, cues:[{s,e,t,r}] }
//   POST             → 写入（需要 X-Key）
//   DELETE ?v=<ID>   → 删除（需要 X-Key）
//   POST   ?migrate=1 → 从旧的 Netlify 站点搬字幕过来，每次最多 20 个（需要 X-Key）
//
// 二、生词本 /api/vocab（2026-11-18 从 JSONBin 搬来；整份存在 KV 的 "vocab" 这一条里）
//   GET              → { ok, custom, progress, deleted, pending }   读取不需要口令
//   POST {state}     → 和云端合并后保存，返回合并结果 { ok, state }（需要 X-Key）
//   POST {add:[词条]} → 加入完整词条：从待整理队列和已删除列表里移除同名词（插件用；需要 X-Key）
// 写入口令只在服务器上存 SHA-256 指纹；网页源码里没有口令，每台设备第一次同步时输入一次
const KEY_SHA = "947d04a67b6309d28e86acd947f64e86145130b89ebb580fc6a157db9748c299"; // 同步口令的 SHA-256，只用来校验写入（字幕和生词本共用）
const OLD_API = "https://ruilearning-my.netlify.app/.netlify/functions/cap";
const API_PATHS = ["/.netlify/functions/cap", "/api/cap"], VOCAB_PATH = "/api/vocab", VOCAB_KEY = "vocab";
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

// ---------- 生词本 ----------
const vdef = () => ({ custom: [], progress: {}, deleted: [], pending: [] });
const vnorm = s => ({ custom: Array.isArray(s && s.custom) ? s.custom : [], progress: s && s.progress && typeof s.progress === "object" && !Array.isArray(s.progress) ? s.progress : {}, deleted: Array.isArray(s && s.deleted) ? s.deleted : [], pending: Array.isArray(s && s.pending) ? s.pending : [] });
// 和网页里的 mergeState 一样：两份取并集；同一个 id 以 b 为准；删除会传播
function vmerge(a, b) {
  a = vnorm(a); b = vnorm(b);
  const byId = {};
  a.custom.forEach(e => { if (e && e.id) byId[e.id] = e; });
  b.custom.forEach(e => { if (e && e.id) byId[e.id] = e; });
  const deleted = Array.from(new Set([...a.deleted, ...b.deleted]));
  const del = new Set(deleted);
  const custom = Object.values(byId).filter(e => !del.has(e.id));
  const progress = Object.assign({}, a.progress, b.progress);
  const pend = {}; [...a.pending, ...b.pending].forEach(w => { if (w) pend[(w + "").toLowerCase()] = w; });
  return { custom, progress, deleted, pending: Object.values(pend) };
}
// 和插件原来的 cloudAdd 一样：同名词已存在就跳过；加入时从待整理队列、已删除列表里去掉
function vadd(d, entries) {
  d = vnorm(d); let n = 0;
  for (const e of entries) {
    if (!e || !e.id || !e.word) continue;
    const lw = String(e.word).toLowerCase();
    d.pending = d.pending.filter(w => (w + "").toLowerCase() !== lw);
    d.deleted = d.deleted.filter(x => x !== e.id);
    if (d.custom.some(x => x && (x.id === e.id || (x.word || "").toLowerCase() === lw))) continue;
    d.custom.push(e); n++;
  }
  return { d, n };
}
async function vocab(req, env) {
  if (req.method === "OPTIONS") return json({ ok: true });
  const kv = env.CAPTIONS;
  if (!kv) return json({ ok: false, error: "KV binding CAPTIONS is missing" }, 500);
  try {
    const stored = vnorm(await kv.get(VOCAB_KEY, "json"));
    if (req.method === "GET") return json(Object.assign({ ok: true }, stored));
    if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
    if (!(await authed(req))) return json({ ok: false, error: "unauthorized" }, 401);
    const raw = await req.text(); if (raw.length > 5000000) return json({ ok: false, error: "too large" }, 413);
    const b = JSON.parse(raw || "{}");
    let next, added = 0;
    if (Array.isArray(b.add)) { const r = vadd(stored, b.add.slice(0, 2000)); next = r.d; added = r.n; }
    else if (b.state && typeof b.state === "object") next = vmerge(stored, b.state);
    else return json({ ok: false, error: "bad body" }, 400);
    const changed = JSON.stringify(next) !== JSON.stringify(stored);
    if (changed) await kv.put(VOCAB_KEY, JSON.stringify(next));
    return json({ ok: true, changed, added, total: next.custom.length, state: next });
  } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 500); }
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (API_PATHS.includes(u.pathname)) return cap(req, env, u);
    if (u.pathname === VOCAB_PATH) return vocab(req, env);
    return env.ASSETS.fetch(req);
  }
};
