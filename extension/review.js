// 复习：听力卡（先听、再显示）+ 填空卡，按间隔重复安排下次复习时间
const $ = id => document.getElementById(id);
const send = m => new Promise(res => { try { chrome.runtime.sendMessage(m, r => res(r || {})); } catch (e) { res({}); } });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const IC = {
  back: '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>', prev: '<path d="M15 5l-7 7 7 7"/>', next: '<path d="M9 5l7 7-7 7"/>',
  replay: '<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v5h5"/>', eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  star: '<path class="s" d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
  play: '<path class="f" d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11.3-6.8a1 1 0 0 0 0-1.72L9.5 4.34A1 1 0 0 0 8 5.2z"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>'
};
const I = n => '<svg class="vi" viewBox="0 0 24 24">' + IC[n] + "</svg>";
const DAY = 864e5, GAP = [10 * 6e4, DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY, 90 * DAY]; // 每升一级，下次复习隔得更久
const DONE = 5; // 到这一级算“已学会”
let sents = [], tags = {}, items = [], med = {}, player = null, saved = [], ctx = {}, srs = {}, sugg = {}, marks = {}, rate = 1, opt = { quiz: true, listen: true, sugg: true, num: 20, newPct: 15, speak: true, tags: [] }, S = { target: "zh-CN", srcLang: "en" }, day = { d: "", n: 0 };
let cards = [], at = 0, sess = { ok: 0, bad: 0 };
const today = () => new Date().toISOString().slice(0, 10);
const lem = w => (typeof vsLemma === "function" ? vsLemma(w.toLowerCase()) : w.toLowerCase());

