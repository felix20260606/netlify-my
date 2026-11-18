// 网站后台接口（Cloudflare Pages），数据存在 KV，绑定名 CAPTIONS
//
// 一、视频字幕 /api/cap
//   GET    ?list=1   → { ok, items:[{v,title,author,n,tr,dur,at}] }
//   GET    ?v=<ID>   → { ok, v, title, author, cues:[{s,e,t,r}] }
//   POST             → 写入
//   DELETE ?v=<ID>   → 删除
//
// 二、生词本 /api/vocab（整份存在 KV 的 "vocab" 这一条里）
//   GET              → { ok, custom, progress, deleted, pending }
//   GET  ?history=1  → { ok, days:[日期…] }   后台存档（每天第一次改动前存一份，保留 30 天）
//   GET  ?at=日期     → 那天的存档
//   POST {state}     → 和云端合并后保存，返回合并结果 { ok, state }
//   POST {add:[词条]} → 加入完整词条：从待整理队列和已删除列表里移除同名词（插件用）
//   POST {patch:{srs,progress}} → 只改复习进度和掌握状态（插件用，返回 { ok, changed }）
//   POST {replace:{…}} → 整份覆盖（还原用：内容取自存档或仓库里的 data/vocab.json）
// 不设口令：谁都能写，被乱改时用存档或仓库备份还原（GitHub Actions 每 6 小时把生词本存进仓库 data/vocab.json）
const API_PATHS = ["/api/cap"], VOCAB_PATH = "/api/vocab", VOCAB_KEY = "vocab";
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,x-key", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" } });
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
    if (req.method === "DELETE") {
      const v = u.searchParams.get("v"); if (!okId(v)) return json({ ok: false, error: "bad id" }, 400);
      await kv.delete("v/" + v);
      return json({ ok: true });
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
const vdef = () => ({ custom: [], progress: {}, deleted: [], pending: [], srs: {} });
const isObj = x => x && typeof x === "object" && !Array.isArray(x);
const vnorm = s => ({ custom: Array.isArray(s && s.custom) ? s.custom : [], progress: isObj(s && s.progress) ? s.progress : {}, deleted: Array.isArray(s && s.deleted) ? s.deleted : [], pending: Array.isArray(s && s.pending) ? s.pending : [], srs: isObj(s && s.srs) ? s.srs : {} });
// 复习进度（网站「🔊 练习」和插件复习页共用）：{ 词条id: { b 级别, n 次数, due 下次复习时间, at 最近练习时间 } }；同一个词以 at 新的为准
function srsMerge(a, b) { const o = Object.assign({}, a); for (const k in b) { const x = b[k]; if (!isObj(x)) continue; if (!o[k] || (+x.at || 0) >= (+o[k].at || 0)) o[k] = x; } return o; }
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
  return { custom, progress, deleted, pending: Object.values(pend), srs: srsMerge(a.srs, b.srs) };
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
    const stored = vnorm(await kv.get(VOCAB_KEY, "json")), before = JSON.stringify(stored); // 先记下原样：合并函数会就地改数组
    if (req.method === "GET") {
      const q = new URL(req.url).searchParams;
      if (q.get("history")) { const l = await kv.list({ prefix: VOCAB_KEY + "@" }); return json({ ok: true, days: l.keys.map(k => k.name.slice(VOCAB_KEY.length + 1)).sort().reverse() }); }
      const at = q.get("at");
      if (at) { if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) return json({ ok: false, error: "bad date" }, 400); const d = await kv.get(VOCAB_KEY + "@" + at, "json"); return d ? json(Object.assign({ ok: true, at }, vnorm(d))) : json({ ok: false, error: "not found" }, 404); }
      return json(Object.assign({ ok: true }, stored));
    }
    if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
    const raw = await req.text(); if (raw.length > 5000000) return json({ ok: false, error: "too large" }, 413);
    const b = JSON.parse(raw || "{}");
    let next, added = 0;
    if (Array.isArray(b.add)) { const r = vadd(stored, b.add.slice(0, 2000)); next = r.d; added = r.n; }
    else if (b.state && typeof b.state === "object") {
      // 旧版网页（词条写死在页面里）会把搬进来的词当成重复草稿删掉，所以只接受新版网页（v:2）的整份同步
      if (b.v !== 2) return json({ ok: false, error: "page outdated, please reload" }, 409);
      next = vmerge(stored, b.state);
    }
    else if (b.replace && typeof b.replace === "object") next = vnorm(b.replace);
    else if (isObj(b.patch)) { // 只改复习进度 / 掌握状态（插件每练一张卡发一次，不用传整本生词本）
      next = vnorm(JSON.parse(before)); next.srs = srsMerge(next.srs, isObj(b.patch.srs) ? b.patch.srs : {});
      if (isObj(b.patch.progress)) for (const k in b.patch.progress) { const v = b.patch.progress[k]; if (v === "known" || v === "learning") next.progress[k] = v; }
    }
    else return json({ ok: false, error: "bad body" }, 400);
    const changed = JSON.stringify(next) !== before;
    if (changed) {
      const day = VOCAB_KEY + "@" + new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // 北京时间的日期
      if (!(await kv.get(day))) await kv.put(day, before, { expirationTtl: 30 * 86400 }); // 当天第一次改动前，存一份改动前的样子
      await kv.put(VOCAB_KEY, JSON.stringify(next));
    }
    return json(isObj(b.patch) ? { ok: true, changed } : { ok: true, changed, added, total: next.custom.length, state: next });
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
