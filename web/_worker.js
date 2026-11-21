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
// 七、查词 /api/dict、抓文章 /api/readurl、今日新闻 /api/news、每日听力 /api/sme、AI 写作评分 /api/ai、语音转文字 /api/stt、AI 语音 /api/tts：见各自函数上面的说明
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

// ---------- 个人的学习资料 /api/mine（按人分开，换设备也在）：阅读的文章、作文批改历史、词汇量测试 ----------
// GET  ?k=reading|writing|vtest → { ok, items:{ id:{v, at} | {del:1, at} } }（删除记号保留 60 天）
// POST {k, changes:{ id:{v,at}|{del:1,at} }} → 同一项以 at 新的为准，返回合并后的 { ok, items }
const MINE_K = /^(reading|writing|vtest|speak|daily|sme)$/; // daily：「📅 每日」的设置、手动打勾、每天完成几项；sme：「📻 6 分钟英语」听过哪几期 // speak：口语页的练习记录、每日打卡、AI 陪练记录、录音存档索引（speak.js）
async function mine(req, env, u) {
  if (req.method === "OPTIONS") return json({ ok: true });
  const kv = env.CAPTIONS; if (!kv) return json({ ok: false, error: "KV binding CAPTIONS is missing" }, 500);
  try {
    const pre = await userPre(req, kv); if (pre === null) return noUser();
    if (req.method === "GET") { const k = u.searchParams.get("k") || ""; if (!MINE_K.test(k)) return json({ ok: false, error: "bad k" }, 400); return json({ ok: true, items: ((await kv.get(pre + "mine:" + k, "json")) || {}).items || {} }); }
    if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
    const raw = await req.text(); if (raw.length > 3000000) return json({ ok: false, error: "too large" }, 413);
    const b = JSON.parse(raw || "{}"); if (!MINE_K.test(b.k || "") || !isObj(b.changes)) return json({ ok: false, error: "bad body" }, 400);
    const key = pre + "mine:" + b.k, cur = ((await kv.get(key, "json")) || {}).items || {}, now = Date.now(); let changed = false;
    for (const id in b.changes) { const x = b.changes[id]; if (!isObj(x) || !(+x.at) || String(id).length > 200) continue; if (!cur[id] || +x.at > +cur[id].at) { cur[id] = x.del ? { del: 1, at: +x.at } : { v: x.v, at: +x.at }; changed = true; } }
    for (const id in cur) if (cur[id].del && now - cur[id].at > 60 * 86400e3) { delete cur[id]; changed = true; }
    if (changed) { const out = JSON.stringify({ items: cur }); if (out.length > 20000000) return json({ ok: false, error: "too large" }, 413); await kv.put(key, out); }
    return json({ ok: true, items: cur });
  } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 500); }
}

// ---------- 查词 /api/dict?w=单词或短语 ----------
// → { ok, word, phon, audio, zh 常用中文, zhs:[{pos, terms}], en:[{pos, def, ex}], examples:[[英, 中]] }，大家共用，KV 缓存 30 天（"d/词"）
// 来源都是免费的：中文 = 谷歌翻译（插件同款接口），音标 / 英文释义 / 发音 = dictionaryapi.dev，例句 = Tatoeba（同 /api/sent）
const UA = { "User-Agent": "ruilearning-my (personal study site)" };
async function gtrans(text, tl, bd) {
  for (const host of ["translate.googleapis.com", "clients5.google.com"]) { // 后台机房的 IP 有时被谷歌拦：换个入口再试
    try { const r = await fetch("https://" + host + "/translate_a/single?client=" + (host[0] === "c" ? "dict-chrome-ex" : "gtx") + "&sl=en&tl=" + tl + "&dt=t" + (bd ? "&dt=bd" : "") + "&dj=1&q=" + encodeURIComponent(text), { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" } });
      if (r.ok) { const j = await r.json(); if (j && (j.sentences || []).some(x => x.trans)) return j; } } catch (e) {}
  }
  try { // 再不行用 MyMemory（免费，每天有额度）
    const r = await fetch("https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) + "&langpair=en|" + tl, { headers: UA });
    const j = r.ok && (await r.json()), t = j && j.responseData && j.responseData.translatedText;
    if (t && !/MYMEMORY WARNING/i.test(t)) return { sentences: [{ trans: t }], dict: [] };
  } catch (e) {}
  return null;
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
    if (kv && out.zh) await kv.put(key, JSON.stringify(out), { expirationTtl: 30 * 86400 }); // 中文没取到的不缓存，下次再试
    return json(Object.assign({ ok: true }, out));
  } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 500); }
}

