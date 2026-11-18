// 复习（交互对齐 Language Reactor 的 PhrasePump）：每个词连续练 3 个例句；先听、再显示原文、再显示翻译；
// 复习过的词先出一张填空题；句子里的词按难度上色，左键查词典、右键标记；按间隔重复安排下次复习时间
const $ = id => document.getElementById(id);
const send = m => new Promise(res => { try { chrome.runtime.sendMessage(m, r => res(r || {})); } catch (e) { res({}); } });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const IC = {
  back: '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>', prev: '<path d="M15 5l-7 7 7 7"/>', next: '<path d="M9 5l7 7-7 7"/>',
  replay: '<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v5h5"/>', eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  star: '<path class="s" d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>', more: '<circle class="f" cx="12" cy="5" r="1.8"/><circle class="f" cx="12" cy="12" r="1.8"/><circle class="f" cx="12" cy="19" r="1.8"/>',
  play: '<path class="f" d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11.3-6.8a1 1 0 0 0 0-1.72L9.5 4.34A1 1 0 0 0 8 5.2z"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  kb: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/>', fs: '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>'
};
const I = n => '<svg class="vi" viewBox="0 0 24 24">' + IC[n] + "</svg>";
const DAY = 864e5, GAP = [10 * 6e4, DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY, 90 * DAY]; // 每升一级，下次复习隔得更久
const DONE = 5; // 到这一级（间隔 35 天）算“已学习”
const PER = 3;  // 每个词连续练几张卡（和 LR 一样，一个词连着出 3 个例句）
const NUMS = [20, 40, 60, 80, 100], NEWS = [0, 5, 10, 15, 20, 25], RATES = [1, 0.8];
const LANGS = [["zh-CN", "中文（简体）"], ["zh-TW", "中文（繁體）"], ["ja", "日本語"], ["ko", "한국어"], ["en", "English"], ["es", "Español"], ["fr", "Français"], ["de", "Deutsch"], ["ru", "Русский"], ["pt", "Português"], ["vi", "Tiếng Việt"], ["th", "ไทย"], ["ms", "Bahasa Melayu"], ["id", "Bahasa Indonesia"]];
const LNAME = { en: "英语", ja: "日语", ko: "韩语", fr: "法语", de: "德语", es: "西班牙语", ru: "俄语", it: "意大利语", pt: "葡萄牙语" };
let sents = [], tags = {}, items = [], med = {}, player = null, saved = [], ctx = {}, srs = {}, sugg = {}, marks = {}, rate = 1, opt = { quiz: true, listen: true, sugg: true, num: 60, newPct: 15, speak: true, tags: [] }, S = { target: "zh-CN", srcLang: "en" }, day = { d: "", n: 0 };
let cards = [], at = 0, sess = { ok: 0, bad: 0 };
const today = () => new Date().toISOString().slice(0, 10);
const lem = w => (typeof vsLemma === "function" ? vsLemma(w.toLowerCase()) : w.toLowerCase());
const near = (v, L) => L.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
const toast = m => { const t = $("toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 1600); };

function load(cb) {
  chrome.storage.sync.get(null, s => { S = Object.assign({ target: "zh-CN", srcLang: "en" }, s); // 单词上色用的词汇水平等设置也在这里
    chrome.storage.local.get({ saved: [], savedSents: [], tags: {}, savedCtx: {}, srs: {}, sugg: {}, marks: {}, reviewRate: 1, reviewOpt: opt, reviewDay: day }, v => { sents = v.savedSents || []; tags = v.tags || {}; sugg = v.sugg || {}; marks = v.marks || {}; rate = RATES.includes(v.reviewRate) ? v.reviewRate : 1;
      saved = [...new Set(v.saved.map(w => w.toLowerCase()))].filter(w => /^[a-z][a-z'’-]*$/i.test(w)); ctx = v.savedCtx || {}; srs = v.srs || {}; opt = Object.assign(opt, v.reviewOpt); day = v.reviewDay && v.reviewDay.d === today() ? v.reviewDay : { d: today(), n: 0 };
      if (!Array.isArray(opt.tags)) opt.tags = []; opt.num = near(opt.num, NUMS); opt.newPct = near(opt.newPct, NEWS); opt.speak = true;
      VS_SAVED = new Set(v.saved.map(w => w.toLowerCase())); VS_MARKS = marks;
      // 复习的项目 = 保存的单词 + 保存的短语和句子（后者用 “s:” 开头的编号），可按颜色标签筛选
      items = saved.concat(sents.map(x => "s:" + x.k)).filter(w => !opt.tags.length || opt.tags.includes(tags[keyOf(w)] || ""));
      chrome.storage.local.get(saved.map(w => "med:w:" + w).concat(sents.map(x => "med:s:" + x.k)), m => { med = m || {}; cb(); }); // 保存时存下的原声、画面和出处
    });
  });
}
const isS = w => w.startsWith("s:"), sObj = w => sents.find(x => "s:" + x.k === w), keyOf = w => (isS(w) ? w.slice(2) : w);
const labelOf = w => { if (!isS(w)) return w; const x = sObj(w); return x ? (x.ph ? x.t : "句子") : ""; };
function plan() {
  const now = Date.now(), due = items.filter(w => srs[w] && srs[w].b < DONE + 2 && srs[w].due <= now).sort((a, b) => srs[a].due - srs[b].due), fresh = items.filter(w => !srs[w]).reverse();
  const nWords = Math.max(1, Math.round(opt.num / PER));
  let nNew = Math.min(fresh.length, Math.round(nWords * opt.newPct / 100)); if (!due.length) nNew = Math.min(fresh.length, nWords);
  let words = due.slice(0, nWords - nNew).concat(fresh.slice(0, nNew));
  // 建议：从看过的视频里挑还没保存的生词，补进这一组（最多占“新项目”的份额）
  const pool = opt.sugg ? Object.keys(sugg).filter(w => !saved.includes(w) && !marks[w] && !srs[w]).sort((a, b) => (sugg[b].n || 1) - (sugg[a].n || 1) || sugg[b].at - sugg[a].at) : [];
  const nSug = Math.min(pool.length, Math.max(0, Math.min(nWords - words.length, Math.max(1, Math.round(nWords * opt.newPct / 100)))));
  const sug = opt.newPct ? pool.slice(0, nSug) : [];
  words = words.concat(sug);
  return { due, fresh, words, sug: new Set(sug), pool };
}
const emoji = () => { const r = day.n / Math.max(1, opt.num); return r <= 0 ? "😭" : r < 0.25 ? "😢" : r < 0.5 ? "😐" : r < 1 ? "🙂" : "😄"; };
function home() {
  closePops(); $("play").style.display = "none"; $("home").style.display = "";
  const p = plan(), learning = items.filter(w => srs[w] && srs[w].b < DONE).length, done = items.filter(w => srs[w] && srs[w].b >= DONE).length;
  $("lang").textContent = LNAME[S.srcLang] || S.srcLang;
  [...$("oTags").children].forEach(b => b.classList.toggle("on", opt.tags.includes(b.dataset.v)));
  $("sDue").textContent = p.due.length; $("sNew").textContent = p.due.length ? p.due.filter(w => Date.now() - srs[w].due > DAY).length + " 个紧急" : ""; $("sQ").textContent = p.fresh.length || p.pool.length ? "+" + p.fresh.length + " 个排队中" + (p.pool.length ? "，" + p.pool.length + " 个建议" : "") : ""; $("sLrn").textContent = learning; $("sDone").textContent = done;
  $("tLrn").title = "你正在练习 " + learning + " 个单词和短语。"; $("tDone").title = "这些单词和短语你大概率能记住至少 5 周。你已经学会了 " + done + " 个。";
  $("emo").textContent = emoji(); $("tdn").textContent = day.n + " 张卡片"; $("tdb").style.width = Math.min(100, day.n / Math.max(1, opt.num) * 100) + "%";
  $("oQuiz").checked = opt.quiz; $("oListen").checked = opt.listen; $("oSugg").checked = opt.sugg;
  [["oNum", "num"], ["oNew", "newPct"]].forEach(([id, k]) => [...$(id).children].forEach(b => b.classList.toggle("on", +b.dataset.v === opt[k])));
  const n = p.words.length * (opt.listen ? PER : 1); $("cnt").textContent = n ? n + " 张卡片" : (saved.length || sents.length ? (opt.tags.length ? "这个标签下没有要练的" : "现在没有到期的词") : ""); $("start").disabled = !n; $("empty").hidden = !!(saved.length || sents.length);
  const q = p.words.slice(0, 10); $("nextBox").hidden = !q.length; $("nextQ").innerHTML = q.map(w => '<span' + (p.sug.has(w) ? ' class="sg" title="建议的新词"' : "") + ">" + esc(labelOf(w)) + "</span>").join("");
}
function saveOpt() { chrome.storage.local.set({ reviewOpt: opt }); home(); }
$("oQuiz").onchange = e => { opt.quiz = e.target.checked; if (!opt.quiz && !opt.listen) opt.listen = true; saveOpt(); };
$("oListen").onchange = e => { opt.listen = e.target.checked; if (!opt.quiz && !opt.listen) opt.quiz = true; saveOpt(); };
$("oSugg").onchange = e => { opt.sugg = e.target.checked; saveOpt(); };
$("oTags").onclick = e => { const b = e.target.closest("b"); if (!b) return; const t = b.dataset.v; opt.tags = opt.tags.includes(t) ? opt.tags.filter(x => x !== t) : opt.tags.concat(t); chrome.storage.local.set({ reviewOpt: opt }, () => load(home)); };
[["oNum", "num"], ["oNew", "newPct"]].forEach(([id, k]) => $(id).onclick = e => { const b = e.target.closest("b"); if (!b) return; opt[k] = +b.dataset.v; saveOpt(); });

// 给一个词找例句：先用保存时的原句，再用例句库（Tatoeba），再没有就只练这个词；同一个词的 3 张卡尽量用不同的句子
async function sentenceFor(w, used, first) {
  const late = ms => new Promise(res => setTimeout(() => res({}), ms));
  if (isS(w)) { // 保存的短语 / 句子：用它所在的原句
    const x = sObj(w) || { t: "", tr: "" }, m2 = med["med:s:" + x.k], en = x.ph ? x.ctx || x.t : x.t; let tr = x.ph ? (x.ctx ? (m2 && m2.tr) || "" : x.tr || "") : x.tr || (m2 && m2.tr) || "";
    if (!tr && en) { const t = await Promise.race([late(6000), send({ type: "translate", text: en, tl: S.target, engine: "google", sl: S.srcLang })]); tr = t.t || ""; }
    return { en, tr, hu: (m2 && m2.hu) || "", md: m2 || null, note: x.ph && x.ctx ? x.t + "：" + (x.tr || "") : "" };
  }
  const md = med["med:w:" + w];
  if (first && md && md.t && find(md.t, w) && !used.has(md.t)) { // 第一张用保存时的原句，配原声、画面和出处
    used.add(md.t); const s = { en: md.t, tr: md.tr || "", hu: md.hu || "", md };
    if (!s.tr) { const t = await Promise.race([late(6000), send({ type: "translate", text: s.en, tl: S.target, engine: "google", sl: S.srcLang })]); s.tr = t.t || ""; }
    return s;
  }
  const r = await Promise.race([send({ type: "sentences", word: w, tl: S.target, sl: S.srcLang }), late(7000)]); let list = (r.s || []).filter(x => find(x.en, w)).map(x => Object.assign({ src: "Tatoeba" }, x));
  const own = (ctx[w] && ctx[w].t) || (sugg[w] && sugg[w].t) || (md && md.t); if (own && find(own, w)) list.push({ en: own, tr: (md && md.t === own && md.tr) || "", src: "视频字幕" });
  if (!list.length) list = [{ en: w, tr: "", src: "" }];
  const pick = list.filter(x => !used.has(x.en)); const s = Object.assign({}, (pick.length ? pick : list)[Math.floor(Math.random() * (pick.length ? pick : list).length)]); used.add(s.en);
  if (!s.tr) { const t = await Promise.race([late(6000), send({ type: s.en === w ? "wordLite" : "translate", word: w, text: s.en, tl: S.target, engine: "google", sl: S.srcLang })]); s.tr = t.t || (t.g && t.g.t) || ""; }
  return s;
}
// 在句子里找到目标词的那个词形
function find(en, w) { if (isS(w)) { const x = sObj(w); if (!x || !x.ph) return null; const i = en.toLowerCase().indexOf(x.t.toLowerCase()); return i >= 0 && en.length > x.t.length ? { i, t: en.substr(i, x.t.length) } : null; } const L = lem(w); const m = [...en.matchAll(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)].find(x => x[0].toLowerCase() === w || lem(x[0]) === L || lem(x[0]) === w); return m ? { i: m.index, t: m[0] } : null; }

function start() {
  const p = plan(); if (!p.words.length) return;
  closePops(); $("home").style.display = "none"; $("play").style.display = "flex";
  cards = []; sess = { ok: 0, bad: 0 };
  for (const w of p.words) { // 一个词的几张卡连在一起：复习过的词先出一张填空题，其余是听力卡
    const used = new Set(), sg = p.sug.has(w), x = isS(w) ? sObj(w) : null;
    const canQuiz = opt.quiz && !!srs[w] && (!x || (x.ph && x.ctx && x.ctx.toLowerCase().includes(x.t.toLowerCase()) && x.ctx.length > x.t.length));
    const kinds = []; if (canQuiz) kinds.push("quiz"); while (kinds.length < (opt.listen ? PER : Math.max(1, kinds.length))) kinds.push(opt.listen ? "listen" : "quiz");
    if (!opt.listen && !canQuiz) kinds.splice(0, kinds.length, "listen"); // 只开了测验但这个词还不能出填空题：给一张听力卡
    kinds.forEach((k, i) => cards.push({ k, w, used, sg, first: i === 0, last: i === kinds.length - 1 }));
  }
  at = 0; show();
}
// 例句按需准备：当前这张等它，后面两张提前取（同一个词的卡按顺序取，避免拿到同一句）
function need(c) { if (!c.p) { const prev = cards[cards.indexOf(c) - 1], wait = prev && prev.w === c.w ? need(prev) : Promise.resolve(); c.p = wait.then(() => sentenceFor(c.w, c.used, c.first)).then(s => (c.s = s)).catch(() => (c.s = { en: c.w, tr: "" })); } return c.p; }
function stopAll() { speak.n = (speak.n || 0) + 1; try { speechSynthesis.cancel(); } catch (e) {} if (player) { try { player.pause(); } catch (e) {} player = null; } }
function say(c) { stopAll(); const a = c.s && c.s.md && c.s.md.aud && c.first; if (a) { try { player = new Audio(c.s.md.aud); player.playbackRate = rate; player.play().catch(() => speak(c.s.en)); return; } catch (e) {} } speak(c.s.en); }
function playPause() { // 空格：播放 / 暂停
  if (player && !player.ended) { if (player.paused) player.play().catch(() => {}); else player.pause(); return; }
  try { if (speechSynthesis.speaking) { if (speechSynthesis.paused) speechSynthesis.resume(); else speechSynthesis.pause(); return; } } catch (e) {}
  const c = cards[at]; if (c && c.s) say(c);
}
const tm = x => Math.floor(x / 60) + ":" + String(Math.floor(x % 60)).padStart(2, "0");
function mediaTop(c) { const m = c.s.md; if (!m || !c.first || !(m.img || m.img2)) return ""; return '<div class="shots">' + [m.img, m.img2].filter(Boolean).map(u => '<img src="' + u + '" alt="">').join("") + "</div>"; }
// 译文：有视频自带的人工翻译时分两行，Ⓗ 人工、Ⓜ 机器（同 LR）；只有一种就只显示一行
function trHtml(c) { const hu = c.s.hu && c.first ? c.s.hu.trim() : "", tr = (c.s.tr || "").trim(); if (hu && tr && hu !== tr) return '<div class="tl"><i>H</i>' + esc(hu) + '</div><div class="tl"><i>M</i>' + esc(tr) + "</div>"; return esc(hu || tr); }
function srcTip(c) { const m = c.s.md; if (m && c.first) return '来源：<a target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=' + encodeURIComponent(m.v) + "&t=" + Math.max(0, Math.floor(m.s)) + 's">' + esc(m.title || "YouTube") + (m.ch ? " · " + esc(m.ch) : "") + " · " + tm(m.s) + "</a>" + (m.aud ? "（原声）" : ""); return c.s.src === "Tatoeba" ? "来源：Tatoeba 例句库 CC-BY" : c.s.src ? "来源：" + esc(c.s.src) : "来源：单词本身"; }
function speakLocal(t) { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = S.srcLang === "en" ? "en-US" : S.srcLang; u.rate = 0.95 * rate; const vs = speechSynthesis.getVoices().filter(x => x.lang && x.lang.toLowerCase().startsWith(u.lang.slice(0, 2).toLowerCase())), pick = vs.find(x => /Samantha|Google US English|Microsoft Aria|Alex/i.test(x.name)) || vs.find(x => x.lang === u.lang && x.localService) || vs[0]; if (pick) u.voice = pick; speechSynthesis.speak(u); } catch (e) {} }
// 没有原声时：用在线朗读（单词用词典真人录音），取不到再用浏览器自带语音
async function speak(t) { const my = (speak.n = (speak.n || 0) + 1); try { const r = await send({ type: "tts", text: t, lang: S.srcLang }); if (my !== speak.n) return; if (r.a) { if (player) { try { player.pause(); } catch (e) {} } player = new Audio(r.a); player.playbackRate = rate; await player.play(); return; } } catch (e) {} if (my === speak.n) speakLocal(t); }
function grade(c, ok) {
  if (c.done) return; c.done = true; c.ok = ok; day.n++; sess[ok ? "ok" : "bad"]++;
  if (c.sg && !saved.includes(c.w)) { chrome.storage.local.set({ reviewDay: day }); return; }
  const r = srs[c.w] || { b: 0, n: 0 }; r.n++;
  if (ok) { if (c.last) { const failedEarlier = cards.some(x => x !== c && x.w === c.w && x.done && !x.ok); r.b = failedEarlier ? 0 : Math.min(GAP.length - 1, (srs[c.w] ? r.b + 1 : 1)); r.due = Date.now() + GAP[r.b]; } }
  else { r.b = 0; r.due = Date.now() + GAP[0]; }
  if (!r.due) r.due = Date.now() + GAP[0];
  srs[c.w] = r; chrome.storage.local.set({ srs, reviewDay: day });
}
// 句子：每个词按词汇水平上色（和视频字幕一样），目标词加框
function sentHtml(c) {
  const en = c.s.en, f = find(en, c.w), mk = t => (typeof vsMark === "function" ? vsMark(esc(t), S) : esc(t));
  if (!f) return mk(en);
  return mk(en.slice(0, f.i)) + '<span class="vs-w tw" data-w="' + esc(f.t) + '">' + esc(f.t) + "</span>" + mk(en.slice(f.i + f.t.length));
}
function show() {
  closePops(); if (at >= cards.length) return finish();
  const c = cards[at]; cards.slice(at + 1, at + 3).forEach(need);
  $("pn").textContent = (at + 1) + "/" + cards.length; $("pb").style.width = ((at + 1) / cards.length * 100) + "%";
  if (!c.s) { $("hint").innerHTML = ""; $("ctl").innerHTML = ""; $("card").innerHTML = '<div class="spin"></div>'; const me = at; need(c).then(() => { if (at === me && $("play").style.display !== "none") show(); }); return; }
  const btn = (id, ic, key, cls, tip) => '<div><button id="' + id + '" class="' + (cls || "") + '" title="' + tip + '">' + I(ic) + "</button><kbd>" + key + "</kbd></div>";
  const corner = '<span class="cr">' + starBtn(c) + '<span class="ic" id="cp" data-tip="复制">' + I("more") + "</span></span>";
  const br = '<span class="br"><span class="tchip">' + esc(labelOf(c.w)) + '</span><span class="inf" id="inf">i<span class="tt">' + srcTip(c) + "</span></span></span>";
  if (c.k === "listen") {
    c.rev = c.rev || 0;
    $("hint").innerHTML = "<small>🔊 听力练习</small>在展示文本之前试着理解。";
    $("card").innerHTML = '<span class="pl" id="pl" title="播放">' + I("play") + "</span>" + corner + mediaTop(c) + '<div class="en' + (c.rev < 1 ? " hid" : "") + '" id="en">' + sentHtml(c) + '</div><div class="zh' + (c.rev < 2 ? " hid" : "") + '" id="zh">' + trHtml(c) + "</div>" + (c.s.note ? '<div class="pn' + (c.rev < 2 ? " hid" : "") + '">' + esc(c.s.note) + "</div>" : "") + br + sugChip(c);
    $("ctl").innerHTML = btn("bA", "prev", "A", "", "上一个") + btn("bS", "replay", "S", "", "重复") + btn("bE", "eye", "E", "", "显示") + btn("bD", "next", "D", "pri", "下一个");
    $("bE").disabled = c.rev >= 2;
    $("bE").onclick = () => reveal(c);
    if (opt.speak && !c.spoken) { c.spoken = true; say(c); }
  } else {
    const f = find(c.s.en, c.w) || { i: 0, t: c.s.en };
    $("hint").innerHTML = "<small>✏️ 测验</small>填空题：输入句子里缺少的单词，按回车检查。";
    $("card").innerHTML = '<span class="pl" id="pl" title="播放（会念出答案）">' + I("play") + "</span>" + corner + mediaTop(c) + '<div class="en" id="en">' + (typeof vsMark === "function" ? vsMark(esc(c.s.en.slice(0, f.i)), S) : esc(c.s.en.slice(0, f.i))) + '<input id="inp" autocomplete="off" spellcheck="false" size="' + Math.max(4, f.t.length + 1) + '"' + (c.done ? ' disabled value="' + esc(c.typed || "") + '" class="' + (c.ok ? "ok" : "no") + '"' : "") + ">" + (typeof vsMark === "function" ? vsMark(esc(c.s.en.slice(f.i + f.t.length)), S) : esc(c.s.en.slice(f.i + f.t.length))) + '</div><div class="zh">' + trHtml(c) + '</div><div class="ans' + (c.done && !c.ok ? " no" : "") + '" id="ans">' + (c.done ? (c.ok ? "正确" : "答案：" + esc(f.t)) : "") + "</div>" + (c.done ? br : "");
    $("ctl").innerHTML = btn("bA", "prev", "A", "", "上一个") + btn("bS", "replay", "S", "", "重复（会念出答案）") + btn("bE", "eye", "E", "", "看答案（算作没答对）") + btn("bD", "next", "D", "pri", "下一个");
    const inp = $("inp"); if (!c.done) inp.focus(); $("bE").disabled = !!c.done;
    const check = give => { if (c.done) return; c.typed = inp.value.trim(); const ok = !give && c.typed.toLowerCase().replace(/’/g, "'") === f.t.toLowerCase().replace(/’/g, "'"); grade(c, ok); show(); if (opt.speak) say(c); };
    inp.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); if (c.done) go(1); else if (inp.value.trim()) check(false); } else if (e.key === "Escape") inp.blur(); };
    $("bE").onclick = () => check(true); c.check = check;
  }
  $("pl").onclick = () => say(c); if ($("sg")) $("sg").onclick = () => addSug(c); $("cst").onclick = () => toggleStar(c); $("cp").onclick = () => copySent(c);
  if ($("inf")) $("inf").onclick = e => { if (!e.target.closest("a")) $("inf").classList.toggle("on"); };
  $("bA").disabled = at === 0; $("bA").onclick = () => go(-1); $("bD").onclick = () => go(1); $("bS").onclick = () => say(c);
  const en = $("en"); en.onclick = e => { if (en.classList.contains("hid")) { reveal(c); return; } const w = e.target.closest(".vs-w"); if (w) wordPop(w); };
  en.oncontextmenu = e => { const w = e.target.closest(".vs-w"); if (!w || en.classList.contains("hid")) return; e.preventDefault(); toggleMark(w.dataset.w); };
  if ($("zh")) $("zh").onclick = () => { if (c.k === "listen") reveal(c); };
}
function copySent(c) { navigator.clipboard.writeText(c.s.en).then(() => toast("已复制当前句子"), () => toast("复制失败")); }
// 卡片右上角的星标：把这句话存进“保存的短语”
const starKey = c => (isS(c.w) ? keyOf(c.w) : "rv|" + c.s.en);
function starBtn(c) { const on = sents.some(x => x.k === starKey(c)); return '<span class="ic' + (on ? " on" : "") + '" id="cst" data-tip="' + (on ? "已保存这句" : "保存这句") + '">' + I("star") + "</span>"; }
function toggleStar(c) { const k = starKey(c); chrome.storage.local.get({ savedSents: [] }, v => { let L = v.savedSents; const i = L.findIndex(x => x.k === k); if (i >= 0) L.splice(i, 1); else L.push({ k, v: (c.s.md && c.s.md.v) || "", s: (c.s.md && c.s.md.s) || 0, t: c.s.en, tr: c.s.tr || "", at: Date.now() }); sents = L; chrome.storage.local.set({ savedSents: L }, () => { const el = $("cst"); if (el) { el.classList.toggle("on", i < 0); el.dataset.tip = i < 0 ? "已保存这句" : "保存这句"; } toast(i < 0 ? "已保存这句" : "已取消保存"); }); }); }
function sugChip(c) { return c.sg ? '<span class="sg' + (saved.includes(c.w) ? " on" : "") + '" id="sg" title="这是从你看过的视频里推荐的新词">' + (saved.includes(c.w) ? "已加入学习" : "建议的新词 · 点这里加入学习 (W)") + "</span>" : ""; }
function addSug(c) { if (!c || !c.sg || saved.includes(c.w)) return; setLearn(c.w); const el = $("sg"); if (el) { el.textContent = "已加入学习"; el.classList.add("on"); } }
function reveal(c) { if (c.k !== "listen") return; c.rev = Math.min(2, (c.rev || 0) + 1); $("en").classList.toggle("hid", c.rev < 1); $("zh").classList.toggle("hid", c.rev < 2); const pn = document.querySelector("#card .pn"); if (pn) pn.classList.toggle("hid", c.rev < 2); $("bE").disabled = c.rev >= 2; }
function go(d) {
  const c = cards[at];
  if (d > 0 && c) { if (c.k === "listen") grade(c, true); else if (!c.done) { const inp = $("inp"); if (inp && inp.value.trim()) { c.check(false); return; } grade(c, false); } }
  stopAll(); at = Math.max(0, at + d); show();
}
function finish() {
  stopAll(); $("pb").style.width = "100%"; $("pn").textContent = cards.length + "/" + cards.length; $("hint").innerHTML = ""; $("ctl").innerHTML = "";
  $("card").innerHTML = '<div class="done"><h2>这一组练完了 ' + emoji() + "</h2><p>今天一共练了 " + day.n + " 张卡片" + (sess.bad ? "，填空题有 " + sess.bad + " 张没答对" : "") + '</p><p style="color:#8b95a1;font-size:13px">没答对的词 10 分钟后会再出现；其余的按 1 天、3 天、7 天、16 天、35 天的间隔再复习。</p><button id="again">返回</button></div>';
  $("again").onclick = () => load(home);
}

