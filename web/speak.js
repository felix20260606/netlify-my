/* 英语「🗣 口语」：拿来就能练的口语课（内容在 speak-data.js 的 window.SPEAK_DATA，第一次打开才加载）
   八栏（新加的排前面）：
   - 📅 每日一练：每天自动排 1 段对话（角色扮演）+ 5 句跟读 + 1 个话题，三样做完算打卡，连续天数；练习次数记进「📊 统计」（本机 speak:log）
   - 🤖 AI 陪练：选场景或自由聊，你开口说（转文字）→ AI 回一句并朗读，顺手纠正你上一句的错；「结束并总结」给错误、地道说法（后台 /api/ai task=chat / chatsum）
   - 🎬 原声跟读：插件保存词句时录下的 YouTube 原声（/api/ext 的 med| 索引 + /api/media），听原声 → 跟读打分 → 回放对比
   - 🎭 情景对话：16 个场景，听全文（A、B 两个声音）、每句跟读打分、「角色扮演」你说 B 的台词（先看中文，说完对答案）
   - 💬 常用表达：20 类功能表达（打招呼、澄清、委婉不同意……），每条可听、可跟读、可加进生词本
   - 🔊 发音：12 组最小对立词（听音辨词小测 + 跟读）、30 条连读弱读
   - 🎯 跟读：120 句高频句，单句跟读打分，或「连续跟读」（每句播完留出时间跟着说）
   - 🗣 话题：40 张话题卡（日常、工作、生活在马来西亚、旅行、兴趣、观点），计时开口说、录音回放、看样例回答
   跟读打分：录音 → 后台 /api/stt（Workers AI 转文字）→ 没开时用浏览器自带的语音识别（Chrome / Edge / Safari；Brave 不行）→ 逐词对比
   本机存：speak:done（练过的标记，按家人分开）、speak:opt（语速、显示中文）、speak:sec（上次看的栏）
   依赖 index.html 的全局：toast、chosenVoice（「⚙ 设置」里选的朗读声音）、vocabAddWord（加进生词本） */
