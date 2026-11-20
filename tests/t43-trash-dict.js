// 回收站（/api/vocab?trash=1、{untrash}）、按人分开；/api/ai、/api/stt 没开 Workers AI 时返回 noai；/api/dict、/api/readurl 参数检查
// 用假的 KV 直接跑 web/_worker.js（Node 18+，不碰线上数据，不联网）
const path = require("path");
(async () => {
  const W = (await import(path.join(__dirname, "..", "web", "_worker.js"))).default;
  const kv = new Map();
  const KV = { get: async (k, t) => { const v = kv.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; }, put: async (k, v) => { kv.set(k, String(v)); }, delete: async k => { kv.delete(k); }, list: async ({ prefix }) => ({ keys: [...kv.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }) };
  const env = { CAPTIONS: KV };
  const call = async (p, body) => { const r = await W.fetch(new Request("https://x.test" + p, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}), env); return { status: r.status, j: await r.json() }; };
  let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } };
  kv.set("vocab", JSON.stringify({ custom: [{ id: "a", word: "apple" }, { id: "b", word: "banana" }], progress: {}, deleted: [], pending: [], srs: {} }));
  // 网页整份同步时删掉 a
  let r = await call("/api/vocab", { v: 2, state: { custom: [{ id: "b", word: "banana" }], progress: {}, deleted: ["a"], pending: [], srs: {} } });
  ok(r.j.ok && r.j.state.custom.length === 1, "deleted via state");
  r = await call("/api/vocab?trash=1"); ok(r.j.items.length === 1 && r.j.items[0].e.word === "apple", "trash has apple " + JSON.stringify(r.j));
  // 插件 patch 删除 b
  r = await call("/api/vocab", { patch: { deleted: ["b"] } });
  r = await call("/api/vocab?trash=1"); ok(r.j.items.length === 2 && r.j.items[0].e.id === "b", "trash has b first");
  // 再推一次同样的删除，不重复进回收站
  r = await call("/api/vocab", { v: 2, state: { custom: [], progress: {}, deleted: ["a", "b"], pending: [], srs: {} } });
  r = await call("/api/vocab?trash=1"); ok(r.j.items.length === 2, "no duplicates");
  // 恢复：网页用新 id 加回去 + untrash
  r = await call("/api/vocab", { add: [{ id: "a_r1", word: "apple" }] }); ok(r.j.added === 1, "re-add with new id");
  r = await call("/api/vocab", { untrash: "a" }); ok(r.j.items.length === 1 && r.j.items[0].e.id === "b", "untrash a");
  // 家人的回收站分开
  r = await call("/api/users", { add: "妈妈" });
  r = await call("/api/vocab?u=u2&trash=1"); ok(r.j.ok && r.j.items.length === 0, "u2 trash empty");
  // AI 没开
  r = await call("/api/ai", { task: "write", text: "x" }); ok(r.j.error === "noai", "ai noai");
  r = await call("/api/stt", { a: 1 }); ok(r.j.error === "noai", "stt noai");
  // 参数检查（不联网）
  r = await call("/api/dict?w=" + encodeURIComponent("<script>")); ok(r.status === 400, "dict bad word");
  r = await call("/api/readurl?url=" + encodeURIComponent("file:///etc/passwd")); ok(r.status === 400, "readurl bad scheme");
  console.log(fail ? fail + " failed" : "t43 ok"); process.exit(fail ? 1 : 0);
})();
