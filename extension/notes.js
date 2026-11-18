// 学习注释：句子级（习语 / 短语动词 / 搭配 / 口语缩略 / 语气词 / 连读）和单词级（原形、易混、语域、可数性、英美、缩写、不发音、重音、近义、高级替换、词根词缀、难度）
// 数据在 data-phrases.js、data-words.js、data-morph.js；这里只负责匹配和拼 HTML。数据文件缺了也不报错。
(function () {
  var G = function (n) { return typeof window[n] !== "undefined" ? window[n] : null; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var reEsc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); };
  var norm = function (w) { return String(w).toLowerCase().replace(/[’‘]/g, "'"); };

  // ---------- 句子级 ----------
  var PH = null, LK = null, FL = null;
  function tokRe(spec) { // "turn|turns * off" → 正则；每个实词一个捕获组（用来高亮）
    var parts = spec.trim().split(/\s+/), out = "";
    parts.forEach(function (t, i) {
      if (t === "*") { out += "(?:\\S+\\s){1,3}?"; return; }
      out += "(" + t.split("|").map(reEsc).join("|") + ")" + (i < parts.length - 1 ? "\\s" : "");
    });
    return new RegExp("(?:^|\\s)" + out + "(?=\\s|$)", "d");
  }
  function compile() {
    if (PH) return;
    PH = []; LK = []; FL = [];
    var KIND = { idiom: ["🧩", "习语", "k-idiom"], phrasal: ["🔗", "短语动词", "k-phv"], colloc: ["🤝", "搭配", "k-col"] };
    (G("VS_PHRASES") || []).forEach(function (r) { try { var k = KIND[r[1]] || KIND.idiom; PH.push({ re: tokRe(r[0]), name: r[0].split(" ").map(function (t) { return t === "*" ? "…" : t.split("|")[0]; }).join(" "), zh: r[2], tip: (k[1] + "。") + (r[3] || ""), ex: r[4], icon: k[0], cls: k[2], grp: "n_phrase" }); } catch (e) {} });
    (G("VS_LINK") || []).forEach(function (r) { try { LK.push({ re: tokRe(r[0]), name: r[0] + " → " + r[1], zh: "连读", tip: r[2] || "", icon: "🔊", cls: "k-link", grp: "n_link" }); } catch (e) {} });
    (G("VS_FILLER") || []).forEach(function (r) { var multi = /\s/.test(r[0]); try { FL.push({ re: tokRe(r[0]), multi: multi, w: r[0], name: r[0], zh: "语气词", tip: r[1] || "", icon: "💭", cls: "k-fill", grp: "n_spoken" }); } catch (e) {} });
  }
  // words：字幕单词数组；raw：原文；S：设置。返回 [{icon,cls,name,zh,tip,ex,keys}]
  // taken：已被句型标签占用的词序号，避免同一处重复出标签
  window.vsSentNotes = function (words, raw, S, max, taken) {
    S = S || {}; compile();
    var toks = words.map(norm), text = toks.join(" "), starts = [], o = 0, out = [], used = {};
    (taken || []).forEach(function (k) { used[k] = 1; });
    toks.forEach(function (t) { starts.push(o); o += t.length + 1; });
    var tokAt = function (c) { var lo = 0, hi = starts.length - 1; while (lo < hi) { var m = (lo + hi + 1) >> 1; if (starts[m] <= c) lo = m; else hi = m - 1; } return lo; };
    var rawL = norm(raw || "");
    function hit(n, m) {
      var keys = [];
      for (var g = 1; g < m.length; g++) { if (!m.indices[g]) continue; var a = tokAt(m.indices[g][0]), b = tokAt(Math.max(m.indices[g][0], m.indices[g][1] - 1)); for (var k = a; k <= b; k++) if (keys.indexOf(k) < 0) keys.push(k); }
      if (!keys.length || keys.every(function (k) { return used[k]; })) return;
      keys.forEach(function (k) { used[k] = 1; });
      out.push({ icon: n.icon, cls: n.cls, name: n.name, zh: n.zh, tip: n.tip, ex: n.ex, keys: keys });
    }
    if (S.n_phrase !== false) PH.forEach(function (n) { if (out.length < 6) { var m = n.re.exec(text); if (m) hit(n, m); } });
    if (S.n_spoken !== false) {
      var RD = G("VS_REDUCE") || {};
      toks.forEach(function (t, i) { var r = RD[t]; if (r && !used[i] && out.length < 8) { used[i] = 1; out.push({ icon: "💬", cls: "k-red", name: words[i] + " = " + r[0], zh: r[1] || "口语缩略", tip: "口语缩略 / 非标准写法，标准形式是 " + r[0] + "。听得懂就行，正式写作别用。", keys: [i] }); } });
      FL.forEach(function (n) {
        var m = n.re.exec(text); if (!m) return;
        // 语气词只在被逗号隔开、或在句首 / 句尾单独成段时才算（Did you see that 里的 you see 不算）
        var i0 = tokAt(m.indices[1][0]), w = reEsc(n.w).replace(/\\ /g, "\\s+").replace(/ /g, "\\s+"), q = "[\\s\"“”'‘’]*";
        var ok = /^(um|uh|uhm|er|erm|hmm|mm|oh|ah)$/.test(n.w)
          || new RegExp("(^|[,;.!?…—–-])" + q + w + q + "([,;.!?…—–-]|$)").test(rawL)
          || (i0 === 0 && !n.multi && /^(so|well|anyway|okay|ok|basically|actually)$/.test(n.w));
        if (!ok) return;
        hit(n, m);
      });
    }
    if (S.n_link !== false) LK.forEach(function (n) { var m = n.re.exec(text); if (m) hit(n, m); });
    return out.slice(0, max || 4);
  };

  // ---------- 单词级 ----------
  var SYNIDX = null;
  function synOf(k) {
    var L = G("VS_SYN"); if (!L) return null;
    if (!SYNIDX) { SYNIDX = {}; L.forEach(function (g, i) { (g[0] || []).forEach(function (w) { SYNIDX[w] = i; }); }); }
    var i = SYNIDX[k]; return i === undefined ? null : L[i];
  }
  function lemmaOf(w) {
    var k = norm(w), irr = G("VS_IRR"), lm = (irr && irr[k]) || (typeof vsLemma === "function" ? vsLemma(k) : k);
    return lm || k;
  }
  function formName(w, lm) {
    var irr = G("VS_IRR");
    if (/ing$/.test(w)) return "-ing 形式";
    if (irr && irr[w]) return /^(was|were)$/.test(w) ? "be 的过去式" : "不规则变化";
    if (/ied$|ed$/.test(w)) return "过去式 / 过去分词";
    if (/est$/.test(w)) return "最高级";
    if (/er$/.test(w) && !/er$/.test(lm)) return "比较级";
    if (/s$/.test(w)) return "复数 或 第三人称单数";
    return "变形";
  }
  function morph(k) { // 拆词根词缀：返回 "un- 不 · believ · -able 能…的"；拆不出两部分就返回空
    if (k.length < 6 || !/^[a-z]+$/.test(k)) return "";
    var P = G("VS_PREFIX") || [], Sx = G("VS_SUFFIX") || [], R = G("VS_ROOT") || [], pre = null, suf = null, rest = k;
    for (var i = 0; i < P.length; i++) { var p = P[i][0]; if (rest.indexOf(p) === 0 && rest.length - p.length >= 3) { pre = P[i]; rest = rest.slice(p.length); break; } }
    for (var j = 0; j < Sx.length; j++) { var s = Sx[j][0]; if (rest.length - s.length >= 3 && rest.slice(-s.length) === s) { suf = Sx[j]; rest = rest.slice(0, -s.length); break; } }
    var root = null; for (var r = 0; r < R.length; r++) { if (R[r][0].length >= 3 && rest.indexOf(R[r][0]) >= 0) { root = R[r]; break; } }
    var n = (pre ? 1 : 0) + (suf ? 1 : 0) + (root ? 1 : 0); if (n < 2) return "";
    return [pre ? "<b>" + esc(pre[0]) + "-</b> " + esc(pre[1]) : "", root ? "<b>" + esc(rest) + "</b> " + esc(root[1]) : "<b>" + esc(rest) + "</b>", suf ? "<b>-" + esc(suf[0]) + "</b> " + esc(suf[1]) : ""].filter(Boolean).join(" · ");
  }
  function cefr(lm) {
    if (typeof vsRank !== "function") return "";
    var r = vsRank(lm); if (!r || r === Infinity) return "C2 以上（生僻）";
    return r <= 600 ? "A1 入门" : r <= 1500 ? "A2 基础" : r <= 3000 ? "B1 中级" : r <= 6000 ? "B2 中高级" : r <= 12000 ? "C1 高级" : "C2 精通";
  }
  // 返回单词的注释 HTML；compact = 悬停小窗（只给最重要的 3 条）
  window.vsWordNotesHtml = function (word, compact) {
    if (!word || /\s/.test(word)) return "";
    var w = norm(word), lm = lemmaOf(w), rows = [];
    var get = function (n, k) { var t = G(n); return t && (t[k] !== undefined ? t[k] : (k !== lm && t[lm] !== undefined ? t[lm] : undefined)); };
    var add = function (lab, html, cls) { rows.push('<div class="vs-wn' + (cls ? " " + cls : "") + '"><i>' + lab + "</i><span>" + html + "</span></div>"); };
    if (lm && lm !== w) add("原形", "<b>" + esc(lm) + "</b>（" + formName(w, lm) + "）");
    var v;
    if ((v = get("VS_REDUCE", w))) add("口语", esc(word) + " = <b>" + esc(v[0]) + "</b> " + esc(v[1] || ""), "warn");
    if ((v = get("VS_CONFUSE", w))) add("易混", esc(v), "warn");
    if ((v = get("VS_REGISTER", w))) add(esc(v[0]), esc(v[1] || ""), /粗口|冒犯/.test(v[0]) ? "bad" : "");
    if ((v = get("VS_UNCOUNT", w))) add("可数性", esc(v));
    if ((v = get("VS_ABBR", w))) add("缩写", esc(v));
    if ((v = get("VS_BRAM", w))) add("英美", esc(v));
    if ((v = get("VS_SILENT", w))) add("发音", esc(v));
    if ((v = get("VS_STRESS", w))) add("重音", esc(v));
    if (!compact) {
      if ((v = get("VS_WEAK", w))) add("弱读", esc(v));
      var sg = synOf(lm) || synOf(w); if (sg) add("近义", sg[0].map(function (x) { return x === lm || x === w ? "<b>" + esc(x) + "</b>" : esc(x); }).join(" / ") + "<br>" + esc(sg[1]));
      if ((v = get("VS_UPGRADE", w))) add("高级替换", esc(v));
      var rk = typeof vsRank === "function" ? vsRank(lm) : Infinity, mp = rk > 3000 ? morph(lm) : ""; if (mp) add("构词", mp + '<br><span style="opacity:.7">按词根词缀拆分，仅供参考</span>'); // 常用词的词源拆法常和现在的意思对不上，只给难词
      var lv = /^[A-Z][a-z]/.test(word) && !(G("VS_RANK") && G("VS_RANK")[w]) ? "" : cefr(lm); if (lv) add("难度", lv + "（按词频估计）", "dim");
      if (/^[A-Z][a-z]/.test(word) && !(G("VS_RANK") && G("VS_RANK")[w] && G("VS_RANK")[w] < 8000)) add("专有名词?", '<a target="_blank" rel="noopener" href="https://zh.wikipedia.org/wiki/Special:Search?search=' + encodeURIComponent(word) + '">在维基百科查「' + esc(word) + "」</a>");
    }
    if (!rows.length) return "";
    return '<div class="vs-wns' + (compact ? " c" : "") + '">' + (compact ? rows.slice(0, 3) : rows).join("") + "</div>";
  };
})();
