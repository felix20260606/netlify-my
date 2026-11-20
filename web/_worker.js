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
//   POST {patch:{srs,progress,deleted}} → 只改复习进度、掌握状态、删除词条（插件用，返回 { ok, changed }）
//   POST {replace:{…}} → 整份覆盖（还原用：内容取自存档或仓库里的 data/vocab.json）
// 不设口令：谁都能写，被乱改时用存档或仓库备份还原（GitHub Actions 每 6 小时把生词本存进仓库 data/vocab.json）
//
// 三、插件数据 /api/ext（整份存在 KV 的 "ext" 这一条里）：已保存的词和句子、颜色标记、标签、配图选择、插件设置，以及录音截图的索引
//   每一项是 "种类|名字" → { v 内容, at 改动时间 } 或 { del:1, at }（删除记号，保留 120 天）；同一项以 at 新的为准，多台设备各改各的也能合并
//   GET              → { ok, ver, items }（只返回没删的）
//   GET  ?history=1 / ?at=日期 → 和生词本一样的每日存档（30 天）
//   POST {changes:{项:{v,at}|{del:1,at}}} → 合并后返回 { ok, ver, items }；"med|…" 项被删除时，对应的录音截图也一起删
//
// 四、录音和截图 /api/media（每条一个 KV 记录 "m:" + 插件里的键，如 m:med:w:apple；内容 { aud, img, img2, t, tr, v, s, at… }）
//   GET  ?k=med:w:apple → { ok, rec }
//   POST {k, rec}       → 保存一条（单条最大 8MB）
//
// 六、家人（多用户）/api/users：不设密码，只是把各人的数据分开
//   GET                         → { ok, users:[{id, name}] }，第一个 id 为 "" 的是原来的主人（数据就是上面那些原样的 KV 记录）
//   POST {add:"名字"}            → 新建一个用户，返回 { ok, user:{id, name}, users }
//   POST {rename:{id, name}}    → 改名字
//   POST {remove:id}            → 删掉一个家人：只有他的生词本和插件数据都是空的才删（加错了名字用），有内容的拒绝（409）
//   其它接口带 ?u=<id> 就读写这个人的数据：生词本、插件数据、录音截图、每日存档的 KV 键前面加 "u/<id>/"（如 u/u2/vocab、u/u2/m:med:w:apple）；
//   不带 u（或 u 为空）就是主人。视频字幕 /api/cap、例句 /api/sent 大家共用。不认识的 u 返回 404，免得打错字写到一份没人看的数据里。
//
// 五、例句 /api/sent?w=单词（网站「🔊 练习」用：像 PhrasePump 一样每次换几句例句听）
//   → { ok, w, items:[{en, zh}] }，来自 Tatoeba 例句库（只要 14 个词以内、带中文翻译、确实包含这个词的），在 KV 里缓存 30 天（"s/单词"）
//   GET ?pump=数量 → 随机的额外句子（5–12 个词、带中文），练习名额没用完时补满（同 PhrasePump 的「pump」），不缓存
// 七、查词 /api/dict、抓文章 /api/readurl、AI 写作评分 /api/ai、语音转文字 /api/stt：见各自函数上面的说明
//   生词本回收站：GET /api/vocab?trash=1 → { items:[{e 词条, at 删除时间}] }（30 天，按人分开）；POST {untrash:id} 从回收站拿掉
const API_PATHS = ["/api/cap"], VOCAB_PATH = "/api/vocab", VOCAB_KEY = "vocab", EXT_PATH = "/api/ext", EXT_KEY = "ext", MEDIA_PATH = "/api/media", SENT_PATH = "/api/sent";
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,x-key", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" } });
const okId = v => /^[\w-]{11}$/.test(v || "");
// ---------- 家人（多用户） ----------
const USERS_KEY = "users", DEF_USERS = [{ id: "", name: "Ray" }];
let usersMem = null, usersAt = 0;
async function usersList(kv, fresh) {
  if (!fresh && usersMem && Date.now() - usersAt < 30000) return usersMem;
  const d = await kv.get(USERS_KEY, "json"); usersMem = Array.isArray(d) && d.length ? d : DEF_USERS; usersAt = Date.now(); return usersMem;
}
// 这次请求是谁：?u=<id>；返回 KV 键前缀（主人是 ""），不认识的返回 null
async function userPre(req, kv) {
  const id = new URL(req.url).searchParams.get("u") || "";
  if (!id) return "";
  if (!/^[a-z0-9]{1,12}$/.test(id)) return null;
  let L = await usersList(kv); if (!L.some(x => x.id === id)) L = await usersList(kv, true);
  return L.some(x => x.id === id) ? "u/" + id + "/" : null;
}
const noUser = () => json({ ok: false, error: "unknown user" }, 404);
async function users(req, env) {
  if (req.method === "OPTIONS") return json({ ok: true });
  const kv = env.CAPTIONS; if (!kv) return json({ ok: false, error: "KV binding CAPTIONS is missing" }, 500);
  try {
    const L = (await usersList(kv, true)).map(x => Object.assign({}, x));
    if (req.method === "GET") return json({ ok: true, users: L });
    if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
    const b = JSON.parse((await req.text()) || "{}"), nm = v => String(v == null ? "" : v).replace(/[<>"&]/g, "").trim().slice(0, 20);
    if (typeof b.add === "string") {
      const name = nm(b.add); if (!name) return json({ ok: false, error: "name" }, 400);
      if (L.some(x => x.name === name)) return json({ ok: false, error: "这个名字已经有了" }, 409);
      if (L.length >= 20) return json({ ok: false, error: "too many" }, 400);
      let n = 2; while (L.some(x => x.id === "u" + n)) n++;
      const user = { id: "u" + n, name }; L.push(user);
      await kv.put(USERS_KEY, JSON.stringify(L)); usersMem = L; usersAt = Date.now();
      return json({ ok: true, user, users: L });
    }
    if (isObj(b.rename)) {
      const x = L.find(y => y.id === String(b.rename.id || "")), name = nm(b.rename.name);
      if (!x || !name) return json({ ok: false, error: "bad body" }, 400);
      if (L.some(y => y !== x && y.name === name)) return json({ ok: false, error: "这个名字已经有了" }, 409);
      x.name = name; await kv.put(USERS_KEY, JSON.stringify(L)); usersMem = L; usersAt = Date.now();
      return json({ ok: true, users: L });
    }
    if (typeof b.remove === "string" && b.remove) {
      const x = L.find(y => y.id === b.remove); if (!x) return json({ ok: false, error: "not found" }, 404);
      const pre = "u/" + x.id + "/", v = vnorm(await kv.get(pre + VOCAB_KEY, "json")), e = await kv.get(pre + EXT_KEY, "json");
      if (v.custom.length || v.pending.length || Object.keys(v.srs || {}).length || Object.keys(live((e && e.items) || {})).filter(k => !k.startsWith("set|")).length) return json({ ok: false, error: "这个人已经有生词或保存的内容，不能删" }, 409);
      const left = L.filter(y => y !== x); await kv.put(USERS_KEY, JSON.stringify(left)); usersMem = left; usersAt = Date.now();
      const keys = (await kv.list({ prefix: pre })).keys; for (const k of keys) await kv.delete(k.name);
      return json({ ok: true, users: left });
    }
    return json({ ok: false, error: "bad body" }, 400);
  } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 500); }
}
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
// 2026-11-20 在线上测试「🔊 练习」时误写进生词本的 3 条复习记录（按精确的 at 认）：任何设备再推上来都不收，possessions 跟着带上来的「已掌握」也不收
const POISON = { v_possessions: 1795107503971, v_motion: 1795106191839, v_guys: 1795104545153 };
function unpoison(st) {
  if (!isObj(st)) return st; let hit = false;
  if (isObj(st.srs)) for (const k in POISON) if (st.srs[k] && +st.srs[k].at === POISON[k]) { delete st.srs[k]; hit = true; }
  if (hit && isObj(st.progress) && st.progress.v_possessions === "known") delete st.progress.v_possessions;
  return st;
}
// 和网页里的 mergeState 一样：两份取并集；同一个 id 以 b 为准（除非 a 的修改时间 u 更新）；删除会传播
function vmerge(a, b) {
  a = vnorm(a); b = vnorm(b);
  const byId = {};
  a.custom.forEach(e => { if (e && e.id) byId[e.id] = e; });
  b.custom.forEach(e => { if (e && e.id && !((+(byId[e.id] || {}).u || 0) > (+e.u || 0))) byId[e.id] = e; }); // 词条带修改时间 u（改过内容的）：以新的为准，免得别的设备的旧缓存盖回去
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
    const pre = await userPre(req, kv); if (pre === null) return noUser();
    const VK = pre + VOCAB_KEY; // 这个人的生词本（主人就是 "vocab"）
    const stored = vnorm(await kv.get(VK, "json")), before = JSON.stringify(stored); // 先记下原样：合并函数会就地改数组
    if (req.method === "GET") {
      const q = new URL(req.url).searchParams;
      if (q.get("trash")) { const now = Date.now(); return json({ ok: true, items: ((await kv.get(VK + ":trash", "json")) || []).filter(t => t && t.e && now - t.at < 30 * 86400e3) }); } // 回收站
      if (q.get("history")) { const l = await kv.list({ prefix: VK + "@" }); return json({ ok: true, days: l.keys.map(k => k.name.slice(VK.length + 1)).sort().reverse() }); }
      const at = q.get("at");
      if (at) { if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) return json({ ok: false, error: "bad date" }, 400); const d = await kv.get(VK + "@" + at, "json"); return d ? json(Object.assign({ ok: true, at }, vnorm(d))) : json({ ok: false, error: "not found" }, 404); }
      return json(Object.assign({ ok: true }, stored));
    }
    if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
    const raw = await req.text(); if (raw.length > 5000000) return json({ ok: false, error: "too large" }, 413);
    const b = JSON.parse(raw || "{}");
    let next, added = 0;
    if (typeof b.untrash === "string") { const tk = VK + ":trash", L = ((await kv.get(tk, "json")) || []).filter(t => t && t.e && t.e.id !== b.untrash); await kv.put(tk, JSON.stringify(L)); return json({ ok: true, items: L }); } // 恢复后从回收站拿掉（恢复本身由网页用新 id 加回去：删除记录只增不减）
    if (Array.isArray(b.add)) { const r = vadd(stored, b.add.slice(0, 2000)); next = r.d; added = r.n; }
    else if (b.state && typeof b.state === "object") {
      // 旧版网页（词条写死在页面里）会把搬进来的词当成重复草稿删掉，所以只接受新版网页（v:2）的整份同步
      if (b.v !== 2) return json({ ok: false, error: "page outdated, please reload" }, 409);
      next = vmerge(stored, unpoison(b.state));
    }
    else if (b.replace && typeof b.replace === "object") next = vnorm(b.replace);
    else if (isObj(b.patch)) { // 只改复习进度 / 掌握状态（插件每练一张卡发一次，不用传整本生词本）
      unpoison(b.patch);
      if (isObj(b.patch.progress) && b.patch.progress.v_possessions === "known" && Date.now() < Date.UTC(2026, 11, 1) && !(stored.srs.v_possessions && (stored.srs.v_possessions.s >= 42 || stored.srs.v_possessions.h >= 42)) && !(isObj(b.patch.srs) && b.patch.srs.v_possessions && (b.patch.srs.v_possessions.s >= 42 || b.patch.srs.v_possessions.h >= 42))) delete b.patch.progress.v_possessions; // 插件里测试时误标的「已知」写回来的：12 月前不收（真练到已掌握会带着稳定度 ≥ 42）
      next = vnorm(JSON.parse(before)); next.srs = srsMerge(next.srs, isObj(b.patch.srs) ? b.patch.srs : {});
      if (isObj(b.patch.progress)) for (const k in b.patch.progress) { const v = b.patch.progress[k]; if (v === "known" || v === "learning") next.progress[k] = v; }
      if (Array.isArray(b.patch.deleted) && b.patch.deleted.length) { const del = new Set(next.deleted.concat(b.patch.deleted.filter(x => typeof x === "string").slice(0, 500))); next.deleted = [...del]; next.custom = next.custom.filter(e => !del.has(e.id)); } // 插件「已保存」页里删除生词本词条
    }
    else return json({ ok: false, error: "bad body" }, 400);
    const changed = JSON.stringify(next) !== before;
    if (changed) {
      // 回收站：这次被删掉的词条整条存进 VK + ":trash"（30 天内能在网站上恢复）
      const gone = new Set(next.deleted), had = JSON.parse(before).custom.filter(e => e && e.id && gone.has(e.id) && !next.custom.some(x => x && x.id === e.id));
      if (had.length) { const tk = VK + ":trash", now = Date.now(), old = ((await kv.get(tk, "json")) || []).filter(t => t && t.e && now - t.at < 30 * 86400e3 && !had.some(e => e.id === t.e.id)); await kv.put(tk, JSON.stringify(had.map(e => ({ e, at: now })).concat(old).slice(0, 500))); }
      const day = VK + "@" + new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // 北京时间的日期
      if (!(await kv.get(day))) await kv.put(day, before, { expirationTtl: 30 * 86400 }); // 当天第一次改动前，存一份改动前的样子
      await kv.put(VK, JSON.stringify(next));
    }
    return json(isObj(b.patch) ? { ok: true, changed } : { ok: true, changed, added, total: next.custom.length, state: next });
  } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 500); }
}

