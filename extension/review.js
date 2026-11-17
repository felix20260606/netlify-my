// 复习：听力卡（先听、再显示）+ 填空卡，按间隔重复安排下次复习时间
const $ = id => document.getElementById(id);
const send = m => new Promise(res => { try { chrome.runtime.sendMessage(m, r => res(r || {})); } catch (e) { res({}); } });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const IC = {
  back: '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>', prev: '<path d="M15 5l-7 7 7 7"/>', next: '<path d="M9 5l7 7-7 7"/>',
  replay: '<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v5h5"/>', eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  play: '<path class="f" d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11.3-6.8a1 1 0 0 0 0-1.72L9.5 4.34A1 1 0 0 0 8 5.2z"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>'
};
const I = n => '<svg class="vi" viewBox="0 0 24 24">' + IC[n] + "</svg>";
const DAY = 864e5, GAP = [10 * 6e4, DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY, 90 * DAY]; // 每升一级，下次复习隔得更久
const DONE = 5; // 到这一级算“已学会”
let saved = [], ctx = {}, srs = {}, opt = { quiz: true, listen: true, num: 20, newPct: 15, speak: true }, S = { target: "zh-CN", srcLang: "en" }, day = { d: "", n: 0 };
let cards = [], at = 0, sess = { ok: 0, bad: 0 };
const today = () => new Date().toISOString().slice(0, 10);
const lem = w => (typeof vsLemma === "function" ? vsLemma(w.toLowerCase()) : w.toLowerCase());

