// 看视频学英语：替网页取 YouTube 字幕 / 查词 / 翻译（浏览器因跨域拿不到）
// GET /.netlify/functions/yt?v=<视频ID>&tl=zh-CN        → { title, lang, kind, cues:[{s,e,t,r}] }
// GET /.netlify/functions/yt?w=<单词或短语>&tl=zh-CN    → { t, zh:[{pos,words}] }
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const json = (o, status = 200, cache = 0) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache ? "public, max-age=" + cache : "no-store" } });
const POS = { noun: "名词", verb: "动词", adjective: "形容词", adverb: "副词", preposition: "介词", pronoun: "代词", conjunction: "连词", interjection: "感叹词", abbreviation: "缩写", phrase: "短语" };

async function gt(q, tl, extra = "") {
  const r = await fetch("https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=" + encodeURIComponent(tl) + "&dt=t" + extra + "&q=" + encodeURIComponent(q), { headers: { "user-agent": UA } });
  if (!r.ok) throw new Error("gt " + r.status);
  return r.json();
}
async function word(w, tl) {
  const j = await gt(w, tl, "&dt=bd");
  return { t: (j[0] || []).map(x => x[0]).join(""), zh: (j[1] || []).slice(0, 4).map(e => ({ pos: POS[e[0]] || e[0], words: (e[1] || []).slice(0, 5) })) };
}
async function translateLines(lines, tl) { // 按块合并翻译，行数对不上就逐行回退
  const out = new Array(lines.length).fill(""), chunks = []; let cur = [], len = 0;
  lines.forEach((t, i) => { if (len + t.length > 1500 || cur.length >= 40) { chunks.push(cur); cur = []; len = 0; } cur.push(i); len += t.length + 1; });
  if (cur.length) chunks.push(cur);
  await Promise.all(chunks.map(async idx => {
    try {
      const j = await gt(idx.map(i => lines[i].replace(/\n/g, " ")).join("\n"), tl);
      const parts = (j[0] || []).map(x => x[0]).join("").split("\n");
      if (parts.length === idx.length) idx.forEach((i, k) => out[i] = parts[k].trim());
      else await Promise.all(idx.map(async i => { try { const x = await gt(lines[i], tl); out[i] = (x[0] || []).map(y => y[0]).join("").trim(); } catch (e) {} }));
    } catch (e) {}
  }));
  return out;
}
function parseJson3(j) {
  const cues = [];
  for (const ev of j.events || []) {
    if (!ev.segs) continue;
    const t = ev.segs.map(s => s.utf8 || "").join("").replace(/\s+/g, " ").trim();
    if (!t) continue;
    cues.push({ s: (ev.tStartMs || 0) / 1000, e: ((ev.tStartMs || 0) + (ev.dDurationMs || 0)) / 1000, t });
  }
  for (let i = 0; i < cues.length - 1; i++) if (cues[i].e > cues[i + 1].s) cues[i].e = cues[i + 1].s; // 自动字幕滚动重叠
  return cues.filter(c => c.e > c.s);
}
async function player(v, client) {
  const r = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", { method: "POST", headers: { "content-type": "application/json", "user-agent": client.ua || UA }, body: JSON.stringify({ context: { client: client.ctx }, videoId: v }) });
  if (!r.ok) throw new Error("player " + r.status);
  return r.json();
}
const CLIENTS = [
  { name: "android", ctx: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 30, hl: "en" }, ua: "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip" },
  { name: "web_embedded", ctx: { clientName: "WEB_EMBEDDED_PLAYER", clientVersion: "1.20250310.01.00", hl: "en" } },
  { name: "tv", ctx: { clientName: "TVHTML5", clientVersion: "7.20250312.16.00", hl: "en" } },
];
async function captions(v, tl) {
  const errs = [];
  for (const c of CLIENTS) {
    try {
      const p = await player(v, c);
      const tracks = p.captions && p.captions.playerCaptionsTracklistRenderer && p.captions.playerCaptionsTracklistRenderer.captionTracks;
      if (!tracks || !tracks.length) { errs.push(c.name + ":" + ((p.playabilityStatus && (p.playabilityStatus.reason || p.playabilityStatus.status)) || "no tracks")); continue; }
      const en = tracks.filter(t => /^en/.test(t.languageCode));
      const tr = en.find(t => t.kind !== "asr") || en[0] || tracks[0];
      const base = tr.baseUrl.replace(/&fmt=[^&]*/, "");
      const r = await fetch(base + "&fmt=json3", { headers: { "user-agent": c.ua || UA } });
      if (!r.ok) { errs.push(c.name + ":timedtext " + r.status); continue; }
      const txt = await r.text(); if (!txt) { errs.push(c.name + ":empty"); continue; }
      let cues = parseJson3(JSON.parse(txt));
      if (!cues.length) { errs.push(c.name + ":no cues"); continue; }
      if (!/^en/.test(tr.languageCode)) { // 没有英文轨：用 YouTube 的机翻英文当原文
        const r2 = await fetch(base + "&fmt=json3&tlang=en", { headers: { "user-agent": c.ua || UA } });
        if (r2.ok) { const c2 = parseJson3(await r2.json()); if (c2.length) cues = c2; }
      }
      // 译文：优先同语言的人工字幕，否则机翻
      const human = tracks.find(t => t.kind !== "asr" && t.languageCode.toLowerCase().split("-")[0] === tl.toLowerCase().split("-")[0] && t !== tr);
      let rs = null;
      if (human) { try { const r3 = await fetch(human.baseUrl.replace(/&fmt=[^&]*/, "") + "&fmt=json3"); const hc = parseJson3(await r3.json()); rs = cues.map(q => hc.filter(h => h.s < q.e - 0.05 && h.e > q.s + 0.05).map(h => h.t).join(" ")); if (rs.filter(Boolean).length < cues.length * 0.6) rs = null; } catch (e) { rs = null; } }
      if (!rs) rs = await translateLines(cues.map(q => q.t), tl);
      cues.forEach((q, i) => q.r = rs[i] || "");
      return { ok: true, v, title: (p.videoDetails && p.videoDetails.title) || "", author: (p.videoDetails && p.videoDetails.author) || "", lang: tr.languageCode, kind: tr.kind === "asr" ? "auto" : "manual", human: !!human, via: c.name, cues };
    } catch (e) { errs.push(c.name + ":" + e.message); }
  }
  return { ok: false, v, error: errs.join(" | ") };
}
export default async (req) => {
  const u = new URL(req.url), tl = u.searchParams.get("tl") || "zh-CN";
  try {
    const w = u.searchParams.get("w");
    if (w) return json(await word(w.slice(0, 200), tl), 200, 86400);
    const v = u.searchParams.get("v") || "";
    if (!/^[\w-]{11}$/.test(v)) return json({ ok: false, error: "bad video id" }, 400);
    const r = await captions(v, tl);
    return json(r, 200, r.ok ? 3600 : 0);
  } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 200); }
};
