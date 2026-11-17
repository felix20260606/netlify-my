// 已保存项目：保存的单词 / 保存的句子 / 所有单词
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const send = m => new Promise(res => { try { chrome.runtime.sendMessage(m, r => res(r || {})); } catch (e) { res({}); } });
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const IC = {
  mark: '<path class="f" d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>', star: '<path class="f" d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>', list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/>', play: '<path class="f" d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11.3-6.8a1 1 0 0 0 0-1.72L9.5 4.34A1 1 0 0 0 8 5.2z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>', book: '<path d="M12 6v14"/><path d="M12 6C10.5 4.7 8.3 4 5 4H3v14h2c3.3 0 5.5.7 7 2 1.5-1.3 3.7-2 7-2h2V4h-2c-3.3 0-5.5.7-7 2z"/>', ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  prev: '<path d="M15 5l-7 7 7 7"/>', next: '<path d="M9 5l7 7-7 7"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>'
};
const I = n => '<svg class="vi" viewBox="0 0 24 24">' + IC[n] + "</svg>";
const DAY = 864e5, PER = 50, DONE = 5;
let S = { level: -1, ratio: 1.5, target: "zh-CN", srcLang: "en" }, saved = [], ctx = {}, srs = {}, marks = {}, sents = [], med = {};
let tab = "words", q = "", sort = "date", filt = "learn", src = "", page = 0, picked = new Set(), player = null, allShown = 1000, tags = {}, tagF = new Set(), allSort = "freq", allView = "cell";
const TAGS = [["g", "#8EE05A", "绿色"], ["y", "#F1E46B", "黄色"], ["r", "#FF6B5E", "红色"], ["b", "#6FD3FF", "蓝色"]];
const tagDot = k => (tags[k] ? '<i class="tg t-' + tags[k] + '"></i>' : "");
const tagChips = () => '<span class="chip tg0' + (tagF.has("") ? " on" : "") + '" data-tg="" title="没有标签的">/</span>' + TAGS.map(t => '<span class="chip tgc t-' + t[0] + (tagF.has(t[0]) ? " on" : "") + '" data-tg="' + t[0] + '" title="' + t[2] + '标签">#</span>').join("");
const tagOk = k => !tagF.size || tagF.has(tags[k] || "");
const tagBtns = '<span class="tgb">标签' + TAGS.map(t => '<button data-b="tag" data-c="' + t[0] + '" class="t-' + t[0] + '" title="' + t[2] + '"></button>').join("") + '<button data-b="tag" data-c="" title="清除标签">/</button></span>';
const lem = w => vsLemma(String(w).toLowerCase());
const tm = x => Math.floor(x / 60) + ":" + String(Math.floor(x % 60)).padStart(2, "0");
const dayOf = at => (at ? new Date(at).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" }) : "更早保存的");
const mOf = w => med["med:w:" + w] || null, sOf = x => med["med:s:" + x.k] || null;

function load(cb) {
  chrome.storage.sync.get({ level: -1, ratio: 1.5, target: "zh-CN", srcLang: "en", greenKnown: false, fadeRare: true, showMarks: true }, s => { S = s;
    chrome.storage.local.get(null, v => {
      saved = [...new Set((v.saved || []).map(w => w.toLowerCase()))]; ctx = v.savedCtx || {}; srs = v.srs || {}; marks = v.marks || {}; sents = v.savedSents || []; tags = v.tags || {};
      med = {}; Object.keys(v).forEach(k => { if (k.startsWith("med:")) med[k] = v[k]; });
      VS_SAVED = new Set(saved); VS_MARKS = marks; cb();
    });
  });
}
function say(text, m) { try { speechSynthesis.cancel(); if (player) player.pause(); } catch (e) {} if (m && m.aud) { player = new Audio(m.aud); player.play().catch(() => {}); return; } try { const u = new SpeechSynthesisUtterance(text); u.lang = "en-US"; speechSynthesis.speak(u); } catch (e) {} }
function srcCell(m, c) {
  const o = m || c; if (!o || !o.v) return '<span class="no">—</span>';
  const url = "https://www.youtube.com/watch?v=" + encodeURIComponent(o.v) + "&t=" + Math.max(0, Math.floor(o.s || 0)) + "s", title = (m && m.title) || "YouTube";
  return '<a href="' + url + '" target="_blank" rel="noopener" title="' + esc(title + (m && m.ch ? " · " + m.ch : "") + " · " + tm(o.s || 0)) + '">' + (m && m.img ? '<img src="' + m.img + '" alt="">' : '<span class="yt">' + I("play") + "</span>") + '<span class="ti">' + esc(title) + "</span></a>";
}
function stage(w) { return '<span class="stg" title="复习阶段和下次复习时间">' + I("book") + stage0(w) + "</span>"; }
function stage0(w) { const r = srs[w]; if (!r) return "未开始"; if (r.b >= DONE) return "已学会"; const d = r.due - Date.now(); return "第 " + (r.b + 1) + " 级 · " + (d <= 0 ? "到期" : d < DAY ? Math.ceil(d / 36e5) + " 小时后" : Math.ceil(d / DAY) + " 天后"); }
function ctxHtml(t, w) { const L = lem(w); return vsMark(esc(t), S).replace(/<span class="vs-w ([^"]*)" data-w="([^"]+)">/g, (a, cl, x) => (x.toLowerCase() === w || lem(x) === L || lem(x) === w ? '<span class="vs-w wb" data-w="' + x + '">' : a)); }
function head() {
  $$(".tabs b").forEach(b => { const t = b.dataset.t; b.innerHTML = I(t === "words" ? "mark" : t === "sents" ? "star" : "list") + (t === "words" ? "保存的单词" : t === "sents" ? "保存的短语" : "所有单词"); b.classList.toggle("on", t === tab); });
}
function pager(n) { const pages = Math.max(1, Math.ceil(n / PER)); page = Math.min(page, pages - 1); return '<span class="pg"><button id="pp"' + (page ? "" : " disabled") + ">" + I("prev") + "</button><b>" + (page + 1) + "</b>/ " + pages + '<button id="pn"' + (page < pages - 1 ? "" : " disabled") + ">" + I("next") + "</button></span>"; }
function tools(ph, sources) {
  return '<div class="tools"><label class="q"><input id="q" placeholder="' + ph + '" value="' + esc(q) + '">' + I("search") + '</label><select id="src"><option value="">来源：全部</option>' + sources.map(x => '<option value="' + esc(x[0]) + '"' + (src === x[0] ? " selected" : "") + ">" + esc(x[1]) + "</option>").join("") + '</select><span class="seg" id="sort">' + [["date", "日期 ↓"], ["freq", "频率"], ["due", "待复习"]].map(x => '<b data-v="' + x[0] + '"' + (sort === x[0] ? ' class="on"' : "") + ">" + x[1] + "</b>").join("") + "</span></div>";
}
function sourcesOf(list, get) { const m = new Map(); list.forEach(x => { const o = get(x); if (o && o.v) m.set(o.v, (o.title || "视频 " + o.v)); }); return [...m.entries()]; }

function drawWords() {
  const known = Object.keys(marks).filter(k => marks[k] === "known"), ign = Object.keys(marks).filter(k => marks[k] === "ignore");
  let base = filt === "known" ? known : filt === "ignore" ? ign : saved.slice();
  const at = w => (mOf(w) || {}).at || (ctx[w] || {}).at || 0, vOf = w => mOf(w) || ctx[w];
  let list = base.map((w, n) => ({ w, n, at: at(w), r: Math.min(vsRank(w), vsRank(lem(w))) }));
  if (q) { const k = q.toLowerCase(); list = list.filter(o => o.w.includes(k) || ((vOf(o.w) || {}).t || "").toLowerCase().includes(k)); }
  if (src) list = list.filter(o => (vOf(o.w) || {}).v === src);
  list = list.filter(o => tagOk(o.w));
  if (sort === "date") list.sort((a, b) => b.at - a.at || b.n - a.n); else if (sort === "freq") list.sort((a, b) => a.r - b.r); else list.sort((a, b) => ((srs[a.w] || {}).due || 9e15) - ((srs[b.w] || {}).due || 9e15));
  const pg = list.slice(page * PER, page * PER + PER);
  let h = '<div class="hd"><h1>保存的单词</h1><span>' + saved.length + "</span><em>你标记的单词及其复习记录</em></div>" + tools("搜索", sourcesOf(saved, vOf)) +
    '<div class="chips"><span class="chip k' + (filt === "known" ? " on" : "") + '" data-f="known">' + I("check") + "标记为已知 <b>" + known.length + '</b></span><span class="chip l' + (filt === "learn" ? " on" : "") + '" data-f="learn">' + I("book") + "标记为将要学习 <b>" + saved.length + '</b></span><span class="chip g' + (filt === "ignore" ? " on" : "") + '" data-f="ignore">' + I("ban") + "不学习 <b>" + ign.length + '</b></span><span style="width:14px"></span>' + tagChips() + pager(list.length) + "</div>" +
    '<div class="sel" id="sel"><span id="seln"></span>' + (filt === "learn" ? '<button data-b="known">标为已知</button>' : '<button data-b="learn">标为将要学习</button>') + '<button data-b="copy">复制</button>' + tagBtns + '<button class="del" data-b="del">' + (filt === "learn" ? "删除" : "取消标记") + "</button></div>";
  if (!pg.length) h += '<div class="empty">' + (base.length ? "没有符合条件的单词。" : filt === "learn" ? "还没有保存的单词。看视频时右键点击单词，把它加入“正在学习”。" : "这一类还没有单词。") + "</div>";
  let last = null, open = false;
  pg.forEach(o => {
    const d = sort === "date" ? dayOf(o.at) : "", m = mOf(o.w), c = ctx[o.w], t = (m && m.t) || (c && c.t) || "";
    if (sort === "date" && d !== last) { if (open) h += "</table>"; last = d; h += '<div class="day">' + d + "<span>" + list.filter(x => dayOf(x.at) === d).length + "</span></div><table><colgroup><col style=\"width:38px\"><col style=\"width:20%\"><col style=\"width:19%\"><col style=\"width:76px\"><col><col style=\"width:120px\"><col style=\"width:230px\"></colgroup><tr><th></th><th>单词</th><th>翻译</th><th style=\"text-align:right;padding-right:22px\">排名</th><th>上下文</th><th>阶段</th><th>来源</th></tr>"; open = true; }
    else if (!open) { h += "<table><colgroup><col style=\"width:38px\"><col style=\"width:20%\"><col style=\"width:19%\"><col style=\"width:76px\"><col><col style=\"width:120px\"><col style=\"width:230px\"></colgroup><tr><th></th><th>单词</th><th>翻译</th><th style=\"text-align:right;padding-right:22px\">排名</th><th>上下文</th><th>阶段</th><th>来源</th></tr>"; open = true; }
    h += '<tr data-w="' + esc(o.w) + '"><td class="c"><input type="checkbox"' + (picked.has(o.w) ? " checked" : "") + '></td><td class="w"><span class="pl" title="' + (m && m.aud ? "播放原声" : "朗读") + '">' + I("play") + '</span>' + tagDot(o.w) + '<span class="' + (filt === "learn" ? "wb" : "") + '">' + esc(o.w) + '</span></td><td class="t" data-tr="' + esc(o.w) + '"></td><td class="r">' + (o.r === Infinity ? "—" : o.r) + '</td><td class="x">' + (t ? ctxHtml(t, o.w) : '<span class="no" style="color:#555b63">—</span>') + '</td><td class="st">' + (filt === "learn" ? stage(o.w) : "—") + '</td><td class="so"><div class="so">' + srcCell(m, c) + '<span class="rm" title="' + (filt === "learn" ? "删除" : "取消标记") + '">' + I("x") + "</span></div></td></tr>";
  });
  if (open) h += "</table>";
  $("#wrap").innerHTML = h; bind(list.length);
  (async () => { const me = tab + page + filt + sort + q + src; for (const el of $$("td[data-tr]")) { if (me !== tab + page + filt + sort + q + src || !el.isConnected) return; const r = await send({ type: "wordLite", word: el.dataset.tr, tl: S.target, sl: S.srcLang }), g = r.g, out = []; if (g) { if (g.t) out.push(g.t); (g.zh || []).forEach(z => z.words.forEach(x => { if (!out.includes(x)) out.push(x); })); } el.textContent = out.slice(0, 3).join(", "); } })();
}
function drawSents() {
  let list = sents.map((x, n) => ({ x, n, at: x.at || (sOf(x) || {}).at || 0 }));
  if (q) { const k = q.toLowerCase(); list = list.filter(o => o.x.t.toLowerCase().includes(k) || (o.x.tr || "").includes(q)); }
  if (src) list = list.filter(o => o.x.v === src);
  list = list.filter(o => tagOk(o.x.k));
  list.sort((a, b) => b.at - a.at || b.n - a.n);
  const pg = list.slice(page * PER, page * PER + PER);
  let h = '<div class="hd"><h1>保存的短语</h1><span>' + sents.length + "</span><em>你用 ☆ 保存的待复习句子</em></div>" + tools("搜索", sourcesOf(sents, x => Object.assign({}, x, sOf(x) || {}))) + '<div class="chips"><span class="chip l on">' + I("book") + "标记为将要学习 <b>" + sents.length + '</b></span><span style="width:14px"></span>' + tagChips() + pager(list.length) + '</div><div class="sel" id="sel"><span id="seln"></span><button data-b="copy">复制</button>' + tagBtns + '<button class="del" data-b="del">删除</button></div>';
  if (!pg.length) h += '<div class="empty">' + (sents.length ? "没有符合条件的短语。" : "还没有保存的短语。看视频时点字幕旁边的 ☆ 保存整句。") + "</div>";
  let last = null, open = false;
  pg.forEach(o => { const d = dayOf(o.at), m = sOf(o.x);
    if (d !== last) { if (open) h += "</table>"; last = d; open = true; h += '<div class="day">' + d + "<span>" + list.filter(x => dayOf(x.at) === d).length + "</span></div><table><colgroup><col style=\"width:38px\"><col><col style=\"width:34%\"><col style=\"width:120px\"><col style=\"width:230px\"></colgroup><tr><th></th><th>短语</th><th>翻译</th><th>阶段</th><th>来源</th></tr>"; }
    h += '<tr data-k="' + esc(o.x.k) + '"><td class="c"><input type="checkbox"' + (picked.has(o.x.k) ? " checked" : "") + '></td><td class="p"><span class="pl" title="' + (m && m.aud ? "播放原声" : "朗读") + '">' + I("play") + "</span>" + tagDot(o.x.k) + vsMark(esc(o.x.t), S) + '</td><td class="t">' + esc(o.x.tr || (m && m.tr) || "") + '</td><td class="st"><span class="stg">' + I("book") + '—</span></td><td class="so"><div class="so">' + srcCell(m, o.x) + '<span class="rm" title="删除">' + I("x") + "</span></div></td></tr>"; });
  if (open) h += "</table>";
  $("#wrap").innerHTML = h; bind(list.length);
}
// 所有单词：按词频每 100 个一段，段内按首字母排；颜色表示状态，右键标记
// 和字幕里给单词上色用的是同一个判断（vsMarkOf + vsCat），所以这里看到的状态就是视频里的状态
function catOf(w) { const mk = vsMarkOf(w); if (mk) return mk === "learn" ? "m-l" : mk === "known" ? "m-k" : "m-i"; const c = vsCat(w, S.level >= 0 ? S : Object.assign({}, S, { level: 2000 }), true); return c === "suggest" ? "a-s" : c === "rare" ? "a-r" : "a-k"; }
let LEMMAS = null; // 只列原形：going、went 归到 go 下面，和字幕里的匹配方式一致
const allWords = () => LEMMAS || (LEMMAS = VS_WORDS.split(" ").filter(w => vsLemma(w) === w));
function drawAll() {
  const W = allWords(), n = { "m-k": 0, "m-l": 0, "m-i": 0, "a-k": 0, "a-s": 0, "a-r": 0 }; W.forEach(w => n[catOf(w)]++);
  let h = '<div class="lv"><b>英语</b><span>' + (S.level >= 0 ? "词汇水平 " + S.level : "未设置词汇水平（按 2000 估算）") + '</span><span>该语言最常用的 ' + W.length + ' 个单词（按原形）</span><button id="lvb">设置词汇水平</button></div>' +
    '<div class="tools"><label class="q"><input id="q" placeholder="搜索" value="' + esc(q) + '">' + I("search") + '</label><span class="seg" id="asort"><b data-v="freq"' + (allSort === "freq" ? ' class="on"' : "") + '>频率</b><b data-v="az"' + (allSort === "az" ? ' class="on"' : "") + '>A–Z</b></span><span class="seg" id="aview"><b data-v="cell"' + (allView === "cell" ? ' class="on"' : "") + '>单元格</b><b data-v="row"' + (allView === "row" ? ' class="on"' : "") + ">行</b></span></div>" +
    '<div class="chips"><span class="chip k on">' + I("check") + "已掌握 <b>" + n["m-k"] + "</b><i>自动 " + n["a-k"] + '</i></span><span class="chip l on">' + I("book") + "学习中 <b>" + n["m-l"] + "</b><i>建议 " + n["a-s"] + '</i></span><span class="chip g on">' + I("ban") + "不学习 <b>" + n["m-i"] + "</b><i>罕见 " + n["a-r"] + '</i></span></div><div class="leg">实线框里的数字是你自己标记的，斜体是按词汇水平推测的。右键点击单词：没有框的词加入学习，已在学习的词标为已掌握。</div>';
  const k = q.toLowerCase(), lim = k ? W.length : allShown, jump = [];
  const cell = w => { const ct = catOf(w); return '<span class="vs-w ' + (ct === "m-l" ? "wb" : ct) + '" data-w="' + esc(w) + '">' + esc(w === "i" ? "I" : w) + "</span>"; };
  const NAME = { "m-k": "已掌握", "m-l": "学习中", "m-i": "不学习", "a-k": "已掌握（推测）", "a-s": "建议学习", "a-r": "罕见" };
  const row = w => '<div class="wr"><span class="rk">' + vsRank(w) + "</span>" + cell(w) + '<span class="sn">' + NAME[catOf(w)] + "</span></div>";
  if (allSort === "freq") {
    for (let a = 0; a < lim; a += 100) {
      let ws = W.slice(a, a + 100); if (k) ws = ws.filter(w => w.includes(k)); if (!ws.length) continue;
      if (!k && (a < 1000 || a % 1000 === 0)) jump.push([a, a === 0 ? 1 : a >= 1000 ? a / 1000 + "k" : a]);
      h += '<div class="sec" id="r' + a + '">第 ' + (a + 1) + " – " + (a + 100) + " 个<span>词频排名 " + vsRank(W[a]) + " – " + vsRank(W[Math.min(a + 99, W.length - 1)]) + "</span></div>";
      if (allView === "row") { h += ws.map(row).join(""); continue; }
      const by = {}; ws.slice().sort().forEach(w => { const c = w[0].toUpperCase(); (by[c] = by[c] || []).push(w); });
      Object.keys(by).forEach(c => { h += '<div class="lr"><i>' + esc(c) + "</i><div>" + by[c].map(cell).join(" ") + "</div></div>"; });
    }
  } else { // A–Z：在已显示的范围内按首字母分段
    let ws = W.slice(0, lim); if (k) ws = ws.filter(w => w.includes(k)); const by = {}; ws.slice().sort().forEach(w => { const c = /^[a-z]/.test(w) ? w[0].toUpperCase() : "#"; (by[c] = by[c] || []).push(w); });
    Object.keys(by).sort().forEach(c => { jump.push([c, c]); h += '<div class="sec" id="r' + c + '">' + esc(c) + "<span>" + by[c].length + "</span></div>" + (allView === "row" ? by[c].map(row).join("") : '<div class="lr"><div>' + by[c].map(cell).join(" ") + "</div></div>"); });
  }
  if (!k && lim < W.length) h += '<div class="empty"><button id="more" style="border:1px solid #4a4f57;border-radius:6px;padding:6px 16px">再显示 1000 个（已显示到排名 ' + lim + "）</button></div>";
  h += '<div class="jump">' + jump.map(a => '<a data-a="' + a[0] + '">' + a[1] + "</a>").join("") + "</div>";
  $("#wrap").innerHTML = h;
  $("#q").oninput = e => { q = e.target.value.trim(); clearTimeout(drawAll.t); drawAll.t = setTimeout(() => { drawAll(); const i = $("#q"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); };
  $("#lvb").onclick = () => chrome.runtime.openOptionsPage();
  $("#asort").onclick = e => { const b = e.target.closest("b"); if (b) { allSort = b.dataset.v; drawAll(); } };
  $("#aview").onclick = e => { const b = e.target.closest("b"); if (b) { allView = b.dataset.v; drawAll(); } };
  if ($("#more")) $("#more").onclick = () => { allShown += 1000; const y = scrollY; drawAll(); scrollTo(0, y); };
  $$(".jump a").forEach(a => (a.onclick = () => { const el = document.getElementById("r" + a.dataset.a); if (el) el.scrollIntoView(); }));
}
function setMark(w, m) { // learn | known | ignore | ""
  w = w.toLowerCase();
  const L = lem(w); Object.keys(marks).forEach(x => { if (x === w || lem(x) === L) delete marks[x]; });
  if (m === "learn") { if (vsMarkOf(w) !== "learn") { saved.push(w); ctx[w] = ctx[w] || { at: Date.now() }; send({ type: "add", word: w }); } }
  else { saved = saved.filter(x => x !== w && lem(x) !== L); if (m) marks[w] = m; VS_SAVED = new Set(saved); }
}
function persist(cb) { chrome.storage.local.get({ saved: [] }, v => { const keep = new Set(saved), out = v.saved.filter(x => keep.has(x.toLowerCase())); saved.forEach(w => { if (!out.some(x => x.toLowerCase() === w)) out.push(w); }); chrome.storage.local.set({ saved: out, marks, savedCtx: ctx, savedSents: sents }, () => { VS_SAVED = new Set(saved); VS_MARKS = marks; cb && cb(); }); }); }
function bind(n) {
  const re = () => { picked.clear(); draw(); };
  $("#q").oninput = e => { q = e.target.value.trim(); page = 0; clearTimeout(bind.t); bind.t = setTimeout(() => { draw(); const i = $("#q"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); };
  $("#src").onchange = e => { src = e.target.value; page = 0; re(); };
  $("#sort").onclick = e => { const b = e.target.closest("b"); if (b) { sort = b.dataset.v; page = 0; re(); } };
  $$(".chip[data-f]").forEach(c => (c.onclick = () => { filt = c.dataset.f; page = 0; re(); }));
  $$(".chip[data-tg]").forEach(c => (c.onclick = () => { const t = c.dataset.tg; if (tagF.has(t)) tagF.delete(t); else tagF.add(t); page = 0; re(); }));
  if ($("#pp")) $("#pp").onclick = () => { page--; re(); scrollTo(0, 0); }; if ($("#pn")) $("#pn").onclick = () => { page++; re(); scrollTo(0, 0); };
  const upd = () => { const s = $("#sel"); s.classList.toggle("on", picked.size > 0); $("#seln").textContent = "已选 " + picked.size + " 项"; };
  $$("#wrap tr[data-w], #wrap tr[data-k]").forEach(tr => {
    const key = tr.dataset.w || tr.dataset.k, isW = !!tr.dataset.w;
    tr.querySelector("input").onchange = e => { if (e.target.checked) picked.add(key); else picked.delete(key); upd(); };
    tr.querySelector(".pl").onclick = () => { if (isW) { const m = mOf(key); say(m && m.aud ? "" : (m && m.t) || (ctx[key] || {}).t || key, m); } else { const x = sents.find(s => s.k === key); say(x.t, sOf(x)); } };
    tr.querySelector(".rm").onclick = () => removeKeys([key]);
  });
  $$("#sel button").forEach(b => (b.onclick = () => { const keys = [...picked], act = b.dataset.b;
    if (act === "copy") { const txt = tab === "words" ? keys.join("\n") : keys.map(k => { const x = sents.find(s => s.k === k); return x ? x.t + "\t" + (x.tr || "") : ""; }).join("\n"); navigator.clipboard.writeText(txt).then(() => (b.textContent = "已复制")); return; }
    if (act === "del") return removeKeys(keys);
    if (act === "tag") { keys.forEach(k => { if (b.dataset.c) tags[k] = b.dataset.c; else delete tags[k]; }); chrome.storage.local.set({ tags }, re); return; }
    keys.forEach(w => setMark(w, act)); persist(re);
  }));
  upd();
}
function removeKeys(keys) {
  if (keys.length > 1 && !confirm("确定要" + (tab === "words" && filt !== "learn" ? "取消标记" : "删除") + "这 " + keys.length + " 项吗？保存的原声和画面也会一起删除。")) return;
  if (tab === "words") { keys.forEach(w => { if (filt === "learn") { saved = saved.filter(x => x !== w); delete ctx[w]; delete srs[w]; delete med["med:w:" + w]; } else delete marks[w]; }); if (filt === "learn") chrome.storage.local.remove(keys.map(w => "med:w:" + w)); chrome.storage.local.set({ srs }); }
  else { sents = sents.filter(x => !keys.includes(x.k)); chrome.storage.local.remove(keys.map(k => "med:s:" + k)); }
  persist(() => { picked.clear(); draw(); });
}
function draw() { head(); if (tab === "words") drawWords(); else if (tab === "sents") drawSents(); else drawAll(); }
$$(".tabs b").forEach(b => (b.onclick = () => { tab = b.dataset.t; q = ""; src = ""; page = 0; picked.clear(); if (tab !== "words") sort = "date"; draw(); scrollTo(0, 0); }));
$("#rv").onclick = () => (location.href = "review.html");
document.addEventListener("contextmenu", e => { const w = e.target.closest && e.target.closest(".lr .vs-w, .wr .vs-w, td.x .vs-w"); if (!w) return; e.preventDefault(); const k = w.dataset.w.toLowerCase(); setMark(k, vsMarkOf(k) === "learn" ? "known" : "learn"); const y = scrollY; persist(() => { draw(); scrollTo(0, y); }); });
load(draw);