// ---------- 插件数据 ----------
const bjDay = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // 北京时间的日期
const live = items => { const o = {}; for (const k in items) if (isObj(items[k]) && !items[k].del) o[k] = items[k]; return o; };
async function ext(req, env) {
  if (req.method === "OPTIONS") return json({ ok: true });
  const kv = env.CAPTIONS;
  if (!kv) return json({ ok: false, error: "KV binding CAPTIONS is missing" }, 500);
  try {
    const pre = await userPre(req, kv); if (pre === null) return noUser();
    const EK = pre + EXT_KEY; // 这个人的插件数据（主人就是 "ext"）
    const raw0 = await kv.get(EK), doc = (raw0 && JSON.parse(raw0)) || { ver: 0, items: {} };
    if (!isObj(doc.items)) doc.items = {};
    if (req.method === "GET") {
      const q = new URL(req.url).searchParams;
      if (q.get("history")) { const l = await kv.list({ prefix: EK + "@" }); return json({ ok: true, days: l.keys.map(k => k.name.slice(EK.length + 1)).sort().reverse() }); }
      const at = q.get("at");
      if (at) { if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) return json({ ok: false, error: "bad date" }, 400); const d = await kv.get(EK + "@" + at, "json"); return d ? json({ ok: true, at, ver: d.ver, items: live(d.items || {}) }) : json({ ok: false, error: "not found" }, 404); }
      return json({ ok: true, ver: doc.ver, items: live(doc.items) });
    }
    if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
    const raw = await req.text(); if (raw.length > 20000000) return json({ ok: false, error: "too large" }, 413);
    const b = JSON.parse(raw || "{}");
    if (b.replace && isObj(b.replace.items)) { // 整份还原（内容取自存档或仓库里的 data/ext.json）
      const day = EK + "@" + bjDay(); if (raw0 && !(await kv.get(day))) await kv.put(day, raw0, { expirationTtl: 30 * 86400 });
      const now = Date.now(), items = {}; for (const k in b.replace.items) { const x = b.replace.items[k]; if (isObj(x)) items[k] = { v: x.v, at: now }; }
      for (const k in doc.items) if (!items[k]) items[k] = { del: 1, at: now };
      const next = { ver: now, items }; await kv.put(EK, JSON.stringify(next)); return json({ ok: true, ver: next.ver, items: live(items) });
    }
    if (!isObj(b.changes)) return json({ ok: false, error: "bad body" }, 400);
    let changed = false; const gone = [];
    for (const k in b.changes) {
      const x = b.changes[k]; if (!isObj(x) || typeof k !== "string" || k.length > 600 || !k.includes("|")) continue;
      const at = +x.at || 0, old = doc.items[k];
      if (old && (+old.at || 0) > at) continue;
      if (x.del) { if (!old || !old.del) { doc.items[k] = { del: 1, at }; changed = true; } if (k.startsWith("med|")) gone.push(k.slice(4)); }
      else if (!old || old.del || JSON.stringify(old.v) !== JSON.stringify(x.v)) { doc.items[k] = { v: x.v, at }; changed = true; }
    }
    if (changed) {
      const cut = Date.now() - 120 * 86400e3; for (const k in doc.items) if (doc.items[k].del && doc.items[k].at < cut) delete doc.items[k];
      const day = EK + "@" + bjDay(); if (raw0 && !(await kv.get(day))) await kv.put(day, raw0, { expirationTtl: 30 * 86400 });
      doc.ver = Date.now(); await kv.put(EK, JSON.stringify(doc));
    }
    for (const m of gone) if (m.startsWith("med:")) await kv.delete(pre + "m:" + m);
    return json({ ok: true, changed, ver: doc.ver, items: live(doc.items) });
  } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 500); }
}
async function media(req, env) {
  if (req.method === "OPTIONS") return json({ ok: true });
  const kv = env.CAPTIONS;
  if (!kv) return json({ ok: false, error: "KV binding CAPTIONS is missing" }, 500);
  try {
    const pre = await userPre(req, kv); if (pre === null) return noUser();
    const okK = k => typeof k === "string" && k.startsWith("med:") && k.length < 480;
    if (req.method === "GET") {
      const k = new URL(req.url).searchParams.get("k"); if (!okK(k)) return json({ ok: false, error: "bad key" }, 400);
      const rec = await kv.get(pre + "m:" + k, "json"); return rec ? json({ ok: true, k, rec }) : json({ ok: false, error: "not found" }, 404);
    }
    if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
    const raw = await req.text(); if (raw.length > 8000000) return json({ ok: false, error: "too large" }, 413);
    const b = JSON.parse(raw || "{}"); if (!okK(b.k) || !isObj(b.rec)) return json({ ok: false, error: "bad body" }, 400);
    await kv.put(pre + "m:" + b.k, JSON.stringify(b.rec));
    return json({ ok: true });
  } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 500); }
}

