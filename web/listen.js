/* 「🎧 听 → 📻 BBC 听力」：BBC Learning English 的四个每周更新的栏目（后台 /api/sme，见 _worker.js）
   🐢 慢速对话 Real Easy English / 💬 地道说法 The English We Speak / 📰 新闻英语 Learning English from the News / 📻 6 分钟英语 6 Minute English
   - 顶上一排切换栏目（记住上次选的 sme:s）；每个栏目：最新（或还没听的最新）一期 + 列表
   - 一期页面：播放器（慢 / 正常 / 快）、简介、本期问题、新闻标题、生词表（＋ 加生词本，例句取节目里那一句）、文稿按说话人分行（默认折起来，先盲听）
     「🀄 中文」开关（sme:zh）：所有英文下面加中文（后台用谷歌翻译，一期翻一次存起来）
     「📰 在阅读里打开文稿」= 用阅读页打开（按水平上色、点词查词、译文）
   - 播放中切到别的页面：播放器变成底部悬浮条继续播（↩ 回到节目 / ✕ 关掉）；同一个 <audio> 元素在页面和悬浮条之间挪，不会断
   - 听完（播放到 90% 以上，或点「✓ 听完了」）记进 sme:done {期号: 时间}，同步到后台 /api/mine k=sme；「📅 每日」的「听」今天听完一期就自动打勾
   依赖 index.html：window.enShow、window.vocabAddWord、toast；read.js 的 window.readingOpen；watch.js 的 window.videoCore.pause（两边不同时放） */
