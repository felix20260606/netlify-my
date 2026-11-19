/* 生词本「🔊 练习」：照 Language Reactor 的 PhrasePump 做的练法，复习进度存在生词本里（state.srs，网站后台），哪台设备练都算
   一个词这一轮要么听 3 句例句（词条自带的 + Tatoeba 例句库，每次换着听），要么做 1 道填空（用保存时的原句）；被动听过 2 次之后才出填空（同 PhrasePump）。
   排程按遗忘曲线（FSRS-4.5 的公式和默认参数）：每个词记着「稳定度」S（天）——过了 S 天还有 90% 的把握记得；
   记得的概率 R = (1 + 19/81 · t/S)^-0.5，降到 90% 时安排复习；越接近遗忘时复习，S 涨得越多，答错 S 变短、10 分钟后重来。
   S 到 60 天（两个月后还有九成把握）自动标为「已掌握」。没有到期的词时，挑现在最可能忘的做「额外练习」。
   依赖 index.html 的全局：state / words / save / speak / toast */
(function () {
  const DAY = 864e5, RELEARN = 10 * 6e4, PER = 3, NUMS = [20, 40, 60, 80, 100], NEWS = [0, 5, 10, 15, 20, 25];
  const LG = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, LS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const today = () => new Date().toISOString().slice(0, 10);
  let opt = Object.assign({ quiz: true, num: 20, newPct: 15, types: ["word", "phrase"], sugg: true, tags: [], recall: true, dir: "en", listen: true }, LG("pump:opt", {})); if (!opt.listen && !opt.quiz) opt.listen = true; if (!Array.isArray(opt.tags)) opt.tags = [];
  // ---------- 遗忘曲线（FSRS-4.5：公式和官方默认参数，github.com/open-spaced-repetition） ----------
  const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
  const RET = 0.9, DECAY = -0.5, FACTOR = 19 / 81, KNOWN_S = 60, LEVELS = [1, 3, 7, 16, 35, 90]; // LEVELS：换算成原来的「级别」，给插件等旧显示用
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const recall = (S, tDays) => Math.pow(1 + FACTOR * Math.max(0, tDays) / S, DECAY);       // 过了 t 天还记得的概率
  const interval = S => S / FACTOR * (Math.pow(RET, 1 / DECAY) - 1);                        // 记得的概率降到 90% 要多少天（= S）
  const initD = g => clamp(W[4] - (g - 3) * W[5], 1, 10);
  const memOf = r => (r && r.s ? { s: r.s, d: r.d || 5 } : { s: [0.4, 1, 3, 7, 16, 35, 90][(r && r.b) || 0] || 0.4, d: 5 }); // 旧进度（只有级别）换算成稳定度
  const rNow = r => { if (!r || !r.at) return 0; return recall(memOf(r).s, (Date.now() - r.at) / DAY); };
  function review(r, g) { // g：1 忘了，3 记得；返回新的 { s 稳定度, d 难度 }
    if (!r || !(r.s || r.b || r.n)) return { s: W[g - 1], d: initD(g) };
    const m = memOf(r), R = recall(m.s, (Date.now() - (r.at || Date.now())) / DAY);
    const d = clamp(W[7] * initD(4) + (1 - W[7]) * (m.d - W[6] * (g - 3)), 1, 10);
    const s = g === 1 ? Math.min(m.s, W[11] * Math.pow(m.d, -W[12]) * (Math.pow(m.s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - R)))
      : m.s * (1 + Math.exp(W[8]) * (11 - m.d) * Math.pow(m.s, -W[9]) * (Math.exp(W[10] * (1 - R)) - 1));
    return { s: Math.max(0.1, s), d };
  }
  const levelOf = s => { let b = 0; LEVELS.forEach((x, i) => { if (s >= x) b = i + 1; }); return b; };
  const seen = r => (r ? (r.x != null ? r.x : Math.round((r.n || 0) / PER)) : 0); // 练过几轮（被动听也算）
  // ---------- 例句：词条自带的 + Tatoeba 例句库（/api/sent，后台缓存）；听力每次换着听，最近听过的往后排 ----------
  const SENT = {}, heard = LG("pump:heard", {});
  const sentFor = w => { const k = String(w.word || "").toLowerCase().trim(); if (!hasEn(w) || w.type === "sentence" || /\s.*\s.*\s/.test(k) || k in SENT) return Promise.resolve(); SENT[k] = null;
    return fetch("/api/sent?w=" + encodeURIComponent(k)).then(r => r.json()).then(j => { SENT[k] = (j && j.items) || []; }).catch(() => { delete SENT[k]; }); };
  let day = LG("pump:day", { d: "", n: 0 }); if (day.d !== today()) day = { d: today(), n: 0 };
  let cards = [], at = 0, bad = 0, playing = false, root = null;
  // 插件保存时录下的原声和两张截图（存在 Cloudflare：/api/ext 里有索引，/api/media 一条一条取），哪台设备都能用
  let MED = null, medP = null, player = null, EXT = null; const medRec = {}, medPr = {};
  const nrm = s => String(s || "").toLowerCase().replace(/[{}]/g, "").replace(/[^a-z0-9']+/g, " ").trim();
  function medMap() {
    if (medP) return medP;
    medP = fetch("/api/ext").then(r => r.json()).then(j => { const it = (j && j.items) || {}, m = {};
      const X = { tags: {}, sugg: {}, marks: {}, saved: new Set() }; // 和插件复习页一样的几样：颜色标签、从看过的视频里推荐的生词、标记、已保存
      for (const k in it) { const i = k.indexOf("|"), n = k.slice(0, i), id = k.slice(i + 1), v = it[k].v; if (n === "tags" && v) X.tags[id] = v; else if (n === "sugg" && v && v.t) X.sugg[id] = v; else if (n === "marks") X.marks[id] = v; else if (n === "saved") X.saved.add(id); }
      EXT = X;
      for (const k in it) if (k.startsWith("med|med:w:")) m[k.slice(10)] = k.slice(4);
      for (const k in it) if (k.startsWith("savedSents|")) { const x = it[k].v, mk = "med:s:" + (x && x.k); if (x && x.t && it["med|" + mk]) { const t = String(x.t).toLowerCase().trim(); if (!m[t]) m[t] = mk; } }
      return (MED = m); }).catch(() => (MED = {}));
    return medP;
  }
  function medFor(w) {
    const k = MED && MED[String(w.word || "").toLowerCase().trim()]; if (!k) return Promise.resolve(null);
    return medPr[k] || (medPr[k] = fetch("/api/media?k=" + encodeURIComponent(k)).then(r => r.ok ? r.json() : null).then(j => (medRec[k] = (j && j.rec) || null)).catch(() => (medRec[k] = null)));
  }
  // 这张卡片的句子就是保存时的那一句：用原声和截图
  const medOf = c => { const k = MED && MED[String(c.w.word || "").toLowerCase().trim()], r = k && medRec[k]; if (!r) return null; return (r.t ? nrm(r.t) === nrm(c.s.en) : !!c.s.orig) ? r : null; };
  const prefetch = from => { for (let i = from; i < Math.min(cards.length, from + 4); i++) medFor(cards[i].w); };
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
  .pp-zh .hm{display:inline-block;font-size:10.5px;font-weight:800;border-radius:4px;padding:0 4px;margin-right:6px;background:var(--ui-surface-3);color:var(--ui-muted);vertical-align:1px}
  .pp-sg{margin-top:12px;font-size:13px;color:var(--ui-muted)}.pp-sg button{margin-left:8px;height:30px;border-radius:8px;border:1px solid var(--ui-pur);background:var(--ui-pur-soft);color:var(--ui-pur-text);font:inherit;font-size:13px;padding:0 12px;cursor:pointer}.pp-sg button:disabled{opacity:.6;cursor:default}
  .pp-rc{cursor:pointer}.pp-rc.back{cursor:default;text-align:left;align-items:stretch}
  .pp-rc .rc-w{font-size:36px;font-weight:900;color:var(--ui-ink);line-height:1.25;text-align:center}.pp-rc .rc-w.long{font-size:24px}.pp-rc.back .rc-w{font-size:26px;text-align:left}
  .pp-rc .rc-p{color:var(--ui-muted);margin-top:6px;text-align:center}.pp-rc.back .rc-p{text-align:left;margin-top:2px}
  .pp-rc .rc-q{margin-top:18px;color:var(--ui-muted);font-size:13px;text-align:center}
  .pp-rc .rc-zh{margin-top:10px;font-size:18px;color:var(--ui-ink)}.pp-rc .rc-en{margin-top:4px;color:var(--ui-muted);font-size:14px}
  .pp-rc .rc-fm{margin-top:10px;font-size:13.5px;color:var(--ui-ink-2);display:grid;gap:2px}.pp-rc .rc-fm span{color:var(--ui-muted)}
  .pp-rc .rc-ex{margin-top:10px;display:grid;gap:8px;font-size:14.5px;color:var(--ui-ink)}.pp-rc .rc-ex span{display:block;color:var(--ui-muted);font-size:13px}.pp-rc .rc-ex .t{color:var(--ui-orange);font-weight:700}
  .pp-rc .rc-tip{margin-top:10px;font-size:13.5px;color:var(--ui-ink-2)}
  .pp-rcb{display:flex;gap:10px;margin:12px 0 0}.pp-rcb button{flex:1;height:46px;border-radius:12px;font:inherit;font-size:15px;font-weight:700;cursor:pointer;border:1px solid var(--ui-line-2);background:var(--ui-surface-2);color:var(--ui-ink)}#pp-yes{background:var(--ui-pur);border-color:var(--ui-pur);color:#fff}#pp-no:hover{border-color:var(--ui-red);color:var(--ui-red)}
  .pp-q span.sg{border-style:dashed}
  .pp-q span i{font-style:normal;font-size:11px;opacity:.7}
  .pp-img{display:flex;gap:8px;justify-content:center;width:100%;max-width:640px;margin:0 auto 14px}.pp-img img{flex:1 1 0;min-width:0;max-width:300px;aspect-ratio:16/9;object-fit:cover;border-radius:10px;background:var(--paper-2)}
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
  const hasEn = w => !/[一-鿿]/.test(w.word); // 「规律」类词条标题是中文：没法听，只能用认词卡练
  const usable = w => w && w.word && opt.types.includes(w.type || "word") && (hasEn(w) || opt.recall);
  // 这个词这一轮出哪几张卡（同 PhrasePump：要么听 3 句，要么 1 道填空；被动听过 2 轮之后才出填空，关了「练习」就直接出填空）
  const ownSent = w => { const k = String(w.word || "").toLowerCase().trim(); return sentences(w).map((x, i) => Object.assign({ orig: i === 0 }, x)).filter(x => nrm(x.en) !== nrm(w.word) || !(SENT[k] || []).length); };
  const canQuiz = w => opt.quiz && !w.sg && hasEn(w) && w.type !== "sentence" && /\{[^}]+\}/.test(mark(sentences(w)[0].en, w));
  function spec(w) {
    const r = srs()[w.id], k = String(w.word || "").toLowerCase().trim();
    if (canQuiz(w) && (seen(r) >= 2 || !opt.listen)) return { quiz: 1, recall: 0, listen: 0 };
    const avail = hasEn(w) ? ownSent(w).length + (SENT[k] || []).length : 0, listen = opt.listen ? Math.min(PER, avail) : 0;
    return { quiz: 0, recall: !w.sg && (opt.recall || !listen) ? 1 : 0, listen: listen || (!opt.listen && !opt.recall && avail ? 1 : 0) }; // 两样都关了：至少给一张听力
  }
  const nCards = w => { const x = spec(w); return x.quiz + x.recall + x.listen; };
  function plan() {
    const S = srs(), now = Date.now(), tagOf = w => (EXT && EXT.tags[String(w.word).toLowerCase().trim()]) || "";
    const P = (typeof words !== "undefined" ? words : []).filter(usable).filter(w => !opt.tags.length || opt.tags.includes(tagOf(w))), live = P.filter(w => w.status !== "known");
    const due = live.filter(w => S[w.id] && S[w.id].due <= now).sort((a, b) => rNow(S[a.id]) - rNow(S[b.id])); // 最可能忘的先练
    const fresh = live.filter(w => !S[w.id]).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    // 建议（同 PhrasePump「来自你的混合内容的新词」）：从看过的视频里挑还没收、没标记过的词；练了不记进度，想学就点「＋ 收进生词本」
    const have = new Set((typeof words !== "undefined" ? words : []).map(w => String(w.word || "").toLowerCase().trim()));
    const pool = opt.sugg && EXT && !opt.tags.length ? Object.keys(EXT.sugg).filter(w => !have.has(w) && !EXT.marks[w] && !EXT.saved.has(w)).sort((a, b) => (EXT.sugg[b].n || 1) - (EXT.sugg[a].n || 1) || (EXT.sugg[b].at || 0) - (EXT.sugg[a].at || 0)) : [];
    const sugg = pool.map(w => ({ id: "sg_" + w, word: w, zh: "", type: "word", sg: 1, examples: [[EXT.sugg[w].t, ""]] }));
    const extraL = live.filter(w => S[w.id] && S[w.id].at && !(S[w.id].due <= now)).sort((a, b) => rNow(S[a.id]) - rNow(S[b.id])); // 额外练习：还没到期、但现在最可能忘的
    // 按卡片张数凑「练习数量」：到期的 → 新词和建议（合起来不超过「新项目」的比例，这是上限）→ 额外练习（还没到期、最可能忘的）；
    // 都没有时（比如刚开始用、还没练过任何词）才不管比例，拿新词来练
    const N = opt.num, maxNew = Math.round(N * opt.newPct / 100), queue = [], used = new Set(); let total = 0, newC = 0;
    const take = (L, kind, capNew) => { for (const w of L) { if (total >= N) return; if (used.has(w.id)) continue; if (capNew && newC >= maxNew) return; const c = nCards(w); if (!c) continue; used.add(w.id); queue.push({ w, kind }); total += c; if (capNew) newC += c; } };
    take(due, "due"); take(fresh, "new", true); take(sugg, "sugg", true); take(extraL, "extra");
    if (!total) { take(fresh, "new"); take(sugg, "sugg"); }
    return { P, live, due, fresh, pool, queue, list: queue.map(q => q.w), n: Math.min(N, total), extra: queue.some(q => q.kind === "extra") };
  }
  // 一个词条的例句：词条自带的 examples（{目标词} 标出位置）；没有就用词条本身
  function sentences(w) { // 词条自带的例句（第一句通常是保存时的原句）
    const L = (w.examples || []).filter(x => Array.isArray(x) && x[0]).map(x => ({ en: String(x[0]), zh: String(x[1] || "") }));
    if (w.type === "sentence") L.unshift({ en: w.word, zh: w.zh || "" });
    return L.length ? L : [{ en: w.word, zh: w.zh || "" }];
  }
  function listenSet(w, n) { // 听力：词条例句 + 例句库，最近听过的往后排，挑 n 句
    const k = String(w.word || "").toLowerCase().trim(), own = ownSent(w); // 没有例句时词条会拿单词本身凑数：例句库有句子就不要它
    const all = own.concat((SENT[k] || []).map(x => ({ en: x.en, zh: x.zh }))).filter((x, i, a) => a.findIndex(y => y.en.toLowerCase() === x.en.toLowerCase()) === i);
    const h = heard[k] || [], score = x => { const i = h.indexOf(x.en); return i < 0 ? 0 : h.length - i; }; // 越近听过分越高，排越后
    const pick = all.map((x, i) => ({ x, r: score(x) * 10 + Math.random() + (x.orig ? -0.5 : 0) })).sort((a, b) => a.r - b.r).slice(0, n || PER).map(o => o.x);
    heard[k] = h.filter(e => !pick.some(p => p.en === e)).concat(pick.map(p => p.en)).slice(-12); LS("pump:heard", heard);
    return pick;
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
    const lrn = p.P.filter(w => S[w.id] && w.status !== "known").length, done = p.P.filter(w => w.status === "known").length;
    const rs = p.live.filter(w => S[w.id] && S[w.id].at).map(w => rNow(S[w.id])), avgR = rs.length ? Math.round(rs.reduce((a, x) => a + x, 0) / rs.length * 100) : 0;
    p.list.slice(0, 12).forEach(w => sentFor(w)); // 先把例句取回来
    const urgent = p.due.filter(w => Date.now() - S[w.id].due > DAY).length, n = p.n;
    const tg = (id, on, name, small) => '<label class="pp-row"><span>' + name + " <small>" + small + '</small></span><input type="checkbox" class="pp-tg" id="' + id + '"' + (on ? " checked" : "") + "></label>";
    const seg = (k, list, isOn, title) => '<div class="pp-row"' + (title ? ' title="' + title + '"' : "") + "><span>" + list.name + '</span><span class="pp-seg" data-k="' + k + '">' + list.items.map(([v, t]) => '<b data-v="' + esc(v) + '" class="' + (isOn(v) ? "on" : "") + '">' + esc(t) + "</b>").join("") + "</span></div>";
    const tags = EXT ? [...new Set(Object.values(EXT.tags))] : [];
    // 布局、文字、顺序同 PhrasePump：左边统计和开始，右边「会话」设置（测验 · 建议 · 练习 · 练习数量 · 新项目 · 筛选），我们自己加的放在后面
    root.innerHTML = '<div class="pp-home"><div class="pp-hc"><h2>🔊 <b>练习</b></h2>' +
      '<div class="pp-today"><span class="emo">' + emoji() + "</span>今天<b>" + day.n + ' 张卡片</b></div><div class="pp-bar"><i style="width:' + Math.min(100, day.n / Math.max(1, opt.num) * 100) + '%"></i></div>' +
      '<div class="pp-st"><div title="记得的概率已经降到 90% 以下、该复习的；「紧急」= 过期超过一天"><small>待复习</small><b>' + p.due.length + "</b><em>" + (urgent ? urgent + " 个紧急" : "") + '</em></div>' +
      '<div title="' + (rs.length ? "按遗忘曲线算，现在平均记得 " + avgR + "%" : "正在练的词") + '"><small>学习中</small><b>' + lrn + "</b><em>+" + p.fresh.length + ' 个排队中</em></div>' +
      '<div title="稳定度到了 60 天（两个月后还有九成把握记得），自动算已掌握"><small>已学习</small><b>' + done + "</b></div></div>" +
      '<div class="pp-go"><button id="pp-start"' + (n ? "" : " disabled") + ">开始练习</button><span>" + (n ? n + " 张卡片" : "现在没有要练的") + "</span></div>" +
      (p.queue.length ? '<div class="pp-next"><b>接下来</b> · 你的队列，然后是推荐' + '<div class="pp-q">' + p.queue.slice(0, 12).map(q => { const r = S[q.w.id]; return "<span" + (q.kind === "sugg" ? ' class="sg" title="推荐：从看过的视频里来的新词"' : r && r.at ? ' title="现在记得的概率"' : "") + ">" + esc(q.w.word) + (r && r.at ? " <i>" + Math.round(rNow(r) * 100) + "%</i>" : "") + "</span>"; }).join("") + "</div></div>" : "") + "</div>" +
      '<div class="pp-opt"><h4>会话</h4>' +
      tg("pp-quiz", opt.quiz, "测验", "填空题") +
      tg("pp-sugg", opt.sugg, "建议", "来自你看过的视频的新词（" + (p.pool ? p.pool.length : 0) + " 个）") +
      tg("pp-listen", opt.listen, "练习", "先理解再显示") +
      seg("num", { name: "练习数量", items: NUMS.map(v => [v, v]) }, v => +v === opt.num) +
      seg("newPct", { name: "新项目", items: NEWS.map(v => [v, v + " %"]) }, v => +v === opt.newPct, "这些卡片里新词最多占的比例") +
      (tags.length ? seg("tags", { name: "筛选", items: tags.map(t => [t, t]) }, v => opt.tags.includes(v)) : "") +
      '<h4 style="margin-top:14px">我们加的</h4>' +
      tg("pp-recall", opt.recall, "认词卡", "先看词回想意思，翻开后自己判断认不认识（原来的「背诵」「自测」）") +
      (opt.recall ? seg("dir", { name: "认词方向", items: [["en", "看英文想中文"], ["zh", "看中文想英文"]] }, v => opt.dir === v) : "") +
      seg("types", { name: "类型", items: [["word", "单词"], ["phrase", "短语"], ["sentence", "句子"], ["pattern", "规律"]] }, v => opt.types.includes(v)) +
      '<p class="pp-note">插件里的「复习」也打开这里，进度是同一份：在哪台设备练都算。「练习数量」是这一组的卡片张数；「新项目」是其中新词最多占的比例。每个词这一轮要么听 3 句例句（每次换着听），要么做 1 道填空。按遗忘曲线排复习：记得的概率降到 90% 时再练，越接近遗忘时练记得越久；两个月后还有九成把握记得，自动算「已掌握」。电脑上可以用键盘：A 上一个、S 重听、E 显示 / 翻开、D 下一个；认词卡翻开后按 1 不认识、2 认识。</p></div></div>';
    root.querySelector("#pp-start").onclick = start;
    root.querySelector("#pp-quiz").onchange = e => { opt.quiz = e.target.checked; if (!opt.quiz) opt.listen = true; LS("pump:opt", opt); home(); };
    root.querySelector("#pp-recall").onchange = e => { opt.recall = e.target.checked; LS("pump:opt", opt); home(); };
    root.querySelector("#pp-sugg").onchange = e => { opt.sugg = e.target.checked; LS("pump:opt", opt); home(); };
    root.querySelector("#pp-listen").onchange = e => { opt.listen = e.target.checked; if (!opt.listen) { opt.quiz = true; } LS("pump:opt", opt); home(); }; // 关了「练习」只做填空（同 PhrasePump），所以测验自动打开
    if (!EXT) medMap().then(() => { if (!playing && root.classList.contains("on")) home(); }); // 插件数据到了：刷新推荐生词、标签
    root.querySelectorAll(".pp-seg").forEach(g => g.onclick = e => { const b = e.target.closest("b"); if (!b) return; const k = g.dataset.k, v = b.dataset.v;
      if (k === "types") { opt.types = opt.types.includes(v) ? opt.types.filter(x => x !== v) : opt.types.concat(v); if (!opt.types.length) opt.types = ["word"]; } else if (k === "dir") opt.dir = v; else if (k === "tags") opt.tags = opt.tags.includes(v) ? opt.tags.filter(x => x !== v) : opt.tags.concat(v); else opt[k] = +v;
      LS("pump:opt", opt); home(); });
  }
  function start() {
    const p = plan(); if (!p.queue.length) return; const S = srs(); cards = []; at = 0; bad = 0; playing = true;
    medMap().then(() => { prefetch(0); const c = cards[at]; if (c && playing) medFor(c.w).then(() => { if (playing && cards[at] === c && medOf(c)) show(); }); }); // 原声截图在后台取，取到之前先用朗读；取到了重画当前卡片
    p.list.forEach(w => {
      const r = S[w.id], wasNew = !r, x0 = seen(r), sp = spec(w), base = { w, wasNew, x0, rev: 0 }; // x0：这一轮开始前练过几轮
      if (sp.quiz) { const o = sentences(w)[0]; cards.push(Object.assign({ s: { en: mark(o.en, w), zh: o.zh, orig: true }, i: 0, k: "quiz" }, base)); return; } // 一道填空，用保存时的原句
      if (sp.recall) cards.push(Object.assign({ s: { en: hasEn(w) ? w.word : "", zh: w.zh || "" }, i: -1, k: "recall" }, base)); // 认词卡
      (sp.listen ? listenSet(w, sp.listen) : []).forEach((x, i) => cards.push(Object.assign({ s: { en: mark(x.en, w), zh: x.zh, orig: x.orig }, i, k: "listen" }, base)));
    });
    cards = cards.slice(0, opt.num); // 正好「练习数量」张（同 PhrasePump）；最后一个词的卡不够一整组也照样算
    cards.forEach((c, i) => { c.last = !cards.slice(i + 1).some(x => x.w.id === c.w.id); });
    show();
  }
  function grade(c, ok) {
    if (c.done) return; c.done = true; c.ok = ok; day.n++; LS("pump:day", day); if (!ok) bad++;
    if (c.w.sg) return; // 推荐生词：还没收进生词本，不记进度
    const S = srs(), id = c.w.id, r = Object.assign({ n: 0 }, S[id]), now = Date.now();
    const lapsed = cards.some(x => x !== c && x.w.id === id && x.done && !x.ok); // 这一轮前面已经错过一张（已经按「忘了」算过）
    r.n++;
    if (!ok && !lapsed) { const m = review(S[id], 1); Object.assign(r, m, { at: now, due: now + RELEARN, b: 0 }); } // 忘了：稳定度变短，10 分钟后再来
    else if (ok && c.last && !lapsed) { const m = review(S[id], 3); Object.assign(r, m, { at: now, due: now + Math.max(1, interval(m.s)) * DAY, b: levelOf(m.s) }); r.x = (c.x0 || 0) + 1; if (m.s >= KNOWN_S) state.progress[id] = "known"; } // 这一轮都对：按遗忘曲线排下次
    else if (c.last && lapsed) r.x = (c.x0 || 0) + 1;
    S[id] = r; save(state);
  }

  // 人工翻译（视频自带）和机器翻译不一样时两行都给（同插件复习页的 H / M）
  const zhHtml = c => { const m = medOf(c), hu = m && m.hu ? String(m.hu).trim() : "", zh = String(c.s.zh || (m && m.tr) || "").trim(); return hu && zh && hu !== zh ? '<span class="hm">H</span>' + esc(hu) + '<br><span class="hm">M</span>' + esc(zh) : esc(hu || zh); };
  // 句子按词汇水平上色（和视频字幕、插件一样），目标词照旧带框
  function colorEn(c) {
    const V = window.__vs; if (!V) return; if (!V.ready()) { V.load().then(() => { if (cards[at] === c && playing) colorEn(c); }); return; }
    const el = root.querySelector("#pp-en"); if (!el) return; const h = V.html(plain(c.s.en)); if (!h) return;
    const pre = (c.s.en.split("{")[0].match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || []).length, m = c.s.en.match(/\{([^}]+)\}/), len = m ? (m[1].match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || []).length : 0;
    el.innerHTML = h; const ws = el.querySelectorAll(".vs-w"); for (let i = pre; i < pre + len && i < ws.length; i++) ws[i].classList.add("t");
  }
  // 推荐生词收进生词本：查释义生成词条（同网站视频页），并告诉插件「将要学习」
  async function addSugg(c) {
    const w = c.w.word, id = "v_" + w.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""), sg = EXT.sugg[w] || {};
    let zh = ""; try { const j = await (await fetch("https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&dt=bd&q=" + encodeURIComponent(w))).json(); const L = []; const add = x => { x = String(x || "").trim(); if (x && x.toLowerCase() !== w && !L.includes(x)) L.push(x); }; add((j[0] || []).map(x => x[0]).join("")); (j[1] || []).forEach(e => (e[1] || []).slice(0, 3).forEach(add)); zh = L.slice(0, 4).join("；"); } catch (e) {}
    const ex = sg.t ? [[String(sg.t).replace(new RegExp("\\b(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")\\b", "i"), "{$1}"), ""]] : [];
    try { state.custom = state.custom || []; if (!state.custom.some(x => x && (x.id === id || String(x.word || "").toLowerCase() === w))) state.custom.push({ id, type: "word", word: w, phon: "", en: "", zh: zh || "(未查到，可手动补)", tag: "视频", date: new Date().toISOString().slice(0, 10), forms: [], examples: ex, tip: "" }); if (typeof refresh === "function") refresh(); save(state); } catch (e) { toast("收进生词本失败"); return; }
    EXT.saved.add(w); c.w.added = true; cards.forEach(x => { if (x.w.word === w) x.w.added = true; });
    try { await fetch("/api/ext", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes: { ["saved|" + w]: { v: w, at: Date.now() } } }) }); } catch (e) {}
    toast("已收进生词本：" + w); show();
  }
  const say = c => { try { if (player) { player.pause(); player = null; } const m = medOf(c); if (m && m.aud) { try { speechSynthesis.cancel(); } catch (e) {} player = new Audio(m.aud); player.play().catch(() => speak(plain(c.s.en))); return; } speak(plain(c.s.en)); } catch (e) {} };
  const imgs = c => { const m = medOf(c), L = m ? [m.img, m.img2].filter(Boolean) : []; return L.length ? '<div class="pp-img">' + L.map(u => '<img src="' + esc(u) + '" alt="">').join("") + "</div>" : ""; };
  function show() {
    if (at >= cards.length) return finish();
    const c = cards[at], pct = (at + 1) / cards.length * 100; prefetch(at);
    if (MED && MED[String(c.w.word || "").toLowerCase().trim()] && !(MED[String(c.w.word).toLowerCase().trim()] in medRec)) medFor(c.w).then(() => { if (cards[at] === c && medOf(c)) show(); }); // 原声截图到了：重画这张卡片
    const top = '<div class="pp-top"><button id="pp-back">← 返回</button><div class="pp-bar"><i style="width:' + pct + '%"></i></div><span>' + (at + 1) + "/" + cards.length + "</span></div>";
    const ctl = (k) => '<div class="pp-ctl"><div><button id="pp-a" title="上一个"' + (at ? "" : " disabled") + '>‹</button><kbd>A</kbd></div><div><button id="pp-s" title="重听">↻</button><kbd>S</kbd></div><div><button id="pp-e" title="' + (k === "quiz" ? "看答案（算没答对）" : k === "recall" ? "翻开" : "显示") + '"' + ((k === "listen" && c.rev >= 2) || (k === "quiz" && c.done) || (k === "recall" && c.flip) ? " disabled" : "") + '>👁</button><kbd>E</kbd></div><div><button id="pp-d" class="pri" title="下一个">›</button><kbd>D</kbd></div></div>';
    const def = c.w.zh ? '<div class="pp-def' + (c.k === "listen" && c.rev < 2 ? " hid" : "") + '">' + esc(c.w.word) + "：" + esc(c.w.zh) + "</div>" : "";
    if (c.k === "recall") {
      const w = c.w, zhFirst = opt.dir === "zh" && w.zh, big = t => '<div class="rc-w' + (String(t).length > 24 ? " long" : "") + '">' + t + "</div>";
      const front = zhFirst ? big(esc(w.zh)) + '<div class="rc-q">想一想英文怎么说</div>' : big(esc(plain(w.word))) + (w.phon ? '<div class="rc-p">' + esc(w.phon) + "</div>" : "") + '<div class="rc-q">想一想是什么意思</div>';
      const ex = (w.examples || []).filter(x => Array.isArray(x) && x[0]).slice(0, 2), fm = (w.forms || []).slice(0, 6);
      const back = big(esc(plain(w.word))) + (w.phon ? '<div class="rc-p">' + esc(w.phon) + "</div>" : "") + '<div class="rc-zh">' + esc(w.zh || "") + "</div>" + (w.en ? '<div class="rc-en">' + esc(w.en) + "</div>" : "") +
        (fm.length ? '<div class="rc-fm">' + fm.map(x => "<div><b>" + esc(x[0]) + "</b> <span>" + esc(x[1] || "") + "</span> " + esc(x[2] || "") + "</div>").join("") + "</div>" : "") +
        (ex.length ? '<div class="rc-ex">' + ex.map(x => "<div>" + html(String(x[0])) + "<span>" + esc(x[1] || "") + "</span></div>").join("") + "</div>" : "") + (w.tip ? '<div class="rc-tip">🧠 ' + esc(w.tip) + "</div>" : "");
      root.innerHTML = top + '<div class="pp-hint"><b>🃏 认词</b>' + (c.flip ? (c.done ? (c.ok ? "认识 ✓" : "不认识，10 分钟后再出现") : "认识吗？自己判断，按 D 算认识") : "先回想，再点卡片或按 E 翻开") + '</div><div class="pp-card pp-rc' + (c.flip ? " back" : "") + '" id="pp-rc"><button class="pl" id="pp-pl" title="朗读">▶</button><button class="cp" id="pp-cp">复制</button>' + (c.flip ? back : front) + "</div>" +
        (c.flip && !c.done ? '<div class="pp-rcb"><button id="pp-no">✗ 不认识</button><button id="pp-yes">✓ 认识</button></div>' : "") + ctl("recall");
      root.querySelector("#pp-rc").onclick = e => { if (e.target.closest("button")) return; flip(c); };
      if (c.flip && !c.done) { root.querySelector("#pp-no").onclick = () => { grade(c, false); go(1); }; root.querySelector("#pp-yes").onclick = () => { grade(c, true); go(1); }; }
    } else if (c.k === "listen") {
      root.innerHTML = top + '<div class="pp-hint"><b>🔊 听力练习</b>在显示文字之前试着听懂。</div><div class="pp-card"><button class="pl" id="pp-pl" title="播放">▶</button><button class="cp" id="pp-cp">复制</button>' + imgs(c) +
        '<div class="pp-en' + (c.rev < 1 ? " hid" : "") + '" id="pp-en">' + html(c.s.en) + '</div><div class="pp-zh' + (c.rev < 2 ? " hid" : "") + '" id="pp-zh">' + zhHtml(c) + "</div>" + def + (c.w.sg ? '<div class="pp-sg">💡 推荐生词：在看过的视频里出现，还没收进生词本 <button id="pp-add"' + (c.w.added ? " disabled" : "") + ">" + (c.w.added ? "已收进生词本" : "＋ 收进生词本") + "</button></div>" : "") + '<span class="pp-chip">' + esc(c.w.word) + "</span></div>" + ctl("listen");
      if (!c.spoken) { c.spoken = true; c.medSaid = !!medOf(c); say(c); } else if (medOf(c) && !c.medSaid) { c.medSaid = true; say(c); } // 原声晚到：用原声再放一遍
      root.querySelector("#pp-en").onclick = root.querySelector("#pp-zh").onclick = () => reveal(c);
      colorEn(c); const ad = root.querySelector("#pp-add"); if (ad) ad.onclick = e => { e.stopPropagation(); addSugg(c); };
    } else {
      const m = c.s.en.match(/\{([^}]+)\}/), ans = m ? m[1] : "", parts = c.s.en.split(/\{[^}]+\}/);
      root.innerHTML = top + '<div class="pp-hint"><b>✏️ 测验</b>填空：输入句子里缺少的词，按回车检查。</div><div class="pp-card"><button class="pl" id="pp-pl" title="播放（会念出答案）">▶</button><button class="cp" id="pp-cp">复制</button>' + imgs(c) +
        '<div class="pp-en">' + esc(parts[0]) + '<input id="pp-in" autocomplete="off" autocapitalize="off" spellcheck="false" size="' + Math.max(4, ans.length + 1) + '"' + (c.done ? ' disabled value="' + esc(c.typed || "") + '" class="' + (c.ok ? "ok" : "no") + '"' : "") + ">" + esc(parts.slice(1).join("")) + '</div><div class="pp-zh">' + esc(c.s.zh) + '</div><div class="pp-ans' + (c.done && !c.ok ? " no" : "") + '">' + (c.done ? (c.ok ? "正确" : "答案：" + esc(ans)) : "") + "</div>" + (c.done ? def + '<span class="pp-chip">' + esc(c.w.word) + "</span>" : "") + "</div>" + ctl("quiz");
      const inp = root.querySelector("#pp-in"); if (!c.done) setTimeout(() => inp.focus(), 30);
      c.check = give => { if (c.done) return; c.typed = inp.value.trim(); const ok = !give && c.typed.toLowerCase().replace(/’/g, "'") === ans.toLowerCase().replace(/’/g, "'"); grade(c, ok); show(); say(c); };
      inp.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); if (c.done) go(1); else if (inp.value.trim()) c.check(false); } };
    }
    root.querySelector("#pp-back").onclick = () => { try { speechSynthesis.cancel(); if (player) player.pause(); } catch (e) {} home(); };
    root.querySelector("#pp-pl").onclick = root.querySelector("#pp-s").onclick = () => say(c);
    root.querySelector("#pp-cp").onclick = () => { const t = plain(c.s.en); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast("已复制"), () => toast("复制失败")); };
    root.querySelector("#pp-a").onclick = () => go(-1); root.querySelector("#pp-d").onclick = () => go(1);
    root.querySelector("#pp-e").onclick = () => (c.k === "listen" ? reveal(c) : c.k === "recall" ? flip(c) : c.check(true));
  }
  function flip(c) { if (c.flip) return; c.flip = true; show(); if (c.s.en) say(c); } // 翻开认词卡，顺便念一下
  function reveal(c) { if (c.k !== "listen") return; c.rev = Math.min(2, c.rev + 1); show(); }
  function go(d) {
    const c = cards[at]; if (!c) return;
    if (d > 0 && c.k === "recall" && !c.done) { if (!c.flip) { flip(c); return; } grade(c, true); } // 认词卡：没翻开先翻开；翻开了按「下一个」算认识
    else if (d > 0) { if (c.k === "listen") grade(c, true); else if (!c.done) { const inp = root.querySelector("#pp-in"); if (inp && inp.value.trim()) { c.check(false); return; } grade(c, false); } }
    try { speechSynthesis.cancel(); } catch (e) {} at = Math.max(0, at + d); show();
  }
  function finish() {
    playing = false;
    root.innerHTML = '<div class="pp-card pp-done"><h3>这一组练完了 ' + emoji() + "</h3><p>今天一共练了 " + day.n + " 张卡片" + (bad ? "，有 " + bad + " 张没答对或不认识" : "") + '</p><p style="font-size:13px">没答对的词 10 分钟后再出现；其余按遗忘曲线算：记得的概率降到 90% 时再来，记得越牢，间隔越长。</p><button id="pp-home">返回</button></div>';
    root.querySelector("#pp-home").onclick = home;
  }
  document.addEventListener("keydown", e => {
    if (!playing || !root || !root.classList.contains("on") || e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const c = cards[at]; if (!c) return; const k = e.key.toLowerCase();
    if (k === "d" || k === "arrowright") go(1); else if (k === "a" || k === "arrowleft") { if (at) go(-1); } else if (k === "s" || k === "arrowdown" || k === " ") say(c); else if (k === "e") { if (c.k === "listen") reveal(c); else if (c.k === "recall") flip(c); else c.check(true); } else if (c.k === "recall" && c.flip && !c.done && (k === "1" || k === "2")) { grade(c, k === "2"); go(1); } else return;
    e.preventDefault();
  });
  window.pumpShow = () => { if (!playing) home(); };
  window.pumpRefresh = () => { if (root && root.classList.contains("on") && !playing) home(); };
  function init() {
    root = document.getElementById("pump"); if (!root) return;
    const st = document.createElement("style"); st.textContent = CSS; document.head.append(st);
    // 生词本的模式：新加的「⭐ 已保存」排最前，第一次打开默认进它；之后记住上次选的模式
    // ?go=pump / ?go=saved：插件里的「复习」「已保存」按钮直接打开这里
    let m = "saved"; try { m = localStorage.getItem("vocab_mode") || "saved"; } catch (e) {}
    if (m === "flash" || m === "test") m = "pump"; // 「背诵」「自测」已并进练习的认词卡
    const go = new URLSearchParams(location.search).get("go");
    if (go && /^(saved|pump|list)$/.test(go)) { m = go; try { history.replaceState(null, "", location.pathname); localStorage.setItem("wt:tab", "0"); } catch (e) {} const l1 = document.getElementById("l1-en"), nb = document.getElementById("tab-notebook"); if (l1) l1.click(); if (nb) nb.click(); }
    const b = document.querySelector('.modes button[data-mode="' + m + '"]') || document.querySelector('.modes button[data-mode="saved"]');
    if (b && !document.documentElement.classList.contains("collect-mode")) b.click();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