// ---------- 例句（Tatoeba） ----------
async function sent(req, env, u) {
  if (req.method === "OPTIONS") return json({ ok: true });
  const pn = Math.min(30, +u.searchParams.get("pump") || 0);
  if (pn > 0) {
    try {
      const out = [];
      for (let i = 0; i < 3 && out.length < pn; i++) {
        const r = await fetch("https://tatoeba.org/en/api_v0/search?from=eng&query=&sort=random&word_count_min=5&word_count_max=12&to=cmn&trans_filter=limit&trans_to=cmn&rand_seed=" + Math.random().toString(36).slice(2, 8), { headers: { "User-Agent": "ruilearning-my (personal study site)" } });
        if (!r.ok) break; const j = await r.json();
        (j.results || []).forEach(x => { const ts = (x.translations || []).flat().filter(t => t && t.lang === "cmn"), t = ts.find(t => t.script === "Hans") || ts[0]; if (x.text && t && x.text.length <= 90 && !out.some(o => o.en === x.text)) out.push({ en: String(x.text), zh: String(t.text || "") }); });
      }
      return json({ ok: true, items: out.slice(0, pn) });
    } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 500); }
  }
  const w = String(u.searchParams.get("w") || "").toLowerCase().trim();
  if (!/^[a-z][a-z' -]{0,40}$/.test(w)) return json({ ok: false, error: "bad word" }, 400);
  const kv = env.CAPTIONS, key = "s/" + w;
  try {
    const hit = kv && (await kv.get(key, "json")); if (hit) return json({ ok: true, w, items: hit, cached: true });
    const r = await fetch("https://tatoeba.org/en/api_v0/search?from=eng&query=" + encodeURIComponent(w.includes(" ") ? '"' + w + '"' : w) + "&sort=relevance&word_count_max=14&to=cmn&trans_filter=limit&trans_to=cmn", { headers: { "User-Agent": "ruilearning-my (personal study site)" }, cf: { cacheTtl: 86400 } });
    if (!r.ok) return json({ ok: false, error: "tatoeba " + r.status }, 502);
    const j = await r.json(), stem = w.length > 4 ? w.replace(/(e|s|es|ed|ing|y)$/, "") : w;
    const re = new RegExp("\\b" + stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+"), "i");
    const items = (j.results || []).map(x => { const ts = (x.translations || []).flat().filter(t => t && t.lang === "cmn"), t = ts.find(t => t.script === "Hans") || ts[0]; return { en: String(x.text || ""), zh: t ? String(t.text || "") : "" }; })
      .filter(x => x.en && x.zh && x.en.length <= 100 && re.test(x.en)).slice(0, 12);
    if (kv) await kv.put(key, JSON.stringify(items), { expirationTtl: 30 * 86400 });
    return json({ ok: true, w, items });
  } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 500); }
}

