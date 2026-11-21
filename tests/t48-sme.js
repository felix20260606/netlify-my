// 每日听力 /api/sme（BBC 6 Minute English）：目录页解析、每期页面解析（简介 / 本期问题 / 生词表 / 按说话人分行的文稿 / mp3）、KV 缓存、坏参数
// 用假的 KV、假的 fetch 直接跑 web/_worker.js（Node 18+，不联网，不碰线上数据）
const path = require("path");
(async () => {
  const BASE = "https://www.bbc.co.uk/learningenglish/english/features/";
  const item = (id, img, t, d, p) => '<div class="img"><a  href="/learningenglish/english/features/' + id + '"><img src="' + img + '" alt="" /></a></div><div class="text"><h2><a  href="/learningenglish/english/features/' + id + '">' + t + '</a></h2><div class="details"><h3><b>Episode x</b> / ' + d + '</h3>\n<p>' + p + "</p></div></div>";
  const y = +new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 4);
  const IDX = {
    [BASE + "6-minute-english_" + y]: "<html>" + item("6-minute-english_" + y + "/ep-" + String(y).slice(2) + "1119", "https://img/1.jpg", "Are microplastics harming us?", "19 Nov " + y, "What&#39;s the last plastic thing you used?") + item("6-minute-english_" + y + "/ep-" + String(y).slice(2) + "1112", "https://img/2.jpg", "Learning &amp; ageing", "12 Nov " + y, "Mixing generations") + "</html>",
    [BASE + "6-minute-english_" + (y - 1)]: "<html>" + item("6-minute-english_" + (y - 1) + "/ep-" + String(y - 1).slice(2) + "1225", "https://img/3.jpg", "Was Christmas better?", "25 Dec " + (y - 1), "Nostalgia") + "</html>",
  };
  const EP = '<html><head><meta property="og:title" content="BBC Learning English - 6 Minute English / Are microplastics harming us?" /></head><body>' +
    '<h3>Introduction</h3><p>How much plastic do you use?</p><p>Becca and Phil discuss this.</p>' +
    "<h3>This week's question</h3><p>How long would it take?<br />a) 13,000 years<br />b) 23,000 years<br />Listen to the programme to hear the answer.</p>" +
    '<h3>Vocabulary</h3><p><strong>marine</strong><br />related to the sea</p><p><strong>spike</strong><br />sudden, sharp increase</p>' +
    '<p><strong>TRANSCRIPT</strong></p><p class="p2">Note: This is not a word-for-word transcript.&nbsp;</p>' +
    "<p><strong>Phil</strong><br />Hi Becca.<br />&nbsp;<br /><strong>Becca</strong><br />Hi Phil.<br />&nbsp;<br /><strong>Phil</strong><br />Microplastics &ndash; tiny pieces.<br />&nbsp;<br /><strong>Professor Mark Miodownik</strong><br />We are exposed.<br />&nbsp;<br /><strong>Becca</strong><br /><strong>A spike</strong> is a sudden, sharp increase.<br />&nbsp;<br /><strong>Phil</strong><br />Bye!</p>" +
    '<div class="widget-pagelink-download-inner bbcle-download-linkparent-extension-mp3"><a class="download" href="https://downloads.bbc.co.uk/learningenglish/features/6min/x_download.mp3">Download Audio</a></div><h3>Next</h3><p>Other stuff here</p></body></html>';
  let calls = 0;
  globalThis.fetch = async u => { u = String(u); calls++; if (IDX[u]) return new Response(IDX[u], { headers: { "content-type": "text/html" } }); if (u === BASE + "6-minute-english_" + y + "/ep-" + String(y).slice(2) + "1119") return new Response(EP, { headers: { "content-type": "text/html" } }); return new Response("no", { status: 404 }); };
  const W = (await import(path.join(__dirname, "..", "web", "_worker.js"))).default;
  const kv = new Map(), opts = {};
  const KV = { get: async (k, t) => { const v = kv.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; }, put: async (k, v, o) => { kv.set(k, String(v)); opts[k] = o; }, delete: async k => { kv.delete(k); }, list: async () => ({ keys: [], list_complete: true }) };
  const env = { CAPTIONS: KV };
  const call = async p => { const r = await W.fetch(new Request("https://x.test" + p), env); return { status: r.status, j: await r.json() }; };
  let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } };

  let r = await call("/api/sme");
  ok(r.j.ok && r.j.list.length === 3, "list " + JSON.stringify(r.j).slice(0, 300));
  ok(r.j.list[0].t === "Are microplastics harming us?" && r.j.list[0].d === "19 Nov " + y && r.j.list[0].p === "What's the last plastic thing you used?" && r.j.list[0].img === "https://img/1.jpg", "first item " + JSON.stringify(r.j.list[0]));
  ok(r.j.list[1].t === "Learning & ageing" && r.j.list[2].id.includes(String(y - 1)), "entities + previous year");
  ok(kv.has("sme/list") && opts["sme/list"].expirationTtl === 12 * 3600, "list cached 12h");
  const c1 = calls; r = await call("/api/sme"); ok(r.j.ok && calls === c1, "list from cache");

  const id = r.j.list[0].id;
  r = await call("/api/sme?ep=" + encodeURIComponent(id));
  ok(r.j.ok && r.j.title === "Are microplastics harming us?", "ep title " + r.j.title);
  ok(r.j.mp3 === "https://downloads.bbc.co.uk/learningenglish/features/6min/x_download.mp3", "mp3");
  ok(r.j.intro === "How much plastic do you use? Becca and Phil discuss this.", "intro " + r.j.intro);
  ok(JSON.stringify(r.j.q) === JSON.stringify(["How long would it take?", "a) 13,000 years", "b) 23,000 years"]), "question " + JSON.stringify(r.j.q));
  ok(JSON.stringify(r.j.vocab) === JSON.stringify([["marine", "related to the sea"], ["spike", "sudden, sharp increase"]]), "vocab " + JSON.stringify(r.j.vocab));
  ok(r.j.lines.length === 6 && r.j.lines[0].who === "Phil" && r.j.lines[1].who === "Becca" && r.j.lines[2].t === "Microplastics – tiny pieces." && r.j.lines[3].who === "Professor Mark Miodownik", "transcript " + JSON.stringify(r.j.lines));
  ok(r.j.lines[4].who === "Becca" && r.j.lines[4].t === "A spike is a sudden, sharp increase.", "inline bold kept in sentence " + JSON.stringify(r.j.lines[4]));
  ok(!r.j.lines.some(l => /Other stuff|Note:/.test(l.t)), "stops at Next, drops note");
  ok(kv.has("sme/ep/" + id) && opts["sme/ep/" + id].expirationTtl === 90 * 86400, "episode cached 90 days");
  r = await call("/api/sme?ep=" + encodeURIComponent("../../etc")); ok(r.status === 400, "bad ep 400");
  r = await call("/api/sme?ep=" + encodeURIComponent("6-minute-english_" + y + "/ep-000000")); ok(r.status === 502 && !kv.has("sme/ep/6-minute-english_" + y + "/ep-000000"), "missing ep 502 not cached");
  // mine 接受 daily / sme 两种新集合
  r = await (async () => { const q = await W.fetch(new Request("https://x.test/api/mine", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ k: "sme", changes: { [id]: { v: 123, at: 5 } } }) }), env); return q.json(); })();
  ok(r.ok && r.items[id].v === 123, "mine k=sme");
  r = await (async () => { const q = await W.fetch(new Request("https://x.test/api/mine", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ k: "daily", changes: { "day:2026-11-21": { v: [3, 5], at: 6 } } }) }), env); return q.json(); })();
  ok(r.ok && r.items["day:2026-11-21"].v[0] === 3, "mine k=daily");
  console.log(fail ? "t48 FAILED" : "t48 ok");
  process.exit(fail ? 1 : 0);
})();
