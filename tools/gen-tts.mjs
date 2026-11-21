// 口语页的 AI 真人语音：把 web/speak-data.js 里固定的英文句子预先生成成 web/tts/<编号>.mp3，网页优先播这些静态文件（不花额度）。
// 编号 = FNV-1a 32 位（"声音|句子"），网页 web/speak.js 的 ttsKey() 用同一个算法。
// 每次最多生成 TTS_BUDGET 个字母（默认 6000，约 8,200 neurons，Workers AI 免费额度每天 1 万），接口报错（额度用完等）就停下，下次接着做。
// 用法：node tools/gen-tts.mjs            生成一批并更新 web/tts/index.json
//       node tools/gen-tts.mjs --dry      只统计：一共多少句、多少字母、还剩多少没生成
// GitHub Actions（.github/workflows/tts.yml）每天跑一次，直到全部生成完；以后改了 speak-data.js 也会自动补上新句子。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "web/tts");
const API = process.env.TTS_API || "https://ruilearning-my.pages.dev/api/tts";
const BUDGET = +(process.env.TTS_BUDGET || 6000);
const DRY = process.argv.includes("--dry");
export const VOICES = { "": "asteria", A: "orion" }; // 默认（B 和其它所有句子）女声，对话里的 A 男声；改了要同步 web/speak.js 不用改（它读 index.json 里的 voices）

export const clean = t => String(t).replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
export function ttsKey(voice, text) { const s = voice + "|" + clean(text); let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); }

// 按页面实际朗读的字段收集句子（顺序 = 生成的先后：新手先用到的排前面）
export function collect(D) {
  const L = [], seen = new Set();
  const add = (t, who) => { t = clean(t || ""); if (!t || !/[a-z]/i.test(t) || /[一-鿿]/.test(t) || t.length > 1500) return; const v = VOICES[who === "A" ? "A" : ""], k = ttsKey(v, t); if (seen.has(k)) return; seen.add(k); L.push({ k, v, t }); };
  const st = D.starter || {};
  (st.rescue || []).forEach(x => add(x.en)); (st.intro || []).forEach(x => add(x.en));
  (D.dialogs || []).forEach(d => (d.lines || []).forEach(l => { add(l.en, l.who); if (l.who === "A") add(l.en); })); // 角色扮演里 A 也可能用默认声音读
  (D.quick || []).forEach(x => { add(x.q); add(x.a); });
  const P = D.pron || {};
  (P.shadow || []).forEach(g => (g.items || g.lines || []).forEach(x => add(x.en)));
  (D.functions || []).concat(D.slang || []).forEach(f => (f.items || []).forEach(x => { add(x.en); if (x.ex) add(String(x.ex).replace(/\b[AB]:\s*/g, "")); }));
  (D.drills || []).forEach(d => (d.items || []).forEach(x => add(x.en)));
  (D.topics || []).forEach(t => { add(t.q); add(t.sample); });
  (P.pairs || []).forEach(p => { (p.sent || []).forEach(s => s.forEach(x => add(x))); (p.words || []).forEach(w => w.forEach(x => add(x))); });
  (P.connected || []).forEach(x => add(x.en));
  (D.stress || []).forEach(x => add(x.en));
  (D.twisters || []).forEach(x => add(x.en));
  return L;
}

function loadData() {
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "web/speak-data.js"), "utf8"), ctx);
  return ctx.window.SPEAK_DATA;
}

async function main() {
  const L = collect(loadData());
  fs.mkdirSync(OUT, { recursive: true });
  const have = new Set(fs.readdirSync(OUT).filter(f => f.endsWith(".mp3")).map(f => f.slice(0, -4)));
  const todo = L.filter(x => !have.has(x.k));
  const chars = a => a.reduce((n, x) => n + x.t.length, 0);
  console.log(`共 ${L.length} 句 ${chars(L)} 个字母；已生成 ${L.length - todo.length} 句，还剩 ${todo.length} 句 ${chars(todo)} 个字母`);
  let used = 0, made = 0, stop = "";
  if (!DRY) for (const x of todo) {
    if (used + x.t.length > BUDGET) { stop = "到了今天的字母上限"; break; }
    let r;
    try { r = await fetch(API + "?v=" + x.v + "&t=" + encodeURIComponent(x.t)); } catch (e) { stop = "连不上：" + e.message; break; }
    const ct = r.headers.get("content-type") || "";
    if (!r.ok || !ct.startsWith("audio/")) { stop = "接口报错 " + r.status + " " + (await r.text()).slice(0, 200); break; }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 200) { stop = "音频太小"; break; }
    fs.writeFileSync(path.join(OUT, x.k + ".mp3"), buf); have.add(x.k); used += x.t.length; made++;
  }
  // index.json：done = 有静态文件的，todo = 固定句子但还没生成的（网页对 todo 先用系统语音，不现场花额度）
  const done = L.filter(x => have.has(x.k)).map(x => x.k), left = L.filter(x => !have.has(x.k)).map(x => x.k);
  if (!DRY) fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify({ voices: VOICES, done, todo: left }) + "\n");
  console.log(`这次生成 ${made} 句 ${used} 个字母；还剩 ${left.length} 句${stop ? "（停下原因：" + stop + "）" : ""}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