function load(cb) {
  chrome.storage.sync.get({ target: "zh-CN", srcLang: "en" }, s => { S = s;
    chrome.storage.local.get({ saved: [], savedCtx: {}, srs: {}, reviewOpt: opt, reviewDay: day }, v => {
      saved = [...new Set(v.saved.map(w => w.toLowerCase()))].filter(w => /^[a-z][a-z'’-]*$/i.test(w)); ctx = v.savedCtx || {}; srs = v.srs || {}; opt = Object.assign(opt, v.reviewOpt); day = v.reviewDay && v.reviewDay.d === today() ? v.reviewDay : { d: today(), n: 0 };
      cb();
    });
  });
}
function plan() {
  const now = Date.now(), due = saved.filter(w => srs[w] && srs[w].b < DONE + 2 && srs[w].due <= now).sort((a, b) => srs[a].due - srs[b].due), fresh = saved.filter(w => !srs[w]).reverse();
  const per = (opt.listen ? 1 : 0) + (opt.quiz ? 1 : 0) || 1, nWords = Math.max(1, Math.round(opt.num / per));
  let nNew = Math.min(fresh.length, Math.round(nWords * opt.newPct / 100)); if (!due.length) nNew = Math.min(fresh.length, nWords);
  const words = due.slice(0, nWords - nNew).concat(fresh.slice(0, nNew));
  return { due, fresh, words, per };
}
function home() {
  $("play").style.display = "none"; $("home").style.display = "";
  const p = plan(), learning = saved.filter(w => srs[w] && srs[w].b < DONE).length, done = saved.filter(w => srs[w] && srs[w].b >= DONE).length;
  $("sDue").textContent = p.due.length; $("sNew").textContent = p.fresh.length ? "+" + p.fresh.length + " 个新词" : ""; $("sLrn").textContent = learning; $("sDone").textContent = done;
  $("tdn").textContent = day.n + " 张卡片"; $("tdb").style.width = Math.min(100, day.n / Math.max(1, opt.num) * 100) + "%";
  $("oQuiz").checked = opt.quiz; $("oListen").checked = opt.listen; $("oSpeak").checked = opt.speak;
  [["oNum", "num"], ["oNew", "newPct"]].forEach(([id, k]) => [...$(id).children].forEach(b => b.classList.toggle("on", +b.dataset.v === opt[k])));
  const n = p.words.length * p.per; $("cnt").textContent = n ? n + " 张卡片" : (saved.length ? "现在没有到期的词" : ""); $("start").disabled = !n; $("empty").hidden = !!saved.length;
}
function saveOpt() { chrome.storage.local.set({ reviewOpt: opt }); home(); }
$("oQuiz").onchange = e => { opt.quiz = e.target.checked; if (!opt.quiz && !opt.listen) opt.listen = true; saveOpt(); };
$("oListen").onchange = e => { opt.listen = e.target.checked; if (!opt.quiz && !opt.listen) opt.quiz = true; saveOpt(); };
$("oSpeak").onchange = e => { opt.speak = e.target.checked; saveOpt(); };
[["oNum", "num"], ["oNew", "newPct"]].forEach(([id, k]) => $(id).onclick = e => { const b = e.target.closest("b"); if (!b) return; opt[k] = +b.dataset.v; saveOpt(); });

// 给一个词找例句：先用例句库，没有就用保存时所在的那句字幕，再没有就只练这个词
async function sentenceFor(w, used) {
  const r = await send({ type: "sentences", word: w, tl: S.target, sl: S.srcLang }); let list = (r.s || []).filter(x => find(x.en, w));
  if (ctx[w] && ctx[w].t && find(ctx[w].t, w)) list.push({ en: ctx[w].t, tr: "" });
  if (!list.length) list = [{ en: w, tr: "" }];
  const pick = list.filter(x => !used.has(x.en)); const s = (pick.length ? pick : list)[Math.floor(Math.random() * (pick.length ? pick : list).length)]; used.add(s.en);
  if (!s.tr) { const t = await send({ type: s.en === w ? "wordLite" : "translate", word: w, text: s.en, tl: S.target, engine: "google", sl: S.srcLang }); s.tr = t.t || (t.g && t.g.t) || ""; }
  return s;
}
// 在句子里找到目标词的那个词形
function find(en, w) { const L = lem(w); const m = [...en.matchAll(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)].find(x => x[0].toLowerCase() === w || lem(x[0]) === L || lem(x[0]) === w); return m ? { i: m.index, t: m[0] } : null; }

async function start() {
  const p = plan(); if (!p.words.length) return;
  $("home").style.display = "none"; $("play").style.display = "flex"; $("card").innerHTML = '<div class="zh">正在准备卡片…</div>'; $("ctl").innerHTML = ""; $("hint").innerHTML = ""; $("pn").textContent = "";
  cards = []; sess = { ok: 0, bad: 0 };
  for (const w of p.words) {
    const used = new Set(), a = opt.listen ? await sentenceFor(w, used) : null, b = opt.quiz ? await sentenceFor(w, used) : null;
    if (a) cards.push({ k: "listen", w, s: a, last: !b }); if (b) cards.push({ k: "quiz", w, s: b, last: true });
  }
  // 同一个词的听力卡和填空卡之间隔开几张
  const L = cards.filter(c => c.k === "listen"), Q = cards.filter(c => c.k === "quiz"); cards = [];
  for (let i = 0; i < Math.max(L.length, Q.length); i += 3) cards.push(...L.slice(i, i + 3), ...Q.slice(i, i + 3));
  at = 0; show();
}
function speak(t) { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = S.srcLang === "en" ? "en-US" : S.srcLang; u.rate = 0.95; speechSynthesis.speak(u); } catch (e) {} }
function grade(c, ok) {
  if (c.done) return; c.done = true; c.ok = ok;
  const r = srs[c.w] || { b: 0, n: 0 }; r.n++;
  if (ok) { if (c.last) { const failedEarlier = cards.some(x => x !== c && x.w === c.w && x.done && !x.ok); r.b = failedEarlier ? 0 : Math.min(GAP.length - 1, r.b + 1); r.due = Date.now() + GAP[r.b === 0 ? 0 : r.b]; } }
  else { r.b = 0; r.due = Date.now() + GAP[0]; }
  if (!r.due) r.due = Date.now() + GAP[0];
  srs[c.w] = r; day.n++; sess[ok ? "ok" : "bad"]++; chrome.storage.local.set({ srs, reviewDay: day });
}
function hl(c) { const f = find(c.s.en, c.w); return f ? esc(c.s.en.slice(0, f.i)) + "<mark>" + esc(f.t) + "</mark>" + esc(c.s.en.slice(f.i + f.t.length)) : esc(c.s.en); }
function show() {
  if (at >= cards.length) return finish();
  const c = cards[at]; $("pn").textContent = (at + 1) + "/" + cards.length; $("pb").style.width = (at / cards.length * 100) + "%";
  const btn = (id, ic, key, cls, tip) => '<div><button id="' + id + '" class="' + (cls || "") + '" title="' + tip + '">' + I(ic) + "</button><kbd>" + key + "</kbd></div>";
  if (c.k === "listen") {
    c.rev = c.rev || 0;
    $("hint").innerHTML = "<small>听力练习</small>在展示文本之前试着理解。";
    $("card").innerHTML = '<span class="pl" id="pl" title="朗读">' + I("play") + '</span><div class="en' + (c.rev < 1 ? " hid" : "") + '" id="en">' + hl(c) + '</div><div class="zh' + (c.rev < 2 ? " hid" : "") + '" id="zh">' + esc(c.s.tr || "") + '</div><span class="lem">' + esc(c.w) + "</span>";
    $("ctl").innerHTML = btn("bA", "prev", "A", "", "上一张") + btn("bS", "replay", "S", "", "重听") + btn("bE", "eye", "E", "", "显示") + btn("bX", "x", "X", "bad" + (c.bad ? " on" : ""), "还不会") + btn("bD", "next", "D", "pri", "下一张");
    $("bX").onclick = () => { c.bad = !c.bad; $("bX").classList.toggle("on", c.bad); };
    $("en").onclick = $("zh").onclick = $("bE").onclick = () => reveal(c);
    if (opt.speak && !c.spoken) { c.spoken = true; speak(c.s.en); }
  } else {
    const f = find(c.s.en, c.w) || { i: 0, t: c.s.en };
    $("hint").innerHTML = "<small>填空题</small>输入句子里缺少的单词，按回车检查。";
    $("card").innerHTML = '<span class="pl" id="pl" title="朗读（会念出答案）">' + I("play") + '</span><div class="en">' + esc(c.s.en.slice(0, f.i)) + '<input id="inp" autocomplete="off" spellcheck="false" size="' + Math.max(4, f.t.length + 1) + '"' + (c.done ? ' disabled value="' + esc(c.typed || "") + '" class="' + (c.ok ? "ok" : "no") + '"' : "") + ">" + esc(c.s.en.slice(f.i + f.t.length)) + '</div><div class="zh">' + esc(c.s.tr || "") + '</div><div class="ans' + (c.done && !c.ok ? " no" : "") + '" id="ans">' + (c.done ? (c.ok ? "正确" : "答案：" + esc(f.t)) : "") + '</div><span class="lem">' + (c.done ? esc(c.w) : "") + "</span>";
    $("ctl").innerHTML = btn("bA", "prev", "A", "", "上一张") + btn("bE", "eye", "E", "", "看答案（算作没答对）") + btn("bD", "next", "D", "pri", "下一张");
    const inp = $("inp"); if (!c.done) inp.focus();
    const check = give => { if (c.done) return; c.typed = inp.value.trim(); const ok = !give && c.typed.toLowerCase().replace(/’/g, "'") === f.t.toLowerCase().replace(/’/g, "'"); grade(c, ok); show(); if (opt.speak) speak(c.s.en); };
    inp.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); if (c.done) go(1); else if (inp.value.trim()) check(false); } };
    $("bE").onclick = () => check(true);
  }
  $("pl").onclick = () => speak(c.s.en);
  $("bA").disabled = at === 0; $("bA").onclick = () => go(-1); $("bD").onclick = () => go(1); if ($("bS")) $("bS").onclick = () => speak(c.s.en);
}
function reveal(c) { if (c.k !== "listen") return; c.rev = Math.min(2, (c.rev || 0) + 1); $("en").classList.toggle("hid", c.rev < 1); $("zh").classList.toggle("hid", c.rev < 2); }
function go(d) {
  const c = cards[at];
  if (d > 0 && c) { if (c.k === "listen") grade(c, !c.bad); else if (!c.done) { const inp = $("inp"); if (inp && inp.value.trim()) { inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); return; } grade(c, false); } }
  at = Math.max(0, at + d); show();
}
function finish() {
  speechSynthesis.cancel(); $("pb").style.width = "100%"; $("pn").textContent = cards.length + "/" + cards.length; $("hint").innerHTML = ""; $("ctl").innerHTML = "";
  $("card").innerHTML = '<div class="done"><h2>这一组练完了</h2><p>答对 ' + sess.ok + " 张，没答对 " + sess.bad + ' 张</p><p style="color:#8b95a1;font-size:13px">没答对的词 10 分钟后会再出现；答对的词按 1 天、3 天、7 天、16 天、35 天的间隔再复习。</p><button id="again">返回</button></div>';
  $("again").onclick = () => load(home);
}
document.addEventListener("keydown", e => {
  if ($("play").style.display === "none" || e.metaKey || e.ctrlKey || e.altKey) return; const c = cards[at]; if (!c) return;
  const k = e.key.toLowerCase();
  if (k === "d" || k === "arrowright") go(1); else if (k === "a" || k === "arrowleft") { if (at > 0) go(-1); } else if (k === "s") speak(c.s.en); else if (k === "e") { if (c.k === "listen") reveal(c); else if ($("bE")) $("bE").click(); } else if (k === "x" && $("bX")) $("bX").click(); else return;
  e.preventDefault();
});
$("back").innerHTML = I("back"); $("back").onclick = () => { speechSynthesis.cancel(); load(home); };
$("start").onclick = start;
load(home);
