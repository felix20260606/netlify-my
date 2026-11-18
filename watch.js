/* 看视频学英语：嵌入 YouTube 播放器 + 同步双语字幕 + 点词查词 + 一键加入生词本
   字幕来自电脑上的浏览器扩展（看过的视频自动同步到 /.netlify/functions/cap）。
   依赖 index.html 里的全局：state / words / refresh / save / speak / toast */
(function () {
  "use strict";
  const API = "/.netlify/functions/cap";
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const fmt = t => { t = Math.max(0, Math.floor(t)); const m = Math.floor(t / 60), s = t % 60; return (m >= 60 ? Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0"); };
  const WORD = /[A-Za-z][A-Za-z'’-]*/g;
  const tip = m => { try { toast(m); } catch (e) {} };

  let set = Object.assign({ autoPause: false, hideTr: false, rate: 1 }, LS.get("wt:set", {}));
  let doc = null, cues = [], cur = -1, player = null, ready = false, timer = null, pausedFor = -1, lock = false, follow = true, userScroll = 0, apiP = null, sheetWord = "";

  /* 书签小工具：在 YouTube 页面里读出正在显示的字幕，存到本站，再跳回来学习（手机上不依赖电脑） */
  const BM_SRC = "(function(){ var K=\"__KEY__\",S=\"__SITE__\",D=document,L=location; if(!/(^|\\.)youtube\\.com$/.test(L.hostname)){alert(\"请先在 Safari 里打开 YouTube 的视频页，再点这个书签\");return;} var m=L.href.match(/[?&]v=([\\w-]{11})/)||L.href.match(/\\/shorts\\/([\\w-]{11})/); if(!m){alert(\"请先打开一个 YouTube 视频，再点这个书签\");return;} var v=m[1],p=D.getElementById(\"movie_player\")||D.querySelector(\".html5-video-player\"),done=false,hit=false; var box=D.createElement(\"div\");box.style.cssText=\"position:fixed;left:12px;right:12px;top:12px;z-index:2147483647;background:#0c9370;color:#fff;font:600 15px/1.4 system-ui;padding:12px 14px;border-radius:12px;text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.35)\"; var say=function(t){box.textContent=t;if(!box.parentNode)D.body.appendChild(box);}; say(\"正在读取字幕…\"); function parse(t){var j=JSON.parse(t),c=[],i,e,s;for(i=0;i<(j.events||[]).length;i++){e=j.events[i];if(!e.segs)continue;s=e.segs.map(function(x){return x.utf8||\"\"}).join(\"\").replace(/\\s+/g,\" \").trim();if(!s)continue;c.push({s:(e.tStartMs||0)/1000,e:((e.tStartMs||0)+(e.dDurationMs||0))/1000,t:s});} for(i=0;i<c.length-1;i++)if(c[i].e>c[i+1].s)c[i].e=c[i+1].s;return c.filter(function(x){return x.e>x.s});} function send(c,lang){if(done||!c.length)return;done=true;hit=true;say(\"拿到 \"+c.length+\" 句字幕，正在保存…\");var a=\"\";try{a=p.getVideoData().author||\"\"}catch(e){} F.call(window,S+\"/.netlify/functions/cap\",{method:\"POST\",headers:{\"Content-Type\":\"application/json\",\"X-Key\":K},body:JSON.stringify({v:v,title:D.title.replace(/^\\(\\d+\\)\\s*/,\"\").replace(/ - YouTube$/,\"\"),author:a,lang:lang||\"en\",cues:c})}).then(function(r){return r.json()}).then(function(r){if(r&&r.ok){say(\"已保存，正在打开学习页…\");L.href=S+\"/?v=\"+v;}else{done=false;say(\"保存失败：\"+((r&&r.error)||\"未知错误\"));}}).catch(function(){done=false;say(\"保存失败：网络问题，请再点一次书签\");});} var F=window.fetch,O=XMLHttpRequest.prototype.open,seen={}; function grab(u){if(done||!/\\/api\\/timedtext/.test(u))return;var a;try{a=new URL(u,L.href)}catch(e){return}if(a.searchParams.get(\"v\")&&a.searchParams.get(\"v\")!==v)return;a.searchParams.delete(\"tlang\");a.searchParams.set(\"fmt\",\"json3\");var k=a.href;if(seen[k])return;seen[k]=1;F.call(window,k).then(function(r){return r.ok?r.text():\"\"}).then(function(t){if(t)send(parse(t),a.searchParams.get(\"lang\"))}).catch(function(){seen[k]=0});} XMLHttpRequest.prototype.open=function(a,u){try{grab(String(u))}catch(e){}return O.apply(this,arguments);}; window.fetch=function(i){try{grab(String(typeof i===\"string\"?i:(i&&i.url)||\"\"))}catch(e){}return F.apply(this,arguments);}; var scan=function(){if(done)return;var es=performance.getEntriesByType(\"resource\"),i;for(i=es.length-1;i>=0;i--)grab(es[i].name);}; var kick=function(){if(done||!p)return;try{p.loadModule&&p.loadModule(\"captions\");var tl=p.getOption(\"captions\",\"tracklist\")||[],en=tl.filter(function(x){return /^en/.test(x.languageCode)}),tr=en.filter(function(x){return x.kind!==\"asr\"})[0]||en[0]||tl[0];p.setOption(\"captions\",\"track\",{});if(tr)setTimeout(function(){try{p.setOption(\"captions\",\"track\",{languageCode:tr.languageCode})}catch(e){}},350);else if(p.toggleSubtitlesOn)p.toggleSubtitlesOn();}catch(e){}}; scan();setTimeout(function(){if(!done)kick()},1200);setTimeout(kick,4000);setTimeout(kick,7500);var iv=setInterval(function(){if(done)clearInterval(iv);else scan()},700);setTimeout(function(){clearInterval(iv)},11000); setTimeout(function(){if(!hit)say(\"没拿到字幕：这个视频可能没有字幕。请先点一下播放，再点一次书签试试\");setTimeout(function(){if(!hit&&box.parentNode)box.parentNode.removeChild(box)},6000);},11000); })();";
  const bookmarklet = () => { let k = ""; try { k = SYNC_KEY; } catch (e) {} return "javascript:" + encodeURIComponent(BM_SRC.replace("__KEY__", () => k).replace("__SITE__", () => location.origin)); };
  /* ---------- 样式 ---------- */
  const css = `
  #view-video{display:none;padding-top:calc(56px + env(safe-area-inset-top,0px))}
  html.show-video #view-video{display:block}
  html.show-video #view-en,html.show-video #view-fat,html.show-video #view-trip,html.show-video #view-ielts,html.show-video #subtabs{display:none!important}
  html.show-video body{padding-bottom:0}
  #apptabs .seg-wrap.three{max-width:460px}
  #view-video .wrap{max-width:620px;margin:0 auto;padding:0 14px}
  #watch{padding-top:12px}
  .wt-open{display:flex;gap:8px}
  .wt-open input{flex:1;min-width:0;border:1px solid var(--line);background:var(--paper);border-radius:12px;padding:11px 12px;font:inherit;font-size:16px;color:var(--ink)}
  .wt-btn{border:0;border-radius:12px;background:var(--jade);color:#fff;font:inherit;font-weight:700;font-size:14px;padding:0 16px;min-height:44px;cursor:pointer}
  .wt-hint{color:var(--muted);font-size:13px;margin:10px 2px 14px;line-height:1.6}
  .wt-item{display:flex;gap:12px;align-items:center;background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:8px;margin-bottom:10px;cursor:pointer}
  .wt-item img{width:112px;aspect-ratio:16/9;object-fit:cover;border-radius:9px;background:var(--paper-2);flex:none}
  .wt-item b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:14.5px;line-height:1.35}
  .wt-item span{display:block;color:var(--muted);font-size:12px;margin-top:4px}
  .wt-bm{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:0 14px;margin-bottom:12px;font-size:14px;line-height:1.6}
  .wt-bm summary{cursor:pointer;font-weight:700;padding:12px 0;min-height:44px;list-style-position:inside}
  .wt-bm ol{margin:0 0 10px;padding-left:20px}.wt-bm li{margin-bottom:6px}.wt-bm p{color:var(--muted);font-size:13px;margin:10px 0 14px}
  .wt-bma{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .wt-bml{display:inline-flex;align-items:center;min-height:44px;padding:0 14px;border:1px dashed var(--jade);border-radius:12px;color:var(--jade);font-weight:700;text-decoration:none;cursor:grab}
  .wt-empty{text-align:center;color:var(--muted);padding:28px 10px;font-size:14px;line-height:1.7}
  .wt-play{display:none;flex-direction:column;min-height:420px}
  #watch.playing .wt-home{display:none}#watch.playing .wt-play{display:flex}
  .wt-bar{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex:none}
  .wt-bar button{border:1px solid var(--line);background:var(--paper);border-radius:10px;min-width:44px;min-height:40px;font:inherit;font-size:14px;color:var(--ink);cursor:pointer}
  .wt-bar b{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px}
  .wt-video{position:relative;width:100%;aspect-ratio:16/9;background:#000;border-radius:12px;overflow:hidden;flex:none}
  .wt-video iframe,.wt-video>div{position:absolute;inset:0;width:100%;height:100%;border:0}
  .wt-sub{flex:none;background:#14181d;color:#fff;border-radius:12px;margin-top:8px;padding:10px 12px;min-height:76px;text-align:center}
  .wt-sub .en{font-size:19px;font-weight:700;line-height:1.4}
  .wt-sub .zh{font-size:15px;color:#c9d1d9;margin-top:4px;line-height:1.4;transition:filter .15s}
  .wt-sub.hide .zh{filter:blur(7px);cursor:pointer}.wt-sub.hide .zh.rv{filter:none}
  .wt-sub .none{color:#8b949e;font-size:14px;font-weight:400}
  .wt-w{cursor:pointer;border-radius:3px;padding:0 1px}.wt-w:active{background:rgba(255,255,255,.2)}
  .wt-w.lr{color:#FFBD80}.wt-w.kn{color:#9CFFCD}
  .wt-list .wt-w.lr{color:#c9741f}.wt-list .wt-w.kn{color:#0c9370}
  .wt-ctl{display:flex;gap:6px;margin-top:8px;flex:none}
  .wt-ctl button{flex:1;min-width:0;min-height:44px;border:1px solid var(--line);background:var(--paper);border-radius:11px;font:inherit;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer;padding:0 2px;white-space:nowrap}
  .wt-ctl button.on{background:var(--jade);border-color:var(--jade);color:#fff}
  .wt-list{flex:1 1 auto;min-height:120px;overflow-y:auto;-webkit-overflow-scrolling:touch;margin-top:8px;border:1px solid var(--line);border-radius:12px;background:var(--paper);position:relative}
  .wt-row{padding:9px 12px 9px 46px;border-bottom:1px solid var(--line);position:relative;cursor:pointer;font-size:15.5px;line-height:1.45}
  .wt-row i{position:absolute;left:10px;top:11px;font-style:normal;font-size:11px;color:var(--muted)}
  .wt-row .r{display:block;color:var(--muted);font-size:13px;margin-top:2px}
  .wt-row.cur{background:#EAF6F1;box-shadow:inset 4px 0 0 var(--jade)}.wt-row.cur .t{font-weight:700}
  .wt-back{position:sticky;bottom:10px;margin:0 auto;display:none;width:max-content;border:0;border-radius:999px;background:var(--ink);color:#fff;font:inherit;font-size:13px;padding:8px 16px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25)}
  .wt-list.away .wt-back{display:block}
  .wt-mask{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:80;display:none}.wt-mask.on{display:block}
  .wt-sheet{position:fixed;left:0;right:0;bottom:0;z-index:81;background:var(--paper);border-radius:18px 18px 0 0;box-shadow:0 -8px 30px rgba(0,0,0,.25);padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));max-width:620px;margin:0 auto;transform:translateY(105%);transition:transform .2s ease;max-height:70vh;overflow-y:auto}
  .wt-sheet.on{transform:none}
  .wt-sheet h3{margin:0;font-size:22px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
  .wt-sheet h3 small{font-size:14px;color:var(--muted);font-weight:400}
  .wt-sheet .m{font-size:17px;font-weight:700;margin-top:6px}
  .wt-sheet .p{color:var(--muted);font-size:14px;margin-top:4px;line-height:1.55}
  .wt-sheet .d{font-size:14px;margin-top:8px;line-height:1.5}
  .wt-sheet .x{background:var(--paper-2);border-radius:10px;padding:8px 10px;margin-top:10px;font-size:14px;line-height:1.5}
  .wt-sheet .x span{display:block;color:var(--muted);font-size:13px}
  .wt-sheet .a{display:flex;gap:8px;margin-top:14px}
  .wt-sheet .a button{flex:1;min-height:48px;border-radius:12px;border:1px solid var(--line);background:var(--paper);font:inherit;font-size:15px;font-weight:700;color:var(--ink);cursor:pointer}
  .wt-sheet .a .add{background:var(--jade);border-color:var(--jade);color:#fff;flex:2}
  .wt-sheet .a .add.in{background:var(--paper-2);border-color:var(--line);color:var(--muted)}
  @media (max-width:640px){
    #apptabs .seg-wrap.three button{font-size:13.5px;padding-left:0;padding-right:0}
    #view-video .wrap{padding:0 max(10px,env(safe-area-inset-left,0px)) 0 max(10px,env(safe-area-inset-right,0px))}
    #watch{padding-top:14px}
    .wt-sub .en{font-size:18px}
    .wt-video{border-radius:10px}
  }
  @media (max-width:640px) and (orientation:landscape){ .wt-video{max-height:62vh;aspect-ratio:auto;height:62vh} }
  }`;

  /* ---------- 生词本状态 ---------- */
  let book = new Map();
  function loadBook() { book = new Map(); try { words.forEach(w => { const k = String(w.word || "").toLowerCase().replace(/[{}]/g, ""); if (k) book.set(k, w.status === "known" ? "kn" : "lr"); }); } catch (e) {} }
  function stems(w) { const o = [w]; if (/ies$/.test(w)) o.push(w.slice(0, -3) + "y"); if (/(es|ed)$/.test(w)) o.push(w.slice(0, -2), w.slice(0, -1)); if (/s$/.test(w)) o.push(w.slice(0, -1)); if (/ing$/.test(w)) o.push(w.slice(0, -3), w.slice(0, -3) + "e"); if (/(.)\1(ed|ing)$/.test(w)) o.push(w.replace(/(.)\1(ed|ing)$/, "$1")); return o; }
  const statusOf = w => { for (const s of stems(w.toLowerCase())) if (book.has(s)) return book.get(s); return ""; };
  const markup = t => esc(t).replace(WORD, w => '<span class="wt-w ' + statusOf(w.replace(/’/g, "'")) + '" data-w="' + w.replace(/’/g, "'") + '">' + w + "</span>");

  /* ---------- 搭界面 ---------- */
  let root, listEl, subEl, enter = () => {};
  function build() {
    const st = document.createElement("style"); st.textContent = css; document.head.append(st);
    const seg = $("#apptabs .seg-wrap"), ven = document.getElementById("view-en"); if (!seg || !ven) return false;
    root = document.createElement("div"); root.id = "watch";
    root.innerHTML = `
      <div class="wt-home">
        <div class="wt-open"><input id="wt-url" inputmode="url" placeholder="粘贴 YouTube 链接…" autocomplete="off" autocapitalize="off"><button class="wt-btn" id="wt-go">打开</button></div>
        <div class="wt-hint">在电脑上用「双语字幕」插件看过的视频会自动出现在这里，带双语字幕，可以点词查词、加入生词本。</div>
        <details class="wt-bm" id="wt-bm"><summary>📱 手机上给任意视频加字幕（不用电脑）</summary>
          <ol>
            <li>点下面的按钮，复制书签代码。</li>
            <li>在 Safari 里把任意网页加入书签（分享 → 添加书签），名字改成「学这个视频」。</li>
            <li>打开书签列表 → 编辑 → 点这个书签，把「地址」整段删掉，粘贴刚才复制的代码，保存。</li>
            <li>以后在 Safari 里打开 YouTube 视频（要用浏览器，不是 YouTube App），点一下播放，再从书签里点「学这个视频」。</li>
          </ol>
          <div class="wt-bma"><button class="wt-btn" id="wt-bmc">复制书签代码</button><a id="wt-bml" class="wt-bml">学这个视频</a></div>
          <p>电脑上可以直接把右边的「学这个视频」拖到书签栏。安卓 Chrome：同样存成书签，然后在 YouTube 页面的地址栏里输入「学这个视频」并点选它。</p>
        </details>
        <div id="wt-items"></div>
      </div>
      <div class="wt-play">
        <div class="wt-bar"><button id="wt-back" aria-label="返回">‹ 返回</button><b id="wt-title"></b></div>
        <div class="wt-video"><div id="wt-yt"></div></div>
        <div class="wt-sub" id="wt-sub"><div class="en none">点 ▶ 开始播放</div><div class="zh"></div></div>
        <div class="wt-ctl">
          <button id="wt-prev" aria-label="上一句">⏮ 上句</button>
          <button id="wt-rep" aria-label="重播这句">🔁 重听</button>
          <button id="wt-next" aria-label="下一句">下句 ⏭</button>
          <button id="wt-ap">逐句停</button>
          <button id="wt-ht">藏译文</button>
          <button id="wt-rate">1×</button>
        </div>
        <div class="wt-list" id="wt-list"></div>
      </div>`;
    const view = document.createElement("div"); view.id = "view-video"; view.innerHTML = '<div class="wrap"></div>'; view.firstChild.append(root);
    ven.parentNode.insertBefore(view, ven);
    const mask = document.createElement("div"); mask.className = "wt-mask"; mask.id = "wt-mask";
    const sheet = document.createElement("div"); sheet.className = "wt-sheet"; sheet.id = "wt-sheet";
    document.body.append(mask, sheet);
    listEl = $("#wt-list"); subEl = $("#wt-sub");

    // 一级标签：和「英语 / 生活」并列
    const H = document.documentElement, btn = document.createElement("button"); btn.id = "l1-video"; btn.type = "button"; btn.textContent = "🎬 视频";
    seg.append(btn); seg.classList.add("three");
    const leave = () => { if (!H.classList.contains("show-video")) return; H.classList.remove("show-video", "wt-playing"); btn.classList.remove("on"); LS.set("wt:tab", 0); try { player && player.pauseVideo && player.pauseVideo(); } catch (e) {} };
    seg.querySelectorAll("button").forEach(b => { if (b !== btn) b.addEventListener("click", leave); });
    enter = () => {
      seg.querySelectorAll("button").forEach(x => x.classList.remove("on")); btn.classList.add("on");
      H.classList.add("show-video"); H.classList.toggle("wt-playing", root.classList.contains("playing")); LS.set("wt:tab", 1);
      scrollTo(0, 0); loadBook(); loadList(); fit();
    };
    btn.onclick = enter;
    $("#wt-bml").href = bookmarklet(); $("#wt-bml").onclick = e => { e.preventDefault(); tip("把它拖到书签栏；手机上请用「复制书签代码」"); };
    $("#wt-bmc").onclick = async () => { const code = bookmarklet(); try { await navigator.clipboard.writeText(code); tip("已复制，按上面第 2、3 步存成书签"); } catch (e) { const ta = document.createElement("textarea"); ta.value = code; ta.style.cssText = "position:fixed;opacity:0"; document.body.append(ta); ta.select(); let ok = false; try { ok = document.execCommand("copy"); } catch (er) {} ta.remove(); tip(ok ? "已复制，按上面第 2、3 步存成书签" : "复制失败，请长按右边的链接复制"); } };
    $("#wt-go").onclick = () => openUrl($("#wt-url").value);
    $("#wt-url").addEventListener("keydown", e => { if (e.key === "Enter") openUrl(e.target.value); });
    $("#wt-items").addEventListener("click", e => { const it = e.target.closest(".wt-item"); if (it) open(it.dataset.v); });
    $("#wt-back").onclick = closePlay;
    $("#wt-prev").onclick = () => jump(-1); $("#wt-next").onclick = () => jump(1); $("#wt-rep").onclick = () => jump(0);
    $("#wt-ap").onclick = () => { set.autoPause = !set.autoPause; saveSet(); };
    $("#wt-ht").onclick = () => { set.hideTr = !set.hideTr; saveSet(); };
    $("#wt-rate").onclick = () => { const R = [1, 0.75, 0.5, 1.25]; set.rate = R[(R.indexOf(set.rate) + 1) % R.length]; saveSet(); try { player.setPlaybackRate(set.rate); } catch (e) {} };
    subEl.addEventListener("click", e => { const w = e.target.closest(".wt-w"); if (w) { lookup(w.dataset.w, cur); return; } const z = e.target.closest(".zh"); if (z) z.classList.toggle("rv"); });
    listEl.addEventListener("click", e => { if (e.target.closest(".wt-back")) { follow = true; listEl.classList.remove("away"); scrollCur(true); return; } const w = e.target.closest(".wt-w"), row = e.target.closest(".wt-row"); if (!row) return; const i = +row.dataset.i; if (w) { lookup(w.dataset.w, i); return; } seek(i); });
    const away = () => { userScroll = Date.now(); follow = false; listEl.classList.add("away"); };
    listEl.addEventListener("touchmove", away, { passive: true }); listEl.addEventListener("wheel", away, { passive: true });
    mask.onclick = closeSheet;
    sheet.addEventListener("click", onSheet);
    addEventListener("resize", fit);
    paintSet();
    return true;
  }
  function saveSet() { LS.set("wt:set", set); paintSet(); }
  function paintSet() { $("#wt-ap").classList.toggle("on", set.autoPause); $("#wt-ht").classList.toggle("on", set.hideTr); $("#wt-rate").textContent = set.rate + "×"; subEl.classList.toggle("hide", set.hideTr); }
  function fit() { // 播放页占满一屏：视频、当前字幕、按钮固定，下面的字幕列表自己滚动
    const p = $(".wt-play", root); if (!root.classList.contains("playing") || !document.documentElement.classList.contains("show-video")) return;
    scrollTo(0, 0); const top = p.getBoundingClientRect().top, land = innerWidth > innerHeight && innerHeight < 520; p.style.height = land ? "auto" : Math.max(380, innerHeight - top - 8) + "px";
  }

  /* ---------- 视频列表 ---------- */
  function drawList(items) {
    const box = $("#wt-items");
    box.innerHTML = items && items.length ? items.map(x => '<div class="wt-item" data-v="' + esc(x.v) + '"><img loading="lazy" alt="" src="https://i.ytimg.com/vi/' + esc(x.v) + '/mqdefault.jpg"><div><b>' + esc(x.title || x.v) + "</b><span>" + esc(x.author || "") + (x.author ? " · " : "") + x.n + " 句" + (x.dur ? " · " + fmt(x.dur) : "") + "</span></div></div>").join("")
      : '<div class="wt-empty">还没有视频。<br>在电脑上打开 YouTube，用插件看任意一个带字幕的视频约 20 秒，它就会出现在这里。</div>';
  }
  async function loadList() {
    drawList(LS.get("wt:list", []));
    try { const r = await fetch(API + "?list=1"); const j = await r.json(); if (j && j.ok) { LS.set("wt:list", j.items); drawList(j.items); } } catch (e) {}
  }
  const vid = s => { s = String(s || "").trim(); const m = s.match(/(?:v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/) || s.match(/^([\w-]{11})$/); return m ? m[1] : ""; };
  function openUrl(s) { const v = vid(s); if (!v) { tip("没认出这个链接，请粘贴 YouTube 视频地址"); return; } open(v); }

  /* ---------- 打开视频 ---------- */
  async function open(v) {
    root.classList.add("playing"); document.documentElement.classList.add("wt-playing");
    doc = { v, title: "", cues: [] }; cues = []; cur = -1; pausedFor = -1; lock = false; follow = true; listEl.classList.remove("away");
    $("#wt-title").textContent = "加载中…"; listEl.innerHTML = '<div class="wt-empty">正在读取字幕…</div>'; showSub(-1); fit();
    startPlayer(v);
    let d = null;
    try { const r = await fetch(API + "?v=" + v); if (r.ok) d = await r.json(); } catch (e) { d = LS.get("wt:doc:" + v, null); }
    if (!doc || doc.v !== v) return;
    if (d && d.ok && d.cues && d.cues.length) {
      doc = d; cues = d.cues; LS.set("wt:doc:" + v, d);
      const tr = LS.get("wt:tr:" + v, {}); cues.forEach((c, i) => { if (!c.r && tr[i]) c.r = tr[i]; });
      $("#wt-title").textContent = d.title || v; drawCues(); fillTrans(v);
    } else {
      $("#wt-title").textContent = "没有字幕";
      listEl.innerHTML = '<div class="wt-empty">这个视频还没有字幕。<br>在电脑上用插件打开它看约 20 秒，字幕会自动同步过来；视频本身现在就可以播放。</div>';
    }
  }
  function closePlay() { stopTick(); try { player && player.destroy && player.destroy(); } catch (e) {} player = null; ready = false; doc = null; root.classList.remove("playing"); document.documentElement.classList.remove("wt-playing"); $(".wt-video", root).innerHTML = '<div id="wt-yt"></div>'; loadList(); }
  function drawCues() {
    listEl.innerHTML = cues.map((c, i) => '<div class="wt-row" data-i="' + i + '"><i>' + fmt(c.s) + '</i><span class="t">' + markup(c.t) + '</span><span class="r">' + esc(c.r || "") + "</span></div>").join("") + '<button class="wt-back">↓ 回到当前</button>';
  }
  async function fillTrans(v) { // 没有译文的句子：在浏览器里分批翻译并缓存
    const need = []; cues.forEach((c, i) => { if (!c.r) need.push(i); }); if (!need.length) return;
    const tl = (doc && doc.tl) || "zh-CN", cache = LS.get("wt:tr:" + v, {});
    for (let k = 0; k < need.length; k += 30) {
      if (!doc || doc.v !== v) return;
      const idx = need.slice(k, k + 30);
      try {
        const r = await fetch("https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=" + encodeURIComponent(tl) + "&dt=t&q=" + encodeURIComponent(idx.map(i => cues[i].t.replace(/\n/g, " ")).join("\n")));
        const j = await r.json(), parts = (j[0] || []).map(x => x[0]).join("").split("\n");
        if (parts.length !== idx.length) continue;
        idx.forEach((i, n) => { cues[i].r = cache[i] = parts[n].trim(); const row = listEl.children[i]; if (row && $(".r", row)) $(".r", row).textContent = cues[i].r; if (i === cur) showSub(cur); });
        LS.set("wt:tr:" + v, cache);
      } catch (e) { return; }
    }
  }

  /* ---------- 播放器 ---------- */
  function loadApi() {
    if (apiP) return apiP;
    apiP = new Promise(res => { if (window.YT && YT.Player) return res(); const old = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { try { old && old(); } catch (e) {} res(); }; const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; s.onerror = () => { apiP = null; tip("播放器加载失败，请检查网络"); }; document.head.append(s); });
    return apiP;
  }
  async function startPlayer(v) {
    stopTick(); ready = false; try { player && player.destroy && player.destroy(); } catch (e) {} player = null;
    $(".wt-video", root).innerHTML = '<div id="wt-yt"></div>';
    await loadApi(); if (!doc || doc.v !== v) return;
    player = new YT.Player("wt-yt", { videoId: v, playerVars: { playsinline: 1, rel: 0, modestbranding: 1, cc_load_policy: 0, iv_load_policy: 3, start: Math.floor(LS.get("wt:pos:" + v, 0)) }, events: {
      onReady: () => { ready = true; try { player.setPlaybackRate(set.rate); } catch (e) {} startTick(); },
      onStateChange: e => { if (e.data === 1) { if (lock) { lock = false; } startTick(); } },
      onError: () => tip("这个视频不允许在站外播放，或暂时无法加载") } });
  }
  const now = () => { try { return player.getCurrentTime() || 0; } catch (e) { return 0; } };
  const playing = () => { try { return player.getPlayerState() === 1; } catch (e) { return false; } };
  function startTick() { if (timer) return; let n = 0; timer = setInterval(() => { tick(); if (++n % 40 === 0 && doc) LS.set("wt:pos:" + doc.v, Math.max(0, now() - 2)); }, 120); }
  function stopTick() { clearInterval(timer); timer = null; }
  function find(t) { let lo = 0, hi = cues.length - 1, a = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (cues[m].s <= t + 0.05) { a = m; lo = m + 1; } else hi = m - 1; } return a; }
  const endOf = i => Math.min(cues[i].e || cues[i].s + 4, cues[i + 1] ? Math.max(cues[i + 1].s, cues[i].s + 0.3) : Infinity);
  function tick() {
    if (!ready || !cues.length) return;
    const t = now(), on = playing();
    if (lock && !on) return;                      // 逐句停时锁住当前句，不跳到下一句
    const i = find(t);
    if (set.autoPause && on && cur >= 0 && pausedFor !== cur && i >= cur && t >= endOf(cur) - 0.14) { pausedFor = cur; lock = true; try { player.pauseVideo(); } catch (e) {} return; }
    if (i !== cur) { cur = i; showSub(i); markRow(); }
  }
  function showSub(i) {
    const c = cues[i];
    subEl.innerHTML = c ? '<div class="en">' + markup(c.t) + '</div><div class="zh">' + esc(c.r || "") + "</div>" : '<div class="en none">' + (cues.length ? "…" : "点 ▶ 开始播放") + '</div><div class="zh"></div>';
  }
  function markRow() {
    const old = $(".wt-row.cur", listEl); if (old) old.classList.remove("cur");
    const row = listEl.children[cur]; if (!row || !row.classList.contains("wt-row")) return; row.classList.add("cur");
    if (!follow && Date.now() - userScroll > 6000) { follow = true; listEl.classList.remove("away"); }
    scrollCur(false);
  }
  function scrollCur(force) { const row = listEl.children[cur]; if (!row || (!follow && !force)) return; listEl.scrollTo({ top: Math.max(0, row.offsetTop - listEl.clientHeight * 0.3), behavior: "smooth" }); }
  function seek(i) { if (!cues[i] || !ready) return; lock = false; pausedFor = -1; cur = i; showSub(i); follow = true; listEl.classList.remove("away"); markRow(); try { player.seekTo(cues[i].s + 0.01, true); player.playVideo(); } catch (e) {} }
  function jump(d) { if (!cues.length) return; const base = cur < 0 ? find(now()) : cur; seek(Math.max(0, Math.min(cues.length - 1, (base < 0 ? 0 : base) + d))); }

  /* ---------- 查词 ---------- */
  const dc = {};
  async function gword(w) {
    const k = w.toLowerCase(); if (dc[k]) return dc[k];
    const c = LS.get("wt:w:" + k, null); if (c) return dc[k] = c;
    const o = { zh: [], phon: "", en: "" };
    try {
      const j = await (await fetch("https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&dt=bd&q=" + encodeURIComponent(k))).json();
      const add = x => { x = String(x || "").trim(); if (x && x.toLowerCase() !== k && !o.zh.includes(x)) o.zh.push(x); };
      add((j[0] || []).map(x => x[0]).join("")); (j[1] || []).forEach(e => (e[1] || []).slice(0, 4).forEach(add));
      o.pos = (j[1] || []).slice(0, 3).map(e => ({ p: e[0], w: (e[1] || []).slice(0, 4) }));
    } catch (e) {}
    if (!/\s/.test(k)) try {
      const r = await fetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(k)); if (r.ok) { const j = await r.json(); const e = j[0] || {}; o.phon = e.phonetic || ((e.phonetics || []).find(p => p.text) || {}).text || ""; const d = ((e.meanings || [])[0] || {}).definitions; o.en = (d && d[0] && d[0].definition) || ""; }
    } catch (e) {}
    if (o.zh.length) LS.set("wt:w:" + k, o);
    return dc[k] = o;
  }
  const POS = { noun: "名", verb: "动", adjective: "形", adverb: "副", preposition: "介", pronoun: "代", conjunction: "连", interjection: "叹" };
  let sheetCtx = null;
  async function lookup(w, ci) {
    try { if (playing()) player.pauseVideo(); } catch (e) {}
    sheetWord = w; const c = cues[ci], sheet = $("#wt-sheet"), st = statusOf(w);
    sheetCtx = c ? { t: c.t, r: c.r || "" } : null;
    const ctxHtml = c ? '<div class="x">' + esc(c.t).replace(new RegExp("\\b(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")\\b", "i"), "<b>$1</b>") + "<span>" + esc(c.r || "") + "</span></div>" : "";
    sheet.innerHTML = "<h3>" + esc(w) + '<small id="wt-ph"></small></h3><div class="m" id="wt-m">查询中…</div><div class="p" id="wt-p"></div><div class="d" id="wt-d"></div>' + ctxHtml +
      '<div class="a"><button data-a="say">🔊 发音</button><button data-a="add" class="add' + (st ? " in" : "") + '">' + (st ? (st === "kn" ? "已掌握" : "已在生词本") : "＋ 加入生词本") + '</button><button data-a="x">关闭</button></div>';
    sheet.classList.add("on"); $("#wt-mask").classList.add("on");
    try { speak(w); } catch (e) {}
    const g = await gword(w); if (sheetWord !== w) return;
    $("#wt-m").textContent = g.zh.slice(0, 4).join("；") || "（没查到释义）";
    $("#wt-p").innerHTML = (g.pos || []).map(p => "<b>" + esc(POS[p.p] || p.p) + ".</b> " + esc(p.w.join("，"))).join("　");
    $("#wt-ph").textContent = g.phon || ""; $("#wt-d").textContent = g.en || "";
  }
  function closeSheet() { sheetWord = ""; $("#wt-sheet").classList.remove("on"); $("#wt-mask").classList.remove("on"); }
  async function onSheet(e) {
    const b = e.target.closest("button[data-a]"); if (!b) return; const a = b.dataset.a, w = sheetWord;
    if (a === "x") return closeSheet();
    if (a === "say") { try { speak(w); } catch (er) {} return; }
    if (a === "add") {
      if (b.classList.contains("in")) return;
      const lw = w.toLowerCase(), g = await gword(w), id = "v_" + lw.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const ex = sheetCtx ? [[sheetCtx.t.replace(/\s+/g, " ").replace(new RegExp("\\b(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")\\b", "i"), "{$1}"), sheetCtx.r]] : [];
      const entry = { id, type: /\s/.test(lw) ? "phrase" : "word", word: lw, phon: g.phon || "", en: g.en || "", zh: g.zh.slice(0, 4).join("；") || "(未查到，可手动补)", tag: "视频", date: new Date().toISOString().slice(0, 10), forms: [], examples: ex, tip: "" };
      try {
        state.custom = state.custom || []; state.deleted = (state.deleted || []).filter(x => x !== id);
        if (!state.custom.some(x => x && (x.id === id || String(x.word || "").toLowerCase() === lw))) state.custom.push(entry);
        refresh(); save(state); loadBook();
        b.classList.add("in"); b.textContent = "已在生词本"; tip("已加入生词本：" + lw);
        // 重新上色
        if (cur >= 0) showSub(cur); const top = listEl.scrollTop; drawCues(); listEl.scrollTop = top; const row = listEl.children[cur]; if (row && row.classList.contains("wt-row")) row.classList.add("cur");
      } catch (er) { tip("保存失败"); }
    }
  }

  function init() { if (!build()) return; { const q = new URLSearchParams(location.search).get("v"); if (q && /^[\w-]{11}$/.test(q)) { try { history.replaceState(null, "", location.pathname); } catch (e) {} enter(); open(q); window.__wt = { open, state: () => ({ cur, n: cues.length, lock, follow, set }) }; return; } } if (LS.get("wt:tab", 0) && !document.documentElement.classList.contains("collect-mode")) enter(); window.__wt = { open, state: () => ({ cur, n: cues.length, lock, follow, set }) }; }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