(function () {
  "use strict";
  const V = "1";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const LG = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const LS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const tip = m => (typeof toast === "function" ? toast(m) : alert(m));
  const SECS = [["daily", "📅 每日一练"], ["chat", "🤖 AI 陪练"], ["clip", "🎬 原声跟读"], ["dialog", "🎭 情景对话"], ["func", "💬 常用表达"], ["pron", "🔊 发音"], ["shadow", "🎯 跟读"], ["topic", "🗣 话题"]];

  const CSS = `
  #view-speak{display:none;padding-top:98px;background:var(--ui-bg,var(--bg));color:var(--ui-ink);min-height:100vh}
  html.show-speak #view-en{display:none}html.show-speak #view-speak{display:block}
  @media(min-width:1024px){#view-speak{padding-top:56px}}
  #speak{max-width:1100px;margin:0 auto;padding:18px 16px 80px;overflow-wrap:anywhere}#speak *{box-sizing:border-box}
  .sk-hd{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px 16px;margin:6px 0 14px}.sk-hd h1{margin:0;font-size:26px;font-weight:900;color:var(--ui-ink)}
  .sk-hd p{margin:0;color:var(--ui-muted);font-size:13.5px;flex:1 1 260px}.sk-hd .sp{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .sk-seg{display:inline-flex;border:1px solid var(--ui-line-2);border-radius:10px;overflow:hidden}.sk-seg button{border:0;background:var(--ui-surface-2);color:var(--ui-ink-2);font:inherit;font-size:13px;padding:6px 11px;cursor:pointer}.sk-seg button.on{background:var(--ui-pur);color:#fff}
  .sk-chips{display:flex;gap:6px;margin-bottom:16px;overflow-x:auto;scrollbar-width:none}.sk-chips::-webkit-scrollbar{display:none}
  .sk-chips button{flex:0 0 auto;border:1px solid var(--ui-line-2);background:var(--ui-surface-2);color:var(--ui-ink-2);border-radius:999px;padding:7px 14px;font:inherit;font-size:14px;cursor:pointer}
  .sk-chips button b{margin-left:5px;font-weight:600;color:var(--ui-muted);font-size:12.5px}.sk-chips button.on{background:var(--ui-pur);border-color:var(--ui-pur);color:#fff}.sk-chips button.on b{color:#fff}
  .sk-intro{background:var(--ui-surface);border:1px solid var(--ui-line);border-radius:14px;padding:12px 14px;margin-bottom:14px;color:var(--ui-ink-2);font-size:14px;line-height:1.6}
  .sk-intro b{color:var(--ui-ink)}
  .sk-grid{display:grid;grid-template-columns:1fr;gap:10px}@media(min-width:720px){.sk-grid{grid-template-columns:1fr 1fr}}@media(min-width:1024px){.sk-grid.three{grid-template-columns:1fr 1fr 1fr}}
  .sk-card{display:flex;align-items:center;gap:12px;background:var(--ui-surface);border:1px solid var(--ui-line);border-radius:14px;padding:13px 15px;cursor:pointer;transition:border-color .15s,background .15s;min-width:0;text-align:left;font:inherit;color:inherit;width:100%}
  .sk-card:hover{border-color:var(--ui-pur);background:var(--ui-surface-2)}.sk-card .t{flex:1 1 auto;min-width:0}
  .sk-card b{display:block;color:var(--ui-ink);font-size:15.5px;line-height:1.35}.sk-card span{display:block;color:var(--ui-muted);font-size:12.5px;margin-top:3px}
  .sk-card .pv{color:var(--ui-ink-2);font-size:13px;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sk-card .ok{flex:0 0 auto;font-size:12px;color:var(--ui-green,#7CE3B8);border:1px solid currentColor;border-radius:999px;padding:1px 8px}
  .sk-card>i{font-style:normal;font-size:22px;color:var(--ui-muted)}
  .sk-tag{display:inline-block;font-size:11.5px;line-height:19px;padding:0 7px;border-radius:6px;background:var(--ui-pur-soft,rgba(156,63,208,.18));color:var(--ui-pur-text);margin-right:6px;vertical-align:1px}
  .sk-sub{margin:20px 0 10px;font-size:16px;font-weight:800;color:var(--ui-ink)}.sk-sub small{margin-left:8px;font-weight:500;color:var(--ui-muted);font-size:12.5px}
  .sk-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}.sk-bar .gap{flex:1 1 auto}
  .sk-title{margin:6px 0 4px;font-size:24px;line-height:1.3;color:var(--ui-ink)}.sk-title small{display:block;font-size:14px;color:var(--ui-muted);font-weight:500;margin-top:4px}
  .sk-scene{background:var(--ui-surface);border:1px solid var(--ui-line);border-radius:12px;padding:10px 13px;margin:10px 0 14px;font-size:14px;color:var(--ui-ink-2);line-height:1.6}
  .sk-lines{display:flex;flex-direction:column;gap:10px}
  .sk-ln{display:flex;gap:10px;align-items:flex-start;max-width:92%}.sk-ln.B{margin-left:auto;flex-direction:row-reverse}
  .sk-av{flex:0 0 auto;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;background:var(--ui-surface-3,#3a3d44);color:var(--ui-ink-2)}
  .sk-ln.B .sk-av{background:var(--ui-pur);color:#fff}
  .sk-bub{background:var(--ui-surface);border:1px solid var(--ui-line);border-radius:14px;padding:10px 13px;min-width:0;transition:box-shadow .2s,border-color .2s}
  .sk-ln.B .sk-bub{background:var(--ui-surface-2);border-color:var(--ui-line-2)}
  .sk-ln.cur .sk-bub{border-color:var(--ui-pur);box-shadow:0 0 0 3px rgba(156,63,208,.25)}
  .sk-en{font-size:17px;line-height:1.55;color:var(--ui-ink)}.sk-zh{font-size:13.5px;color:var(--ui-muted);margin-top:3px;line-height:1.5}
  .sk-hide .sk-zh{display:none}
  .sk-mask{color:var(--ui-muted);font-style:italic;font-size:14.5px}
  .sk-ops{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center}
  .sk-ib{border:1px solid var(--ui-line-2);background:var(--ui-surface-2);color:var(--ui-ink-2);border-radius:9px;height:32px;min-width:34px;padding:0 9px;font:inherit;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
  .sk-ib:hover{border-color:var(--ui-pur);color:var(--ui-ink)}.sk-ib.rec{border-color:var(--ui-red-line,#a44);color:var(--ui-red,#ff8080)}.sk-ib.rec.on{background:var(--ui-red,#e5484d);color:#fff;animation:skp 1s infinite}
  @keyframes skp{50%{opacity:.6}}
  .sk-res{margin-top:8px;font-size:14.5px;line-height:1.7}.sk-res .ok{color:var(--ui-green,#7CE3B8)}.sk-res .no{color:var(--ui-red,#ff8080);text-decoration:underline wavy;text-underline-offset:4px}
  .sk-res .x{color:var(--ui-muted);font-size:12.5px}.sk-res .sc{font-weight:800;margin-right:8px}.sk-res .said{color:var(--ui-muted);font-size:13px}
  .sk-res audio{height:32px;vertical-align:middle;max-width:100%}
  .sk-box{background:var(--ui-surface);border:1px solid var(--ui-line);border-radius:14px;padding:13px 15px;margin-top:14px}
  .sk-box h3{margin:0 0 8px;font-size:15px;color:var(--ui-ink)}
  .sk-ph{display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-top:1px solid var(--ui-line)}.sk-ph:first-of-type{border-top:0}
  .sk-ph .e{font-weight:700;color:var(--ui-ink);font-size:15px}.sk-ph .z{color:var(--ui-muted);font-size:13px;margin-top:2px}.sk-ph .t{flex:1 1 auto;min-width:0}
  .sk-tip{margin-top:12px;font-size:13.5px;color:var(--ui-ink-2);background:rgba(255,184,107,.08);border:1px solid rgba(255,184,107,.25);border-radius:10px;padding:9px 12px}
  .sk-item{background:var(--ui-surface);border:1px solid var(--ui-line);border-radius:14px;padding:12px 14px}
  .sk-item .e{font-size:17px;font-weight:700;color:var(--ui-ink)}.sk-item .z{color:var(--ui-ink-2);font-size:14px;margin-top:3px}
  .sk-item .ex{margin-top:8px;padding:8px 10px;background:var(--ui-surface-2);border-radius:10px;font-size:14px;color:var(--ui-ink-2);line-height:1.6}.sk-item .ex small{display:block;color:var(--ui-muted);font-size:12.5px}
  .sk-reg{font-size:11px;border-radius:6px;padding:1px 6px;margin-left:6px;vertical-align:2px;font-weight:600}
  .sk-reg.r0{background:rgba(124,227,184,.14);color:#7CE3B8}.sk-reg.r1{background:rgba(111,211,255,.14);color:#6FD3FF}.sk-reg.r2{background:rgba(255,184,107,.14);color:#FFB86B}
  .sk-pairs{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .sk-pair{display:flex;gap:6px}.sk-pair button{flex:1 1 0;border:1px solid var(--ui-line-2);background:var(--ui-surface-2);color:var(--ui-ink);border-radius:10px;min-height:44px;font:inherit;font-size:16px;font-weight:700;cursor:pointer}
  .sk-pair button:hover{border-color:var(--ui-pur)}
  .sk-quiz{text-align:center;padding:16px}.sk-quiz .q{font-size:15px;color:var(--ui-ink-2);margin-bottom:12px}.sk-quiz .ch{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
  .sk-quiz .ch button{min-width:120px;min-height:52px;font-size:19px;font-weight:800;border-radius:12px;border:1px solid var(--ui-line-2);background:var(--ui-surface-2);color:var(--ui-ink);cursor:pointer;font-family:inherit}
  .sk-quiz .ch button.r{background:rgba(124,227,184,.18);border-color:#7CE3B8}.sk-quiz .ch button.w{background:rgba(255,128,128,.16);border-color:#ff8080}
  .sk-quiz .sc{margin-top:10px;color:var(--ui-muted);font-size:13.5px}
  .sk-big{font-size:21px;line-height:1.5;color:var(--ui-ink);font-weight:700}
  .sk-timer{font-size:40px;font-weight:900;font-variant-numeric:tabular-nums;color:var(--ui-ink);text-align:center;margin:6px 0}.sk-timer.prep{color:var(--ui-orange,#FFB86B)}.sk-timer.go{color:var(--ui-red,#ff8080)}
  .sk-center{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:8px}
  .sk-sample{margin-top:10px;font-size:15.5px;line-height:1.75;color:var(--ui-ink)}
  .sk-empty{color:var(--ui-muted);text-align:center;padding:40px 0}
  .sk-note{color:var(--ui-muted);font-size:12.5px;margin-top:10px;line-height:1.6}
  @media(max-width:640px){.sk-hd h1{font-size:22px}.sk-title{font-size:21px}.sk-ln{max-width:100%}.sk-en{font-size:16px}.sk-ib{height:36px}}`;

  let root = null, D = null, loading = null;
  let sec = LG("speak:sec", "daily"); if (!SECS.some(s => s[0] === sec)) sec = "daily";
  let opt = Object.assign({ rate: 1, zh: true }, LG("speak:opt", {}));
  let done = LG("speak:done", {});
  let view = null; // 打开的条目：{t:"dialog"|"func"|"pair"|"conn"|"topic"|"sgrp", id}
  let shadowGroup = 0;
  const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // 吉隆坡 / 北京时间的日期
  const dayStart = () => Date.parse(today() + "T00:00:00+08:00");
  // 练过：记时间（每日一练按「今天练过」算）；每次练习也记进 speak:log（📊 统计的热力日历、连续天数用）
  const markDone = k => { const now = Date.now(), again = done[k] && done[k] >= dayStart(); done[k] = now; LS("speak:done", done); if (!again) { const L = LG("speak:log", {}); L[today()] = (L[today()] || 0) + 1; LS("speak:log", L); } };
  const doneToday = k => (done[k] || 0) >= dayStart();
  const isDone = k => !!done[k];

  function loadData() {
    if (window.SPEAK_DATA) { D = window.SPEAK_DATA; return Promise.resolve(); }
    if (!loading) loading = new Promise(res => { const s = document.createElement("script"); s.src = "speak-data.js?v=" + V; s.onload = s.onerror = res; document.head.append(s); }).then(() => { D = window.SPEAK_DATA || null; });
    return loading;
  }

  /* ---------- 朗读：两个声音（A 用另一个英语声音，B 和其它用「⚙ 设置」里选的） ---------- */
  let sayId = 0;
  function voicesEn() { try { return speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang)); } catch (e) { return []; } }
  function voiceFor(who) {
    const main = (typeof chosenVoice !== "undefined" && chosenVoice) || null, L = voicesEn();
    if (who !== "A") return main;
    const other = L.find(v => (!main || v.name !== main.name) && /en[-_]US/i.test(v.lang)) || L.find(v => !main || v.name !== main.name);
    return other || main;
  }
  function say(text, o) {
    o = o || {}; const my = ++sayId;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text).replace(/[{}]/g, ""));
      const v = voiceFor(o.who); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-US";
      u.rate = (o.rate || opt.rate) * (o.slow ? 0.75 : 1); u.pitch = o.who === "A" ? 1.05 : 1;
      u.onend = () => { if (my === sayId && o.end) o.end(); }; u.onerror = () => { if (my === sayId && o.end) o.end(true); };
      speechSynthesis.speak(u);
    } catch (e) { tip("这个浏览器不能朗读"); if (o.end) o.end(true); }
  }
  function hush() { sayId++; try { speechSynthesis.cancel(); } catch (e) {} }

  /* ---------- 录音和打分（同「🔊 练习」的跟读卡） ---------- */
  const toks = t => String(t || "").toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9'\s-]+/g, " ").split(/[\s-]+/).map(x => x.replace(/^'+|'+$/g, "")).filter(Boolean);
  function align(target, said) {
    const a = toks(target), b = toks(said), n = a.length, m = b.length, T = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) T[i][j] = a[i] === b[j] ? T[i + 1][j + 1] + 1 : Math.max(T[i + 1][j], T[i][j + 1]);
    const hit = new Array(n).fill(false), extra = []; let i = 0, j = 0;
    while (i < n && j < m) { if (a[i] === b[j]) { hit[i] = true; i++; j++; } else if (T[i + 1][j] >= T[i][j + 1]) i++; else extra.push(b[j++]); }
    while (j < m) extra.push(b[j++]);
    return { a, hit, extra, score: n ? hit.filter(Boolean).length / n : 0 };
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const RES = {}; // key → {url, said, res, best, busy, noai}
  let rec = null;
  function recStop(cancel) { if (!rec) return; const r = rec; rec = null; r.cancel = !!cancel; try { if (r.sr) r.sr.stop(); } catch (e) {} try { if (r.mr && r.mr.state !== "inactive") r.mr.stop(); else if (r.stream) { r.stream.getTracks().forEach(t => t.stop()); if (!r.cancel) recDone(r); } } catch (e) {} clearTimeout(r.t); paintRec(r.key); }
  // key：这条的编号；target：要读的句子（话题卡没有目标句，只录音、转文字）；max：最长秒数；after：录完以后要做的事
  async function recStart(key, target, max, after) {
    if (rec) { const same = rec.key === key; recStop(false); if (same) return; }
    hush(); let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { tip("没拿到麦克风：请在浏览器地址栏允许使用麦克风"); return; }
    const r = rec = { key, target, after, stream, chunks: [], srText: "" };
    try { r.mr = new MediaRecorder(stream); } catch (e) { r.mr = null; }
    if (SR) { try { const sr = r.sr = new SR(); sr.lang = "en-US"; sr.interimResults = false; sr.continuous = true; sr.onresult = e => { r.srText = [...e.results].map(x => x[0].transcript).join(" "); }; sr.onerror = () => {}; sr.start(); } catch (e) { r.sr = null; } }
    if (r.mr) { r.mr.ondataavailable = e => { if (e.data && e.data.size) r.chunks.push(e.data); }; r.mr.onstop = () => { stream.getTracks().forEach(t => t.stop()); if (!r.cancel) recDone(r); }; r.mr.start(); }
    else if (!r.sr) { stream.getTracks().forEach(t => t.stop()); rec = null; tip("这个浏览器不能录音"); return; }
    (RES[key] = RES[key] || {}).on = true; paintRec(key);
    r.t = setTimeout(() => { if (rec === r) recStop(false); }, (max || 20) * 1000);
  }
  async function recDone(r) {
    const x = RES[r.key] = RES[r.key] || {}; x.on = false; x.busy = true; paintRec(r.key);
    const blob = r.chunks.length ? new Blob(r.chunks, { type: r.chunks[0].type || "audio/webm" }) : null;
    if (blob) { try { if (x.url) URL.revokeObjectURL(x.url); } catch (e) {} x.url = URL.createObjectURL(blob); }
    let text = "";
    if (blob) { try { const j = await (await fetch("/api/stt", { method: "POST", headers: { "Content-Type": blob.type }, body: blob })).json(); if (j && j.ok) text = j.text || ""; else if (j && j.error === "noai") x.noai = true; } catch (e) {} }
    if (!text) { await new Promise(res => setTimeout(res, 600)); text = r.srText; }
    x.busy = false; x.said = text;
    if (r.target) { x.res = text ? align(r.target, text) : null; if (x.res) x.best = Math.max(x.best || 0, x.res.score); }
    paintRec(r.key);
    if (r.after) r.after(x);
  }
  const pct = v => Math.round((v || 0) * 100);
  function recBtn(key, target, max, label) { const x = RES[key] || {}; return '<button class="sk-ib rec' + (x.on ? " on" : "") + '" data-rec="' + esc(key) + '" data-t="' + esc(target || "") + '" data-max="' + (max || 20) + '">' + (x.on ? "⏹ 停止" : "🎙 " + (label || (x.url ? "再读" : "跟读"))) + "</button>"; }
  function resHtml(key) {
    const x = RES[key]; if (!x) return "";
    if (x.on) return '<div class="sk-res"><span class="said">正在录音……说完点「⏹ 停止」</span></div>';
    if (x.busy) return '<div class="sk-res"><span class="said">正在识别……</span></div>';
    let h = "";
    if (x.res) h += '<div><span class="sc" style="color:' + (x.res.score >= .85 ? "var(--ui-green,#7CE3B8)" : x.res.score >= .6 ? "var(--ui-orange,#FFB86B)" : "var(--ui-red,#ff8080)") + '">读对 ' + pct(x.res.score) + "%" + (x.best > x.res.score ? "（最好 " + pct(x.best) + "%）" : "") + "</span>" + x.res.a.map((w, i) => '<span class="' + (x.res.hit[i] ? "ok" : "no") + '">' + esc(w) + "</span>").join(" ") + (x.res.extra.length ? '<div class="x">多说了：' + x.res.extra.map(esc).join(" ") + "</div>" : "") + "</div>";
    else if (x.said) h += '<div class="said">识别到：' + esc(x.said) + "</div>";
    else if (x.url) h += '<div class="said">' + (SR || !x.noai ? "没识别出文字，可以回放听听自己读得怎么样" : "这个浏览器转不了文字（Brave 不行；换 Chrome / Safari，或在 Cloudflare 打开 Workers AI），可以回放和原声对比") + "</div>";
    if (x.url) h += '<div style="margin-top:6px"><audio controls src="' + x.url + '"></audio></div>';
    return '<div class="sk-res">' + h + "</div>";
  }
  function paintRec(key) {
    if (!root) return;
    root.querySelectorAll('[data-res="' + CSS.escape(key) + '"]').forEach(el => { el.innerHTML = resHtml(key); });
    root.querySelectorAll('[data-rec="' + CSS.escape(key) + '"]').forEach(b => { const x = RES[key] || {}; b.classList.toggle("on", !!x.on); b.textContent = x.on ? "⏹ 停止" : "🎙 " + (b.dataset.label || (x.url ? "再读" : "跟读")); });
  }
  // 一句话的操作行：🔊 听、🐢 慢速、🎙 跟读 + 结果
  function ops(key, en, who, extra) {
    return '<div class="sk-ops"><button class="sk-ib" data-say="' + esc(en) + '"' + (who ? ' data-who="' + who + '"' : "") + ' title="听">🔊</button><button class="sk-ib" data-say="' + esc(en) + '" data-slow="1" title="慢速">🐢</button>' + recBtn(key, en) + (extra || "") + '</div><div data-res="' + esc(key) + '">' + resHtml(key) + "</div>";
  }

  /* ---------- 页面 ---------- */
  function counts() {
    if (!D) return {};
    return { daily: 3, chat: (D.dialogs || []).length + 1, clip: CLIPS ? CLIPS.length : "…", dialog: (D.dialogs || []).length, func: (D.functions || []).length, pron: ((D.pron && D.pron.pairs) || []).length + 1, shadow: ((D.pron && D.pron.shadow) || []).reduce((a, g) => a + g.items.length, 0), topic: (D.topics || []).length };
  }
  function doneCount(prefix) { return Object.keys(done).filter(k => k.indexOf(prefix) === 0).length; }
  function head() {
    const n = counts();
    return '<div class="sk-hd"><h1>🗣 口语</h1><p>每天 15 分钟：听 → 跟读 → 角色扮演 → 自己说。点 🔊 听，点 🎙 录音跟读，会标出读对、读漏的词。</p><div class="sp">' +
      '<span class="sk-seg" title="朗读速度"><button data-rate="0.8" class="' + (opt.rate < .95 ? "on" : "") + '">慢</button><button data-rate="1" class="' + (opt.rate >= .95 && opt.rate < 1.1 ? "on" : "") + '">正常</button><button data-rate="1.15" class="' + (opt.rate >= 1.1 ? "on" : "") + '">快</button></span>' +
      '<span class="sk-seg" title="显示中文"><button data-zh="1" class="' + (opt.zh ? "on" : "") + '">中文</button><button data-zh="0" class="' + (!opt.zh ? "on" : "") + '">隐藏</button></span></div></div>' +
      '<div class="sk-chips">' + SECS.map(([k, t]) => '<button data-sec="' + k + '" class="' + (sec === k && !view ? "on" : sec === k ? "on" : "") + '">' + t + "<b>" + (n[k] || 0) + "</b></button>").join("") + "</div>";
  }
  function draw() {
    if (!root) return;
    if (!D) { root.innerHTML = head() + '<div class="sk-empty">' + (loading ? "正在加载口语内容…" : "口语内容没加载出来，刷新一下") + "</div>"; return; }
    let body = "";
    if (view) body = ({ dialog: dialogView, func: funcView, pair: pairView, conn: connView, topic: topicView })[view.t]();
    else body = ({ daily: dailyView, chat: chatView, clip: clipList, dialog: dialogList, func: funcList, pron: pronList, shadow: shadowList, topic: topicList })[sec]();
    root.innerHTML = head() + '<div class="' + (opt.zh ? "" : "sk-hide") + '">' + body + "</div>";
    if (view && view.t === "pair") quizPaint();
    if (view && view.t === "topic") timerPaint();
  }
  const back = '<button class="ui-btn" data-act="back">← 返回</button>';
  const card = (act, id, title, sub, pv, ok, tags) => '<button class="sk-card" data-act="' + act + '" data-id="' + esc(id) + '"><div class="t"><b>' + (tags || "") + esc(title) + "</b>" + (sub ? "<span>" + esc(sub) + "</span>" : "") + (pv ? '<div class="pv">' + esc(pv) + "</div>" : "") + "</div>" + (ok ? '<span class="ok">✓ 练过</span>' : "") + "<i>›</i></button>";

  // ===== 🎭 情景对话 =====
  const LV = ["入门", "基础", "进阶"];
  function dialogList() {
    const L = D.dialogs || [];
    return '<div class="sk-intro"><b>怎么练：</b>① 先点「▶ 听全文」听两遍；② 每句点 🎙 跟读，读到 85% 以上；③ 点「🎭 角色扮演」，你演 B：只看中文说英文，说完对答案。已练 ' + doneCount("d:") + " / " + L.length + " 个场景。</div>" +
      '<div class="sk-grid">' + L.slice().sort((a, b) => LV.indexOf(a.level) - LV.indexOf(b.level)).map(d => card("dialog", d.id, d.title, d.en_title + " · " + (d.lines || []).length + " 句", d.scene, isDone("d:" + d.id), '<span class="sk-tag">' + esc(d.level || "") + "</span>")).join("") + "</div>";
  }
  let RP = null; // 角色扮演 / 听全文的进度：{id, i, mode:"play"|"rp", wait}
  function dialogView() {
    const d = (D.dialogs || []).find(x => x.id === view.id); if (!d) { view = null; return dialogList(); }
    const rp = RP && RP.id === d.id ? RP : null;
    const lines = d.lines.map((l, i) => {
      const key = "d:" + d.id + ":" + i, cur = rp && rp.i === i, hideEn = rp && rp.mode === "rp" && l.who === "B" && i >= rp.i && !(rp.shown || {})[i];
      return '<div class="sk-ln ' + l.who + (cur ? " cur" : "") + '" data-li="' + i + '"><div class="sk-av">' + esc(l.who === "B" ? "我" : "A") + '</div><div class="sk-bub">' +
        (hideEn ? '<div class="sk-mask">（' + esc(d.roles && d.roles.B || "你") + "：用英语说）</div>" + '<div class="sk-zh" style="display:block">' + esc(l.zh) + "</div>" : '<div class="sk-en">' + esc(l.en) + '</div><div class="sk-zh">' + esc(l.zh) + "</div>") +
        (hideEn ? (cur ? '<div class="sk-ops">' + recBtn(key, l.en, 25, "说出来") + '<button class="sk-ib" data-act="rp-show" data-i="' + i + '">看答案</button></div><div data-res="' + esc(key) + '">' + resHtml(key) + "</div>" : "") : ops(key, l.en, l.who === "A" ? "A" : "")) +
        (rp && rp.mode === "rp" && cur && (rp.shown || {})[i] ? '<div class="sk-ops"><button class="ui-btn pri" data-act="rp-next">继续 ▶</button></div>' : "") +
        "</div></div>";
    }).join("");
    const playing = rp && rp.mode === "play", rping = rp && rp.mode === "rp";
    return '<div class="sk-bar">' + back + '<span class="gap"></span>' +
      '<button class="ui-btn' + (playing ? " pri" : "") + '" data-act="play">' + (playing ? "⏹ 停止" : "▶ 听全文") + "</button>" +
      '<button class="ui-btn' + (rping ? " pri" : "") + '" data-act="rp">' + (rping ? "⏹ 结束角色扮演" : "🎭 角色扮演（我说 B）") + "</button></div>" +
      '<h2 class="sk-title">' + esc(d.title) + "<small>" + esc(d.en_title) + " · " + esc(d.level || "") + "</small></h2>" +
      '<div class="sk-scene">📍 ' + esc(d.scene) + "<br>A：" + esc(d.roles && d.roles.A || "") + "　·　我（B）：" + esc(d.roles && d.roles.B || "") + "</div>" +
      '<div class="sk-lines">' + lines + "</div>" +
      '<div class="sk-box"><h3>📌 这段要记住的表达</h3>' + (d.phrases || []).map(p => '<div class="sk-ph"><div class="t"><div class="e">' + esc(p[0]) + '</div><div class="z">' + esc(p[1]) + '</div></div><button class="sk-ib" data-say="' + esc(p[0]) + '">🔊</button><button class="sk-ib" data-add="' + esc(p[0]) + '" title="加进生词本">＋</button></div>').join("") +
      (d.tip ? '<div class="sk-tip">💡 ' + esc(d.tip) + "</div>" : "") + "</div>" +
      '<div class="sk-center" style="margin-top:16px">' + (isDone("d:" + d.id) ? '<span class="sk-note">✓ 这个场景练过了</span>' : '<button class="ui-btn" data-act="mark" data-k="d:' + esc(d.id) + '">✓ 标记为练过</button>') + "</div>";
  }
  function scrollLine(i) { const el = root && root.querySelector('.sk-ln[data-li="' + i + '"]'); if (el) { const r = el.getBoundingClientRect(); if (r.top < 110 || r.bottom > innerHeight - 40) el.scrollIntoView({ block: "center", behavior: "smooth" }); } }
  function rpStep() {
    const d = (D.dialogs || []).find(x => RP && x.id === RP.id); if (!d || !RP) return;
    if (RP.i >= d.lines.length) { const m = RP.mode; RP = null; if (m === "rp") { markDone("d:" + d.id); tip("角色扮演完成 🎉"); } draw(); return; }
    const l = d.lines[RP.i]; draw(); scrollLine(RP.i);
    if (RP.mode === "play" || l.who === "A") { const my = RP; say(l.en, { who: l.who === "A" ? "A" : "", end: err => { if (RP !== my) return; RP.i++; setTimeout(rpStep, err ? 0 : 350); } }); }
    // 角色扮演轮到 B：等你录音或点「看答案」
  }

  // ===== 💬 常用表达 =====
  function funcList() {
    const L = D.functions || [];
    return '<div class="sk-intro"><b>怎么练：</b>每类先听一遍、跟读，再挑 2–3 个自己最想用的，点「＋」加进生词本，在「🔊 练习」里复习。<span class="sk-reg r0">随意</span><span class="sk-reg r1">中性</span><span class="sk-reg r2">正式</span> 标的是场合。已练 ' + doneCount("f:") + " / " + L.length + " 类。</div>" +
      '<div class="sk-grid three">' + L.map(g => card("func", g.id, g.title, (g.items || []).length + " 个表达", (g.items || []).slice(0, 4).map(x => x.en).join(" · "), isDone("f:" + g.id))).join("") + "</div>";
  }
  const regCls = r => (r === "随意" ? "r0" : r === "正式" ? "r2" : "r1");
  function funcView() {
    const g = (D.functions || []).find(x => x.id === view.id); if (!g) { view = null; return funcList(); }
    return '<div class="sk-bar">' + back + "</div>" + '<h2 class="sk-title">' + esc(g.title) + "</h2>" + (g.note ? '<div class="sk-scene">💡 ' + esc(g.note) + "</div>" : "") +
      '<div class="sk-grid">' + g.items.map((x, i) => { const key = "f:" + g.id + ":" + i; return '<div class="sk-item"><div class="e">' + esc(x.en) + '<span class="sk-reg ' + regCls(x.reg) + '">' + esc(x.reg || "") + '</span></div><div class="z sk-zh" style="font-size:14px">' + esc(x.zh) + "</div>" +
        ops(key, x.en, "", '<button class="sk-ib" data-add="' + esc(x.en) + '" data-sent="' + esc(x.ex || "") + '" title="加进生词本">＋ 生词本</button>') +
        (x.ex ? '<div class="ex">' + esc(x.ex) + ' <button class="sk-ib" data-say="' + esc(String(x.ex).replace(/\b[AB]:\s*/g, "")) + '" style="height:26px">🔊</button><small class="sk-zh">' + esc(x.exzh || "") + "</small></div>" : "") + "</div>"; }).join("") + "</div>" +
      '<div class="sk-center" style="margin-top:16px">' + (isDone("f:" + g.id) ? '<span class="sk-note">✓ 这类练过了</span>' : '<button class="ui-btn" data-act="mark" data-k="f:' + esc(g.id) + '">✓ 标记为练过</button>') + "</div>";
  }

  // ===== 🔊 发音 =====
  function pronList() {
    const P = D.pron || {}, L = P.pairs || [];
    return '<div class="sk-intro"><b>怎么练：</b>中国人最容易混的音，一组一组练：先看嘴型说明，点两个词对比着听，再做「听音辨词」小测（听到哪个点哪个），最后跟读例句。已练 ' + doneCount("p:") + " / " + L.length + " 组。</div>" +
      '<div class="sk-grid three">' + L.map(p => card("pair", p.id, p.title, p.a + " vs " + p.b, (p.words || []).slice(0, 4).map(w => w[0] + "/" + w[1]).join(" · "), isDone("p:" + p.id))).join("") + "</div>" +
      '<div class="sk-sub">连读、弱读、吞音<small>母语者说快了为什么听不懂</small></div><div class="sk-grid">' + card("conn", "all", "连读和弱读 " + ((P.connected || []).length) + " 条", "gonna、wanna、didja、pick it up……", "听慢速和正常速度对比，跟读", isDone("p:conn")) + "</div>";
  }
  let QZ = null; // 听音辨词：{id, n, ok, cur:[a,b,ans], picked}
  function pairView() {
    const p = ((D.pron || {}).pairs || []).find(x => x.id === view.id); if (!p) { view = null; return pronList(); }
    return '<div class="sk-bar">' + back + "</div>" + '<h2 class="sk-title">' + esc(p.title) + "<small>" + esc(p.a) + " vs " + esc(p.b) + "</small></h2>" +
      '<div class="sk-scene">👄 ' + esc(p.how) + "</div>" +
      '<div class="sk-box"><h3>🎧 听音辨词</h3><div class="sk-quiz" id="sk-quiz"></div></div>' +
      '<div class="sk-box"><h3>对比着听（点词就读）</h3><div class="sk-pairs">' + (p.words || []).map(w => '<div class="sk-pair"><button data-say="' + esc(w[0]) + '">' + esc(w[0]) + '</button><button data-say="' + esc(w[1]) + '">' + esc(w[1]) + "</button></div>").join("") + "</div></div>" +
      '<div class="sk-box"><h3>例句跟读</h3>' + (p.sent || []).flat().map((s, i) => '<div class="sk-ph" style="display:block"><div class="e">' + esc(s) + "</div>" + ops("p:" + p.id + ":" + i, s) + "</div>").join("") + "</div>";
  }
  function quizNew() {
    const p = ((D.pron || {}).pairs || []).find(x => view && x.id === view.id); if (!p) return;
    if (!QZ || QZ.id !== p.id) QZ = { id: p.id, n: 0, ok: 0 };
    const w = p.words[Math.floor(Math.random() * p.words.length)], ans = Math.random() < .5 ? 0 : 1;
    QZ.cur = [w[0], w[1], ans]; QZ.picked = null; quizPaint(); setTimeout(() => say(w[ans], { rate: Math.min(opt.rate, 1) }), 150);
  }
  function quizPaint() {
    const el = root && root.querySelector("#sk-quiz"); if (!el) return;
    if (!QZ || QZ.id !== (view && view.id) || !QZ.cur) { el.innerHTML = '<div class="q">听一个词，选出你听到的是哪一个（10 题）</div><button class="ui-btn pri" data-act="qz-go">开始</button>'; return; }
    const [a, b, ans] = QZ.cur, pk = QZ.picked;
    el.innerHTML = '<div class="q">第 ' + (QZ.n + (pk == null ? 1 : 0)) + ' / 10 题：听到的是哪个？<button class="sk-ib" data-act="qz-again" style="margin-left:6px">🔊 再听</button></div><div class="ch">' +
      [a, b].map((w, i) => '<button data-qz="' + i + '" class="' + (pk == null ? "" : i === ans ? "r" : i === pk ? "w" : "") + '">' + esc(w) + "</button>").join("") + "</div>" +
      '<div class="sc">答对 ' + QZ.ok + " / " + QZ.n + (pk != null ? (QZ.n >= 10 ? '　<button class="ui-btn pri" data-act="qz-go">再来 10 题</button>' : '　<button class="ui-btn pri" data-act="qz-next">下一题 ▶</button>') : "") + "</div>";
  }
  function connView() {
    const L = (D.pron || {}).connected || [];
    return '<div class="sk-bar">' + back + "</div>" + '<h2 class="sk-title">连读、弱读、吞音<small>先听 🐢 慢速，再听 🔊 正常速度，注意说快了以后的变化</small></h2>' +
      '<div class="sk-grid">' + L.map((x, i) => '<div class="sk-item"><div class="e"><span class="sk-tag">' + esc(x.type) + "</span>" + esc(x.en) + '</div><div class="z">听起来像 <b style="color:var(--ui-pur-text)">' + esc(x.sounds) + '</b></div><div class="z sk-zh">' + esc(x.zh) + "</div>" + ops("c:" + i, x.en) + "</div>").join("") + "</div>" +
      '<div class="sk-center" style="margin-top:16px">' + (isDone("p:conn") ? '<span class="sk-note">✓ 练过了</span>' : '<button class="ui-btn" data-act="mark" data-k="p:conn">✓ 标记为练过</button>') + "</div>";
  }

  // ===== 🎯 跟读 =====
  let SH = null; // 连续跟读：{g, i}
  function shadowList() {
    const G = (D.pron || {}).shadow || []; if (shadowGroup >= G.length) shadowGroup = 0; const g = G[shadowGroup]; if (!g) return '<div class="sk-empty">没有句子</div>';
    const on = SH && SH.g === shadowGroup;
    return '<div class="sk-intro"><b>怎么练：</b>「连续跟读」会一句一句播，每句后面留出时间，你跟着大声说（影子跟读，不打分，练语调和节奏）；想看自己读得准不准，单句点 🎙。已跟读 ' + doneCount("s:") + " 句。</div>" +
      '<div class="sk-bar"><span class="sk-seg">' + G.map((x, i) => '<button data-sg="' + i + '" class="' + (i === shadowGroup ? "on" : "") + '">' + esc(x.group) + "</button>").join("") + '</span><span class="gap"></span><button class="ui-btn' + (on ? " pri" : "") + '" data-act="sh">' + (on ? "⏹ 停止" : "▶ 连续跟读") + "</button></div>" +
      '<div class="sk-lines">' + g.items.map((x, i) => { const key = "s:" + shadowGroup + ":" + i; return '<div class="sk-ln' + (on && SH.i === i ? " cur" : "") + '" data-li="' + i + '" style="max-width:100%"><div class="sk-av">' + (isDone(key) ? "✓" : i + 1) + '</div><div class="sk-bub" style="flex:1 1 auto"><div class="sk-en">' + esc(x.en) + '</div><div class="sk-zh">' + esc(x.zh) + "</div>" + ops(key, x.en) + "</div></div>"; }).join("") + "</div>";
  }
  function shStep() {
    const G = (D.pron || {}).shadow || [], g = G[SH && SH.g]; if (!g || !SH) return;
    if (SH.i >= g.items.length) { SH = null; tip("这一组跟读完了 👏"); draw(); return; }
    draw(); scrollLine(SH.i);
    const my = SH, x = g.items[SH.i], t0 = Date.now();
    say(x.en, { end: () => { if (SH !== my) return; const gap = Math.max(1500, (Date.now() - t0) * 1.2 + 600); markDone("s:" + SH.g + ":" + SH.i); setTimeout(() => { if (SH !== my) return; SH.i++; shStep(); }, gap); } });
  }

  // ===== 🗣 话题 =====
  const CATS = ["日常", "工作", "生活在马来西亚", "旅行", "兴趣", "观点"];
  function topicList() {
    const L = D.topics || [];
    return '<div class="sk-intro"><b>怎么练：</b>选一张卡，看问题和要点，准备 15 秒，然后录音说 1–2 分钟（说不下去就看「好用的表达」）。说完回放听自己，再看样例回答，挑一两句换成自己的话再说一遍。已说 ' + doneCount("t:") + " / " + L.length + " 个话题。</div>" +
      CATS.map(c => { const T = L.filter(t => t.cat === c); return T.length ? '<div class="sk-sub">' + esc(c) + "<small>" + T.length + " 个</small></div>" + '<div class="sk-grid three">' + T.map(t => card("topic", t.id, t.q, t.qzh, "", isDone("t:" + t.id), '<span class="sk-tag">' + esc(t.level || "") + "</span>")).join("") + "</div>" : ""; }).join("");
  }
  let TM = null; // 计时：{id, phase:"prep"|"talk", left, t}
  function timerPaint() {
    const el = root && root.querySelector("#sk-timer"); if (!el) return;
    const t = TM && TM.id === (view && view.id) ? TM : null, key = "t:" + (view && view.id);
    if (!t) { el.innerHTML = '<div class="sk-center"><button class="ui-btn pri" data-act="tm" data-s="60">⏱ 准备 15 秒 + 说 1 分钟</button><button class="ui-btn" data-act="tm" data-s="120">说 2 分钟</button>' + recBtn(key, "", 180, "直接录音") + "</div>"; return; }
    const m = Math.floor(t.left / 60), s = t.left % 60;
    el.innerHTML = '<div class="sk-timer ' + t.phase + '">' + m + ":" + String(s).padStart(2, "0") + '</div><div class="sk-center"><span class="sk-note">' + (t.phase === "prep" ? "准备：看要点，想想先说什么" : "正在录音，开口说！") + '</span><button class="ui-btn" data-act="tm-stop">' + (t.phase === "prep" ? "跳过准备" : "⏹ 说完了") + "</button></div>";
  }
  function tmTick() {
    if (!TM) return; TM.left--;
    if (TM.left <= 0) {
      if (TM.phase === "prep") { TM.phase = "talk"; TM.left = TM.total; recStart("t:" + TM.id, "", TM.total + 5, () => { TM = null; markDone("t:" + view.id); timerPaint(); }); }
      else { clearInterval(TM.t); recStop(false); return; }
    }
    timerPaint();
  }
  function topicView() {
    const t = (D.topics || []).find(x => x.id === view.id); if (!t) { view = null; return topicList(); }
    const key = "t:" + t.id, x = RES[key] || {}, words = x.said ? toks(x.said).length : 0;
    return '<div class="sk-bar">' + back + "</div>" +
      '<div class="sk-box" style="margin-top:0"><div class="sk-big">' + esc(t.q) + ' <button class="sk-ib" data-say="' + esc(t.q) + '">🔊</button></div><div class="sk-zh" style="font-size:14.5px">' + esc(t.qzh) + "</div>" +
      '<div style="margin-top:10px;font-size:14.5px;color:var(--ui-ink-2);line-height:1.7">' + (t.points || []).map(p => "• " + esc(p)).join("<br>") + "</div></div>" +
      '<div class="sk-box"><div id="sk-timer"></div><div data-res="' + esc(key) + '">' + resHtml(key) + "</div>" + (words ? '<div class="sk-note">这次说了 ' + words + " 个词" + (words < 60 ? "，试着再多说几句：举个例子、讲个经历、说说原因" : "，不错！") + "</div>" : "") + aiRateHtml(key) + "</div>" +
      '<div class="sk-box"><h3>🧰 好用的表达</h3>' + (t.phrases || []).map(p => '<div class="sk-ph"><div class="t"><div class="e">' + esc(p[0]) + '</div><div class="z">' + esc(p[1]) + '</div></div><button class="sk-ib" data-say="' + esc(p[0]) + '">🔊</button><button class="sk-ib" data-add="' + esc(p[0]) + '" title="加进生词本">＋</button></div>').join("") + "</div>" +
      '<details class="sk-box"><summary style="cursor:pointer;font-weight:800;color:var(--ui-ink)">📝 看样例回答（自己先说完再看）</summary><div class="sk-ops" style="margin-top:10px"><button class="sk-ib" data-say="' + esc(t.sample) + '">🔊 听样例</button><button class="sk-ib" data-say="' + esc(t.sample) + '" data-slow="1">🐢 慢速</button></div><div class="sk-sample">' + esc(t.sample) + '</div><div class="sk-zh" style="margin-top:8px;font-size:14px;line-height:1.7">' + esc(t.samplezh) + "</div></details>" +
      '<div class="sk-center" style="margin-top:16px">' + (isDone(key) ? '<span class="sk-note">✓ 这个话题说过了</span>' : '<button class="ui-btn" data-act="mark" data-k="' + esc(key) + '">✓ 标记为说过</button>') + "</div>";
  }

  // ===== 📅 每日一练 =====
  const hashOf = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  function dailyPlan() { // 按日期定：今天固定是这几样；优先挑还没练过的
    const day = today(), h = hashOf(day), pick = (L, keyOf) => { if (!L.length) return null; const fresh = L.filter(x => !done[keyOf(x)]), P = fresh.length ? fresh : L; return P[h % P.length]; };
    const d = pick(D.dialogs || [], x => "d:" + x.id), t = pick(D.topics || [], x => "t:" + x.id);
    const all = []; ((D.pron || {}).shadow || []).forEach((g, gi) => g.items.forEach((x, i) => all.push({ key: "s:" + gi + ":" + i, en: x.en, zh: x.zh })));
    const fresh = all.filter(x => !done[x.key] || doneToday(x.key)), P = fresh.length >= 5 ? fresh : all, st = h % Math.max(1, P.length - 4);
    return { d, t, s: P.slice(st, st + 5) };
  }
  function streak() {
    const D0 = LG("speak:days", {}); let n = 0, k = today();
    if (!D0[k]) k = new Date(Date.parse(k + "T00:00:00+08:00") - 864e5 + 8 * 3600e3).toISOString().slice(0, 10); // 今天还没做完：从昨天往前数
    while (D0[k]) { n++; k = new Date(Date.parse(k + "T00:00:00+08:00") - 864e5 + 8 * 3600e3).toISOString().slice(0, 10); }
    return n;
  }
  function dailyView() {
    const p = dailyPlan(), dOk = p.d && doneToday("d:" + p.d.id), sN = p.s.filter(x => doneToday(x.key)).length, tOk = p.t && doneToday("t:" + p.t.id), all = !!(dOk && sN >= 5 && tOk);
    if (all) { const D0 = LG("speak:days", {}); if (!D0[today()]) { D0[today()] = 1; LS("speak:days", D0); tip("今天的口语练完了 🎉"); } }
    const n = (dOk ? 1 : 0) + (sN >= 5 ? 1 : 0) + (tOk ? 1 : 0), st = streak();
    const box = (ok, title, sub, body) => '<div class="sk-box"><h3>' + (ok ? "✅ " : "⬜ ") + title + '<small style="margin-left:8px;font-weight:500;color:var(--ui-muted);font-size:12.5px">' + sub + "</small></h3>" + body + "</div>";
    return '<div class="sk-intro"><b>🔥 连续 ' + st + " 天</b>　今天完成 <b>" + n + " / 3</b>" + (all ? "　🎉 今天的练完了，想多练就去「🤖 AI 陪练」聊几句" : "　大约 15 分钟：对话 → 跟读 → 话题") + "</div>" +
      (p.d ? box(dOk, "① 情景对话：" + esc(p.d.title), "先听全文，再角色扮演一遍（演完自动打勾）", '<div class="sk-scene" style="margin:4px 0 10px">📍 ' + esc(p.d.scene) + '</div><button class="ui-btn pri" data-act="dialog" data-id="' + esc(p.d.id) + '">' + (dOk ? "再练一次" : "去练 ▶") + "</button>") : "") +
      box(sN >= 5, "② 跟读 5 句", "每句点 🎙 读一遍（" + sN + " / 5）", '<div class="sk-lines">' + p.s.map((x, i) => '<div class="sk-ln" style="max-width:100%"><div class="sk-av">' + (doneToday(x.key) ? "✓" : i + 1) + '</div><div class="sk-bub" style="flex:1 1 auto"><div class="sk-en">' + esc(x.en) + '</div><div class="sk-zh">' + esc(x.zh) + "</div>" + ops(x.key, x.en) + "</div></div>").join("") + "</div>") +
      (p.t ? box(tOk, "③ 话题：" + esc(p.t.q), esc(p.t.qzh), '<button class="ui-btn pri" data-act="topic" data-id="' + esc(p.t.id) + '">' + (tOk ? "再说一次" : "去说 ▶") + '</button><span class="sk-note" style="margin-left:8px">录完可以让 AI 点评</span>') : "") +
      '<div class="sk-note">每天的内容按日期自动换，优先排还没练过的。三样都做完算打卡；练习次数也会算进「📊 统计」的热力日历和连续天数。</div>';
  }

  // ===== 🤖 AI 陪练 =====
  let CH = null; // {scene, title, msgs:[{role, content, fix}], busy, sum, sumBusy}
  let chatAuto = LG("speak:chatAuto", true);
  const FREE = { id: "free", title: "自由聊天", scene: "casual small talk between two friends: daily life, work, weekend plans, food, hobbies, living in Kuala Lumpur" };
  function chatScenes() { return [FREE].concat((D.dialogs || []).map(d => ({ id: d.id, title: d.title, scene: d.en_title + ". " + "You play: " + (d.roles && d.roles.A || "the other person") + ". The learner plays: " + (d.roles && d.roles.B || "themselves") + ". Context (Chinese): " + d.scene }))); }
  function chatView() {
    if (!CH) return '<div class="sk-intro"><b>怎么聊：</b>选一个场景，AI 先开口；你点 🎙 用英语回答（说完自动发出去），也可以打字。AI 会接着聊、追问，还会顺手纠正你上一句的错。聊 6 句以上点「结束并总结」，看看哪些地方可以说得更好。</div>' +
      '<div class="sk-grid three">' + chatScenes().map(c => '<button class="sk-card" data-act="chat-go" data-id="' + esc(c.id) + '"><div class="t"><b>' + (c.id === "free" ? "💬 " : "🎭 ") + esc(c.title) + "</b><span>" + (c.id === "free" ? "想到哪聊到哪" : "AI 演对方，你演自己") + "</span></div><i>›</i></button>").join("") + "</div>";
    const msgs = CH.msgs.map((m, i) => m.role === "assistant"
      ? '<div class="sk-ln"><div class="sk-av">AI</div><div class="sk-bub"><div class="sk-en">' + esc(m.content) + '</div><div class="sk-ops"><button class="sk-ib" data-say="' + esc(m.content) + '" data-who="A">🔊</button><button class="sk-ib" data-say="' + esc(m.content) + '" data-who="A" data-slow="1">🐢</button><button class="sk-ib" data-act="chat-zh" data-i="' + i + '">译</button></div>' + (m.zh ? '<div class="sk-zh" style="display:block">' + esc(m.zh) + "</div>" : "") + "</div></div>"
      : '<div class="sk-ln B"><div class="sk-av">我</div><div class="sk-bub"><div class="sk-en">' + esc(m.content) + "</div>" + (m.fix ? '<div class="sk-res"><span class="no">' + esc(m.fix.bad) + '</span> → <span class="ok">' + esc(m.fix.good) + '</span> <button class="sk-ib" data-say="' + esc(m.fix.good) + '" style="height:26px">🔊</button><div class="x">' + esc(m.fix.why_zh || "") + "</div></div>" : "") + "</div></div>").join("");
    const x = RES.chat || {}, users = CH.msgs.filter(m => m.role === "user").length;
    let sum = "";
    if (CH.sumBusy) sum = '<div class="sk-box"><span class="sk-note">AI 正在看你们的对话……</span></div>';
    else if (CH.sum) { const S = CH.sum; sum = '<div class="sk-box"><h3>📋 这次聊天的小结</h3><div style="font-size:14.5px;line-height:1.7;color:var(--ui-ink-2)">' + esc(S.summary_zh || "") + "</div>" +
      ((S.good_zh || []).length ? '<div style="margin-top:8px;font-size:14px;color:var(--ui-green,#7CE3B8)">' + S.good_zh.map(g => "👍 " + esc(g)).join("<br>") + "</div>" : "") +
      ((S.fixes || []).length ? '<h3 style="margin-top:12px">✏️ 可以说得更好</h3>' + S.fixes.map(f => '<div class="sk-ph"><div class="t"><div class="z"><span style="color:var(--ui-red,#ff8080)">' + esc(f.bad) + '</span></div><div class="e">' + esc(f.good) + '</div><div class="z">' + esc(f.why_zh || "") + '</div></div><button class="sk-ib" data-say="' + esc(f.good) + '">🔊</button></div>').join("") : "") +
      ((S.phrases || []).length ? '<h3 style="margin-top:12px">🧰 下次可以用</h3>' + S.phrases.map(f => '<div class="sk-ph"><div class="t"><div class="e">' + esc(f.en) + '</div><div class="z">' + esc(f.zh || "") + '</div></div><button class="sk-ib" data-say="' + esc(f.en) + '">🔊</button><button class="sk-ib" data-add="' + esc(f.en) + '" title="加进生词本">＋</button></div>').join("") : "") + "</div>"; }
    return '<div class="sk-bar"><button class="ui-btn" data-act="chat-end">← 换个场景</button><span class="gap"></span><label class="sk-note" style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="sk-auto"' + (chatAuto ? " checked" : "") + '>自动朗读 AI 的话</label>' +
      '<button class="ui-btn" data-act="chat-sum"' + (users >= 2 && !CH.busy && !CH.sumBusy ? "" : " disabled") + ">结束并总结</button></div>" +
      '<h2 class="sk-title">' + esc(CH.title) + "<small>AI 演对方，你用英语回答</small></h2>" +
      '<div class="sk-lines" id="sk-chat">' + msgs + (CH.busy ? '<div class="sk-ln"><div class="sk-av">AI</div><div class="sk-bub"><span class="sk-note">正在想……</span></div></div>' : "") + "</div>" +
      (CH.err ? '<div class="sk-tip">' + esc(CH.err) + ' <button class="sk-ib" data-act="chat-retry">重试</button></div>' : "") +
      '<div class="sk-box"><div class="sk-ops" style="margin-top:0">' + '<button class="ui-btn ' + (x.on ? "" : "pri") + '" data-rec="chat" data-t="" data-max="40" data-label="说一句" style="min-width:120px">' + (x.on ? "⏹ 说完了" : "🎙 说一句") + '</button><input id="sk-say" placeholder="或者打字，回车发送" style="flex:1 1 200px;min-width:0;height:38px;border-radius:10px;border:1px solid var(--ui-line-2);background:var(--ui-surface-2);color:var(--ui-ink);padding:0 12px;font:inherit;font-size:15px"><button class="ui-btn" data-act="chat-send">发送</button></div>' +
      (x.busy ? '<div class="sk-note">正在识别……</div>' : "") + '<div class="sk-note">卡住了？说 "Sorry, could you say that again?" 或 "How do you say … in English?" 也算练习。</div></div>' + sum;
  }
  async function chatAsk() {
    if (!CH || CH.busy) return; CH.busy = true; CH.err = ""; draw(); chatScroll();
    const my = CH;
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "chat", scene: CH.scene, history: CH.msgs.map(m => ({ role: m.role, content: m.content })) }) });
      const j = await r.json().catch(() => ({}));
      if (CH !== my) return;
      if (!j.ok) throw new Error(j.error === "noai" ? "AI 没开（Cloudflare 里绑定 Workers AI）" : "AI 没回上来，点重试");
      const last = [...CH.msgs].reverse().find(m => m.role === "user"); if (last && j.fix) last.fix = j.fix;
      CH.msgs.push({ role: "assistant", content: j.reply }); CH.busy = false; draw(); chatScroll();
      if (chatAuto) say(j.reply, { who: "A" });
    } catch (e) { if (CH === my) { CH.busy = false; CH.err = e.message || "出错了"; draw(); } }
  }
  function chatSend(text) {
    text = String(text || "").trim(); if (!CH || !text || CH.busy) return;
    CH.msgs.push({ role: "user", content: text }); CH.sum = null;
    if (CH.msgs.filter(m => m.role === "user").length === 3) markDone("c:" + today()); // 聊上 3 句算今天用过 AI 陪练
    chatAsk();
  }
  function chatScroll() { const el = root && root.querySelector("#sk-chat"); if (el && el.lastElementChild) el.lastElementChild.scrollIntoView({ block: "center", behavior: "smooth" }); }
  async function chatSum() {
    if (!CH || CH.sumBusy) return; CH.sumBusy = true; draw(); const my = CH;
    try {
      const j = await (await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "chatsum", scene: CH.scene, history: CH.msgs.map(m => ({ role: m.role, content: m.content })) }) })).json();
      if (CH !== my) return; CH.sumBusy = false; if (j.ok) CH.sum = j; else tip("总结没出来，再点一次"); draw();
      const b = root.querySelector(".sk-box:last-child"); if (b) b.scrollIntoView({ block: "start", behavior: "smooth" });
    } catch (e) { if (CH === my) { CH.sumBusy = false; tip("总结没出来，再点一次"); draw(); } }
  }
  async function zhOf(en) { // 谷歌翻译（同阅读页）
    try { const j = await (await fetch("https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=" + encodeURIComponent(en))).json(); return (j[0] || []).map(x => x[0] || "").join(""); } catch (e) { return ""; }
  }

  // ===== 🎬 原声跟读 =====
  let CLIPS = null, clipN = 40; const CLIPREC = {};
  function loadClips() {
    if (CLIPS) return Promise.resolve();
    return fetch("/api/ext", { cache: "no-store" }).then(r => r.json()).then(j => {
      const it = (j && j.items) || {}, L = [];
      for (const k in it) {
        if (!k.startsWith("med|med:")) continue; const mk = k.slice(4), at = it[k].at || 0;
        if (mk.startsWith("med:w:")) { const w = mk.slice(6), c = it["savedCtx|" + w]; L.push({ mk, word: w, t: c && c.v && c.v.t ? String(c.v.t) : "", at }); }
        else { const sk = mk.slice(6), s = Object.keys(it).find(x => x.startsWith("savedSents|") && it[x].v && it[x].v.k === sk), v = s && it[s].v; L.push({ mk, t: v ? String(v.t || "") : "", tr: v ? String(v.tr || "") : "", at }); }
      }
      CLIPS = L.sort((a, b) => b.at - a.at);
    }).catch(() => { CLIPS = []; });
  }
  function clipGet(mk) { return CLIPREC[mk] ? Promise.resolve(CLIPREC[mk]) : fetch("/api/media?k=" + encodeURIComponent(mk)).then(r => r.ok ? r.json() : null).then(j => (CLIPREC[mk] = (j && j.rec) || {})).catch(() => ({})); }
  let clipAudio = null;
  function clipPlay(mk, slow) { clipGet(mk).then(r => { if (!r || !r.aud) { tip("这条没有原声"); return; } hush(); try { if (clipAudio) clipAudio.pause(); clipAudio = new Audio(r.aud); clipAudio.playbackRate = slow ? 0.75 : 1; clipAudio.play(); } catch (e) { tip("播放不了"); } }); }
  function clipList() {
    if (!CLIPS) { loadClips().then(draw); return '<div class="sk-empty">正在取你保存的原声……</div>'; }
    if (!CLIPS.length) return '<div class="sk-intro">还没有原声：在电脑上用插件看 YouTube 时保存单词或句子（设置里开着「保存时存下原声和画面」），这里就会出现那一句的真人原声。</div>';
    const L = CLIPS.slice(0, clipN);
    return '<div class="sk-intro"><b>怎么练：</b>这些是你看 YouTube 时保存下来的真人原声（共 ' + CLIPS.length + " 条，最新的在前）。点 ▶ 听原声，跟着读，点 🎙 录音打分，再回放和原声对比。点「🖼」看当时的画面。已练 " + doneCount("v:") + " 条。</div>" +
      '<div class="sk-lines">' + L.map(c => { const r = CLIPREC[c.mk], t = (r && r.t) || c.t, key = "v:" + c.mk; return '<div class="sk-ln" style="max-width:100%"><div class="sk-av">' + (isDone(key) ? "✓" : "🎬") + '</div><div class="sk-bub" style="flex:1 1 auto">' +
        (r && r.img && c.showImg ? '<img src="' + r.img + '" alt="" style="width:100%;max-width:420px;border-radius:10px;display:block;margin-bottom:8px">' : "") +
        '<div class="sk-en">' + (t ? esc(t) : '<span class="sk-mask">（点 ▶ 取原句）</span>') + (c.word ? ' <span class="sk-tag">' + esc(c.word) + "</span>" : "") + '</div><div class="sk-zh">' + esc((r && r.tr) || c.tr || "") + (r && r.title ? '　· <span style="opacity:.8">' + esc(r.title) + "</span>" : "") + "</div>" +
        '<div class="sk-ops"><button class="sk-ib" data-clip="' + esc(c.mk) + '">▶ 原声</button><button class="sk-ib" data-clip="' + esc(c.mk) + '" data-slow="1">🐢 慢放</button><button class="sk-ib" data-clipimg="' + esc(c.mk) + '">🖼</button>' + (t ? recBtn(key, t, 25) : "") + "</div>" +
        '<div data-res="' + esc(key) + '">' + resHtml(key) + "</div></div></div>"; }).join("") + "</div>" +
      (CLIPS.length > clipN ? '<div class="sk-center" style="margin-top:12px"><button class="ui-btn" data-act="clip-more">再显示 40 条</button></div>' : "");
  }

  // ===== 🗣 话题：AI 点评 =====
  const AIR = {}; // key → {busy, r, err}
  function aiRateHtml(key) {
    const a = AIR[key], x = RES[key] || {}, words = x.said ? toks(x.said).length : 0;
    if (!a) return words >= 8 ? '<div class="sk-center"><button class="ui-btn pri" data-act="ai-rate">🤖 AI 点评这次回答</button></div>' : "";
    if (a.busy) return '<div class="sk-note" style="text-align:center">AI 正在听你的回答（按雅思口语标准）……</div>';
    if (a.err) return '<div class="sk-tip">' + esc(a.err) + ' <button class="sk-ib" data-act="ai-rate">重试</button></div>';
    const r = a.r, B = r.band || {}, bk = "tb:" + key;
    return '<div style="margin-top:12px"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:baseline"><span style="font-size:30px;font-weight:900;color:var(--ui-pur-text)">' + esc(B.overall) + '</span><span class="sk-note" style="margin:0">流利连贯 ' + esc(B.FC) + " · 词汇 " + esc(B.LR) + " · 语法 " + esc(B.GRA) + "（发音没算：AI 只看文字）</span></div>" +
      '<div style="margin-top:6px;font-size:14.5px;line-height:1.7;color:var(--ui-ink-2)">' + esc(r.summary_zh || "") + "</div>" +
      ((r.strengths_zh || []).length ? '<div style="margin-top:6px;font-size:14px;color:var(--ui-green,#7CE3B8)">' + r.strengths_zh.map(g => "👍 " + esc(g)).join("<br>") + "</div>" : "") +
      ((r.fixes || []).length ? '<h3 style="margin-top:12px">✏️ 改一改</h3>' + r.fixes.map(f => '<div class="sk-ph"><div class="t"><div class="z"><span style="color:var(--ui-red,#ff8080)">' + esc(f.bad) + '</span></div><div class="e">' + esc(f.good) + '</div><div class="z">' + esc(f.why_zh || "") + '</div></div><button class="sk-ib" data-say="' + esc(f.good) + '">🔊</button></div>').join("") : "") +
      (r.better ? '<h3 style="margin-top:12px">⭐ 升级版回答（照着再说一遍）</h3><div class="sk-sample">' + esc(r.better) + '</div><div class="sk-zh" style="font-size:14px;line-height:1.7;margin-top:6px">' + esc(r.better_zh || "") + '</div>' + ops(bk, r.better) : "") + "</div>";
  }
  async function aiRate(key, q) {
    const x = RES[key] || {}; if (!x.said) return;
    AIR[key] = { busy: true }; draw();
    try {
      const j = await (await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "speak", prompt: q, text: x.said }) })).json();
      AIR[key] = j.ok ? { r: j } : { err: j.error === "noai" ? "AI 没开（Cloudflare 里绑定 Workers AI）" : j.error === "too short" ? "说得太短了，至少说几句再点评" : "AI 没回上来" };
    } catch (e) { AIR[key] = { err: "网络问题，没连上 AI" }; }
    draw();
  }

  /* ---------- 事件 ---------- */
  function stopAll() { hush(); RP = null; SH = null; if (TM) { clearInterval(TM.t); TM = null; } if (rec) recStop(true); }
  function open(t, id) { stopAll(); view = { t, id }; QZ = null; draw(); window.scrollTo(0, 0); }
  function init() {
    if (root) return; const host = document.getElementById("view-speak"); if (!host) return;
    const st = document.createElement("style"); st.textContent = CSS; document.head.append(st);
    host.innerHTML = '<div id="speak"></div>'; root = host.firstChild;
    root.addEventListener("click", async e => {
      const t = e.target;
      const cp = t.closest("[data-clip]"); if (cp) { clipPlay(cp.dataset.clip, !!cp.dataset.slow); clipGet(cp.dataset.clip).then(() => { if (sec === "clip" && !view) draw(); }); return; }
      const ci = t.closest("[data-clipimg]"); if (ci) { const c = (CLIPS || []).find(x => x.mk === ci.dataset.clipimg); if (c) { c.showImg = !c.showImg; clipGet(c.mk).then(r => { if (c.showImg && !(r && r.img)) tip("这条没存画面"); draw(); }); } return; }
      const sy = t.closest("[data-say]"); if (sy) { if (RP || SH) { RP = null; SH = null; } say(sy.dataset.say, { slow: !!sy.dataset.slow, who: sy.dataset.who || "" }); return; }
      const rb = t.closest("[data-rec]"); if (rb) {
        const key = rb.dataset.rec, tgt = rb.dataset.t, max = +rb.dataset.max || 20;
        recStart(key, tgt, max, x => {
          if (key.indexOf("s:") === 0 && x.url) markDone(key); // 跟读句：录过就算练过
          if (RP && RP.mode === "rp" && key.indexOf("d:" + RP.id + ":") === 0) { (RP.shown = RP.shown || {})[RP.i] = true; draw(); }
          if (key.indexOf("t:") === 0 && x.url && view) { markDone(key); delete AIR[key]; draw(); }
          if (key.indexOf("v:") === 0 && x.url) markDone(key);
          if (key === "chat") { RES.chat = { }; if (x.said) chatSend(x.said); else { tip("没听清，再说一次，或者打字"); draw(); } }
          if (sec === "daily" && !view && key.indexOf("s:") === 0) draw();
        });
        return;
      }
      const ad = t.closest("[data-add]"); if (ad) { if (window.vocabAddWord) window.vocabAddWord(ad.dataset.add, ad.dataset.sent || ""); else tip("生词本还没加载好"); return; }
      const sc = t.closest("[data-sec]"); if (sc) { stopAll(); sec = sc.dataset.sec; view = null; LS("speak:sec", sec); draw(); return; }
      const rt = t.closest("[data-rate]"); if (rt) { opt.rate = +rt.dataset.rate; LS("speak:opt", opt); draw(); return; }
      const zh = t.closest("[data-zh]"); if (zh) { opt.zh = zh.dataset.zh === "1"; LS("speak:opt", opt); draw(); return; }
      const sg = t.closest("[data-sg]"); if (sg) { stopAll(); shadowGroup = +sg.dataset.sg; draw(); return; }
      const qz = t.closest("[data-qz]"); if (qz && QZ && QZ.cur && QZ.picked == null) { QZ.picked = +qz.dataset.qz; QZ.n++; if (QZ.picked === QZ.cur[2]) QZ.ok++; if (QZ.n >= 10) { markDone("p:" + QZ.id); tip("10 题答对 " + QZ.ok + " 题"); } quizPaint(); say(QZ.cur[QZ.cur[2]]); return; }
      const b = t.closest("[data-act]"); if (!b) return; const a = b.dataset.act;
      if (a === "chat-go") { const c = chatScenes().find(x => x.id === b.dataset.id); if (!c) return; stopAll(); CH = { id: c.id, title: c.title, scene: c.scene, msgs: [] }; chatAsk(); return; }
      if (a === "chat-end") { stopAll(); CH = null; draw(); return; }
      if (a === "chat-send") { const i = root.querySelector("#sk-say"); if (i && i.value.trim()) { const v = i.value; i.value = ""; chatSend(v); } return; }
      if (a === "chat-retry") { chatAsk(); return; }
      if (a === "chat-sum") { chatSum(); return; }
      if (a === "chat-zh") { const m = CH && CH.msgs[+b.dataset.i]; if (m && !m.zh) zhOf(m.content).then(z => { m.zh = z || "（没翻译出来）"; draw(); }); return; }
      if (a === "clip-more") { clipN += 40; draw(); return; }
      if (a === "ai-rate") { const tp = (D.topics || []).find(x => view && x.id === view.id); if (tp) aiRate("t:" + tp.id, tp.q); return; }
      if (a === "back") { stopAll(); view = null; draw(); window.scrollTo(0, 0); return; }
      if (["dialog", "func", "pair", "conn", "topic"].includes(a)) { open(a, b.dataset.id); return; }
      if (a === "mark") { markDone(b.dataset.k); draw(); return; }
      if (a === "play") { if (RP && RP.mode === "play") { stopAll(); draw(); } else { stopAll(); RP = { id: view.id, i: 0, mode: "play" }; rpStep(); } return; }
      if (a === "rp") { if (RP && RP.mode === "rp") { stopAll(); draw(); } else { stopAll(); RP = { id: view.id, i: 0, mode: "rp", shown: {} }; rpStep(); } return; }
      if (a === "rp-show") { if (RP) { (RP.shown = RP.shown || {})[+b.dataset.i] = true; draw(); const d = D.dialogs.find(x => x.id === RP.id); if (d) say(d.lines[RP.i].en); } return; }
      if (a === "rp-next") { if (RP) { if (rec) recStop(true); RP.i++; rpStep(); } return; }
      if (a === "sh") { if (SH) { stopAll(); draw(); } else { stopAll(); SH = { g: shadowGroup, i: 0 }; shStep(); } return; }
      if (a === "qz-go") { QZ = null; quizNew(); return; }
      if (a === "qz-next") { quizNew(); return; }
      if (a === "qz-again") { if (QZ && QZ.cur) say(QZ.cur[QZ.cur[2]], { rate: Math.min(opt.rate, 1) }); return; }
      if (a === "tm") { stopAll(); const total = +b.dataset.s || 60; TM = { id: view.id, phase: total > 60 ? "talk" : "prep", left: total > 60 ? total : 15, total }; if (TM.phase === "talk") recStart("t:" + TM.id, "", total + 5, () => { TM = null; markDone("t:" + view.id); draw(); }); TM.t = setInterval(tmTick, 1000); timerPaint(); return; }
      if (a === "tm-stop") { if (!TM) return; if (TM.phase === "prep") { TM.left = 1; tmTick(); } else { clearInterval(TM.t); recStop(false); } return; }
    });
    root.addEventListener("keydown", e => { if (e.target.id === "sk-say" && e.key === "Enter" && !e.isComposing) { e.preventDefault(); const v = e.target.value; e.target.value = ""; chatSend(v); } });
    root.addEventListener("change", e => { if (e.target.id === "sk-auto") { chatAuto = e.target.checked; LS("speak:chatAuto", chatAuto); } });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && document.documentElement.classList.contains("show-speak")) { stopAll(); draw(); } });
  }
  window.speakShow = () => { init(); if (!root) return; draw(); if (!D) loadData().then(draw); };
  window.speakHide = () => { if (root) { stopAll(); } };
  // 直达链接（?go=speak）或上次停在口语页：切换标签的代码比本文件先跑，那时还没有 speakShow，这里补画一次
  const boot = () => { init(); if (document.documentElement.classList.contains("show-speak")) window.speakShow(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
