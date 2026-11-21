/* 📅 每日一练（英语 → 第一个标签）：把每天该做的「词 · 听 · 说 · 读 · 写」排成一张清单，点「去练」直接跳到那个模块，做完自动打勾
   - 自动打勾用各模块自己记的数据（不另外记）：
       🔤 背单词：pump:log[今天].n（「🔊 练习」每做一张卡 +1）≥ 目标张数
       🎧 听：「🔊 练习」里今天做了 10 张听力 / 听写卡（pump:log[今天].ls），或口语「🎬 原声跟读」今天练过一条（speak:done 里 v: 开头的时间是今天）；用别的方式听过可以手动打勾
       🗣 说：口语「📅 每日一练」今天打卡（speak:days[今天]）
       📖 读：「📰 阅读」今天打开过一篇（reading:docs 里 at 是今天）；「去练」直接打开阅读页最上面的「📰 今日新闻」
       ✍️ 写：「📝 写作批改」今天批改过一篇（writing:history 里 at 是今天）
   - 本机存：daily:opt（开哪几项、单词目标）、daily:check（手动打勾，按天）、daily:days（每天完成几项 / 共几项，算连续天数和 7 天小格子）
   - 去练了某项之后，页面左下角有「📅 每日一练 2/5」小按钮，点一下回来 */