// ---------- 查词 /api/dict?w=单词或短语 ----------
// → { ok, word, phon, audio, zh 常用中文, zhs:[{pos, terms}], en:[{pos, def, ex}], examples:[[英, 中]] }，大家共用，KV 缓存 30 天（"d/词"）
// 来源都是免费的：中文 = 谷歌翻译（插件同款接口），音标 / 英文释义 / 发音 = dictionaryapi.dev，例句 = Tatoeba（同 /api/sent）
const UA = { "User-Agent": "ruilearning-my (personal study site)" };
async function gtrans(text, tl, bd) {
  const r = await fetch("https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=" + tl + "&dt=t" + (bd ? "&dt=bd" : "") + "&dj=1&q=" + encodeURIComponent(text));
  if (!r.ok) return null; return r.json();
}
async function dict(req, env, u) {
  if (req.method === "OPTIONS") return json({ ok: true });
  const w = String(u.searchParams.get("w") || "").trim().replace(/\s+/g, " ");
  if (!w || w.length > 80 || !/^[A-Za-z][A-Za-z0-9' .,?!-]*$/.test(w)) return json({ ok: false, error: "bad word" }, 400);
  const kv = env.CAPTIONS, key = "d/" + w.toLowerCase();
  try {
    const hit = kv && (await kv.get(key, "json")); if (hit && !u.searchParams.get("fresh")) return json(Object.assign({ ok: true, cached: true }, hit));
    const one = w.split(" ").length <= 3;
    const [g, d, ex] = await Promise.all([
      gtrans(w, "zh-CN", one).catch(() => null),
      one ? fetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(w.toLowerCase()), { headers: UA }).then(r => r.ok ? r.json() : null).catch(() => null) : null,
      /^[a-z][a-z' -]{0,40}$/i.test(w) ? sent(new Request("https://x/"), env, new URL("https://x/api/sent?w=" + encodeURIComponent(w.toLowerCase()))).then(r => r.json()).catch(() => null) : null,
    ]);
    const out = { word: w, phon: "", audio: "", zh: "", zhs: [], en: [], examples: [] };
    if (g) { out.zh = (g.sentences || []).map(x => x.trans || "").join(""); out.zhs = (g.dict || []).slice(0, 4).map(x => ({ pos: x.pos || "", terms: (x.terms || []).slice(0, 6) })); }
    if (Array.isArray(d) && d[0]) {
      const ps = d.flatMap(x => x.phonetics || []);
      out.phon = (d.find(x => x.phonetic) || {}).phonetic || (ps.find(p => p.text) || {}).text || "";
      out.audio = ((ps.find(p => /-us\.mp3$/.test(p.audio || "")) || ps.find(p => p.audio)) || {}).audio || "";
      d.forEach(x => (x.meanings || []).forEach(m => (m.definitions || []).slice(0, 3).forEach(df => { if (out.en.length < 6) out.en.push({ pos: m.partOfSpeech || "", def: df.definition || "", ex: df.example || "" }); })));
    }
    if (ex && ex.ok) out.examples = (ex.items || []).slice(0, 5).map(x => [x.en, x.zh]);
    if (!out.zh && !out.en.length) return json({ ok: false, error: "not found", word: w }, 404);
    if (kv) await kv.put(key, JSON.stringify(out), { expirationTtl: 30 * 86400 });
    return json(Object.assign({ ok: true }, out));
  } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 500); }
}