// ---------- 单词：左键查词典，右键标记（和视频里一样：已掌握 / 将要学习） ----------
const isLearn = w => VS_SAVED.has(w.toLowerCase());
function setKnown(w) {
  const k = w.toLowerCase(); marks[k] = "known"; VS_MARKS = marks; VS_SAVED.delete(k); saved = saved.filter(x => x !== k);
  chrome.storage.local.get({ saved: [] }, v => chrome.storage.local.set({ marks, saved: v.saved.filter(x => x.toLowerCase() !== k) }));
  recolor(); toast(w + " → 已掌握");
}
function setLearn(w) {
  const k = w.toLowerCase(); delete marks[k]; VS_MARKS = marks; VS_SAVED.add(k); if (!saved.includes(k)) saved.push(k);
  chrome.storage.local.get({ saved: [] }, v => { if (!v.saved.some(x => x.toLowerCase() === k)) v.saved.push(w); chrome.storage.local.set({ marks, saved: v.saved }); });
  send({ type: "add", word: w, tl: S.target }); recolor(); toast(w + " → 将要学习");
}
const toggleMark = w => (isLearn(w) ? setKnown(w) : setLearn(w));
function recolor() { const c = cards[at]; if (!c || !c.s || c.k !== "listen") return; const en = $("en"); if (en) en.innerHTML = sentHtml(c); const p = document.querySelector(".wpop"); if (p && p.dataset.w) paintPopBtns(p, p.dataset.w); }
const meanings = g => { const out = []; const add = x => { x = String(x || "").trim(); if (x && !out.includes(x)) out.push(x); }; if (g) { add(g.t); (g.zh || []).forEach(z => (z.words || []).forEach(add)); } return out; };
function paintPopBtns(p, w) { p.querySelector('[data-k="known"]').classList.toggle("on", marks[w.toLowerCase()] === "known"); p.querySelector('[data-k="learn"]').classList.toggle("on", isLearn(w)); }
async function wordPop(el) {
  closePops(); const w = el.dataset.w, r = el.getBoundingClientRect();
  const p = document.createElement("div"); p.className = "wpop"; p.dataset.w = w;
  const lm = lem(w); p.innerHTML = (lm && lm !== w.toLowerCase() ? '<span class="hw">' + esc(lm) + "</span>" : "") + '<ul><li>…</li></ul><div class="wb"><button data-k="known" title="已掌握">' + I("check") + '</button><button data-k="learn" title="将要学习">' + I("book") + "</button></div>";
  document.body.append(p); paintPopBtns(p, w);
  const place = () => { const h = p.offsetHeight, wd = p.offsetWidth; p.style.left = Math.max(8, Math.min(innerWidth - wd - 8, r.left + r.width / 2 - wd / 2)) + "px"; p.style.top = (r.top - h - 8 > 8 ? r.top - h - 8 : r.bottom + 8) + "px"; };
  place();
  p.onclick = e => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.k === "known") setKnown(w); else setLearn(w); };
  if (S.speakOnClick) speak(w);
  const res = await send({ type: "wordLite", word: /['’]/.test(w) ? w.replace(/’/g, "'") : w.toLowerCase(), tl: S.target, sl: S.srcLang });
  if (!p.isConnected) return; const ms = meanings(res.g).slice(0, 5);
  p.querySelector("ul").innerHTML = ms.length ? ms.map(x => "<li>" + esc(x) + "</li>").join("") : "<li>没查到</li>"; place();
}
function closePops() { document.querySelectorAll(".wpop").forEach(x => x.remove()); ["keysPop", "qset"].forEach(id => $(id).classList.remove("on")); document.querySelectorAll('.tb[data-a="keys"],.tb[data-a="qset"]').forEach(b => b.classList.remove("on")); const i = $("inf"); if (i) i.classList.remove("on"); }
document.addEventListener("mousedown", e => { if (!e.target.closest(".wpop,.pop,.tb,.vs-w,#inf")) closePops(); });

// ---------- 顶部工具：快捷键、快速设置、播放速度、词典、全屏 ----------
const TI = { keys: "kb", qset: "gear", dict: "book", fs: "fs" };
document.querySelectorAll(".tb[data-a]").forEach(b => { if (TI[b.dataset.a]) b.innerHTML = I(TI[b.dataset.a]); });
const showRate = () => document.querySelectorAll('.tb[data-a="spd"]').forEach(b => { b.textContent = rate + "x"; b.classList.toggle("slow", rate !== 1); });
document.addEventListener("click", e => {
  const b = e.target.closest(".tb[data-a]"); if (!b) return; const a = b.dataset.a;
  if (a === "spd") { rate = RATES[(RATES.indexOf(rate) + 1) % RATES.length]; chrome.storage.local.set({ reviewRate: rate }); showRate(); const c = cards[at]; if ($("play").style.display !== "none" && c && c.s) say(c); }
  else if (a === "keys" || a === "qset") { const el = $(a === "keys" ? "keysPop" : "qset"), on = !el.classList.contains("on"); closePops(); el.classList.toggle("on", on); b.classList.toggle("on", on); if (a === "qset" && on) $("qTl").value = S.target; }
  else if (a === "dict") { const on = !$("dict").classList.contains("on"); $("dict").classList.toggle("on", on); document.body.classList.toggle("dict-on", on); document.querySelectorAll('.tb[data-a="dict"]').forEach(x => x.classList.toggle("on", on)); if (on) $("dIn").focus(); }
  else if (a === "fs") { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); }
});
$("qTl").innerHTML = LANGS.map(([v, n]) => '<option value="' + v + '">' + n + "</option>").join("");
$("qOk").onclick = () => { const v = $("qTl").value; closePops(); if (v === S.target) return; S.target = v; chrome.storage.sync.set({ target: v }); toast("翻译语言已改，新的卡片会用新语言"); cards.slice(at + 1).forEach(c => { if (!c.done) { c.p = null; c.s = null; } }); };
$("qFull").onclick = () => { closePops(); send({ type: "openSettings" }); };
$("dIn").onkeydown = async e => {
  e.stopPropagation(); if (e.key !== "Enter") return; const t = $("dIn").value.trim(); if (!t) return; $("dOut").innerHTML = '<div class="tip">查询中…</div>';
  if (/\s/.test(t) && t.split(/\s+/).length > 3) { const r = await send({ type: "translate", text: t, tl: S.target, engine: "google", sl: "auto" }); $("dOut").innerHTML = '<div class="w">' + esc(t) + "</div><p>" + esc(r.t || "没有结果") + "</p>"; return; }
  const r = await send({ type: "wordLite", word: t.toLowerCase(), tl: S.target, sl: "auto" }), ms = meanings(r.g);
  $("dOut").innerHTML = '<div class="w">' + esc(t) + "</div>" + (ms.length ? "<ul>" + ms.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul>" : "<p>没有结果</p>");
};

document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closePops(); return; }
  if ($("play").style.display === "none" || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return; const c = cards[at]; if (!c) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === "c") { if (!String(getSelection())) { e.preventDefault(); if (c.s) copySent(c); } return; }
  if (e.ctrlKey || e.metaKey) return;
  if (k === "d" || k === "arrowright") go(1); else if (k === "a" || k === "arrowleft") { if (at > 0) go(-1); } else if (k === "s" || k === "arrowdown") { if (c.s) say(c); } else if (k === "e") { if (c.k === "listen") reveal(c); else if ($("bE") && !$("bE").disabled) $("bE").click(); } else if (k === " ") playPause(); else if (k === "w") addSug(c); else return;
  e.preventDefault();
});
$("back").innerHTML = I("back"); $("back").onclick = () => { stopAll(); load(home); };
$("start").onclick = start;
load(() => { showRate(); home(); });
