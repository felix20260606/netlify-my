/* 「🎧 听 → 📻 6 分钟英语」：BBC Learning English 的 6 Minute English（每周四一期，6 分钟两位主持人聊一个话题，带全文文稿和生词表）
   - 后台 GET /api/sme → 节目目录；GET /api/sme?ep=… → 一期的音频 mp3、简介、本期问题、生词表、文稿（后台缓存，见 _worker.js）
   - 一期页面：播放器（慢 / 正常 / 快）、先盲听（文稿默认折起来）、本期问题、生词表（＋ 加生词本，例句取文稿里那一句）、文稿按说话人分行（点一行从那里播不了，因为没有时间轴，只能整段播放）
     「📰 在阅读里打开文稿」= 用阅读页打开（按水平上色、点词查词、译文）
   - 听完（播放到 90% 以上，或点「✓ 听完了」）记进 sme:done {期号: 时间}，同步到后台 /api/mine k=sme（换设备也在）；「📅 每日」的「听」今天听完一期就自动打勾
   依赖 index.html：window.enShow、window.vocabAddWord、toast；read.js 的 window.readingOpen */
(function () {
  "use strict";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const LG = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const LS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const tip = m => { try { (window.toast || (() => {}))(m); } catch (e) {} };
  const CSS = `
  #sme{display:none;max-width:900px;margin:0 auto;padding:6px 0 60px;overflow-wrap:anywhere;color:var(--ui-ink);font-family:var(--ui-font)}#sme.on{display:block}
  #sme .sm-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px;margin:4px 0 12px}#sme .sm-head h2{margin:0;font-size:20px}#sme .sm-head span{color:var(--ui-muted);font-size:13.5px}
  #sme .sm-new{display:grid;grid-template-columns:200px 1fr;gap:14px;align-items:center;background:linear-gradient(135deg,color-mix(in srgb,var(--ui-pur) 16%,var(--ui-surface)),var(--ui-surface));border:1px solid color-mix(in srgb,var(--ui-pur) 40%,var(--ui-line));border-radius:16px;padding:14px;cursor:pointer;margin-bottom:16px}
  #sme .sm-new img{width:100%;border-radius:10px;display:block;aspect-ratio:16/9;object-fit:cover}#sme .sm-new small{color:var(--ui-pur-text);font-weight:800;font-size:12.5px}#sme .sm-new b{display:block;font-size:19px;margin:4px 0}#sme .sm-new p{margin:0;color:var(--ui-ink-2);font-size:14px}
  #sme .sm-grid{display:grid;grid-template-columns:1fr;gap:10px}@media(min-width:720px){#sme .sm-grid{grid-template-columns:1fr 1fr}}
  #sme .sm-it{display:flex;gap:12px;align-items:center;background:var(--ui-surface);border:1px solid var(--ui-line);border-radius:14px;padding:10px 12px;cursor:pointer;min-width:0}#sme .sm-it:hover{border-color:var(--ui-pur)}
  #sme .sm-it img{width:88px;height:50px;object-fit:cover;border-radius:8px;flex:0 0 auto}#sme .sm-it .t{min-width:0;flex:1}#sme .sm-it b{display:block;font-size:14.5px;line-height:1.35}#sme .sm-it span{display:block;color:var(--ui-muted);font-size:12px;margin-top:2px}
  #sme .ok{color:var(--ui-green,#3fb37f);font-weight:700}
  #sme .sm-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:2px 0 12px}#sme .sm-bar .sp{flex:1}
  #sme h1{margin:4px 0 6px;font-size:24px;line-height:1.35}#sme .sm-date{color:var(--ui-muted);font-size:13px;margin-bottom:10px}
  #sme .sm-box{background:var(--ui-surface);border:1px solid var(--ui-line);border-radius:14px;padding:12px 14px;margin:0 0 12px}#sme .sm-box h3{margin:0 0 8px;font-size:15px}
  #sme audio{width:100%;margin:4px 0 6px}#sme .sm-rate{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:13px;color:var(--ui-muted)}
  #sme .sm-rate button{border:1px solid var(--ui-line-2);background:var(--ui-surface-2);color:var(--ui-ink);border-radius:8px;padding:3px 10px;font:inherit;font-size:13px;cursor:pointer}#sme .sm-rate button.on{border-color:var(--ui-pur);color:var(--ui-pur-text)}
  #sme .sm-q div{margin:3px 0;font-size:14.5px}#sme .sm-intro{font-size:14.5px;line-height:1.6;color:var(--ui-ink-2)}
  #sme .sm-voc{display:grid;grid-template-columns:auto 1fr auto;gap:6px 12px;align-items:center}#sme .sm-voc b{font-size:15px}#sme .sm-voc span{color:var(--ui-ink-2);font-size:13.5px}
  #sme .sm-voc button{border:1px solid var(--ui-line-2);background:transparent;color:var(--ui-ink);border-radius:8px;height:30px;padding:0 9px;font:inherit;font-size:13px;cursor:pointer}
  #sme .sm-tr{font-size:16px;line-height:1.7}#sme .sm-tr p{margin:0 0 10px}#sme .sm-tr .w{display:block;font-size:12px;font-weight:800;color:var(--ui-pur-text)}#sme .sm-tr.hide{filter:blur(6px);user-select:none;max-height:220px;overflow:hidden;cursor:pointer}
  #sme .sm-empty{color:var(--ui-muted);padding:16px 2px}
  @media(max-width:640px){#sme .sm-new{grid-template-columns:1fr}#sme h1{font-size:21px}}`;

  let root = null, LIST = null, listBusy = false, EP = null, epBusy = false, view = "home", trShow = false, rate = +LG("sme:rate", 1) || 1;
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

  function loadList() {
    if (LIST || listBusy) return; listBusy = true;
    fetch("/api/sme").then(r => r.json()).then(j => { listBusy = false; LIST = j && j.ok ? j.list : []; if (view === "home") draw(); }).catch(() => { listBusy = false; LIST = []; if (view === "home") draw(); });
  }
  function openEp(id) {
    view = "ep"; EP = null; epBusy = true; trShow = false; draw(); window.scrollTo(0, 0);
    fetch("/api/sme?ep=" + encodeURIComponent(id)).then(r => r.json()).then(j => { epBusy = false; EP = j && j.ok ? j : { err: 1, id }; draw(); }).catch(() => { epBusy = false; EP = { err: 1, id }; draw(); });
  }
  const meta = id => (LIST || []).find(x => x.id === id) || {};

  function homeHtml() {
    const D = done();
    if (!LIST) return '<div class="sm-empty">正在取节目列表…</div>';
    if (!LIST.length) return '<div class="sm-empty">节目列表没取到，过一会儿再试</div>';
    const n0 = LIST[0], fresh = LIST.find(x => !D[x.id]) || n0;
    const it = x => '<div class="sm-it" data-ep="' + esc(x.id) + '"><img src="' + esc(x.img) + '" alt="" loading="lazy"><div class="t"><b>' + esc(x.t) + "</b><span>" + esc(x.d) + (D[x.id] ? ' · <em class="ok">✓ 听过</em>' : "") + "</span></div></div>";
    return '<div class="sm-new" data-ep="' + esc(fresh.id) + '"><img src="' + esc(fresh.img) + '" alt=""><div><small>' + (fresh === n0 ? "🆕 最新一期" : "👉 还没听的最新一期") + " · " + esc(fresh.d) + "</small><b>" + esc(fresh.t) + "</b><p>" + esc(fresh.p) + "</p></div></div>" +
      '<div class="sm-grid">' + LIST.slice(0, 40).map(it).join("") + "</div>";
  }
  function epHtml() {
    if (!EP) return '<div class="sm-empty">' + (epBusy ? "正在取这一期的音频和文稿…" : "") + "</div>";
    if (EP.err) return '<div class="sm-empty">这一期没取到，<a href="https://www.bbc.co.uk/learningenglish/english/features/' + esc(EP.id) + '" target="_blank" rel="noopener">去 BBC 网站看</a></div>';
    const m = meta(EP.id), D = done(), heard = !!D[EP.id];
    const tr = (EP.lines || []).map(l => "<p>" + (l.who ? '<span class="w">' + esc(l.who) + "</span>" : "") + esc(l.t) + "</p>").join("");
    return '<h1>' + esc(EP.title) + '</h1><div class="sm-date">' + esc(m.d || "") + " · BBC Learning English · 6 Minute English" + (heard ? ' · <span class="ok">✓ 听过</span>' : "") + "</div>" +
      '<div class="sm-box"><audio id="sm-audio" controls preload="metadata" src="' + esc(EP.mp3) + '"></audio><div class="sm-rate">速度 ' + [0.75, 0.9, 1, 1.15].map(v => '<button data-rate="' + v + '" class="' + (Math.abs(rate - v) < .01 ? "on" : "") + '">' + v + "×</button>").join("") +
      '<span style="flex:1"></span><button data-a="done">' + (heard ? "✓ 已听完" : "✓ 听完了") + "</button></div></div>" +
      (EP.intro ? '<div class="sm-box"><h3>📝 简介</h3><div class="sm-intro">' + esc(EP.intro) + "</div></div>" : "") +
      ((EP.q || []).length ? '<div class="sm-box sm-q"><h3>❓ 本期问题（答案在节目最后）</h3>' + EP.q.map(x => "<div>" + esc(x) + "</div>").join("") + "</div>" : "") +
      ((EP.vocab || []).length ? '<div class="sm-box"><h3>🔤 本期生词</h3><div class="sm-voc">' + EP.vocab.map((v, i) => "<b>" + esc(v[0]) + "</b><span>" + esc(v[1]) + '</span><button data-add="' + i + '">＋ 生词本</button>').join("") + "</div></div>" : "") +
      '<div class="sm-box"><h3 style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">📄 文稿 <span style="flex:1"></span><button class="ui-btn" data-a="tr">' + (trShow ? "折起来" : "显示文稿") + '</button><button class="ui-btn" data-a="read">📰 在阅读里打开（查词、上色、译文）</button></h3>' +
      '<div class="sm-tr' + (trShow ? "" : " hide") + '" data-a="tr-peek" title="' + (trShow ? "" : "建议先不看文稿听一两遍，再点开对照") + '">' + tr + "</div></div>";
  }
  function draw() {
    if (!root) return;
    root.innerHTML = '<div class="sm-head"><h2>📻 6 分钟英语</h2><span>BBC Learning English · 每周四一期，两位主持人聊一个话题，带文稿和生词表</span></div>' +
      (view === "ep" ? '<div class="sm-bar"><button class="ui-btn" data-a="home">← 节目列表</button></div>' + epHtml() : homeHtml());
    const au = root.querySelector("#sm-audio");
    if (au) {
      au.playbackRate = rate;
      au.addEventListener("loadedmetadata", () => { au.playbackRate = rate; });
      au.addEventListener("timeupdate", () => { if (au.duration && au.currentTime / au.duration > 0.9 && EP && !EP.err) markDone(EP.id); });
      au.addEventListener("play", () => { try { if (window.TTS && TTS.stop) TTS.stop(); speechSynthesis.cancel(); } catch (e) {} });
    }
  }
  function init() {
    if (root) return; root = document.getElementById("sme"); if (!root) return;
    const st = document.createElement("style"); st.textContent = CSS; document.head.append(st);
    root.addEventListener("click", e => {
      const t = e.target, epEl = t.closest("[data-ep]"); if (epEl) { openEp(epEl.dataset.ep); return; }
      const r = t.closest("[data-rate]"); if (r) { rate = +r.dataset.rate; LS("sme:rate", rate); const au = root.querySelector("#sm-audio"); if (au) au.playbackRate = rate; root.querySelectorAll("[data-rate]").forEach(x => x.classList.toggle("on", x === r)); return; }
      const ad = t.closest("[data-add]"); if (ad && EP) { const v = EP.vocab[+ad.dataset.add], w = String(v[0]).replace(/\s*\(.*?\)\s*/g, " ").trim(), re = new RegExp("\\b" + w.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), line = (EP.lines || []).find(l => re.test(l.t)); if (window.vocabAddWord) { ad.disabled = true; window.vocabAddWord(w, line ? line.t : "").then(ok => { ad.textContent = ok ? "✓ 已加" : "已在本里"; }); } return; }
      const b = t.closest("[data-a]"); if (!b) return; const a = b.dataset.a;
      if (a === "home") { view = "home"; const au = root.querySelector("#sm-audio"); if (au) au.pause(); draw(); return; }
      if (a === "done" && EP && !EP.err) { markDone(EP.id); return; }
      if (a === "tr" || (a === "tr-peek" && !trShow)) { trShow = !trShow; draw(); return; }
      if (a === "read" && EP && window.readingOpen) {
        const text = (EP.lines || []).map(l => (l.who ? l.who + ": " : "") + l.t).join("\n\n"), au = root.querySelector("#sm-audio"); if (au) au.pause();
        if (window.enShow) window.enShow("read"); setTimeout(() => window.readingOpen(text, "6 Minute English: " + EP.title, "sme:" + EP.id), 50); return;
      }
    });
  }
  window.smeShow = () => { init(); if (!root) return; pull(); loadList(); draw(); };
  window.smeDoneToday = () => { const D = done(), t = new Date().toDateString(); return Object.keys(D).filter(id => new Date(D[id]).toDateString() === t); }; // 「📅 每日」的「听」用
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