// ---------- 抓文章正文 /api/readurl?url=… （「📰 阅读」用）→ { ok, title, text }：只取标题和正文段落（p、h1–h3、li、blockquote），不存 ----------
async function readurl(req, env, u) {
  if (req.method === "OPTIONS") return json({ ok: true });
  let t; try { t = new URL(u.searchParams.get("url") || ""); } catch (e) { return json({ ok: false, error: "bad url" }, 400); }
  if (!/^https?:$/.test(t.protocol)) return json({ ok: false, error: "bad url" }, 400);
  try {
    const r = await fetch(t.toString(), { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept": "text/html" }, redirect: "follow" });
    if (!r.ok) return json({ ok: false, error: "http " + r.status }, 502);
    if (!/html/i.test(r.headers.get("content-type") || "")) return json({ ok: false, error: "not html" }, 415);
    let title = "", og = "", skip = 0, cur = null; const blocks = [];
    const B = { element(el) { if (skip) return; cur = { t: el.tagName, s: "" }; blocks.push(cur); el.onEndTag(() => { cur = null; }); }, text(x) { if (cur && !skip) cur.s += x.text; } };
    const SK = { element(el) { skip++; el.onEndTag(() => { skip--; }); } };
    await new HTMLRewriter()
      .on("title", { text(x) { title += x.text; } })
      .on('meta[property="og:title"]', { element(el) { og = el.getAttribute("content") || ""; } })
      .on("script,style,nav,footer,aside,form,noscript,figure", SK)
      .on("p,h1,h2,h3,li,blockquote", B)
      .transform(r).arrayBuffer();
    const dec = s => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&mdash;/g, "—").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/\s+/g, " ").trim();
    const paras = blocks.map(b => ({ t: b.t, s: dec(b.s) })).filter(b => b.s && (b.t[0] === "h" || b.s.split(" ").length >= (b.t === "li" ? 6 : 5)));
    const text = paras.map(b => b.s).join("\n\n").slice(0, 60000);
    if (text.split(/\s+/).length < 40) return json({ ok: false, error: "no article text" }, 422);
    return json({ ok: true, title: dec(og || title).slice(0, 200), text, url: t.toString() });
  } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 500); }
}

