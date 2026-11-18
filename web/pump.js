/* 生词本「🔊 练习」：照 Language Reactor 的 PhrasePump 做的练法，和电脑插件的复习页共用一份复习进度（state.srs，存在网站后台）
   每个词连续练 3 个例句（用词条自带的例句）；先听，按 E / 点模糊处先显示原文、再显示翻译；复习过的词先出一张填空题。
   间隔：1 天、3 天、7 天、16 天、35 天、90 天；到 35 天这一级自动标为「已掌握」。依赖 index.html 的全局：state / words / save / speak / toast */
(function () {
  const DAY = 864e5, GAP = [10 * 6e4, DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY, 90 * DAY], DONE = 5, PER = 3, NUMS = [20, 40, 60, 80, 100], NEWS = [0, 5, 10, 15, 20, 25];
  const LG = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, LS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const today = () => new Date().toISOString().slice(0, 10);
  let opt = Object.assign({ quiz: true, num: 20, newPct: 15, types: ["word", "phrase"] }, LG("pump:opt", {}));
  let day = LG("pump:day", { d: "", n: 0 }); if (day.d !== today()) day = { d: today(), n: 0 };
  let cards = [], at = 0, bad = 0, playing = false, root = null;
  const CSS = `
  #pump{display:none;max-width:860px;margin:0 auto;padding:6px 0 30px}#pump.on{display:block}
  @media(min-width:1024px){#pump{max-width:1200px}.pp-home{grid-template-columns:minmax(0,1.1fr) minmax(0,1fr)}.pp-card{min-height:320px}.pp-en{font-size:24px;max-width:860px}.pp-zh{font-size:17px;max-width:860px}}
  .pp-home{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px;align-items:start}
  @media(max-width:720px){.pp-home{grid-template-columns:1fr}}
  .pp-hc{background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:20px 20px 22px;box-shadow:0 1px 0 rgba(0,0,0,.02)}
  .pp-hc h2{margin:0 0 14px;font-size:20px;display:flex;align-items:center;gap:8px}.pp-hc h2 b{color:var(--jade)}
  .pp-today{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px;margin-bottom:8px}.pp-today .emo{font-size:18px}.pp-today b{color:var(--ink);font-weight:600}
  .pp-bar{height:6px;border-radius:3px;background:var(--paper-2);overflow:hidden}.pp-bar i{display:block;height:100%;background:var(--jade);width:0;transition:width .3s}
  .pp-st{display:flex;margin:18px 0 14px;padding-bottom:16px;border-bottom:1px solid var(--line)}.pp-st div{flex:1}
  .pp-st small{display:block;color:var(--muted);font-size:12px}.pp-st b{font-size:24px;font-weight:600}.pp-st em{display:block;font-style:normal;color:var(--muted);font-size:12px}
  .pp-go{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:6px}
  .pp-go button{background:var(--jade);color:#fff;border:0;font:inherit;font-weight:800;font-size:16px;border-radius:12px;padding:0 22px;min-height:46px;cursor:pointer}.pp-go button:disabled{opacity:.4;cursor:default}.pp-go span{color:var(--muted);font-size:13px}
  .pp-next{margin-top:16px;font-size:13px;color:var(--muted)}.pp-next b{color:var(--ink)}
  .pp-q{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}.pp-q span{font-size:13px;color:#9a6512;border:1px solid #ecd2a0;background:#FFF8EA;border-radius:5px;padding:0 6px;line-height:1.6}
  .pp-opt{background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:14px 16px}
  .pp-opt h4{margin:2px 0 8px;font-size:12px;color:var(--muted);font-weight:600}
  .pp-row{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:42px;font-size:14px;border-top:1px dashed var(--line)}.pp-row:first-of-type{border-top:0}.pp-row small{color:var(--muted);font-size:12px}
  .pp-seg{display:inline-flex;flex-wrap:wrap;gap:4px;justify-content:flex-end}.pp-seg b{font-weight:600;font-size:12.5px;color:var(--muted);border:1px solid var(--line);padding:3px 9px;border-radius:999px;cursor:pointer;background:var(--paper)}.pp-seg b.on{background:var(--jade);border-color:var(--jade);color:#fff}
  .pp-tg{appearance:none;width:42px;height:24px;border-radius:999px;background:#d9dfdc;position:relative;cursor:pointer;margin:0;flex:none}.pp-tg::after{content:"";position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:left .15s}.pp-tg:checked{background:var(--jade)}.pp-tg:checked::after{left:21px}
  .pp-note{color:var(--muted);font-size:12px;line-height:1.6;margin:10px 2px 0}
  .pp-top{display:flex;align-items:center;gap:12px;margin-bottom:8px}.pp-top button{border:1px solid var(--line);background:var(--paper);border-radius:999px;font:inherit;font-size:13px;padding:0 12px;min-height:34px;cursor:pointer}
  .pp-top .pp-bar{flex:1}.pp-top span{font-size:13px;color:var(--muted);min-width:44px;text-align:right}
  .pp-hint{text-align:center;color:var(--muted);font-size:13px;margin:6px 0 10px}.pp-hint b{color:var(--ink);margin-right:6px}
  .pp-card{position:relative;background:var(--paper);border:1px solid var(--line);border-radius:18px;min-height:250px;padding:46px 22px 40px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .pp-card .pl{position:absolute;left:12px;top:12px;width:32px;height:32px;border-radius:50%;background:var(--jade);color:#fff;border:0;font-size:13px;cursor:pointer}
  .pp-card .cp{position:absolute;right:12px;top:12px;border:0;background:none;color:var(--muted);font-size:13px;cursor:pointer;padding:6px}
  .pp-en{font-size:21px;font-weight:700;line-height:1.55;max-width:640px}.pp-en .t{color:#b5651d;box-shadow:inset 0 -2px 0 #ecd2a0;border-radius:2px}
  .pp-zh{font-size:16px;color:#3c4a55;margin-top:14px;max-width:640px}.pp-def{font-size:13px;color:var(--muted);margin-top:10px;max-width:600px}
  .pp-card .hid{filter:blur(7px);cursor:pointer;user-select:none}
  .pp-chip{position:absolute;right:12px;bottom:10px;font-size:12px;color:#9a6512;border:1px solid #ecd2a0;border-radius:4px;padding:0 6px}
  .pp-card input{font:700 20px inherit;font-family:inherit;width:auto;border:0;border-bottom:2px solid var(--jade);background:var(--paper-2);border-radius:6px 6px 0 0;text-align:center;padding:2px 6px;outline:none;color:var(--ink)}
  .pp-card input.ok{border-color:#2e9e5b;color:#2e9e5b}.pp-card input.no{border-color:#d0463b;color:#d0463b}
  .pp-ans{margin-top:10px;font-size:14px;color:#2e9e5b;min-height:20px}.pp-ans.no{color:#d0463b}
  .pp-ctl{display:flex;justify-content:center;gap:14px;margin-top:16px}.pp-ctl div{display:flex;flex-direction:column;align-items:center;gap:6px}
  .pp-ctl button{width:56px;height:56px;border-radius:50%;border:1px solid var(--line);background:var(--paper);font-size:22px;cursor:pointer;color:var(--ink)}.pp-ctl button.pri{background:var(--jade);border-color:var(--jade);color:#fff}.pp-ctl button:disabled{opacity:.35;cursor:default}
  .pp-ctl kbd{font:11px ui-monospace,monospace;color:var(--muted);border:1px solid var(--line);border-radius:3px;padding:0 5px}
  @media(hover:none){.pp-ctl kbd{display:none}}
  .pp-done h3{margin:0 0 8px;font-size:20px}.pp-done p{color:var(--muted);margin:4px 0}.pp-done button{margin-top:16px;background:var(--jade);color:#fff;border:0;font:inherit;font-weight:800;border-radius:12px;padding:0 20px;min-height:44px;cursor:pointer}
  /* 深色主题：用 theme.css 的颜色 */
  .pp-q span,.pp-chip{color:var(--ui-orange);border-color:rgba(255,184,107,.35);background:rgba(255,184,107,.08)}
  .pp-en .t{color:var(--ui-orange);box-shadow:inset 0 -2px 0 rgba(255,184,107,.45)}
  .pp-zh{color:var(--ui-ink-2)}
  .pp-tg{background:#3a4048}.pp-tg:checked{background:var(--ui-pur)}
  .pp-card input.ok{border-color:var(--ui-green);color:var(--ui-green)}.pp-card input.no{border-color:var(--ui-red);color:var(--ui-red)}
  .pp-ans{color:var(--ui-green)}.pp-ans.no{color:var(--ui-red)}
  .pp-ctl button{background:var(--ui-surface-2);border-color:var(--ui-line-2)}.pp-ctl button.pri{background:var(--ui-pur);border-color:var(--ui-pur)}
  .pp-hc,.pp-opt,.pp-card{box-shadow:var(--ui-shadow)}`;
  const srs = () => (state.srs = state.srs || {});
  const emoji = () => { const r = day.n / Math.max(1, opt.num); return r <= 0 ? "😭" : r < 0.25 ? "😢" : r < 0.5 ? "😐" : r < 1 ? "🙂" : "😄"; };
  const usable = w => w && w.word && opt.types.includes(w.type || "word") && !/[一-鿿]/.test(w.word); // 「规律」类词条标题是中文，不适合听力
  function plan() {
    const S = srs(), now = Date.now(), P = (typeof words !== "undefined" ? words : []).filter(usable), live = P.filter(w => w.status !== "known");
    const due = live.filter(w => S[w.id] && S[w.id].due <= now).sort((a, b) => S[a.id].due - S[b.id].due);
    const fresh = live.filter(w => !S[w.id]).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const nW = Math.max(1, Math.round(opt.num / PER)); let nNew = Math.min(fresh.length, Math.round(nW * opt.newPct / 100)); if (!due.length) nNew = Math.min(fresh.length, nW);
    return { P, live, due, fresh, list: due.slice(0, nW - nNew).concat(fresh.slice(0, nNew)) };
  }
  // 一个词条的例句：词条自带的 examples（{目标词} 标出位置）；没有就用词条本身
  function sentences(w) {
    const L = (w.examples || []).filter(x => Array.isArray(x) && x[0]).map(x => ({ en: String(x[0]), zh: String(x[1] || "") }));
    if (w.type === "sentence") L.unshift({ en: w.word, zh: w.zh || "" });
    return L.length ? L : [{ en: w.word, zh: w.zh || "" }];
  }
  const plain = en => en.replace(/[{}]/g, "");
  function mark(en, w) { // 目标词位置：优先用 {} 标记；没有就在句子里找这个词
    if (/\{[^}]+\}/.test(en)) return en;
    if (w.type === "sentence") return en;
    const i = en.toLowerCase().indexOf(String(w.word).toLowerCase()); return i >= 0 ? en.slice(0, i) + "{" + en.substr(i, w.word.length) + "}" + en.slice(i + w.word.length) : en;
  }
  const html = en => esc(en).replace(/\{([^}]+)\}/g, '<span class="t">$1</span>');
  function home() {
    playing = false; const p = plan(), S = srs();
    const lrn = p.P.filter(w => S[w.id] && S[w.id].b < DONE && w.status !== "known").length, done = p.P.filter(w => w.status === "known" || (S[w.id] && S[w.id].b >= DONE)).length;
    const urgent = p.due.filter(w => Date.now() - S[w.id].due > DAY).length, n = p.list.reduce((a, w) => a + Math.min(PER, sentences(w).length), 0);
    root.innerHTML = '<div class="pp-home"><div class="pp-hc"><h2>🔊 <b>练习</b></h2>' +
      '<div class="pp-today"><span class="emo">' + emoji() + "</span>今天<b>" + day.n + ' 张卡片</b></div><div class="pp-bar"><i style="width:' + Math.min(100, day.n / Math.max(1, opt.num) * 100) + '%"></i></div>' +
      '<div class="pp-st"><div title="到期要复习的词；「紧急」= 过期超过一天"><small>待复习</small><b>' + p.due.length + "</b><em>" + (urgent ? urgent + " 个紧急" : "") + '</em></div><div title="正在练、还没到 35 天这一级的词"><small>学习中</small><b>' + lrn + "</b><em>+" + p.fresh.length + ' 个排队中</em></div><div title="已掌握，或复习间隔到了 35 天"><small>已学习</small><b>' + done + "</b></div></div>" +
      '<div class="pp-go"><button id="pp-start"' + (n ? "" : " disabled") + ">开始练习</button><span>" + (n ? n + " 张卡片" : "现在没有要练的词") + "</span></div>" +
      (p.list.length ? '<div class="pp-next"><b>接下来</b> · 待复习的优先，然后是新词<div class="pp-q">' + p.list.slice(0, 12).map(w => "<span>" + esc(w.word) + "</span>").join("") + "</div></div>" : "") + "</div>" +
      '<div class="pp-opt"><h4>会话</h4>' +
      '<label class="pp-row"><span>测验 <small>复习过的词先出一张填空题</small></span><input type="checkbox" class="pp-tg" id="pp-quiz"' + (opt.quiz ? " checked" : "") + "></label>" +
      '<div class="pp-row"><span>练习数量</span><span class="pp-seg" data-k="num">' + NUMS.map(v => '<b data-v="' + v + '" class="' + (v === opt.num ? "on" : "") + '">' + v + "</b>").join("") + "</span></div>" +
      '<div class="pp-row" title="新词最多占的比例；待复习的多时会自动减少"><span>新项目</span><span class="pp-seg" data-k="newPct">' + NEWS.map(v => '<b data-v="' + v + '" class="' + (v === opt.newPct ? "on" : "") + '">' + v + "%</b>").join("") + "</span></div>" +
      '<div class="pp-row"><span>类型</span><span class="pp-seg" data-k="types">' + [["word", "单词"], ["phrase", "短语"], ["sentence", "句子"]].map(([v, t]) => '<b data-v="' + v + '" class="' + (opt.types.includes(v) ? "on" : "") + '">' + t + "</b>").join("") + "</span></div>" +
      '<p class="pp-note">和电脑插件里的「复习」是同一份进度：在哪边练都算。每个词连续练 3 个例句；练到 35 天这一级自动标为「已掌握」。电脑上可以用键盘：A 上一个、S 重听、E 显示、D 下一个。</p></div></div>';
    root.querySelector("#pp-start").onclick = start;
    root.querySelector("#pp-quiz").onchange = e => { opt.quiz = e.target.checked; LS("pump:opt", opt); };
    root.querySelectorAll(".pp-seg").forEach(g => g.onclick = e => { const b = e.target.closest("b"); if (!b) return; const k = g.dataset.k, v = b.dataset.v;
      if (k === "types") { opt.types = opt.types.includes(v) ? opt.types.filter(x => x !== v) : opt.types.concat(v); if (!opt.types.length) opt.types = ["word"]; } else opt[k] = +v;
      LS("pump:opt", opt); home(); });
  }
  function start() {
    const p = plan(); if (!p.list.length) return; const S = srs(); cards = []; at = 0; bad = 0; playing = true;
    p.list.forEach(w => {
      const L = sentences(w).map(x => ({ en: mark(x.en, w), zh: x.zh })), n = Math.min(PER, L.length), wasNew = !S[w.id];
      const canQuiz = opt.quiz && !wasNew && w.type !== "sentence" && /\{[^}]+\}/.test(L[0].en);
      for (let i = 0; i < n; i++) cards.push({ w, s: L[i], k: canQuiz && i === 0 ? "quiz" : "listen", last: i === n - 1, wasNew, rev: 0 });
    });
    show();
  }
  function grade(c, ok) {
    if (c.done) return; c.done = true; c.ok = ok; day.n++; LS("pump:day", day); if (!ok) bad++;
    const S = srs(), id = c.w.id, r = Object.assign({ b: 0, n: 0 }, S[id]); r.n++; r.at = Date.now();
    if (!ok) { r.b = 0; r.due = Date.now() + GAP[0]; }
    else if (c.last) { const failed = cards.some(x => x !== c && x.w.id === id && x.done && !x.ok); r.b = failed ? 0 : c.wasNew ? 1 : Math.min(GAP.length - 1, r.b + 1); r.due = Date.now() + GAP[r.b]; if (r.b >= DONE) state.progress[id] = "known"; }
    else if (!r.due) r.due = Date.now() + GAP[0];
    S[id] = r; save(state);
  }
  const say = c => { try { speak(plain(c.s.en)); } catch (e) {} };
  function show() {
    if (at >= cards.length) return finish();
    const c = cards[at], pct = (at + 1) / cards.length * 100;
    const top = '<div class="pp-top"><button id="pp-back">← 返回</button><div class="pp-bar"><i style="width:' + pct + '%"></i></div><span>' + (at + 1) + "/" + cards.length + "</span></div>";
    const ctl = (k) => '<div class="pp-ctl"><div><button id="pp-a" title="上一个"' + (at ? "" : " disabled") + '>‹</button><kbd>A</kbd></div><div><button id="pp-s" title="重听">↻</button><kbd>S</kbd></div><div><button id="pp-e" title="' + (k === "quiz" ? "看答案（算没答对）" : "显示") + '"' + ((k === "listen" && c.rev >= 2) || (k === "quiz" && c.done) ? " disabled" : "") + '>👁</button><kbd>E</kbd></div><div><button id="pp-d" class="pri" title="下一个">›</button><kbd>D</kbd></div></div>';
    const def = c.w.zh ? '<div class="pp-def' + (c.k === "listen" && c.rev < 2 ? " hid" : "") + '">' + esc(c.w.word) + "：" + esc(c.w.zh) + "</div>" : "";
    if (c.k === "listen") {
      root.innerHTML = top + '<div class="pp-hint"><b>🔊 听力练习</b>在显示文字之前试着听懂。</div><div class="pp-card"><button class="pl" id="pp-pl" title="播放">▶</button><button class="cp" id="pp-cp">复制</button>' +
        '<div class="pp-en' + (c.rev < 1 ? " hid" : "") + '" id="pp-en">' + html(c.s.en) + '</div><div class="pp-zh' + (c.rev < 2 ? " hid" : "") + '" id="pp-zh">' + esc(c.s.zh) + "</div>" + def + '<span class="pp-chip">' + esc(c.w.word) + "</span></div>" + ctl("listen");
      if (!c.spoken) { c.spoken = true; say(c); }
      root.querySelector("#pp-en").onclick = root.querySelector("#pp-zh").onclick = () => reveal(c);
    } else {
      const m = c.s.en.match(/\{([^}]+)\}/), ans = m ? m[1] : "", parts = c.s.en.split(/\{[^}]+\}/);
      root.innerHTML = top + '<div class="pp-hint"><b>✏️ 测验</b>填空：输入句子里缺少的词，按回车检查。</div><div class="pp-card"><button class="pl" id="pp-pl" title="播放（会念出答案）">▶</button><button class="cp" id="pp-cp">复制</button>' +
        '<div class="pp-en">' + esc(parts[0]) + '<input id="pp-in" autocomplete="off" autocapitalize="off" spellcheck="false" size="' + Math.max(4, ans.length + 1) + '"' + (c.done ? ' disabled value="' + esc(c.typed || "") + '" class="' + (c.ok ? "ok" : "no") + '"' : "") + ">" + esc(parts.slice(1).join("")) + '</div><div class="pp-zh">' + esc(c.s.zh) + '</div><div class="pp-ans' + (c.done && !c.ok ? " no" : "") + '">' + (c.done ? (c.ok ? "正确" : "答案：" + esc(ans)) : "") + "</div>" + (c.done ? def + '<span class="pp-chip">' + esc(c.w.word) + "</span>" : "") + "</div>" + ctl("quiz");
      const inp = root.querySelector("#pp-in"); if (!c.done) setTimeout(() => inp.focus(), 30);
      c.check = give => { if (c.done) return; c.typed = inp.value.trim(); const ok = !give && c.typed.toLowerCase().replace(/’/g, "'") === ans.toLowerCase().replace(/’/g, "'"); grade(c, ok); show(); say(c); };
      inp.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); if (c.done) go(1); else if (inp.value.trim()) c.check(false); } };
    }
    root.querySelector("#pp-back").onclick = () => { try { speechSynthesis.cancel(); } catch (e) {} home(); };
    root.querySelector("#pp-pl").onclick = root.querySelector("#pp-s").onclick = () => say(c);
    root.querySelector("#pp-cp").onclick = () => { const t = plain(c.s.en); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast("已复制"), () => toast("复制失败")); };
    root.querySelector("#pp-a").onclick = () => go(-1); root.querySelector("#pp-d").onclick = () => go(1);
    root.querySelector("#pp-e").onclick = () => (c.k === "listen" ? reveal(c) : c.check(true));
  }
  function reveal(c) { if (c.k !== "listen") return; c.rev = Math.min(2, c.rev + 1); show(); }
  function go(d) {
    const c = cards[at]; if (!c) return;
    if (d > 0) { if (c.k === "listen") grade(c, true); else if (!c.done) { const inp = root.querySelector("#pp-in"); if (inp && inp.value.trim()) { c.check(false); return; } grade(c, false); } }
    try { speechSynthesis.cancel(); } catch (e) {} at = Math.max(0, at + d); show();
  }
  function finish() {
    playing = false;
    root.innerHTML = '<div class="pp-card pp-done"><h3>这一组练完了 ' + emoji() + "</h3><p>今天一共练了 " + day.n + " 张卡片" + (bad ? "，填空题有 " + bad + " 张没答对" : "") + '</p><p style="font-size:13px">没答对的词 10 分钟后再出现；其余按 1、3、7、16、35 天的间隔复习。</p><button id="pp-home">返回</button></div>';
    root.querySelector("#pp-home").onclick = home;
  }
  document.addEventListener("keydown", e => {
    if (!playing || !root || !root.classList.contains("on") || e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const c = cards[at]; if (!c) return; const k = e.key.toLowerCase();
    if (k === "d" || k === "arrowright") go(1); else if (k === "a" || k === "arrowleft") { if (at) go(-1); } else if (k === "s" || k === "arrowdown" || k === " ") say(c); else if (k === "e") { if (c.k === "listen") reveal(c); else c.check(true); } else return;
    e.preventDefault();
  });
  window.pumpShow = () => { if (!playing) home(); };
  window.pumpRefresh = () => { if (root && root.classList.contains("on") && !playing) home(); };
  function init() {
    root = document.getElementById("pump"); if (!root) return;
    const st = document.createElement("style"); st.textContent = CSS; document.head.append(st);
    // 生词本的模式：新加的「练习」排最前，第一次打开默认进练习；之后记住上次选的模式
    let m = "pump"; try { m = localStorage.getItem("vocab_mode") || "pump"; } catch (e) {}
    const b = document.querySelector('.modes button[data-mode="' + m + '"]') || document.querySelector('.modes button[data-mode="pump"]');
    if (b && !document.documentElement.classList.contains("collect-mode")) b.click();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