(function () {
  "use strict";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const LG = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const LS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const tip = m => { try { (window.toast || (() => {}))(m); } catch (e) {} };
  // 新加的排前面
  const SER = [
    ["ree", "🐢 慢速对话", "Real Easy English", "每周一期 · 两位主持人用简单英语慢慢聊日常话题，带生词表和文稿，最适合打基础"],
    ["tews", "💬 地道说法", "The English We Speak", "每周一期 · 3 分钟讲一个英国人常说的地道表达，有例句和文稿"],
    ["news", "📰 新闻英语", "Learning English from the News", "每周一期 · 用真实的新闻标题讲词：新闻背景、各家标题、关键词和例句（这个栏目没有全文文稿）"],
    ["sme", "📻 6 分钟英语", "6 Minute English", "每周一期 · 两位主持人 6 分钟聊一个话题，有本期问题、生词表和文稿"],
  ];
  const SM = Object.fromEntries(SER.map(x => [x[0], x]));
  const serOf = id => /^real-easy-english\//.test(id) ? "ree" : /^the-english-we-speak/.test(id) ? "tews" : /^learning-english-from-the-news/.test(id) ? "news" : "sme";
  const CSS = `
  #sme{display:none;max-width:900px;margin:0 auto;padding:6px 0 60px;overflow-wrap:anywhere;color:var(--ui-ink);font-family:var(--ui-font)}#sme.on{display:block}
  #sme .sm-ser{display:flex;gap:8px;overflow-x:auto;padding:2px 0 4px;margin:2px 0 8px;scrollbar-width:none}#sme .sm-ser::-webkit-scrollbar{display:none}
  #sme .sm-ser button{flex:0 0 auto;border:1px solid var(--ui-line-2);background:var(--ui-surface);color:var(--ui-ink);border-radius:999px;padding:7px 14px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap}
  #sme .sm-ser button.on{background:var(--ui-pur);border-color:var(--ui-pur);color:#fff}
  #sme .sm-head{margin:2px 0 12px;color:var(--ui-muted);font-size:13.5px;line-height:1.55}#sme .sm-head b{color:var(--ui-ink-2)}
  #sme .sm-new{display:grid;grid-template-columns:200px 1fr;gap:14px;align-items:center;background:linear-gradient(135deg,color-mix(in srgb,var(--ui-pur) 16%,var(--ui-surface)),var(--ui-surface));border:1px solid color-mix(in srgb,var(--ui-pur) 40%,var(--ui-line));border-radius:16px;padding:14px;cursor:pointer;margin-bottom:16px}
  #sme .sm-new img{width:100%;border-radius:10px;display:block;aspect-ratio:16/9;object-fit:cover}#sme .sm-new small{color:var(--ui-pur-text);font-weight:800;font-size:12.5px}#sme .sm-new b{display:block;font-size:19px;margin:4px 0}#sme .sm-new p{margin:0;color:var(--ui-ink-2);font-size:14px}
  #sme .sm-grid{display:grid;grid-template-columns:1fr;gap:10px}@media(min-width:720px){#sme .sm-grid{grid-template-columns:1fr 1fr}}
  #sme .sm-it{display:flex;gap:12px;align-items:center;background:var(--ui-surface);border:1px solid var(--ui-line);border-radius:14px;padding:10px 12px;cursor:pointer;min-width:0}#sme .sm-it:hover{border-color:var(--ui-pur)}
  #sme .sm-it img{width:88px;height:50px;object-fit:cover;border-radius:8px;flex:0 0 auto}#sme .sm-it .t{min-width:0;flex:1}#sme .sm-it b{display:block;font-size:14.5px;line-height:1.35}#sme .sm-it span{display:block;color:var(--ui-muted);font-size:12px;margin-top:2px}
  #sme .ok{color:var(--ui-green,#3fb37f);font-weight:700}
  #sme .sm-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:2px 0 12px}#sme .sm-bar .sp{flex:1}
  #sme .ui-btn.on{border-color:var(--ui-pur);color:var(--ui-pur-text)}
  #sme h1{margin:4px 0 6px;font-size:24px;line-height:1.35}#sme .sm-date{color:var(--ui-muted);font-size:13px;margin-bottom:10px}
  #sme .sm-box{background:var(--ui-surface);border:1px solid var(--ui-line);border-radius:14px;padding:12px 14px;margin:0 0 12px}#sme .sm-box h3{margin:0 0 8px;font-size:15px}
  #sme audio,#sm-float audio{width:100%;margin:4px 0 6px;display:block}#sme .sm-rate{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:13px;color:var(--ui-muted)}
  #sme .sm-rate button{border:1px solid var(--ui-line-2);background:var(--ui-surface-2);color:var(--ui-ink);border-radius:8px;padding:3px 10px;font:inherit;font-size:13px;cursor:pointer}#sme .sm-rate button.on{border-color:var(--ui-pur);color:var(--ui-pur-text)}
  #sme .sm-q div{margin:3px 0;font-size:14.5px}#sme .sm-intro{font-size:14.5px;line-height:1.6;color:var(--ui-ink-2)}
  #sme .zh{display:block;color:var(--ui-muted);font-size:.88em;line-height:1.55;margin-top:2px}#sme .zh:empty{display:none}#sme .zh.ld{opacity:.6}
  #sme .sm-voc{display:grid;grid-template-columns:auto 1fr auto;gap:8px 12px;align-items:center}#sme .sm-voc b{font-size:15px}#sme .sm-voc span.d{color:var(--ui-ink-2);font-size:13.5px}#sme .sm-voc i{display:block;font-style:normal;color:var(--ui-muted);font-size:13px;margin-top:3px}
  #sme .sm-voc button{border:1px solid var(--ui-line-2);background:transparent;color:var(--ui-ink);border-radius:8px;height:30px;padding:0 9px;font:inherit;font-size:13px;cursor:pointer}
  #sme .sm-hd div{margin:0 0 8px;font-size:14.5px}#sme .sm-hd small{color:var(--ui-muted);font-size:12px;margin-left:6px}
  #sme .sm-tr{font-size:16px;line-height:1.7}#sme .sm-tr p{margin:0 0 10px}#sme .sm-tr .w{display:block;font-size:12px;font-weight:800;color:var(--ui-pur-text)}#sme .sm-tr.hide{filter:blur(6px);user-select:none;max-height:220px;overflow:hidden;cursor:pointer}
  #sme .sm-empty{color:var(--ui-muted);padding:16px 2px}
  #sm-float{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:9400;width:min(560px,calc(100vw - 24px));box-sizing:border-box;background:var(--ui-surface,#26282c);border:1px solid color-mix(in srgb,var(--ui-pur,#9C3FD0) 50%,var(--ui-line-2,#454950));border-radius:16px;padding:8px 10px 4px;box-shadow:0 14px 40px rgba(0,0,0,.45);color:var(--ui-ink,#e6e8eb);font-family:var(--ui-font);display:none}
  #sm-float.on{display:block}#sm-float .top{display:flex;align-items:center;gap:8px;font-size:13px}#sm-float .top b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #sm-float button{border:1px solid var(--ui-line-2,#454950);background:var(--ui-surface-2,#2d2f34);color:var(--ui-ink,#e6e8eb);border-radius:8px;height:28px;padding:0 9px;font:inherit;font-size:12.5px;cursor:pointer;flex:0 0 auto}
  @media(max-width:640px){#sme .sm-new{grid-template-columns:1fr}#sme h1{font-size:21px}#sme .sm-voc{grid-template-columns:1fr auto}#sme .sm-voc b{grid-column:1/-1;margin-top:4px}}`;

  let root = null, ser = SM[LG("sme:s", "")] ? LG("sme:s", "") : SER[0][0], view = "home", trShow = false, rate = +LG("sme:rate", 1) || 1, zhOn = !!LG("sme:zh", false);
  const LISTS = {}, listBusy = {}, EPS = {}, ZH = {}, zhBusy = {}; let EP = null, epBusy = false;
  // ---------- 一个一直在的 <audio>：在节目页里显示，切走了就挪进悬浮条 ----------
  const AU = document.createElement("audio"); AU.controls = true; AU.preload = "metadata"; AU.id = "sm-audio";
  let fl = null, flClosed = false, auTitle = "";
  function flEl() {
    if (fl) return fl; fl = document.createElement("div"); fl.id = "sm-float";
    fl.innerHTML = '<div class="top"><span>🎧</span><b></b><button data-f="back" title="回到这期节目">↩ 回到节目</button><button data-f="x" title="停止并关掉">✕</button></div><div class="au"></div>';
    fl.addEventListener("click", e => { const b = e.target.closest("[data-f]"); if (!b) return; if (b.dataset.f === "x") { AU.pause(); flClosed = true; sync(); } else backToEp(); });
    document.body.append(fl); return fl;
  }
  const onPage = () => !!(root && root.classList.contains("on") && root.getClientRects().length && view === "ep" && EP && !EP.err && EP.id === AU.dataset.id);
  // html.sm-floating：视频悬浮窗看到这个会往上挪，不叠在一起。只在真的要变时才写：classList 就算没变也会触发 MutationObserver，sync 又在监听 html 的 class，会死循环卡住页面
  function setFloatCls(on) { const H = document.documentElement; if (H.classList.contains("sm-floating") !== on) H.classList.toggle("sm-floating", on); }
  function sync() { // 节目页看得见 → 播放器放回页面；看不见但在播（或暂停在中途）→ 悬浮条
    const slot = root && root.querySelector("#sm-slot"), f = flEl(), box = f.querySelector(".au");
    if (onPage() && slot) { if (AU.parentNode !== slot) slot.append(AU); f.classList.remove("on"); setFloatCls(false); return; }
    if (AU.parentNode !== box) box.append(AU);
    const keep = !!AU.dataset.id && !flClosed && (!AU.paused || (AU.currentTime > 0 && !AU.ended));
    f.querySelector("b").textContent = auTitle; f.classList.toggle("on", keep); setFloatCls(keep);
  }
  function backToEp() {
    const id = AU.dataset.id; if (!id) return;
    if (window.enShow) window.enShow("listen", "sme");
    ser = serOf(id); LS("sme:s", ser); if (!(EP && EP.id === id && view === "ep")) openEp(id); else { draw(); window.scrollTo(0, 0); }
  }
  AU.addEventListener("loadedmetadata", () => { AU.playbackRate = rate; });
  AU.addEventListener("play", () => { flClosed = false; try { if (window.TTS && TTS.stop) TTS.stop(); speechSynthesis.cancel(); } catch (e) {} try { if (window.videoCore && videoCore.pause) videoCore.pause(); } catch (e) {} sync(); });
  AU.addEventListener("pause", () => sync());
  AU.addEventListener("timeupdate", () => { if (AU.duration && AU.currentTime / AU.duration > 0.9 && AU.dataset.id) markDone(AU.dataset.id); });
  window.smePause = () => { try { AU.pause(); } catch (e) {} };

  // ---------- 听过哪几期：本机 sme:done + 后台 /api/mine k=sme ----------
  const done = () => LG("sme:done", {}) || {};
  function markDone(id) {
    const D = done(); if (D[id] && new Date(D[id]).toDateString() === new Date().toDateString()) return;
    D[id] = Date.now(); LS("sme:done", D);
    fetch("/api/mine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ k: "sme", changes: { [id]: { v: D[id], at: D[id] } } }) }).catch(() => {});
    tip("✓ 这期听完了"); if (view === "ep") draw();
  }
  let pulled = false;
  function pull() {
    if (pulled) return; pulled = true;
    fetch("/api/mine?k=sme").then(r => r.json()).then(j => { if (!j || !j.ok) return; const D = done(); let ch = false; for (const id in j.items || {}) { const x = j.items[id]; if (!x.del && +x.v > (+D[id] || 0)) { D[id] = +x.v; ch = true; } } if (ch) { LS("sme:done", D); draw(); } }).catch(() => {});
  }

  function loadList(s) {
    if (LISTS[s] || listBusy[s]) return; listBusy[s] = true;
    const fin = l => { listBusy[s] = false; LISTS[s] = l; if (view === "home" && ser === s) draw(); };
    fetch("/api/sme?s=" + s).then(r => r.json()).then(j => fin(j && j.ok ? j.list : [])).catch(() => fin([]));
  }
  function openEp(id) {
    view = "ep"; trShow = false; EP = EPS[id] || null; epBusy = !EP; draw(); window.scrollTo(0, 0);
    if (EP) { if (zhOn) loadZh(id); return; }
    fetch("/api/sme?ep=" + encodeURIComponent(id)).then(r => r.json()).then(j => { epBusy = false; if (j && j.ok) EPS[id] = j; if (view === "ep" && !EP) { EP = j && j.ok ? j : { err: 1, id }; draw(); if (zhOn && EP.ok) loadZh(id); } }).catch(() => { epBusy = false; if (view === "ep" && !EP) { EP = { err: 1, id }; draw(); } });
  }
  function loadZh(id) {
    if (ZH[id] || zhBusy[id]) return; zhBusy[id] = true;
    fetch("/api/sme?zh=1&ep=" + encodeURIComponent(id)).then(r => r.json()).then(j => { zhBusy[id] = false; if (j && j.ok) ZH[id] = j; else tip("中文翻译没取到，过一会儿再点一次「🀄 中文」"); if (EP && EP.id === id) draw(); }).catch(() => { zhBusy[id] = false; tip("中文翻译没取到（网络问题）"); if (EP && EP.id === id) draw(); });
  }
  const meta = id => (LISTS[serOf(id)] || []).find(x => x.id === id) || {};

  function homeHtml() {
    const D = done(), L = LISTS[ser];
    if (!L) return '<div class="sm-empty">正在取节目列表…</div>';
    if (!L.length) return '<div class="sm-empty">节目列表没取到，过一会儿再试</div>';
    const n0 = L[0], fresh = L.find(x => !D[x.id]) || n0;
    const it = x => '<div class="sm-it" data-ep="' + esc(x.id) + '"><img src="' + esc(x.img) + '" alt="" loading="lazy"><div class="t"><b>' + esc(x.t) + "</b><span>" + esc(x.d) + (D[x.id] ? ' · <em class="ok">✓ 听过</em>' : "") + "</span></div></div>";
    return '<div class="sm-new" data-ep="' + esc(fresh.id) + '"><img src="' + esc(fresh.img) + '" alt=""><div><small>' + (fresh === n0 ? "🆕 最新一期" : "👉 还没听的最新一期") + " · " + esc(fresh.d) + "</small><b>" + esc(fresh.t) + "</b><p>" + esc(fresh.p) + "</p></div></div>" +
      '<div class="sm-grid">' + L.slice(0, 40).map(it).join("") + "</div>";
  }
  function epHtml() {
    if (!EP) return '<div class="sm-empty">' + (epBusy ? "正在取这一期的音频和文稿…" : "") + "</div>";
    if (EP.err) return '<div class="sm-empty">这一期没取到，<a href="https://www.bbc.co.uk/learningenglish/english/features/' + esc(EP.id) + '" target="_blank" rel="noopener">去 BBC 网站看</a></div>';
    const m = meta(EP.id), D = done(), heard = !!D[EP.id], S = SM[serOf(EP.id)], Z = zhOn ? ZH[EP.id] : null, zl = zhOn && !Z && zhBusy[EP.id];
    // 中文：开着才有；还在翻就先在前面几处显示「翻译中…」
    const zh = (arr, i) => zhOn ? '<span class="zh' + (zl ? " ld" : "") + '">' + (Z ? esc((arr ? (Z[arr] || [])[i] : Z.intro) || "") : zl && (arr !== "lines" || i < 2) ? "翻译中…" : "") + "</span>" : "";
    const tr = (EP.lines || []).map((l, i) => "<p>" + (l.who ? '<span class="w">' + esc(l.who === "Examples" ? "例句 Examples" : l.who) + "</span>" : "") + esc(l.t) + zh("lines", i) + "</p>").join("");
    const news = serOf(EP.id) === "news";
    return '<h1>' + esc(EP.title) + '</h1><div class="sm-date">' + esc(m.d || "") + " · BBC Learning English · " + esc(S[2]) + (heard ? ' · <span class="ok">✓ 听过</span>' : "") + "</div>" +
      '<div class="sm-box"><div id="sm-slot"></div><div class="sm-rate">速度 ' + [0.75, 0.9, 1, 1.15].map(v => '<button data-rate="' + v + '" class="' + (Math.abs(rate - v) < .01 ? "on" : "") + '">' + v + "×</button>").join("") +
      '<span style="flex:1"></span><button data-a="done">' + (heard ? "✓ 已听完" : "✓ 听完了") + "</button></div></div>" +
      (EP.intro ? '<div class="sm-box"><h3>' + (news ? "📰 新闻背景" : "📝 简介") + '</h3><div class="sm-intro">' + esc(EP.intro) + zh("", 0) + "</div></div>" : "") +
      ((EP.q || []).length ? '<div class="sm-box sm-q"><h3>❓ 本期问题（答案在节目最后）</h3>' + EP.q.map((x, i) => "<div>" + esc(x) + zh("q", i) + "</div>").join("") + "</div>" : "") +
      ((EP.heads || []).length ? '<div class="sm-box sm-hd"><h3>🗞️ 各家新闻标题</h3>' + EP.heads.map((h, i) => "<div>" + esc(h[0]) + (h[1] ? "<small>— " + esc(h[1]) + "</small>" : "") + zh("heads", i) + "</div>").join("") + "</div>" : "") +
      ((EP.vocab || []).length ? '<div class="sm-box"><h3>🔤 ' + (news ? "关键词" : "本期生词") + '</h3><div class="sm-voc">' + EP.vocab.map((v, i) => "<b>" + esc(v[0]) + '</b><span class="d">' + esc(v[1]) + zh("vocab", i) + (v[2] ? "<i>例：" + esc(v[2]) + (Z ? '<span class="zh">' + esc((Z.vex || [])[i] || "") + "</span>" : "") + "</i>" : "") + '</span><button data-add="' + i + '">＋ 生词本</button>').join("") + "</div></div>" : "") +
      (tr ? '<div class="sm-box"><h3 style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">📄 文稿 <span style="flex:1"></span><button class="ui-btn" data-a="tr">' + (trShow ? "折起来" : "显示文稿") + '</button><button class="ui-btn" data-a="read">📰 在阅读里打开（查词、上色）</button></h3>' +
        '<div class="sm-tr' + (trShow ? "" : " hide") + '" data-a="tr-peek" title="' + (trShow ? "" : "建议先不看文稿听一两遍，再点开对照") + '">' + tr + "</div></div>" : (news ? '<div class="sm-empty">这个栏目 BBC 没有放全文文稿：先听一遍，再看上面的新闻背景和关键词。</div>' : ""));
  }
  function draw() {
    if (!root) return;
    const f = flEl(); if (root.contains(AU)) f.querySelector(".au").append(AU); // 先把播放器挪出去，重画页面时不会被删掉（删掉会停）
    const S = SM[ser];
    root.innerHTML = '<div class="sm-ser">' + SER.map(x => '<button data-ser="' + x[0] + '" class="' + (x[0] === ser ? "on" : "") + '">' + x[1] + "</button>").join("") + "</div>" +
      (view === "ep" ? '<div class="sm-bar"><button class="ui-btn" data-a="home">← 节目列表</button><span class="sp"></span><button class="ui-btn' + (zhOn ? " on" : "") + '" data-a="zh" title="英文下面显示中文翻译">🀄 中文：' + (zhOn ? "开" : "关") + "</button></div>" + epHtml()
        : '<div class="sm-head"><b>' + esc(S[2]) + "</b> · BBC Learning English · " + esc(S[3]) + "</div>" + homeHtml());
    if (view === "ep" && EP && !EP.err && AU.dataset.id !== EP.id) { AU.pause(); AU.src = EP.mp3; AU.dataset.id = EP.id; auTitle = SM[serOf(EP.id)][1] + " · " + EP.title; AU.playbackRate = rate; flClosed = false; }
    sync();
  }
  function init() {
    if (root) return; root = document.getElementById("sme"); if (!root) return;
    const st = document.createElement("style"); st.textContent = CSS; document.head.append(st);
    flEl();
    // 切标签（#sme 或外面的页面被藏起来）时把播放器挪进悬浮条
    const mo = new MutationObserver(() => sync());
    mo.observe(root, { attributes: true, attributeFilter: ["class"] }); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-en", "data-mode"] });
    const ven = document.getElementById("view-en"); if (ven) mo.observe(ven, { attributes: true, attributeFilter: ["class", "style"] });
    root.addEventListener("click", e => {
      const t = e.target, sv = t.closest("[data-ser]"); if (sv) { ser = sv.dataset.ser; LS("sme:s", ser); view = "home"; loadList(ser); draw(); return; }
      const epEl = t.closest("[data-ep]"); if (epEl) { openEp(epEl.dataset.ep); return; }
      const r = t.closest("[data-rate]"); if (r) { rate = +r.dataset.rate; LS("sme:rate", rate); AU.playbackRate = rate; root.querySelectorAll("[data-rate]").forEach(x => x.classList.toggle("on", x === r)); return; }
      const ad = t.closest("[data-add]"); if (ad && EP) { const v = EP.vocab[+ad.dataset.add], w = String(v[0]).replace(/\s*\(.*?\)\s*/g, " ").trim(), re = new RegExp("\\b" + w.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), line = (EP.lines || []).find(l => re.test(l.t)); if (window.vocabAddWord) { ad.disabled = true; window.vocabAddWord(w, v[2] || (line ? line.t : "")).then(ok => { ad.textContent = ok ? "✓ 已加" : "已在本里"; }); } return; }
      const b = t.closest("[data-a]"); if (!b) return; const a = b.dataset.a;
      if (a === "home") { view = "home"; if (EP && !EP.err) ser = serOf(EP.id); loadList(ser); draw(); return; }
      if (a === "zh") { zhOn = !zhOn; LS("sme:zh", zhOn); if (zhOn && EP && !EP.err) loadZh(EP.id); draw(); return; }
      if (a === "done" && EP && !EP.err) { markDone(EP.id); return; }
      if (a === "tr" || (a === "tr-peek" && !trShow)) { trShow = !trShow; draw(); return; }
      if (a === "read" && EP && window.readingOpen) {
        const text = (EP.lines || []).map(l => (l.who ? l.who + ": " : "") + l.t).join("\n\n");
        if (window.enShow) window.enShow("read"); setTimeout(() => window.readingOpen(text, SM[serOf(EP.id)][2] + ": " + EP.title, "sme:" + EP.id), 50); return;
      }
    });
  }
  window.smeShow = () => { init(); if (!root) return; pull(); loadList(ser); draw(); };
  window.smeDoneToday = () => { const D = done(), t = new Date().toDateString(); return Object.keys(D).filter(id => new Date(D[id]).toDateString() === t); }; // 「📅 每日」的「听」用
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