// ---------- AI（Cloudflare Workers AI，免费额度每天 1 万 neurons；要在 Pages 项目「设置 → 绑定」里加 Workers AI，变量名 AI）----------
// POST /api/ai {task:"write", type:t1|t2|mail|free, prompt, text} → { ok, band:{TR,CC,LR,GRA,overall}, summary_zh, strengths_zh:[], improve_zh:[], rewrite }；没开 AI 时 { ok:false, error:"noai" }
// POST /api/stt（请求体就是录音文件）→ { ok, text }：跟读打分用（Whisper 语音转文字）
const AI_MODELS = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct"];
const WRITE_SYS = `You are a strict, experienced IELTS writing examiner. Assess the candidate's answer using the official IELTS Writing band descriptors (Task Response / Task Achievement, Coherence and Cohesion, Lexical Resource, Grammatical Range and Accuracy). Use half bands (e.g. 6.5). Be realistic: most learner essays score 5.0-7.0; penalise answers under the word limit or off topic.
Reply with ONLY one JSON object, no markdown, exactly in this shape:
{"band":{"TR":0,"CC":0,"LR":0,"GRA":0,"overall":0},"summary_zh":"2-3 sentences in Simplified Chinese","strengths_zh":["..."],"improve_zh":["specific, actionable advice in Simplified Chinese; quote the original phrase and give a better English version"],"rewrite":"an improved version of the whole answer in English, same ideas and similar length, band 8 level"}
Give 2-4 strengths_zh and 3-6 improve_zh. overall = mean of the four, rounded to the nearest half band.`;
function pickJson(s) { s = String(s || ""); const i = s.indexOf("{"), j = s.lastIndexOf("}"); if (i < 0 || j <= i) return null; try { return JSON.parse(s.slice(i, j + 1)); } catch (e) { return null; } }
async function ai(req, env) {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (!env.AI) return json({ ok: false, error: "noai" });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  try {
    const b = await req.json(), text = String(b.text || "").slice(0, 8000), prompt = String(b.prompt || "").slice(0, 3000);
    if (b.task !== "write" || text.split(/\s+/).length < 20) return json({ ok: false, error: "bad body" }, 400);
    const kind = { t1: "IELTS Academic Writing Task 1 (report on visual data, at least 150 words)", t2: "IELTS Writing Task 2 (essay, at least 250 words)", mail: "an email / letter (like IELTS General Task 1, at least 150 words)", free: "free writing (judge it like a Task 2 essay)" }[b.type] || "IELTS Writing Task 2 (essay, at least 250 words)";
    const msgs = [{ role: "system", content: WRITE_SYS }, { role: "user", content: "Task type: " + kind + "\nQuestion: " + (prompt || "(not given)") + "\n\nCandidate's answer:\n" + text }];
    let last = "";
    for (const m of AI_MODELS) {
      try {
        const r = await env.AI.run(m, { messages: msgs, max_tokens: 2048, temperature: 0.2 });
        const raw = r && (typeof r.response === "string" ? r.response : JSON.stringify(r.response || r));
        const o = pickJson(raw);
        if (o && o.band) return json({ ok: true, model: m, band: o.band, summary_zh: o.summary_zh || "", strengths_zh: o.strengths_zh || [], improve_zh: o.improve_zh || [], rewrite: o.rewrite || "" });
        last = "bad output";
      } catch (e) { last = String(e && e.message || e); }
    }
    return json({ ok: false, error: last || "ai failed" }, 502);
  } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 500); }
}
async function stt(req, env) {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (!env.AI) return json({ ok: false, error: "noai" });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  try {
    const buf = await req.arrayBuffer(); if (!buf.byteLength) return json({ ok: false, error: "empty" }, 400); if (buf.byteLength > 4e6) return json({ ok: false, error: "too large" }, 413);
    const bytes = new Uint8Array(buf); let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    try { const r = await env.AI.run("@cf/openai/whisper-large-v3-turbo", { audio: btoa(bin), language: "en" }); if (r && r.text != null) return json({ ok: true, text: String(r.text).trim() }); } catch (e) {}
    const r = await env.AI.run("@cf/openai/whisper", { audio: [...bytes] });
    return json({ ok: true, text: String((r && r.text) || "").trim() });
  } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 500); }
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (API_PATHS.includes(u.pathname)) return cap(req, env, u);
    if (u.pathname === VOCAB_PATH) return vocab(req, env);
    if (u.pathname === "/api/users") return users(req, env);
    if (u.pathname === EXT_PATH) return ext(req, env);
    if (u.pathname === MEDIA_PATH) return media(req, env);
    if (u.pathname === SENT_PATH) return sent(req, env, u);
    if (u.pathname === "/api/dict") return dict(req, env, u);
    if (u.pathname === "/api/readurl") return readurl(req, env, u);
    if (u.pathname === "/api/ai") return ai(req, env);
    if (u.pathname === "/api/stt") return stt(req, env);
    return env.ASSETS.fetch(req);
  }
};
