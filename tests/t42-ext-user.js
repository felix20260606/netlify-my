// 插件切换生词本用户（家人）：先把当前的人的改动传完，再清本机、拉新的人的数据；请求带 ?u=；切回来数据完整、「忽略」的词不会被加回已保存
// 插件后台 extension/background.js 跑在 vm 里，网站后台 web/_worker.js 用假的 KV 直接接请求（不碰线上数据）
const fs = require("fs"), vm = require("vm"), path = require("path");
(async () => {
  const W = (await import(path.join(__dirname, "..", "web", "_worker.js"))).default;
  const kv = new Map(), KV = {
    get: async (k, t) => { const v = kv.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; },
    put: async (k, v) => { kv.set(k, String(v)); }, delete: async k => { kv.delete(k); },
    list: async ({ prefix }) => ({ keys: [...kv.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })) }),
  };
  kv.set("users", JSON.stringify([{ id: "", name: "Ray" }, { id: "u2", name: "妈妈" }]));
  kv.set("vocab", JSON.stringify({ custom: [{ id: "v_owner", word: "owner", type: "word" }, { id: "v_skipme", word: "skipme", type: "word" }], progress: {}, deleted: [], pending: [], srs: {} }));
  kv.set("ext", JSON.stringify({ ver: 1, items: { "saved|owner": { v: "owner", at: 1 }, "marks|skipme": { v: "ignore", at: 1 }, "med|med:w:owner": { v: "sig", at: 1 } } }));
  kv.set("m:med:w:owner", JSON.stringify({ t: "owner clip", at: 1 }));
  kv.set("u/u2/ext", JSON.stringify({ ver: 1, items: { "saved|apple": { v: "apple", at: 1 } } }));
  const urls = [];
  const local = {}, sync = { target: "zh-CN" }, listeners = [];
  const fire = (ch, area) => listeners.forEach(f => { try { f(ch, area); } catch (e) {} });
  const pick = (o, k) => { if (k == null) return JSON.parse(JSON.stringify(o)); if (typeof k === "string") return k in o ? { [k]: JSON.parse(JSON.stringify(o[k])) } : {}; if (Array.isArray(k)) { const r = {}; k.forEach(x => { if (x in o) r[x] = JSON.parse(JSON.stringify(o[x])); }); return r; } const r = {}; for (const x in k) r[x] = x in o ? JSON.parse(JSON.stringify(o[x])) : k[x]; return r; };
  const area = (o, name) => ({
    get: (k, cb) => { const r = pick(o, k); if (cb) cb(r); return Promise.resolve(r); },
    set: async v => { const ch = {}; for (const x in v) { ch[x] = { newValue: v[x] }; o[x] = JSON.parse(JSON.stringify(v[x])); } fire(ch, name); },
    remove: async ks => { const ch = {}; [].concat(ks).forEach(x => { if (x in o) { ch[x] = { oldValue: o[x] }; delete o[x]; } }); fire(ch, name); },
    getKeys: async () => Object.keys(o),
  });
  const ctx = { console, setTimeout, clearTimeout, URL, encodeURIComponent, Promise, JSON, importScripts() {},
    chrome: { storage: { local: area(local, "local"), sync: area(sync, "sync"), onChanged: { addListener: f => listeners.push(f) } },
      runtime: { onMessage: { addListener() {} }, onInstalled: { addListener() {} }, onStartup: { addListener() {} }, getURL: x => x, id: "x" },
      alarms: { create() {}, onAlarm: { addListener() {} } }, tabs: { create() {} }, action: { onClicked: { addListener() {} } } },
    fetch: async (u, o) => { u = String(u); if (!u.startsWith("https://ruilearning-my.pages.dev/api/")) return { ok: false, json: async () => ({}) };
      urls.push(u); const r = await W.fetch(new Request(u.replace("https://ruilearning-my.pages.dev", "https://x.test"), o), { CAPTIONS: KV }); const t = await r.text(); return { ok: r.ok, status: r.status, json: async () => JSON.parse(t) }; } };
  ctx.self = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "extension", "background.js"), "utf8") + "\n;globalThis.__t={extSync,setSiteUser,nbApply};", ctx);
  let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } };
  const T = ctx.__t, extOf = k => JSON.parse(kv.get(k) || '{"items":{}}').items;

  // 主人：第一次同步，拿到云端数据
  let r = await T.extSync(true); ok(r.ok, "owner first sync " + JSON.stringify(r));
  ok((local.saved || []).includes("owner") && local.marks && local.marks.skipme === "ignore" && local["med:w:owner"], "owner data local");
  // 本机新存一个词还没传，就切到妈妈
  await ctx.chrome.storage.local.set({ saved: [...local.saved, "fresh"] });
  urls.length = 0;
  r = await T.setSiteUser("u2"); ok(r.ok, "switch to u2 " + JSON.stringify(r));
  ok(extOf("ext")["saved|fresh"], "pending owner change pushed before switch");
  ok(local.siteUser === "u2" && JSON.stringify(local.saved) === '["apple"]', "local now u2 saved " + JSON.stringify(local.saved));
  ok(!local.marks || !local.marks.skipme, "owner marks gone");
  ok(!local["med:w:owner"], "owner media gone from local");
  const u2 = extOf("u/u2/ext"); ok(!u2["saved|owner"] && !u2["saved|fresh"] && !u2["med|med:w:owner"] && !u2["marks|skipme"], "no owner data leaked into u2 " + Object.keys(u2));
  ok(u2["set|target"], "settings carried to u2");
  ok(urls.filter(u => /\/api\/(vocab|ext|media)/.test(u)).every(u => /[?&]u=u2/.test(u) || urls.indexOf(u) < urls.findIndex(x => /u=u2/.test(x))), "requests after switch carry u=u2");
  ok(!kv.has("u/u2/m:med:w:owner"), "owner media not copied to u2");
  // 在妈妈这边存一个词
  await ctx.chrome.storage.local.set({ saved: [...local.saved, "banana"] }); await T.extSync(true);
  ok(extOf("u/u2/ext")["saved|banana"] && !extOf("ext")["saved|banana"], "u2 change goes to u2 only");
  // 切回主人
  r = await T.setSiteUser(""); ok(r.ok, "switch back " + JSON.stringify(r));
  ok(["owner", "fresh"].every(w => local.saved.includes(w)) && !local.saved.includes("banana") && !local.saved.includes("apple"), "owner saved restored " + JSON.stringify(local.saved));
  ok(local.marks && local.marks.skipme === "ignore" && !local.saved.includes("skipme"), "ignored word not re-added");
  ok(local["med:w:owner"] && local["med:w:owner"].t === "owner clip", "owner media downloaded again");
  ok(!extOf("ext")["saved|skipme"], "owner cloud not polluted");
  // 网络断了不切
  const f0 = ctx.fetch; ctx.fetch = async () => { throw new Error("offline"); };
  await ctx.chrome.storage.local.set({ saved: [...local.saved, "offline1"] });
  r = await T.setSiteUser("u2"); ok(!r.ok && local.siteUser === "" && local.saved.includes("offline1"), "offline: no switch, data kept " + JSON.stringify(r));
  ctx.fetch = f0;
  console.log(fail ? "t42 FAILED" : "t42 ok"); process.exit(fail ? 1 : 0);
})();