function load(cb) {
  chrome.storage.sync.get({ target: "zh-CN", srcLang: "en" }, s => { S = s;
    chrome.storage.local.get({ saved: [], savedSents: [], tags: {}, savedCtx: {}, srs: {}, sugg: {}, marks: {}, reviewRate: 1, reviewOpt: opt, reviewDay: day }, v => { sents = v.savedSents || []; tags = v.tags || {}; sugg = v.sugg || {}; marks = v.marks || {}; rate = v.reviewRate || 1;
      saved = [...new Set(v.saved.map(w => w.toLowerCase()))].filter(w => /^[a-z][a-z'’-]*$/i.test(w)); ctx = v.savedCtx || {}; srs = v.srs || {}; opt = Object.assign(opt, v.reviewOpt); day = v.reviewDay && v.reviewDay.d === today() ? v.reviewDay : { d: today(), n: 0 };
      if (!Array.isArray(opt.tags)) opt.tags = [];
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
  const per = (opt.listen ? 1 : 0) + (opt.quiz ? 1 : 0) || 1, nWords = Math.max(1, Math.round(opt.num / per));
  let nNew = Math.min(fresh.length, Math.round(nWords * opt.newPct / 100)); if (!due.length) nNew = Math.min(fresh.length, nWords);
  let words = due.slice(0, nWords - nNew).concat(fresh.slice(0, nNew));
  // 建议：从看过的视频里挑还没保存的生词，补进这一组（最多占“新项目”的份额）
  const pool = opt.sugg ? Object.keys(sugg).filter(w => !saved.includes(w) && !marks[w] && !srs[w]).sort((a, b) => (sugg[b].n || 1) - (sugg[a].n || 1) || sugg[b].at - sugg[a].at) : [];
  const nSug = Math.min(pool.length, Math.max(0, Math.min(nWords - words.length, Math.max(1, Math.round(nWords * opt.newPct / 100)))));
  const sug = opt.newPct ? pool.slice(0, nSug) : [];
  words = words.concat(sug);
  return { due, fresh, words, per, sug: new Set(sug), pool };
}
function home() {
  $("play").style.display = "none"; $("home").style.display = "";
  const p = plan(), learning = items.filter(w => srs[w] && srs[w].b < DONE).length, done = items.filter(w => srs[w] && srs[w].b >= DONE).length;
  [...$("oTags").children].forEach(b => b.classList.toggle("on", opt.tags.includes(b.dataset.v)));
  $("sDue").textContent = p.due.length; $("sNew").textContent = p.due.length ? p.due.filter(w => Date.now() - srs[w].due > DAY).length + " 个紧急" : ""; $("sQ").textContent = p.fresh.length || p.pool.length ? "+" + p.fresh.length + " 个排队中" + (p.pool.length ? "，" + p.pool.length + " 个建议" : "") : ""; $("sLrn").textContent = learning; $("sDone").textContent = done;
  $("tdn").textContent = day.n + " 张卡片"; $("tdb").style.width = Math.min(100, day.n / Math.max(1, opt.num) * 100) + "%";
  $("oQuiz").checked = opt.quiz; $("oListen").checked = opt.listen; $("oSugg").checked = opt.sugg; $("oSpeak").checked = opt.speak;
  [["oNum", "num"], ["oNew", "newPct"]].forEach(([id, k]) => [...$(id).children].forEach(b => b.classList.toggle("on", +b.dataset.v === opt[k])));
  const n = p.words.length * p.per; $("cnt").textContent = n ? n + " 张卡片" : (saved.length || sents.length ? (opt.tags.length ? "这个标签下没有要练的" : "现在没有到期的词") : ""); $("start").disabled = !n; $("empty").hidden = !!(saved.length || sents.length);
}
function saveOpt() { chrome.storage.local.set({ reviewOpt: opt }); home(); }
$("oQuiz").onchange = e => { opt.quiz = e.target.checked; if (!opt.quiz && !opt.listen) opt.listen = true; saveOpt(); };
$("oListen").onchange = e => { opt.listen = e.target.checked; if (!opt.quiz && !opt.listen) opt.quiz = true; saveOpt(); };
$("oSpeak").onchange = e => { opt.speak = e.target.checked; saveOpt(); };
$("oSugg").onchange = e => { opt.sugg = e.target.checked; saveOpt(); };
$("oTags").onclick = e => { const b = e.target.closest("b"); if (!b) return; const t = b.dataset.v; opt.tags = opt.tags.includes(t) ? opt.tags.filter(x => x !== t) : opt.tags.concat(t); chrome.storage.local.set({ reviewOpt: opt }, () => load(home)); };
[["oNum", "num"], ["oNew", "newPct"]].forEach(([id, k]) => $(id).onclick = e => { const b = e.target.closest("b"); if (!b) return; opt[k] = +b.dataset.v; saveOpt(); });

// 给一个词找例句：先用例句库，没有就用保存时所在的那句字幕，再没有就只练这个词
async function sentenceFor(w, used) {
  const late = ms => new Promise(res => setTimeout(() => res({}), ms));
  if (isS(w)) { // 保存的短语 / 句子：用它所在的原句
    const x = sObj(w) || { t: "", tr: "" }, m2 = med["med:s:" + x.k], en = x.ph ? x.ctx || x.t : x.t; let tr = x.ph ? (x.ctx ? (m2 && m2.tr) || "" : x.tr || "") : x.tr || (m2 && m2.tr) || "";
    if (!tr && en) { const t = await Promise.race([late(6000), send({ type: "translate", text: en, tl: S.target, engine: "google", sl: S.srcLang })]); tr = t.t || ""; }
    return { en, tr, md: m2 || null, note: x.ph && x.ctx ? x.t + "：" + (x.tr || "") : "" };
  }
  const md = med["med:w:" + w];
  if (md && md.t && find(md.t, w)) { // 有保存时的原句：就用它，配原声、画面和出处
    const s = { en: md.t, tr: md.tr || "", md };
    if (!s.tr) { const t = await Promise.race([late(6000), send({ type: "translate", text: s.en, tl: S.target, engine: "google", sl: S.srcLang })]); s.tr = t.t || ""; }
    return s;
  }
  const r = await Promise.race([send({ type: "sentences", word: w, tl: S.target, sl: S.srcLang }), late(7000)]); let list = (r.s || []).filter(x => find(x.en, w));
  const own = (ctx[w] && ctx[w].t) || (sugg[w] && sugg[w].t); if (own && find(own, w)) list.push({ en: own, tr: "" });
  if (!list.length) list = [{ en: w, tr: "" }];
  const pick = list.filter(x => !used.has(x.en)); const s = (pick.length ? pick : list)[Math.floor(Math.random() * (pick.length ? pick : list).length)]; used.add(s.en);
  if (!s.tr) { const t = await Promise.race([late(6000), send({ type: s.en === w ? "wordLite" : "translate", word: w, text: s.en, tl: S.target, engine: "google", sl: S.srcLang })]); s.tr = t.t || (t.g && t.g.t) || ""; }
  return s;
}
// 在句子里找到目标词的那个词形
function find(en, w) { if (isS(w)) { const x = sObj(w); if (!x || !x.ph) return null; const i = en.toLowerCase().indexOf(x.t.toLowerCase()); return i >= 0 && en.length > x.t.length ? { i, t: en.substr(i, x.t.length) } : null; } const L = lem(w); const m = [...en.matchAll(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)].find(x => x[0].toLowerCase() === w || lem(x[0]) === L || lem(x[0]) === w); return m ? { i: m.index, t: m[0] } : null; }

function start() {
  const p = plan(); if (!p.words.length) return;
  $("home").style.display = "none"; $("play").style.display = "flex";
  cards = []; sess = { ok: 0, bad: 0 };
  const L = [], Q = [];
  for (const w of p.words) { const used = new Set(), sg = p.sug.has(w); const x = isS(w) ? sObj(w) : null, canQuiz = opt.quiz && (!x || (x.ph && x.ctx && x.ctx.toLowerCase().includes(x.t.toLowerCase()) && x.ctx.length > x.t.length)), doListen = opt.listen || !canQuiz; if (doListen) L.push({ k: "listen", w, used, sg, last: !canQuiz }); if (canQuiz) Q.push({ k: "quiz", w, used, sg, last: true }); }
  // 同一个词的听力卡和填空卡之间隔开几张
  for (let i = 0; i < Math.max(L.length, Q.length); i += 3) cards.push(...L.slice(i, i + 3), ...Q.slice(i, i + 3));
  at = 0; show();
}
// 例句按需准备：当前这张等它，后面两张提前取
function need(c) { if (!c.p) c.p = sentenceFor(c.w, c.used).then(s => (c.s = s)).catch(() => (c.s = { en: c.w, tr: "" })); return c.p; }
function stopAll() { speak.n = (speak.n || 0) + 1; try { speechSynthesis.cancel(); } catch (e) {} if (player) { try { player.pause(); } catch (e) {} player = null; } }
function say(c) { stopAll(); const a = c.s && c.s.md && c.s.md.aud; if (a) { try { player = new Audio(a); player.playbackRate = rate; player.play().catch(() => speak(c.s.en)); return; } catch (e) {} } speak(c.s.en); }
const tm = x => Math.floor(x / 60) + ":" + String(Math.floor(x % 60)).padStart(2, "0");
function mediaTop(c) { const m = c.s.md; return m && m.img ? '<img class="shot" src="' + m.img + '" alt="">' : ""; }
function mediaSrc(c) { const m = c.s.md; if (!m) return '<span class="src syn">例句来自例句库 · 合成语音</span>'; return '<a class="src" target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=' + encodeURIComponent(m.v) + "&t=" + Math.max(0, Math.floor(m.s)) + 's" title="打开视频的这一句">' + (m.aud ? "原声" : "合成语音") + " · " + esc(m.title || "YouTube") + (m.ch ? " · " + esc(m.ch) : "") + " · " + tm(m.s) + "</a>"; }
function speakLocal(t) { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = S.srcLang === "en" ? "en-US" : S.srcLang; u.rate = 0.95 * rate; const vs = speechSynthesis.getVoices().filter(x => x.lang && x.lang.toLowerCase().startsWith(u.lang.slice(0, 2).toLowerCase())), pick = vs.find(x => /Samantha|Google US English|Microsoft Aria|Alex/i.test(x.name)) || vs.find(x => x.lang === u.lang && x.localService) || vs[0]; if (pick) u.voice = pick; speechSynthesis.speak(u); } catch (e) {} }
// 没有原声时：用在线朗读（单词用词典真人录音），取不到再用浏览器自带语音
async function speak(t) { const my = (speak.n = (speak.n || 0) + 1); try { const r = await send({ type: "tts", text: t, lang: S.srcLang }); if (my !== speak.n) return; if (r.a) { if (player) { try { player.pause(); } catch (e) {} } player = new Audio(r.a); player.playbackRate = rate; await player.play(); return; } } catch (e) {} if (my === speak.n) speakLocal(t); }
function grade(c, ok) {
  if (c.done) return; c.done = true; c.ok = ok;
  if (c.sg && !saved.includes(c.w)) { day.n++; sess[ok ? "ok" : "bad"]++; chrome.storage.local.set({ reviewDay: day }); return; }
  const r = srs[c.w] || { b: 0, n: 0 }; r.n++;
  if (ok) { if (c.last) { const failedEarlier = cards.some(x => x !== c && x.w === c.w && x.done && !x.ok); r.b = failedEarlier ? 0 : Math.min(GAP.length - 1, r.b + 1); r.due = Date.now() + GAP[r.b === 0 ? 0 : r.b]; } }
  else { r.b = 0; r.due = Date.now() + GAP[0]; }
  if (!r.due) r.due = Date.now() + GAP[0];
  srs[c.w] = r; day.n++; sess[ok ? "ok" : "bad"]++; chrome.storage.local.set({ srs, reviewDay: day });
}
function hl(c) { const f = find(c.s.en, c.w); return f ? esc(c.s.en.slice(0, f.i)) + "<mark>" + esc(f.t) + "</mark>" + esc(c.s.en.slice(f.i + f.t.length)) : esc(c.s.en); }
function show() {
  if (at >= cards.length) return finish();
  const c = cards[at]; cards.slice(at + 1, at + 3).forEach(need);
  if (!c.s) { $("pn").textContent = (at + 1) + "/" + cards.length; $("hint").innerHTML = ""; $("ctl").innerHTML = ""; $("card").innerHTML = '<div class="spin"></div>'; const me = at; need(c).then(() => { if (at === me && $("play").style.display !== "none") show(); }); return; }
  $("pn").textContent = (at + 1) + "/" + cards.length; $("pb").style.width = (at / cards.length * 100) + "%";
  const btn = (id, ic, key, cls, tip) => '<div><button id="' + id + '" class="' + (cls || "") + '" title="' + tip + '">' + I(ic) + "</button><kbd>" + key + "</kbd></div>";
  if (c.k === "listen") {
    c.rev = c.rev || 0;
    $("hint").innerHTML = "<small>听力练习</small>在展示文本之前试着理解。";
    $("card").innerHTML = '<span class="pl" id="pl" title="播放">' + I("play") + "</span>" + mediaTop(c) + '<div class="en' + (c.rev < 1 ? " hid" : "") + '" id="en">' + hl(c) + '</div><div class="zh' + (c.rev < 2 ? " hid" : "") + '" id="zh">' + esc(c.s.tr || "") + '</div><span class="lem">' + esc(labelOf(c.w)) + "</span>" + (c.s.note ? '<div class="pn' + (c.rev < 2 ? " hid" : "") + '">' + esc(c.s.note) + "</div>" : "") + mediaSrc(c) + sugChip(c) + starBtn(c);
    $("ctl").innerHTML = btn("bA", "prev", "A", "", "上一张") + btn("bS", "replay", "S", "", "重听") + btn("bE", "eye", "E", "", "显示") + btn("bX", "x", "X", "bad" + (c.bad ? " on" : ""), "还不会") + btn("bD", "next", "D", "pri", "下一张");
    $("bX").onclick = () => { c.bad = !c.bad; $("bX").classList.toggle("on", c.bad); };
    $("en").onclick = $("zh").onclick = $("bE").onclick = () => reveal(c);
    if (opt.speak && !c.spoken) { c.spoken = true; say(c); }
  } else {
    const f = find(c.s.en, c.w) || { i: 0, t: c.s.en };
    $("hint").innerHTML = "<small>填空题</small>输入句子里缺少的单词，按回车检查。";
    $("card").innerHTML = '<span class="pl" id="pl" title="播放（会念出答案）">' + I("play") + "</span>" + mediaTop(c) + '<div class="en">' + esc(c.s.en.slice(0, f.i)) + '<input id="inp" autocomplete="off" spellcheck="false" size="' + Math.max(4, f.t.length + 1) + '"' + (c.done ? ' disabled value="' + esc(c.typed || "") + '" class="' + (c.ok ? "ok" : "no") + '"' : "") + ">" + esc(c.s.en.slice(f.i + f.t.length)) + '</div><div class="zh">' + esc(c.s.tr || "") + '</div><div class="ans' + (c.done && !c.ok ? " no" : "") + '" id="ans">' + (c.done ? (c.ok ? "正确" : "答案：" + esc(f.t)) : "") + '</div><span class="lem">' + (c.done ? esc(labelOf(c.w)) : "") + "</span>" + mediaSrc(c) + starBtn(c);
    $("ctl").innerHTML = btn("bA", "prev", "A", "", "上一张") + btn("bE", "eye", "E", "", "看答案（算作没答对）") + btn("bD", "next", "D", "pri", "下一张");
    const inp = $("inp"); if (!c.done) inp.focus();
    const check = give => { if (c.done) return; c.typed = inp.value.trim(); const ok = !give && c.typed.toLowerCase().replace(/’/g, "'") === f.t.toLowerCase().replace(/’/g, "'"); grade(c, ok); show(); if (opt.speak) say(c); };
    inp.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); if (c.done) go(1); else if (inp.value.trim()) check(false); } };
    $("bE").onclick = () => check(true);
  }
  $("pl").onclick = () => say(c); if ($("sg")) $("sg").onclick = () => addSug(c); if ($("cst")) $("cst").onclick = () => toggleStar(c);
  $("bA").disabled = at === 0; $("bA").onclick = () => go(-1); $("bD").onclick = () => go(1); if ($("bS")) $("bS").onclick = () => say(c);
}
// 卡片右上角的星标：把这句话存进“保存的短语”
const starKey = c => (isS(c.w) ? keyOf(c.w) : "rv|" + c.s.en);
function starBtn(c) { const on = sents.some(x => x.k === starKey(c)); return '<span class="cst' + (on ? " on" : "") + '" id="cst" title="' + (on ? "已保存这句" : "保存这句") + '">' + I("star") + "</span>"; }
function toggleStar(c) { const k = starKey(c); chrome.storage.local.get({ savedSents: [] }, v => { let L = v.savedSents; const at = L.findIndex(x => x.k === k); if (at >= 0) L.splice(at, 1); else L.push({ k, v: (c.s.md && c.s.md.v) || "", s: (c.s.md && c.s.md.s) || 0, t: c.s.en, tr: c.s.tr || "", at: Date.now() }); sents = L; chrome.storage.local.set({ savedSents: L }, () => { const el = $("cst"); if (el) el.classList.toggle("on", at < 0); }); }); }
function sugChip(c) { return c.sg ? '<span class="sg' + (saved.includes(c.w) ? " on" : "") + '" id="sg" title="这是从你看过的视频里推荐的新词">' + (saved.includes(c.w) ? "已加入学习" : "建议的新词 · 点这里加入学习 (W)") + "</span>" : ""; }
function addSug(c) { if (!c || !c.sg || saved.includes(c.w)) return; saved.push(c.w); if (sugg[c.w]) ctx[c.w] = Object.assign({}, sugg[c.w], { at: Date.now() }); chrome.storage.local.get({ saved: [], savedCtx: {} }, v => { if (!v.saved.some(x => x.toLowerCase() === c.w)) v.saved.push(c.w); v.savedCtx[c.w] = ctx[c.w] || { at: Date.now() }; chrome.storage.local.set({ saved: v.saved, savedCtx: v.savedCtx }); }); send({ type: "add", word: c.w }); const el = $("sg"); if (el) { el.textContent = "已加入学习"; el.classList.add("on"); } }
function reveal(c) { if (c.k !== "listen") return; c.rev = Math.min(2, (c.rev || 0) + 1); $("en").classList.toggle("hid", c.rev < 1); $("zh").classList.toggle("hid", c.rev < 2); const pn = document.querySelector("#card .pn"); if (pn) pn.classList.toggle("hid", c.rev < 2); }
function go(d) {
  const c = cards[at];
  if (d > 0 && c) { if (c.k === "listen") grade(c, !c.bad); else if (!c.done) { const inp = $("inp"); if (inp && inp.value.trim()) { inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); return; } grade(c, false); } }
  stopAll(); at = Math.max(0, at + d); show();
}
function finish() {
  stopAll(); $("pb").style.width = "100%"; $("pn").textContent = cards.length + "/" + cards.length; $("hint").innerHTML = ""; $("ctl").innerHTML = "";
  $("card").innerHTML = '<div class="done"><h2>这一组练完了</h2><p>答对 ' + sess.ok + " 张，没答对 " + sess.bad + ' 张</p><p style="color:#8b95a1;font-size:13px">没答对的词 10 分钟后会再出现；答对的词按 1 天、3 天、7 天、16 天、35 天的间隔再复习。</p><button id="again">返回</button></div>';
  $("again").onclick = () => load(home);
}
document.addEventListener("keydown", e => {
  if ($("play").style.display === "none" || e.metaKey || e.ctrlKey || e.altKey) return; const c = cards[at]; if (!c) return;
  const k = e.key.toLowerCase();
  if (k === "d" || k === "arrowright") go(1); else if (k === "a" || k === "arrowleft") { if (at > 0) go(-1); } else if (k === "s") { if (c.s) say(c); } else if (k === "e") { if (c.k === "listen") reveal(c); else if ($("bE")) $("bE").click(); } else if (k === "x" && $("bX")) $("bX").click(); else if (k === "w") addSug(c); else return;
  e.preventDefault();
});
$("back").innerHTML = I("back"); $("back").onclick = () => { stopAll(); load(home); };
$("start").onclick = start;
const RATES = [0.75, 1, 1.25, 1.5], showRate = () => ($("spd").textContent = rate + "x");
$("spd").onclick = () => { rate = RATES[(RATES.indexOf(rate) + 1) % RATES.length]; chrome.storage.local.set({ reviewRate: rate }); showRate(); const c = cards[at]; if (c && c.s) say(c); };
$("kb").onclick = () => $("keys").classList.toggle("on");
load(() => { showRate(); home(); });