// ---------- 抓文章正文 /api/readurl?url=… （「📰 阅读」用）→ { ok, title, text }：只取标题和正文段落（p、h1–h3、li、blockquote），不存 ----------
async function readurl(req, env, u) {
  if (req.method === "OPTIONS") return json({ ok: true });
  const x = await extractArticle(u.searchParams.get("url") || "");
  return x.ok ? json(x) : json({ ok: false, error: x.error }, x.status || 500);
}
// 抓网页、抽出标题和正文 → {ok, title, text, url} 或 {ok:false, error, status}（/api/readurl 和 /api/news 共用）
async function extractArticle(url) {
  let t; try { t = new URL(url); } catch (e) { return { ok: false, error: "bad url", status: 400 }; }
  if (!/^https?:$/.test(t.protocol)) return { ok: false, error: "bad url", status: 400 };
  try {
    const r = await fetch(t.toString(), { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept": "text/html" }, redirect: "follow" });
    if (!r.ok) return { ok: false, error: "http " + r.status, status: 502 };
    if (!/html/i.test(r.headers.get("content-type") || "")) return { ok: false, error: "not html", status: 415 };
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
    const paras = blocks.map(b => ({ t: b.t, s: dec(b.s) })).filter(b => b.s && !/<iframe|^Embed\b/i.test(b.s) && (b.t[0] === "h" || b.s.split(" ").length >= (b.t === "li" ? 6 : 5)));
    const text = paras.map(b => b.s).join("\n\n").slice(0, 60000);
    if (text.split(/\s+/).length < 40) return { ok: false, error: "no article text", status: 422 };
    return { ok: true, title: dec(og || title).slice(0, 200), text, url: t.toString() };
  } catch (e) { return { ok: false, error: String(e && e.message || e), status: 500 }; }
}

// ---------- 今日新闻 /api/news?d=YYYY-MM-DD （「📰 阅读」顶部「每天一篇」）→ { ok, date, src, url, title, text, words, pub, list:[{t, u, s, p}] } ----------
// 从 BBC / Guardian / NPR 的 RSS 取最近两天的头条，按日期「随机」排（同一天大家拿到同一篇），挑第一篇能抓到 250–1500 词正文的；
// 结果存 KV「news/日期」3 天（不分家人）。list 是当天其它头条（「换一篇」「其它头条」用，前端再走 /api/readurl 抓正文）。?fresh=1 不用缓存重新挑
const NEWS_FEEDS = [
  ["BBC", "https://feeds.bbci.co.uk/news/world/rss.xml"], ["BBC", "https://feeds.bbci.co.uk/news/rss.xml"],
  ["BBC", "https://feeds.bbci.co.uk/news/technology/rss.xml"], ["BBC", "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml"],
  ["Guardian", "https://www.theguardian.com/world/rss"], ["Guardian", "https://www.theguardian.com/science/rss"], ["Guardian", "https://www.theguardian.com/technology/rss"],
  ["NPR", "https://feeds.npr.org/1001/rss.xml"],
];
function rssItems(xml, src) {
  const dec = s => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;|&#x27;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/\s+/g, " ").trim();
  const tag = (x, n) => { const m = x.match(new RegExp("<" + n + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + n + ">")); return m ? dec(m[1]) : ""; };
  return (xml.match(/<item[\s>][\s\S]*?<\/item>/g) || []).map(x => {
    let u = tag(x, "link"); if (src === "BBC") u = u.replace(/\?.*$/, "");
    return { t: tag(x, "title"), u, s: src, p: Date.parse(tag(x, "pubDate")) || 0 };
  }).filter(i => i.t && /^https:\/\//.test(i.u) && !/\/(videos?|live|sounds|av|audio|gallery|picture|in-pictures|ng-interactive)\//.test(i.u));
}
const newsDay = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
async function news(req, env, u) {
  if (req.method === "OPTIONS") return json({ ok: true });
  const d = /^\d{4}-\d{2}-\d{2}$/.test(u.searchParams.get("d") || "") ? u.searchParams.get("d") : newsDay(), key = "news/" + d;
  if (!u.searchParams.get("fresh")) { const c = await env.CAPTIONS.get(key, "json"); if (c) return json(c); }
  const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" };
  const got = await Promise.all(NEWS_FEEDS.map(([s, f]) => fetch(f, { headers: UA }).then(r => (r.ok ? r.text() : "")).then(x => rssItems(x, s)).catch(() => [])));
  const now = Date.now(), seen = new Set(); let all = [];
  for (const L of got) for (const i of L) { const k = i.t.toLowerCase(); if (seen.has(k) || seen.has(i.u)) continue; seen.add(k); seen.add(i.u); all.push(i); }
  const within = h => all.filter(i => i.p && now - i.p < h * 3600e3), r2 = within(48); all = r2.length >= 8 ? r2 : within(7 * 24); // 最近两天的；太少就放宽到一周，更旧的不要
  const h = s => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };
  all.sort((a, b) => h(d + a.u) - h(d + b.u));
  if (!all.length) return json({ ok: false, error: "no feeds" }, 502);
  let pick = null;
  for (const i of all.slice(0, 8)) {
    const x = await extractArticle(i.u); if (!x.ok) continue;
    const n = x.text.split(/\s+/).length; if (n < 250) continue;
    let text = x.text.replace(/^[^\n]{0,200}\n\n/, m => (/[.!?"”]\s*$/.test(m.trim()) ? m : "")); // 第一段是标题（没有句号）就去掉，免得读两遍
    if (n > 1500) { const P = text.split("\n\n"), out = []; let c = 0; for (const p of P) { if (c > 1200) break; out.push(p); c += p.split(/\s+/).length; } text = out.join("\n\n"); }
    pick = { src: i.s, url: i.u, title: i.t || x.title, text, words: text.split(/\s+/).length, pub: i.p }; break;
  }
  if (!pick) return json({ ok: false, error: "no article" }, 502);
  const out = { ok: true, date: d, ...pick, list: all.filter(i => i.u !== pick.url).slice(0, 15).map(({ t, u, s, p }) => ({ t, u, s, p })) };
  await env.CAPTIONS.put(key, JSON.stringify(out), { expirationTtl: 3 * 86400 });
  return json(out);
}

// ---------- 每日听力 /api/sme：BBC Learning English 的四个栏目（「🎧 听 → 📻 BBC 听力」）----------
// s = ree Real Easy English（慢速简单对话）/ tews The English We Speak（地道说法）/ news Learning English from the News（新闻英语）/ sme 6 Minute English
// GET /api/sme?s=tews → { ok, s, list:[{id, t 标题, d 日期, p 一句简介, img}] }：今年和去年的节目目录（新的在前），KV「sme/list/<s>」存 12 小时（6 Minute English 还是「sme/list」）
// GET /api/sme?ep=6-minute-english_2026/ep-261119 → { ok, id, s, title, mp3, intro, q:[问题, 选项…], vocab:[[词, 英文解释, 例句?]], heads:[[新闻标题, 来源]], lines:[{who, t}] }：KV「sme/ep/…」存 90 天
// GET /api/sme?ep=…&zh=1 → { ok, intro, q:[], vocab:[], heads:[], lines:[] } 和上面一一对应的中文（谷歌翻译），KV「sme/zh/…」存 180 天
const SME_S = {
  ree: { slug: "real-easy-english", yearly: false, re: /^real-easy-english\/\d{6}$/ },
  tews: { slug: "the-english-we-speak", yearly: true, re: /^the-english-we-speak_\d{4}\/ep-\d{6}$/ },
  news: { slug: "learning-english-from-the-news", yearly: true, re: /^learning-english-from-the-news_\d{4}\/\d{6}$/ },
  sme: { slug: "6-minute-english", yearly: true, re: /^6-minute-english_\d{4}\/ep-\d{6}$/ },
};
const smeOf = ep => Object.keys(SME_S).find(k => SME_S[k].re.test(ep)) || "";
function smeLines(h) {
  const dec = s => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&hellip;/g, "…").replace(/&pound;/g, "£").replace(/&euro;/g, "€").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n));
  // 说话人 / 生词：「<strong>Name</strong><br />」或「<strong>Name<br /></strong>」→ 单独一行「@@Name」
  return dec(h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "").replace(/<strong>([^<]{1,60})<br\s*\/?>\s*<\/strong>|<strong>([^<]{1,60})<\/strong>\s*<br\s*\/?>/gi, (m, x, y) => "\n@@" + (x || y) + "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|h\d|li|div|dt|dd)>/gi, "\n").replace(/<[^>]+>/g, "")).split("\n").map(s => s.replace(/\s+/g, " ").trim()).filter(s => s && s !== "@@");
}
function smeParse(html) {
  const L0 = smeLines(html), L = L0.map(s => s.replace(/^@@/, "")), at = (re, from) => { for (let i = from || 0; i < L.length; i++) if (re.test(L[i])) return i; return -1; };
  const og = (html.match(/<meta property="og:title" content="([^"]*)"/) || [])[1] || "";
  const mp3 = (html.match(/href="(https:\/\/downloads\.bbc\.co\.uk\/[^"]+\.mp3)"/) || [])[1] || "";
  const iI = at(/^(Introduction|The story)$/i), iH = at(/^News headlines$/i), iQ = at(/^This week'?s question$/i), iV = at(/^(Vocabulary|Key words and phrases)$/i), iT = at(/^Transcript$/i);
  const iEnd = at(/^(Next|Latest|Download|Previous|Episode \d+|Take the quiz|Note: This podcast)/i, Math.max(iI, iV, iT, 0) + 1);
  const marks = [iI, iH, iQ, iV, iT, iEnd].filter(x => x >= 0).sort((x, y) => x - y);
  const end = a => { const n = marks.find(x => x > a); return n == null ? Math.min(L.length, a + 80) : n; };
  const seg = (a, raw) => (a < 0 ? [] : (raw ? L0 : L).slice(a + 1, end(a)));
  const intro = seg(iI).join(" ");
  const q = seg(iQ).filter(s => !/^Listen to the programme/i.test(s));
  const heads = []; { const H = seg(iH); for (let i = 0; i < H.length; i++) { if (H[i + 1] && H[i + 1].length < 40 && H[i].length > H[i + 1].length) { heads.push([H[i], H[i + 1]]); i++; } else heads.push([H[i], ""]); } }
  const V0 = seg(iV, true), vocab = [];
  if (V0.some(s => /^@@/.test(s))) { for (const s of V0) { if (/^@@/.test(s)) vocab.push([s.slice(2).trim(), ""]); else if (vocab.length) { const v = vocab[vocab.length - 1]; if (!v[1]) v[1] = s; else if (!v[2]) v[2] = s; } } }
  else for (let i = 0; i + 1 < V0.length; i += 2) vocab.push([V0[i], V0[i + 1]]);
  const T = iT < 0 ? [] : L0.slice(iT + 1, end(iT)).filter(s => !/^(@@)?Note: This is not a word-for-word transcript/i.test(s));
  const lines = []; let who = "";
  for (let i = 0; i < T.length; i++) { const s = T[i]; if (/^@@/.test(s)) { who = s.slice(2).trim(); continue; } lines.push({ who, t: s }); }
  return { title: og.split(" / ").pop().trim(), mp3, intro, q, vocab: vocab.filter(v => v[0] && v[1]), heads, lines };
}
function smeIndex(html, slug) {
  const out = [], seen = new Set(), re = new RegExp('<a\\s+href="/learningenglish/english/features/(' + slug + '(?:_\\d{4})?/(?:ep-)?\\d{6})"><img src="([^"]+)"[\\s\\S]*?<h2><a\\s+href="[^"]+">([^<]+)</a></h2>[\\s\\S]*?<h3>([\\s\\S]*?)</h3>\\s*<p>([^<]*)</p>', "g");
  const dec = s => s.replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
  let m; while ((m = re.exec(html))) { if (seen.has(m[1])) continue; seen.add(m[1]); const d = (m[4].match(/(\d{1,2} \w{3} \d{4})/) || [])[1] || ""; out.push({ id: m[1], img: m[2], t: dec(m[3]), d, p: dec(m[5]) }); }
  return out;
}
// 一批英文句子 → 一样多的中文：按行拼起来（每段不超过 1500 字）交给谷歌翻译，行数对不上就拆小再试
async function smeZh(arr) {
  const out = arr.map(() => "");
  async function run(idx, depth) {
    const text = idx.map(i => arr[i].replace(/\s+/g, " ")).join("\n"), j = await gtrans(text, "zh-CN");
    const zh = j ? (j.sentences || []).map(x => x.trans || "").join("").split("\n").map(x => x.trim()) : [];
    if (zh.length === idx.length) { idx.forEach((i, k) => { out[i] = zh[k]; }); return; }
    if (idx.length === 1) { out[idx[0]] = zh.join(" ").trim(); return; }
    if (depth < 3) { const h = Math.ceil(idx.length / 2); await run(idx.slice(0, h), depth + 1); await run(idx.slice(h), depth + 1); }
  }
  const chunks = []; let cur = [], len = 0;
  arr.forEach((s, i) => { if (!s) return; if (cur.length && len + s.length > 1500) { chunks.push(cur); cur = []; len = 0; } cur.push(i); len += s.length + 1; });
  if (cur.length) chunks.push(cur);
  for (let i = 0; i < chunks.length; i += 4) await Promise.all(chunks.slice(i, i + 4).map(c => run(c, 0).catch(() => {})));
  return out;
}
async function sme(req, env, u) {
  if (req.method === "OPTIONS") return json({ ok: true });
  const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept": "text/html" };
  const BASE = "https://www.bbc.co.uk/learningenglish/english/features/", ep = u.searchParams.get("ep") || "", fresh = !!u.searchParams.get("fresh");
  if (ep) {
    const s = smeOf(ep); if (!s) return json({ ok: false, error: "bad ep" }, 400);
    const key = "sme/ep/" + ep; let x = fresh ? null : await env.CAPTIONS.get(key, "json");
    if (!x) {
      try {
        const r = await fetch(BASE + ep, { headers: UA }); if (!r.ok) return json({ ok: false, error: "http " + r.status }, 502);
        const p = smeParse(await r.text()); if (!p.mp3 || (p.lines.length < 6 && !(s === "news" && (p.intro || p.vocab.length)))) return json({ ok: false, error: "no transcript" }, 502);
        x = { ok: true, id: ep, s, url: BASE + ep, ...p }; await env.CAPTIONS.put(key, JSON.stringify(x), { expirationTtl: 90 * 86400 });
      } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 502); }
    }
    if (!u.searchParams.get("zh")) return json(x);
    const zk = "sme/zh/" + ep; if (!fresh) { const c = await env.CAPTIONS.get(zk, "json"); if (c) return json(c); }
    const q = x.q || [], V = x.vocab || [], H = x.heads || [], Ls = x.lines || [];
    const all = [x.intro || "", ...q, ...V.map(v => v[1] || ""), ...V.map(v => v[2] || ""), ...H.map(h => h[0]), ...Ls.map(l => l.t)];
    const zh = await smeZh(all); let i = 1; const take = n => { const r = zh.slice(i, i + n); i += n; return r; };
    const out = { ok: true, id: ep, intro: zh[0], q: take(q.length), vocab: take(V.length), vex: take(V.length), heads: take(H.length), lines: take(Ls.length) };
    const got = zh.filter(Boolean).length; if (!got) return json({ ok: false, error: "translate failed" }, 502);
    if (got >= all.filter(Boolean).length * 0.9) await env.CAPTIONS.put(zk, JSON.stringify(out), { expirationTtl: 180 * 86400 }); // 大部分翻好了才存，没翻全的下次再试
    return json(out);
  }
  const s = SME_S[u.searchParams.get("s") || "sme"] ? (u.searchParams.get("s") || "sme") : "", S = SME_S[s]; if (!S) return json({ ok: false, error: "bad s" }, 400);
  const lk = s === "sme" ? "sme/list" : "sme/list/" + s;
  if (!fresh) { const c = await env.CAPTIONS.get(lk, "json"); if (c) return json(c); }
  const y = +newsDay().slice(0, 4), seen = new Set(), list = [];
  for (const page of S.yearly ? [S.slug + "_" + y, S.slug + "_" + (y - 1)] : [S.slug]) {
    try { const r = await fetch(BASE + page, { headers: UA }); if (r.ok) for (const i of smeIndex(await r.text(), S.slug)) if (!seen.has(i.id)) { seen.add(i.id); list.push(i); } } catch (e) {}
  }
  if (!list.length) return json({ ok: false, error: "no list" }, 502);
  list.sort((p, q) => (q.id.match(/\d{6}$/) || [""])[0].localeCompare((p.id.match(/\d{6}$/) || [""])[0])); // 期号 = 年月日，新的在前
  const out = { ok: true, s, list: list.slice(0, 120) }; await env.CAPTIONS.put(lk, JSON.stringify(out), { expirationTtl: 12 * 3600 }); return json(out);
}

// ---------- AI（Cloudflare Workers AI，免费额度每天 1 万 neurons；要在 Pages 项目「设置 → 绑定」里加 Workers AI，变量名 AI）----------
// POST /api/ai {task:"write", type:t1|t2|mail|free, prompt, text} → { ok, band:{TR,CC,LR,GRA,overall}, summary_zh, strengths_zh:[], improve_zh:[], rewrite }；没开 AI 时 { ok:false, error:"noai" }
// POST /api/stt（请求体就是录音文件）→ { ok, text }：跟读打分用（Whisper 语音转文字）
const AI_MODELS = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct"];
const WRITE_SYS = `You are a strict, experienced IELTS writing examiner. Assess the candidate's answer using the official IELTS Writing band descriptors (Task Response / Task Achievement, Coherence and Cohesion, Lexical Resource, Grammatical Range and Accuracy). Use half bands (e.g. 6.5). Be realistic: most learner essays score 5.0-7.0; penalise answers under the word limit or off topic.
Reply with ONLY one JSON object, no markdown, exactly in this shape:
{"band":{"TR":0,"CC":0,"LR":0,"GRA":0,"overall":0},"summary_zh":"2-3 sentences in Simplified Chinese","strengths_zh":["..."],"improve_zh":["specific, actionable advice in Simplified Chinese; quote the original phrase and give a better English version"],"rewrite":"an improved version of the whole answer in English, same ideas and similar length, band 8 level"}
Give 2-4 strengths_zh and 3-6 improve_zh. overall = mean of the four, rounded to the nearest half band.`;
// 口语（web/speak.js）：AI 陪练聊天、聊完总结、话题回答点评。学习者：中文母语、住吉隆坡、程序员、英语约 B1
const SPEAK_WHO = "The learner is a Chinese native speaker (about CEFR B1) living in Kuala Lumpur, Malaysia, working as a software developer. Their words come from speech recognition, so ignore capitalisation, punctuation and obvious mis-hearings; never comment on pronunciation.";
const CHAT_SYS = scene => `You are a friendly, natural English conversation partner. ${SPEAK_WHO}
Situation: ${scene || "casual chat about daily life, work or hobbies"}. Stay in character for this situation, but always speak correct, natural English (never broken English or local slang the learner might copy), because the learner imitates you.
Reply in natural spoken American English, 1-2 short sentences (under 30 words), simple enough for B1, and usually end with a question to keep the conversation going.
Also check the learner's LAST message for a clear grammar or word-choice mistake (not style, not punctuation).
Reply with ONLY one JSON object, no markdown: {"reply":"your reply","fix":null}  or, if the last learner message had a real mistake: {"reply":"...","fix":{"bad":"the wrong part they said","good":"the corrected version","why_zh":"一句简体中文解释"}}`;
const CHATSUM_SYS = `You are an English speaking coach. ${SPEAK_WHO} Review the whole conversation (the learner is "user").
Reply with ONLY one JSON object, no markdown:
{"summary_zh":"2-3 sentences in Simplified Chinese: how they did overall","good_zh":["things they did well, Simplified Chinese"],"fixes":[{"bad":"what they said","good":"correct / more natural version","why_zh":"简体中文解释"}],"phrases":[{"en":"a useful natural expression for this situation they could use next time","zh":"中文"}]}
Give 1-3 good_zh, up to 6 fixes (only real problems, most important first), and 4-6 phrases.`;
const SPEAKRATE_SYS = `You are a strict, experienced IELTS speaking examiner. ${SPEAK_WHO}
Assess the transcript of their spoken answer to the question, using IELTS Speaking band descriptors for Fluency and Coherence (FC), Lexical Resource (LR) and Grammatical Range and Accuracy (GRA); you cannot hear pronunciation, so do not score it. Use half bands. Be realistic: short or simple answers score 4.5-6.0.
Reply with ONLY one JSON object, no markdown:
{"band":{"FC":0,"LR":0,"GRA":0,"overall":0},"summary_zh":"2-3 sentences in Simplified Chinese","strengths_zh":["..."],"fixes":[{"bad":"exact phrase they said","good":"better English","why_zh":"简体中文解释"}],"better":"an improved version of their answer, spoken style, same ideas, about 110-150 words, band 7.5 level","better_zh":"中文翻译"}
Give 1-3 strengths_zh and 3-6 fixes. overall = mean of the three, rounded to the nearest half band.`;
const HOWTO_SYS = `You help a Chinese learner say things in natural English. ${SPEAK_WHO}
They give you something in Chinese (or mixed Chinese/English). Translate the WHOLE meaning into natural spoken English, keeping every detail (who, what, when, words like "bug" or "boss"). Use normal capitalisation and punctuation.
Give three versions: casual (随意), neutral (中性), formal (正式). note_zh says in a few Chinese words when to use it.
Example. Input: 不好意思，能帮我打包吗
Output: {"items":[{"reg":"随意","en":"Sorry, can I get this to go?","note_zh":"在小店、mamak 随口说"},{"reg":"中性","en":"Excuse me, could you pack this up for me?","note_zh":"餐厅里礼貌地说"},{"reg":"正式","en":"Excuse me, would it be possible to have this packed to take away?","note_zh":"高级餐厅、很客气"}],"words":[{"en":"to go","zh":"打包带走"},{"en":"pack up","zh":"打包"}]}
Reply with ONLY one JSON object in exactly that shape, no markdown.`;
const USEWORD_SYS = `You are a friendly English teacher. ${SPEAK_WHO}
The learner was asked to say one sentence using a target word or phrase. Judge whether they used it correctly and naturally (meaning, grammar, collocation).
Reply with ONLY one JSON object, no markdown: {"correct":true,"fixed":"their sentence corrected (same as theirs if already fine)","why_zh":"简体中文：哪里对 / 哪里错","better":"one more natural example sentence with the target","better_zh":"中文"}`;
const JUDGE_SYS = `You are a friendly English speaking coach. ${SPEAK_WHO}
Someone asked the learner a question and they answered quickly in speech. Judge if the answer makes sense as a reply (it does not need to be long or perfect).
Reply with ONLY one JSON object, no markdown: {"correct":true,"fb_zh":"简体中文：一两句反馈","fix":null,"better":"a natural reply a fluent speaker might give, 1-2 sentences"}  — set "fix" to {"bad":"...","good":"...","why_zh":"..."} only for a clear grammar/word mistake.`;
const COACH_SYS = `You are a warm, practical English speaking coach writing in Simplified Chinese for a complete beginner who does not know how to start practising speaking. ${SPEAK_WHO}
You get their self-assessment and their practice history. Make a concrete plan for the NEXT 7 DAYS using only these sections of the app (use the key in "sec"):
rescue (救命句：听不懂/想不起时的 40 句), intro (自我介绍 12 句), daily (每日一练), dialog (情景对话：听全文、跟读、角色扮演), func (常用表达), drill (句型操练), pron (发音：最小对立词、连读、重音、绕口令、数字), shadow (跟读 120 句), clip (原声跟读), quick (快问快答), chat (AI 陪练), howto (这句话英语怎么说), topic (话题卡，AI 点评), mock (雅思口语模拟考).
Reply with ONLY one JSON object, no markdown:
{"level_zh":"一句话判断他现在的水平","advice_zh":"2-3 句最重要的建议","days":[{"day":1,"title":"今天的主题","steps":[{"do_zh":"具体做什么、做多久","sec":"rescue"}]}],"encourage_zh":"一句鼓励"}
In "do_zh" write plain Chinese for the learner (never write the section keys like rescue/dialog in the text; the button shows the section). Exactly 7 days, 2-4 steps each, about 15-20 minutes a day, start easy (listen and repeat) and build up to talking with the AI and topics.`;
// 「📰 今日新闻」的 AI 简化版 + 读后小测：POST /api/ai {task:"newsimp", url, title, text} → { ok, simple, summary_zh, quiz:[{q, opts, ans, why_zh}], words:[{en, zh}] }；
// 同一篇（按网址）存 KV「news/simp/哈希」7 天，全家共用，一篇只花一次额度
const NEWSIMP_SYS = `You are an expert ESL materials writer. The reader is a Chinese native speaker at about CEFR B1 who lives in Kuala Lumpur.
Rewrite the news article for them in 250-350 words (never more than 380 words; leave out minor details), CEFR B1 English, short clear sentences, explain or replace rare words, keep all key facts, names and numbers correct, neutral tone. Separate paragraphs with a blank line.
Then write 4 multiple-choice comprehension questions about the article (in English, 3 options each, only one correct) and pick 6-8 useful words or phrases from the ORIGINAL article that a B1 learner probably does not know.
Reply with ONLY one JSON object, no markdown:
{"simple":"the rewritten article","summary_zh":"两句简体中文概括","quiz":[{"q":"question","opts":["A","B","C"],"ans":0,"why_zh":"简体中文：为什么"}],"words":[{"en":"word or phrase as used in the article","zh":"中文意思"}]}`;
async function aiJson(env, msgs, ok, maxTok) {
  let last = "";
  for (const m of AI_MODELS) {
    try {
      const r = await env.AI.run(m, { messages: msgs, max_tokens: maxTok || 1024, temperature: 0.3 });
      const raw = r && (typeof r.response === "string" ? r.response : JSON.stringify(r.response || r)), o = pickJson(raw);
      if (o && ok(o)) return Object.assign({}, o, { ok: true, model: m }); // ok / model 是接口自己的，不让 AI 的输出盖掉
      last = "bad output";
    } catch (e) { last = String(e && e.message || e); }
  }
  return { ok: false, error: last || "ai failed" };
}
const clip = (s, n) => String(s == null ? "" : s).slice(0, n);
function pickJson(s) { s = String(s || ""); const i = s.indexOf("{"), j = s.lastIndexOf("}"); if (i < 0 || j <= i) return null; try { return JSON.parse(s.slice(i, j + 1)); } catch (e) { return null; } }
async function ai(req, env) {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (!env.AI) return json({ ok: false, error: "noai" });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  try {
    const b = await req.json(), text = String(b.text || "").split(/\s+/).slice(0, 1500).join(" ").slice(0, 10000), prompt = String(b.prompt || "").slice(0, 3000);
    if (b.task === "newsimp") {
      const t = String(b.text || "").split(/\s+/).slice(0, 1000).join(" "), title = clip(b.title, 300); if (t.split(" ").length < 80) return json({ ok: false, error: "bad body" }, 400);
      let hh = 2166136261; const hs = String(b.url || title || t.slice(0, 200)); for (let i = 0; i < hs.length; i++) { hh ^= hs.charCodeAt(i); hh = Math.imul(hh, 16777619); }
      const key = "news/simp/" + (hh >>> 0).toString(36), c = env.CAPTIONS && !b.fresh ? await env.CAPTIONS.get(key, "json") : null; if (c) return json(Object.assign(c, { cached: 1 }));
      const r = await aiJson(env, [{ role: "system", content: NEWSIMP_SYS }, { role: "user", content: "Title: " + title + "\n\n" + t }], o => typeof o.simple === "string" && o.simple.split(/\s+/).length > 80 && Array.isArray(o.quiz), 3800); // 输出要放得下改写稿 + 题目，太小会被截断
      if (r.ok) { r.quiz = (r.quiz || []).filter(q => q && q.q && Array.isArray(q.opts) && q.opts.length >= 2 && +q.ans >= 0 && +q.ans < q.opts.length).slice(0, 5); r.words = (Array.isArray(r.words) ? r.words : []).filter(w => w && w.en).slice(0, 10); if (env.CAPTIONS) await env.CAPTIONS.put(key, JSON.stringify(r), { expirationTtl: 7 * 86400 }); }
      return json(r, r.ok ? 200 : 502);
    }
    // 口语：chat（陪练回一句）、chatsum（聊完总结）、speak（话题回答点评）
    if (b.task === "chat" || b.task === "chatsum") {
      const H = (Array.isArray(b.history) ? b.history : []).slice(-16).map(x => ({ role: x && x.role === "assistant" ? "assistant" : "user", content: clip(x && x.content, 500) })).filter(x => x.content.trim());
      if (b.task === "chat") {
        const r = await aiJson(env, [{ role: "system", content: CHAT_SYS(clip(b.scene, 400)) }].concat(H.length ? H : [{ role: "user", content: "(The conversation starts now. Greet me and open the conversation for this situation.)" }]), o => typeof o.reply === "string" && o.reply.trim(), 300);
        return json(r.ok ? { ok: true, model: r.model, reply: String(r.reply).trim(), fix: r.fix && r.fix.bad && r.fix.good ? { bad: clip(r.fix.bad, 300), good: clip(r.fix.good, 300), why_zh: clip(r.fix.why_zh, 300) } : null } : r, r.ok ? 200 : 502);
      }
      if (H.filter(x => x.role === "user").length < 2) return json({ ok: false, error: "too short" }, 400);
      const conv = H.map(x => (x.role === "user" ? "user: " : "partner: ") + x.content).join("\n");
      const r = await aiJson(env, [{ role: "system", content: CHATSUM_SYS }, { role: "user", content: "Situation: " + clip(b.scene, 400) + "\n\nConversation:\n" + conv }], o => typeof o.summary_zh === "string", 1200);
      return json(r, r.ok ? 200 : 502);
    }
    if (b.task === "howto") {
      const q = clip(b.text, 400).trim(); if (!q) return json({ ok: false, error: "bad body" }, 400);
      const r = await aiJson(env, [{ role: "system", content: HOWTO_SYS }, { role: "user", content: q }], o => Array.isArray(o.items) && o.items.length, 700);
      return json(r, r.ok ? 200 : 502);
    }
    if (b.task === "useword") {
      const w = clip(b.word, 80).trim(), t = clip(b.text, 500).trim(); if (!w || !t) return json({ ok: false, error: "bad body" }, 400);
      const r = await aiJson(env, [{ role: "system", content: USEWORD_SYS }, { role: "user", content: "Target: " + w + (b.zh ? " (" + clip(b.zh, 80) + ")" : "") + "\nLearner's sentence: " + t }], o => typeof o.correct === "boolean", 500);
      return json(r, r.ok ? 200 : 502);
    }
    if (b.task === "judge") {
      const q = clip(b.prompt, 300).trim(), t = clip(b.text, 600).trim(); if (!q || !t) return json({ ok: false, error: "bad body" }, 400);
      const r = await aiJson(env, [{ role: "system", content: JUDGE_SYS }, { role: "user", content: "Question: " + q + "\nLearner's answer: " + t }], o => typeof o.correct === "boolean", 400);
      return json(r, r.ok ? 200 : 502);
    }
    if (b.task === "coach") {
      const r = await aiJson(env, [{ role: "system", content: COACH_SYS }, { role: "user", content: clip(b.text, 3000) }], o => Array.isArray(o.days) && o.days.length, 2000);
      return json(r, r.ok ? 200 : 502);
    }
    if (b.task === "speak") {
      if (text.split(/\s+/).length < 8) return json({ ok: false, error: "too short" }, 400);
      const r = await aiJson(env, [{ role: "system", content: SPEAKRATE_SYS }, { role: "user", content: "Question: " + (prompt || "(not given)") + "\n\nTranscript of the candidate's spoken answer:\n" + text }], o => o.band && typeof o.better === "string", 1600);
      if (r.ok && r.band) { const h = v => Math.round((+v || 0) * 2) / 2, B = r.band; ["FC", "LR", "GRA"].forEach(k => (B[k] = h(B[k]))); B.overall = h((B.FC + B.LR + B.GRA) / 3); } // 雅思只有整分和半分
      return json(r, r.ok ? 200 : 502);
    }
    if (b.task !== "write" || text.split(/\s+/).length < 20) return json({ ok: false, error: "bad body" }, 400);
    const K1 = "IELTS Academic Writing Task 1 (report on visual data given as text, at least 150 words; needs an overview)", K2 = "IELTS Writing Task 2 (essay, at least 250 words)", KM = "an email / letter (IELTS General Training Task 1, at least 150 words)";
    const kind = { t1: K1, task1: K1, t2: K2, task2: K2, mail: KM, email: KM, free: "free writing (judge it like general academic English)" }[b.type] || "IELTS Writing Task 2 (essay, at least 250 words)";
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

// GET /api/tts?t=英文句子&v=声音 → audio/mpeg：口语页的 AI 真人语音（Workers AI @cf/deepgram/aura-1，每 1,000 个字母约 1,364 neurons）
//   v 只能是 TTS_VOICES 里的；t 最长 1500 个字母。生成过的放进 Cloudflare 缓存（同一句不重复花额度）。
//   固定句子由 GitHub Actions（.github/workflows/tts.yml）每天用剩下的额度预先生成成 web/tts/*.mp3，网页优先播那些静态文件；这里只给 AI 回复、随机数字这类每次不同的句子用。
const TTS_VOICES = ["asteria", "luna", "stella", "athena", "hera", "orion", "arcas", "perseus", "angus", "orpheus", "helios", "zeus"];
async function tts(req, env, u, ctx) {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "GET") return json({ ok: false, error: "method" }, 405);
  if (!env.AI) return json({ ok: false, error: "noai" }, 503);
  const t = String(u.searchParams.get("t") || "").replace(/\s+/g, " ").trim(), v = u.searchParams.get("v") || "asteria";
  if (!t || t.length > 1500 || !/[a-z]/i.test(t)) return json({ ok: false, error: "text" }, 400);
  if (!TTS_VOICES.includes(v)) return json({ ok: false, error: "voice" }, 400);
  const key = new Request("https://tts.cache/" + v + "?t=" + encodeURIComponent(t)), cache = typeof caches !== "undefined" ? caches.default : null;
  try { const hit = cache && await cache.match(key); if (hit) return hit; } catch (e) {}
  try {
    let r = await env.AI.run("@cf/deepgram/aura-1", { text: t, speaker: v, encoding: "mp3" });
    let body = r;
    if (r && typeof r === "object" && !(r instanceof ReadableStream) && !(r instanceof ArrayBuffer) && !ArrayBuffer.isView(r) && r.audio) { const b = atob(r.audio), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); body = a; }
    const buf = await new Response(body).arrayBuffer();
    if (buf.byteLength < 200) return json({ ok: false, error: "empty audio" }, 502);
    const res = new Response(buf, { headers: { "content-type": "audio/mpeg", "cache-control": "public, max-age=31536000, immutable", "access-control-allow-origin": "*" } });
    if (cache) { const put = cache.put(key, res.clone()).catch(() => {}); if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put; }
    return res;
  } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 502); }
}

export default {
  async fetch(req, env, ctx) {
    const u = new URL(req.url);
    if (API_PATHS.includes(u.pathname)) return cap(req, env, u);
    if (u.pathname === VOCAB_PATH) return vocab(req, env);
    if (u.pathname === "/api/users") return users(req, env);
    if (u.pathname === EXT_PATH) return ext(req, env);
    if (u.pathname === MEDIA_PATH) return media(req, env);
    if (u.pathname === SENT_PATH) return sent(req, env, u);
    if (u.pathname === "/api/dict") return dict(req, env, u);
    if (u.pathname === "/api/mine") return mine(req, env, u);
    if (u.pathname === "/api/readurl") return readurl(req, env, u);
    if (u.pathname === "/api/news") return news(req, env, u);
    if (u.pathname === "/api/sme") return sme(req, env, u);
    if (u.pathname === "/api/ai") return ai(req, env);
    if (u.pathname === "/api/stt") return stt(req, env);
    if (u.pathname === "/api/tts") return tts(req, env, u, ctx);
    return env.ASSETS.fetch(req);
  }
};
