// 家人（多用户）：/api/users 新建、改名；?u=<id> 读写各自的生词本、插件数据、录音截图，互不影响；不认识的 u 返回 404
// 用假的 KV 直接跑 web/_worker.js（Node 18+，不需要浏览器，不碰线上数据）
const path = require("path");
(async () => {
  const W = (await import(path.join(__dirname, "..", "web", "_worker.js"))).default;
  const kv = new Map();
  const KV = {
    get: async (k, t) => { const v = kv.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; },
    put: async (k, v) => { kv.set(k, String(v)); },
    delete: async k => { kv.delete(k); },
    list: async ({ prefix }) => ({ keys: [...kv.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }),
  };
  const env = { CAPTIONS: KV };
  const call = async (p, body) => { const r = await W.fetch(new Request("https://x.test" + p, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}), env); return { status: r.status, j: await r.json() }; };
  let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } };

  kv.set("vocab", JSON.stringify({ custom: [{ id: "v_owner", word: "owner" }], progress: {}, deleted: [], pending: [], srs: {} }));
  kv.set("ext", JSON.stringify({ ver: 1, items: { "saved|owner": { v: "owner", at: 1 } } }));
  kv.set("m:med:w:owner", JSON.stringify({ t: "owner clip" }));

  let r = await call("/api/users"); ok(r.j.ok && r.j.users.length === 1 && r.j.users[0].id === "", "default users " + JSON.stringify(r.j));
  r = await call("/api/users", { add: "妈妈" }); ok(r.j.ok && r.j.user.id === "u2" && r.j.user.name === "妈妈", "add user " + JSON.stringify(r.j));
  r = await call("/api/users", { add: "妈妈" }); ok(r.status === 409, "dup name refused");
  r = await call("/api/users", { add: "<>" }); ok(r.status === 400, "empty name after strip refused");
  r = await call("/api/users", { rename: { id: "", name: "Ray R" } }); ok(r.j.ok && r.j.users[0].name === "Ray R", "rename owner");

  // 生词本
  r = await call("/api/vocab?u=u2"); ok(r.j.ok && r.j.custom.length === 0, "new user empty notebook");
  r = await call("/api/vocab?u=u2", { add: [{ id: "v_apple", word: "apple" }] }); ok(r.j.added === 1, "add to u2");
  ok(JSON.parse(kv.get("u/u2/vocab")).custom[0].word === "apple", "stored under u/u2/vocab");
  ok(JSON.parse(kv.get("vocab")).custom.length === 1, "owner notebook untouched");
  r = await call("/api/vocab"); ok(r.j.custom.map(x => x.id).join() === "v_owner", "owner GET");
  r = await call("/api/vocab?u=u2", { v: 2, state: { custom: [{ id: "v_pear", word: "pear" }], progress: { v_apple: "known" }, deleted: [], pending: [], srs: {} } });
  ok(r.j.state.custom.length === 2 && r.j.state.progress.v_apple === "known", "state merge u2");
  r = await call("/api/vocab?u=u2&history=1"); ok(r.j.days.length === 1, "u2 history " + JSON.stringify(r.j));
  r = await call("/api/vocab?history=1"); ok(r.j.days.length === 0, "owner history untouched");
  ok(![...kv.keys()].some(k => k.startsWith("vocab@")), "no owner snapshot written");

  // 不认识的人
  r = await call("/api/vocab?u=u9"); ok(r.status === 404, "unknown user 404");
  r = await call("/api/vocab?u=../x"); ok(r.status === 404, "bad id 404");
  r = await call("/api/ext?u=u9", { changes: { "saved|x": { v: "x", at: 5 } } }); ok(r.status === 404 && !kv.has("u/u9/ext"), "unknown ext write refused");

  // 插件数据和录音截图
  r = await call("/api/media?u=u2", { k: "med:w:apple", rec: { t: "apple clip" } }); ok(r.j.ok && kv.has("u/u2/m:med:w:apple"), "media stored per user");
  r = await call("/api/media?k=med:w:apple"); ok(r.status === 404, "owner cannot see u2 media");
  r = await call("/api/media?u=u2&k=med:w:apple"); ok(r.j.rec && r.j.rec.t === "apple clip", "u2 media GET");
  r = await call("/api/ext?u=u2", { changes: { "saved|apple": { v: "apple", at: 5 }, "med|med:w:apple": { v: "sig", at: 5 } } }); ok(r.j.ok && Object.keys(r.j.items).length === 2, "ext u2");
  r = await call("/api/ext"); ok(Object.keys(r.j.items).join() === "saved|owner", "owner ext untouched");
  r = await call("/api/ext?u=u2", { changes: { "med|med:w:apple": { del: 1, at: 9 } } });
  ok(!kv.has("u/u2/m:med:w:apple") && kv.has("m:med:w:owner"), "deleting u2 media removes only u2 record");

  // 删除：有内容的不能删，空的可以
  r = await call("/api/users", { remove: "u2" }); ok(r.status === 409 && kv.has("u/u2/vocab"), "non-empty user not removed");
  r = await call("/api/users", { add: "测试" }); const tid = r.j.user.id;
  await call("/api/vocab?u=" + tid, { v: 2, state: { custom: [], progress: {}, deleted: [], pending: [], srs: {} } });
  await call("/api/ext?u=" + tid, { changes: { "set|target": { v: "zh-CN", at: 3 } } });
  r = await call("/api/users", { remove: tid }); ok(r.j.ok && !r.j.users.some(x => x.id === tid) && ![...kv.keys()].some(k => k.startsWith("u/" + tid + "/")), "empty user removed with keys");
  r = await call("/api/vocab?u=" + tid); ok(r.status === 404, "removed user unknown");
  r = await call("/api/users", { remove: "" }); ok(!r.j.ok && r.j.users === undefined, "owner cannot be removed");
  console.log(fail ? "t41 FAILED" : "t41 ok");
  process.exit(fail ? 1 : 0);
})();