(function () {
  "use strict";
  const LG = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const LS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const tip = m => (typeof window.toast === "function" ? window.toast(m) : null);
  const lday = (t) => { const d = t ? new Date(t) : new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }; // 本地日期（同 pump.js）
  const kday = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // 吉隆坡 / 北京时间（同 speak.js）
  const ago = (k, n) => { const d = new Date(k + "T12:00:00"); d.setDate(d.getDate() - n); return lday(d.getTime()); };
  const isToday = t => !!t && lday(+t) === lday();
  const $ = id => document.getElementById(id);

  const DEF = { word: 20, on: { word: 1, listen: 1, speak: 1, read: 1, write: 1 } };
  const opt = () => { const o = LG("daily:opt", {}); return { word: +o.word || DEF.word, on: Object.assign({}, DEF.on, o.on || {}) }; };

  // ---------- 跳到各模块 ----------
  const click = el => { if (el) el.click(); };
  function toNotebook(mode) { click($("l1-en")); click($("tab-notebook")); setTimeout(() => click(document.querySelector('.modes button[data-mode="' + mode + '"]')), 0); }
  function toSpeak(sec) {
    try { localStorage.setItem("speak:sec", JSON.stringify(sec)); } catch (e) {}
    click($("l1-en")); click($("tab-speak"));
    let n = 0; const t = setInterval(() => { const b = document.querySelector('#view-speak [data-sec="' + sec + '"]'); if (b) { if (!b.classList.contains("on")) b.click(); clearInterval(t); } else if (++n > 30) clearInterval(t); }, 100);
  }
  function toNews() { toNotebook("reading"); setTimeout(() => { if (window.readingNews) window.readingNews(); }, 60); }
  function toWrite() { click($("l1-en")); click($("tab-ielts")); setTimeout(() => click($("ielts-t-write")), 0); }

  // ---------- 今天的任务 ----------
  function tasks() {
    const o = opt(), today = lday();
    const plog = (LG("pump:log", {})[today] || {}), pn = +plog.n || 0, ls = +plog.ls || 0;
    const sdone = LG("speak:done", {}), vToday = Object.keys(sdone).filter(k => /^v:/.test(k) && isToday(sdone[k])).length;
    const sday = !!LG("speak:days", {})[kday()], slog = +(LG("speak:log", {})[kday()] || 0);
    const docs = LG("reading:docs", []), rd = (Array.isArray(docs) ? docs : []).filter(d => isToday(d.at));
    const hist = LG("writing:history", []), wr = (Array.isArray(hist) ? hist : []).filter(h => isToday(h.at));
    const man = (LG("daily:check", {})[today]) || {};
    const L = [
      { id: "word", ic: "🔤", t: "背单词", sub: "在「🔊 练习」里复习、学新词，做满 " + o.word + " 张卡", prog: Math.min(pn, o.word) + " / " + o.word + " 张", pct: pn / o.word, auto: pn >= o.word, go: () => toNotebook("pump"), min: Math.round(o.word / 2) },
      { id: "listen", ic: "🎧", t: "听", sub: "「🔊 练习」里做 10 张听力 / 听写卡，或者去口语「🎬 原声跟读」听一段真人原声并跟读；看了英文视频也可以自己打勾", prog: [ls ? "听力卡 " + Math.min(ls, 10) + " / 10" : "", vToday ? "原声 " + vToday + " 条" : ""].filter(Boolean).join(" · "), pct: vToday ? 1 : ls / 10, auto: vToday > 0 || ls >= 10, go: () => toSpeak("clip"), min: 5 },
      { id: "speak", ic: "🗣", t: "说", sub: "口语「📅 每日一练」：1 段情景对话 + 跟读 5 句 + 说 1 个话题", prog: sday ? "今天已打卡" : slog ? "今天练了 " + slog + " 次，还没打卡" : "", pct: sday ? 1 : Math.min(.9, slog / 7), auto: sday, go: () => toSpeak("daily"), min: 15 },
      { id: "read", ic: "📖", t: "读", sub: "读「📰 今日新闻」（每天一篇 BBC / Guardian 热点），或者阅读里任意一篇；点不认识的词查意思、收进生词本", prog: rd.length ? "今天读了：" + rd.map(d => d.title).slice(0, 2).join("、") : "", pct: rd.length ? 1 : 0, auto: rd.length > 0, go: toNews, min: 10 },
      { id: "write", ic: "✍️", t: "写", sub: "在「📝 写作批改」写一段（用今天背的词写 3–5 句也行），交给它批改", prog: wr.length ? "今天批改了 " + wr.length + " 篇" : "", pct: wr.length ? 1 : 0, auto: wr.length > 0, go: toWrite, min: 10 },
    ].filter(x => o.on[x.id]);
    L.forEach(x => { x.man = !!man[x.id]; x.ok = x.auto || x.man; });
    return L;
  }

  // 每天完成情况：{日期: [完成几项, 共几项]}；连续天数 = 从今天（今天没做完就从昨天）往前数，全部做完的天
  function record(L) {
    const D = LG("daily:days", {}), k = lday(), v = [L.filter(x => x.ok).length, L.length];
    if (!D[k] || D[k][0] !== v[0] || D[k][1] !== v[1]) { const was = D[k] && D[k][0] >= D[k][1]; D[k] = v; LS("daily:days", D); if (!was && v[1] && v[0] >= v[1]) tip("🎉 今天的每日一练全部完成！"); }
    return D;
  }
  const full = x => x && x[1] && x[0] >= x[1];
  function streak(D) { let k = lday(), n = 0; if (!full(D[k])) k = ago(k, 1); while (full(D[k])) { n++; k = ago(k, 1); } return n; }

  // ---------- 页面 ----------
  const CSS = `
  html.show-daily #view-en{display:none}html.show-daily #view-daily{display:block}#view-daily{display:none}
  .dy{max-width:860px;margin:0 auto;padding:calc(110px + env(safe-area-inset-top,0px)) 16px 90px;color:var(--ui-ink);font-family:var(--ui-font)}
  @media(min-width:1024px){.dy{padding-top:84px}}
  .dy-hd{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px 16px;margin:6px 0 14px}.dy-hd h1{margin:0;font-size:26px;font-weight:900}.dy-hd p{margin:0;color:var(--ui-muted);font-size:13.5px;flex:1 1 240px}
  .dy-top{display:grid;grid-template-columns:auto 1fr auto;gap:14px 18px;align-items:center;background:var(--ui-surface);border:1px solid var(--ui-line);border-radius:16px;padding:14px 16px;margin-bottom:14px}
  .dy-ring{--p:0;width:74px;height:74px;border-radius:50%;background:conic-gradient(var(--ui-pur) calc(var(--p)*1%),var(--ui-surface-3,#3a3d43) 0);display:grid;place-items:center}
  .dy-ring>div{width:58px;height:58px;border-radius:50%;background:var(--ui-surface);display:grid;place-items:center;text-align:center;line-height:1.1}.dy-ring b{font-size:19px;font-weight:900}.dy-ring span{display:block;font-size:11px;color:var(--ui-muted)}
  .dy-meta b{font-size:16px}.dy-meta div{color:var(--ui-muted);font-size:13px;margin-top:4px}
  .dy-wk{display:flex;gap:5px}.dy-wk i{display:flex;flex-direction:column;align-items:center;gap:3px;font-style:normal;font-size:11px;color:var(--ui-muted)}
  .dy-wk u{width:18px;height:18px;border-radius:5px;background:var(--ui-surface-3,#3a3d43);display:block}.dy-wk u.h{background:var(--ui-pur);opacity:.45}.dy-wk u.f{background:var(--ui-pur)}.dy-wk i.td em{color:var(--ui-ink);font-weight:800}.dy-wk em{font-style:normal}
  .dy-go{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .dy-list{display:flex;flex-direction:column;gap:10px}
  .dy-it{display:grid;grid-template-columns:44px 1fr auto;gap:4px 12px;align-items:center;background:var(--ui-surface);border:1px solid var(--ui-line);border-radius:14px;padding:12px 14px}
  .dy-it.ok{border-color:color-mix(in srgb,var(--ui-green,#3fb37f) 55%,transparent)}
  .dy-ic{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;font-size:22px;background:var(--ui-surface-2)}.dy-it.ok .dy-ic{background:color-mix(in srgb,var(--ui-green,#3fb37f) 22%,transparent)}
  .dy-t b{font-size:16px}.dy-t small{margin-left:8px;color:var(--ui-muted);font-size:12px}.dy-t .s{color:var(--ui-ink-2);font-size:13.5px;line-height:1.5;margin-top:2px}
  .dy-t .p{font-size:12.5px;color:var(--ui-pur-text);margin-top:4px}.dy-bar{height:4px;border-radius:3px;background:var(--ui-surface-3,#3a3d43);margin-top:6px;overflow:hidden}.dy-bar u{display:block;height:100%;background:var(--ui-pur)}
  .dy-btns{display:flex;flex-direction:column;gap:6px;align-items:stretch}
  .dy-chk{border:1px solid var(--ui-line-2);background:transparent;color:var(--ui-muted);border-radius:10px;font:inherit;font-size:12.5px;padding:5px 8px;cursor:pointer}.dy-chk.on{color:var(--ui-green,#3fb37f);border-color:currentColor}
  .dy-note{color:var(--ui-muted);font-size:12.5px;line-height:1.6;margin-top:14px}
  .dy-set{background:var(--ui-surface);border:1px solid var(--ui-line);border-radius:14px;padding:12px 14px;margin-bottom:14px;display:none;font-size:14px}.dy-set.on{display:block}
  .dy-set label{display:inline-flex;align-items:center;gap:5px;margin:4px 14px 4px 0;cursor:pointer}.dy-set .row{margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  #dy-back{position:fixed;left:14px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:8950;display:none;border:1px solid var(--ui-line-2);border-radius:999px;height:40px;padding:0 14px;background:var(--ui-surface);color:var(--ui-ink);font:inherit;font-size:13.5px;font-weight:700;box-shadow:var(--ui-shadow);cursor:pointer}
  #dy-back.on{display:block}html.show-daily #dy-back,html.collect-mode #dy-back{display:none}
  @media(max-width:640px){.dy-hd h1{font-size:22px}.dy-top{grid-template-columns:auto 1fr}.dy-wk{grid-column:1/-1;justify-content:space-between}.dy-it{grid-template-columns:40px 1fr}.dy-ic{width:40px;height:40px}.dy-btns{grid-column:1/-1;flex-direction:row}.dy-btns .ui-btn{flex:1}}`;

  let root = null, back = null, showSet = false, went = false;
  function draw() {
    if (!root) return;
    const L = tasks(), D = record(L), n = L.filter(x => x.ok).length, st = streak(D), next = L.find(x => !x.ok), o = opt();
    const left = L.filter(x => !x.ok).reduce((a, x) => a + x.min, 0);
    const WD = "日一二三四五六", wk = Array.from({ length: 7 }, (_, i) => ago(lday(), 6 - i));
    const set = '<div class="dy-set' + (showSet ? " on" : "") + '"><b>每天练哪几项</b><div class="row">' +
      [["word", "🔤 背单词"], ["listen", "🎧 听"], ["speak", "🗣 说"], ["read", "📖 读"], ["write", "✍️ 写"]].map(([k, t]) => '<label><input type="checkbox" data-on="' + k + '"' + (o.on[k] ? " checked" : "") + ">" + t + "</label>").join("") +
      '</div><div class="row">单词每天 ' + [10, 20, 30, 50].map(v => '<button class="ui-btn' + (o.word === v ? " pri" : "") + '" data-word="' + v + '">' + v + " 张</button>").join("") + "</div></div>";
    root.innerHTML = '<div class="dy">' +
      '<div class="dy-hd"><h1>📅 每日一练</h1><p>每天按顺序做完这几项：词 → 听 → 说 → 读 → 写。点「去练」直接跳过去，做完回来会自动打勾。</p><button class="ui-btn" data-act="set">⚙ 设置</button></div>' + set +
      '<div class="dy-top"><div class="dy-ring" style="--p:' + (L.length ? Math.round(n / L.length * 100) : 0) + '"><div><div><b>' + n + "/" + L.length + '</b><span>今天</span></div></div></div>' +
      '<div class="dy-meta"><b>' + (!L.length ? "在 ⚙ 设置里选几项开始" : n >= L.length ? "🎉 今天全部完成" : "还剩 " + (L.length - n) + " 项，约 " + left + " 分钟") + "</b><div>🔥 连续全勤 " + st + " 天" + (Object.keys(D).length ? " · 共练了 " + Object.keys(D).filter(k => D[k][0] > 0).length + " 天" : "") + "</div></div>" +
      '<div class="dy-wk">' + wk.map(d => { const x = D[d]; return '<i class="' + (d === lday() ? "td" : "") + '" title="' + d + (x ? "：" + x[0] + " / " + x[1] : "") + '"><u class="' + (full(x) ? "f" : x && x[0] ? "h" : "") + '"></u><em>' + WD[new Date(d + "T12:00:00").getDay()] + "</em></i>"; }).join("") + "</div>" +
      (next ? '<div class="dy-go"><button class="ui-btn pri" data-go="' + next.id + '">▶ ' + (n ? "继续" : "开始") + "：" + next.ic + " " + next.t + "</button></div>" : "") + "</div>" +
      '<div class="dy-list">' + L.map(x => '<div class="dy-it' + (x.ok ? " ok" : "") + '"><div class="dy-ic">' + (x.ok ? "✅" : x.ic) + '</div><div class="dy-t"><b>' + x.ic + " " + esc(x.t) + "</b><small>约 " + x.min + " 分钟</small>" +
        '<div class="s">' + esc(x.sub) + "</div>" + (x.prog ? '<div class="p">' + esc(x.prog) + "</div>" : "") + (x.pct > 0 && !x.ok ? '<div class="dy-bar"><u style="width:' + Math.round(Math.min(1, x.pct) * 100) + '%"></u></div>' : "") + "</div>" +
        '<div class="dy-btns"><button class="ui-btn' + (x.ok ? "" : " pri") + '" data-go="' + x.id + '">' + (x.ok ? "再练" : "去练 ▶") + "</button>" +
        (x.auto ? "" : '<button class="dy-chk' + (x.man ? " on" : "") + '" data-chk="' + x.id + '">' + (x.man ? "✓ 已做完" : "手动打勾") + "</button>") + "</div></div>").join("") + "</div>" +
      '<div class="dy-note">打勾都是看各模块今天的练习记录自动算的（「听」没法全自动判断，可以手动打勾）。每项都做完算一天全勤；更细的数字看生词本里的「📊 统计」和口语页顶部的统计。</div></div>';
    paintBack(L, n);
  }
  function paintBack(L, n) {
    if (!back) return;
    if (!L) { L = tasks(); n = L.filter(x => x.ok).length; }
    back.textContent = "📅 每日一练 " + n + "/" + L.length;
    back.classList.toggle("on", went && L.length > 0);
  }
  function go(id) {
    const x = tasks().find(t => t.id === id) || { id }; went = true;
    ({ word: () => toNotebook("pump"), listen: () => toSpeak("clip"), speak: () => toSpeak("daily"), read: toNews, write: toWrite })[id]();
    paintBack();
    try { window.scrollTo(0, 0); } catch (e) {}
    return x;
  }
  function init() {
    if (root) return;
    root = $("view-daily"); if (!root) return;
    const st = document.createElement("style"); st.textContent = CSS; document.head.append(st);
    back = document.createElement("button"); back.id = "dy-back"; back.type = "button"; document.body.append(back);
    back.onclick = () => click($("tab-daily"));
    root.addEventListener("click", e => {
      const t = e.target.closest("button"); if (!t) return;
      if (t.dataset.go) return go(t.dataset.go);
      if (t.dataset.act === "set") { showSet = !showSet; return draw(); }
      if (t.dataset.word) { const o = LG("daily:opt", {}); o.word = +t.dataset.word; LS("daily:opt", o); return draw(); }
      if (t.dataset.chk) { const C = LG("daily:check", {}), k = lday(), m = C[k] || (C[k] = {}); if (m[t.dataset.chk]) delete m[t.dataset.chk]; else m[t.dataset.chk] = Date.now(); for (const d in C) if (d < ago(k, 30)) delete C[d]; LS("daily:check", C); return draw(); }
    });
    root.addEventListener("change", e => { const k = e.target.dataset.on; if (!k) return; const o = LG("daily:opt", {}); o.on = Object.assign({}, DEF.on, o.on || {}); o.on[k] = e.target.checked ? 1 : 0; LS("daily:opt", o); draw(); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { if (document.documentElement.classList.contains("show-daily")) draw(); else paintBack(); } });
    setInterval(() => { if (went && !document.hidden && !document.documentElement.classList.contains("show-daily")) paintBack(); }, 5000); // 在别的模块练的时候，左下角的进度跟着更新
  }
  window.dailyShow = () => { init(); draw(); };
  window.dailyHide = () => { if (back) paintBack(); };
  const boot = () => { init(); if (document.documentElement.classList.contains("show-daily")) draw(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
