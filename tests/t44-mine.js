// /api/mine：阅读文章、作文历史、词汇量测试按人存、按 at 新的为准合并、删除记号（假 KV，不碰线上）
const path = require("path");
(async () => {
  const W = (await import(path.join(__dirname, "..", "web", "_worker.js"))).default;
  const kv = new Map();
  const KV = { get: async (k, t) => { const v = kv.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; }, put: async (k, v) => { kv.set(k, String(v)); }, delete: async k => { kv.delete(k); }, list: async ({ prefix }) => ({ keys: [...kv.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }) };
  const env = { CAPTIONS: KV };
  const call = async (p, body) => { const r = await W.fetch(new Request("https://x.test" + p, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}), env); return { status: r.status, j: await r.json() }; };
  let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } };
  let r = await call("/api/mine?k=reading"); ok(r.j.ok && !Object.keys(r.j.items).length, "empty");
  r = await call("/api/mine", { k: "reading", changes: { a: { v: { title: "A" }, at: 10 } } }); ok(r.j.items.a.v.title === "A", "add");
  r = await call("/api/mine", { k: "reading", changes: { a: { v: { title: "old" }, at: 5 } } }); ok(r.j.items.a.v.title === "A", "older ignored");
  r = await call("/api/mine", { k: "reading", changes: { a: { del: 1, at: Date.now() } } }); ok(r.j.items.a.del === 1, "tombstone");
  r = await call("/api/mine", { k: "bad", changes: {} }); ok(r.status === 400, "bad k");
  await call("/api/users", { add: "妈妈" });
  r = await call("/api/mine?u=u2&k=reading"); ok(r.j.ok && !Object.keys(r.j.items).length, "u2 separate");
  r = await call("/api/mine?u=zz&k=reading"); ok(r.status === 404, "unknown user");
  console.log(fail ? fail + " failed" : "t44 ok"); process.exit(fail ? 1 : 0);
})();
