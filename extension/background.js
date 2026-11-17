// 生词本同步配置放在 config.js（不进仓库；参照 config.example.js 创建）
let VS_SYNC = { bin: "", key: "" };
try { importScripts("config.js"); } catch (e) {}
const BIN = VS_SYNC.bin, KEY = VS_SYNC.key;
const BASE = "https://api.jsonbin.io/v3/b/" + BIN;

// ---------- 翻译 ----------
async function gTranslate(text, tl, sl) {
  const u = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=" + encodeURIComponent(sl || "auto") + "&tl=" + encodeURIComponent(tl) + "&dt=t&q=" + encodeURIComponent(text);
  const r = await fetch(u); if (!r.ok) throw new Error("g" + r.status);
  const j = await r.json();
  return (j[0] || []).map(x => x[0]).join("");
}
let msTok = null, msExp = 0;
async function msToken() {
  if (msTok && Date.now() < msExp) return msTok;
  const r = await fetch("https://edge.microsoft.com/translate/auth"); if (!r.ok) throw new Error("auth");
  msTok = (await r.text()).trim(); msExp = Date.now() + 8 * 60 * 1000; return msTok;
}
async function msTranslate(texts, tl, sl) {
  const to = { "zh-CN": "zh-Hans", "zh-TW": "zh-Hant" }[tl] || tl;
  const tok = await msToken();
  const r = await fetch("https://api-edge.cognitive.microsofttranslator.com/translate?" + (sl ? "from=" + encodeURIComponent(sl) + "&" : "") + "to=" + to + "&api-version=3.0&includeSentenceLength=true", {
    method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: JSON.stringify(texts.map(Text => ({ Text })))
  });
  if (!r.ok) { msTok = null; throw new Error("ms" + r.status); }
  const j = await r.json(); return j.map(x => (x.translations && x.translations[0] && x.translations[0].text) || "");
}
async function translateMany(texts, tl, engine, sl) {
  if (engine === "ms") { try { return await msTranslate(texts, tl, sl); } catch (e) { /* 回退到 Google */ } }
  return Promise.all(texts.map(t => gTranslate(t, tl, sl).catch(() => "")));
}

// ---------- 查词 ----------
const POS_ZH = { noun: "n.", verb: "v.", adjective: "adj.", adverb: "adv.", pronoun: "pron.", preposition: "prep.", conjunction: "conj.", interjection: "int.", determiner: "det.", exclamation: "excl.", abbreviation: "abbr.", article: "art.", numeral: "num.", particle: "part.", prefix: "pref.", suffix: "suf.", phrase: "phr." };
// 复习用的例句：来自 Tatoeba 例句库（CC-BY），带中文翻译；结果存本地
async function sentences(word, tl, sl) {
  if (sl && sl !== "en") return [];
  const k = "sent:" + tl + ":" + word, c = await chrome.storage.local.get(k); if (c[k]) return c[k];
  const zh = /^zh/i.test(tl || "");
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 6000); // 例句库有时很慢，最多等 6 秒
  const r = await fetch("https://tatoeba.org/en/api_v0/search?from=eng&query=" + encodeURIComponent(word) + "&sort=relevance&word_count_max=14" + (zh ? "&to=cmn&trans_filter=limit&trans_to=cmn" : ""), { signal: ac.signal }).finally(() => clearTimeout(tm));
  if (!r.ok) throw new Error("t" + r.status);
  const j = await r.json();
  const out = (j.results || []).map(x => { const ts = (x.translations || []).flat().filter(t => t && t.lang === "cmn"), t = ts.find(t => t.script === "Hans") || ts[0]; return { en: x.text, tr: zh && t ? t.text : "" }; }).filter(x => x.en && x.en.length <= 90).slice(0, 8);
  if (out.length) chrome.storage.local.set({ [k]: out });
  return out;
}
// 查词结果存本地：同一个词第二次悬停不再联网；失败自动重试一次
async function gWord(word, tl, sl) {
  const k = "dc:" + tl + ":" + word, c = await chrome.storage.local.get(k); if (c[k]) return c[k];
  let g; try { g = await gWordRaw(word, tl, sl); } catch (e) { await new Promise(r => setTimeout(r, 500)); g = await gWordRaw(word, tl, sl); }
  if (g && g.t) chrome.storage.local.set({ [k]: g });
  return g;
}
async function gWordRaw(word, tl, sl) {
  const u = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=" + encodeURIComponent(sl || "auto") + "&tl=" + encodeURIComponent(tl) + "&dt=t&dt=bd&q=" + encodeURIComponent(word);
  const r = await fetch(u); if (!r.ok) throw new Error("g" + r.status);
  const j = await r.json();
  const t = (j[0] || []).map(x => x[0]).join("");
  const zh = /['’]/.test(word) ? [] : (j[1] || []).slice(0, 4).map(e => ({ pos: POS_ZH[e[0]] || e[0], words: (e[1] || []).filter(x => !/[。！？.!?]$/.test(x) && x.length <= 12).slice(0, 5) })).filter(z => z.words.length);
  return { t, zh };
}
function stems(w) {
  const c = []; const add = x => { if (x.length > 1 && x !== w) c.push(x); };
  if (/ies$/.test(w)) add(w.slice(0, -3) + "y");
  if (/(es|ed|er)$/.test(w)) { add(w.slice(0, -2)); add(w.slice(0, -1)); }
  if (/s$/.test(w)) add(w.slice(0, -1));
  if (/ied$/.test(w)) add(w.slice(0, -3) + "y");
  if (/ed$/.test(w) && /(.)\1$/.test(w.slice(0, -2))) add(w.slice(0, -3));
  if (/ing$/.test(w)) { add(w.slice(0, -3)); add(w.slice(0, -3) + "e"); if (/(.)\1$/.test(w.slice(0, -3))) add(w.slice(0, -4)); }
  if (/ly$/.test(w)) add(w.slice(0, -2));
  return c;
}
const ARPA = { AA: "ɑ", AE: "æ", AH: "ʌ", AO: "ɔ", AW: "aʊ", AY: "aɪ", B: "b", CH: "tʃ", D: "d", DH: "ð", EH: "ɛ", ER: "ɝ", EY: "eɪ", F: "f", G: "ɡ", HH: "h", IH: "ɪ", IY: "i", JH: "dʒ", K: "k", L: "l", M: "m", N: "n", NG: "ŋ", OW: "oʊ", OY: "ɔɪ", P: "p", R: "ɹ", S: "s", SH: "ʃ", T: "t", TH: "θ", UH: "ʊ", UW: "u", V: "v", W: "w", Y: "j", Z: "z", ZH: "ʒ" };
const VOW = new Set("AA AE AH AO AW AY EH ER EY IH IY OW OY UH UW".split(" "));
function arpaToIpa(pron) {
  let out = "";
  for (const p of pron.trim().split(/\s+/)) {
    const m = /^([A-Z]+)(\d)?$/.exec(p); if (!m) continue;
    let sym = ARPA[m[1]]; if (!sym) continue;
    if (m[1] === "AH" && m[2] === "0") sym = "ə"; if (m[1] === "ER" && m[2] === "0") sym = "ɚ";
    out += (VOW.has(m[1]) ? (m[2] === "1" ? "ˈ" : m[2] === "2" ? "ˌ" : "") : "") + sym;
  }
  return out ? "/" + out + "/" : "";
}
async function phonetic(w) {
  try {
    const r = await fetch("https://api.datamuse.com/words?sp=" + encodeURIComponent(w) + "&md=r&max=1"); if (!r.ok) return "";
    const j = await r.json(); const e = j[0]; if (!e || e.word !== w) return "";
    const t = (e.tags || []).find(x => x.startsWith("pron:")); return t ? arpaToIpa(t.slice(5)) : "";
  } catch (e) { return ""; }
}
const strip = h => String(h || "").replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const cut = (s, n) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s);
async function wikt(w) {
  const r = await fetch("https://en.wiktionary.org/api/rest_v1/page/definition/" + encodeURIComponent(w));
  if (!r.ok) return null;
  const j = await r.json(); const en = (j.en || []);
  const meanings = en.filter(m => !/^(symbol|letter|number|punctuation mark)$/i.test(m.partOfSpeech || "")).slice(0, 3).map(m => ({
    pos: POS_ZH[(m.partOfSpeech || "").toLowerCase()] || (m.partOfSpeech || "").toLowerCase(),
    defs: (m.definitions || []).map(d => ({ def: cut(strip(d.definition), 150), example: cut(strip((d.examples || [])[0] || ""), 120) })).filter(d => d.def).slice(0, 2)
  })).filter(m => m.defs.length);
  return meanings.length ? meanings : null;
}
async function dict(word) {
  const w = word.toLowerCase();
  try {
    let meanings = await wikt(w).catch(() => null), lemma = "";
    if (!meanings) for (const s of stems(w)) { meanings = await wikt(s).catch(() => null); if (meanings) { lemma = s; break; } }
    const first = meanings && meanings[0] && meanings[0].defs[0] && meanings[0].defs[0].def || "";
    const lm = /\bof ([A-Za-z'-]+)\.?$/.exec(first); if (!lemma && lm && /(past|participle|plural|person|form|comparative|superlative|spelling)/i.test(first)) lemma = lm[1].toLowerCase();
    const ph = await phonetic(lemma && !/^\s*$/.test(lemma) && w !== lemma ? w : w);
    if (!meanings && !ph) return null;
    return { phonetic: ph, audio: "", meanings: meanings || [], lemma };
  } catch (e) { return null; }
}

// ---------- 加入生词本 ----------
async function addWord(word) {
  word = (word || "").trim(); if (!word) return { ok: false };
  const st = await chrome.storage.local.get({ saved: [] });
  if (!st.saved.some(w => w.toLowerCase() === word.toLowerCase())) { st.saved.push(word); await chrome.storage.local.set({ saved: st.saved }); }
  if (!BIN || !KEY) return { ok: true, cloud: false };
  try {
    const r = await fetch(BASE + "/latest", { headers: { "X-Access-Key": KEY, "X-Bin-Meta": "false" } });
    if (!r.ok) throw 0;
    const d = await r.json();
    d.pending = d.pending || [];
    if (!d.pending.some(w => (w + "").toLowerCase() === word.toLowerCase())) d.pending.push(word);
    const p = await fetch(BASE, { method: "PUT", headers: { "Content-Type": "application/json", "X-Access-Key": KEY }, body: JSON.stringify({ custom: d.custom || [], progress: d.progress || {}, deleted: d.deleted || [], pending: d.pending }) });
    return { ok: p.ok, cloud: p.ok };
  } catch (e) { return { ok: true, cloud: false }; }
}

async function phrases(titles) {
  const out = [];
  for (let i = 0; i < titles.length; i += 45) {
    const part = titles.slice(i, i + 45);
    const r = await fetch("https://en.wiktionary.org/w/api.php?action=query&format=json&origin=*&titles=" + encodeURIComponent(part.join("|")));
    const j = await r.json(), norm = {}; ((j.query && j.query.normalized) || []).forEach(n => (norm[n.to] = n.from));
    Object.values((j.query && j.query.pages) || {}).forEach(p => { if (p.missing === undefined && p.invalid === undefined) out.push(norm[p.title] || p.title); });
  }
  return out;
}
chrome.runtime.onMessage.addListener((m, _s, send) => {
  if (m.type === "translateMany") translateMany(m.texts, m.tl, m.engine, m.sl).then(t => send({ t })).catch(() => send({}));
  else if (m.type === "translate") translateMany([m.text], m.tl, m.engine, m.sl).then(t => send({ t: t[0] })).catch(() => send({}));
  else if (m.type === "phrases") phrases(m.titles).then(exist => send({ exist })).catch(() => send({}));
  else if (m.type === "wordLite") gWord(/['’]/.test(m.word) ? m.word.replace(/’/g, "'") : m.word.toLowerCase(), m.tl, m.sl).then(g => send({ g })).catch(() => send({}));
  else if (m.type === "word") Promise.all([gWord(/['’]/.test(m.word) ? m.word.replace(/’/g, "'") : m.word.toLowerCase(), m.tl, m.sl).catch(() => null), dict(m.word)]).then(([g, d]) => send({ g, d }));
  else if (m.type === "reloadSelf") { send({}); setTimeout(() => chrome.runtime.reload(), 200); }
  else if (m.type === "pending" && (!BIN || !KEY)) send({});
  else if (m.type === "pending") fetch(BASE + "/latest", { headers: { "X-Access-Key": KEY, "X-Bin-Meta": "false" } }).then(r => r.json()).then(d => send({ pending: d.pending || [] })).catch(() => send({}));
  else if (m.type === "openSettings") { chrome.windows.create({ url: chrome.runtime.getURL("popup.html"), type: "popup", width: 340, height: 760 }); send({}); }
  else if (m.type === "openLevel") { chrome.runtime.openOptionsPage(); send({}); }
  else if (m.type === "openSaved") { chrome.tabs.create({ url: chrome.runtime.getURL("saved.html") }); send({}); }
  else if (m.type === "openReview") { chrome.tabs.create({ url: chrome.runtime.getURL("review.html") }); send({}); }
  else if (m.type === "sentences") sentences(m.word, m.tl, m.sl).then(s => send({ s })).catch(() => send({ s: [] }));
  else if (m.type === "add") addWord(m.word).then(send);
  else return false;
  return true;
});
