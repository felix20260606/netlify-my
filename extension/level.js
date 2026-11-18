const COL = { colKnown: "#7CE3B8", colSuggest: "#FFB86B", colIgnore: "#CDA8F7", colSpecial: "#7CE3B8" };
const D = Object.assign({ level: -1, greenKnown: false, fadeRare: true, ratio: 1.5, showMarks: true, showSuggest: true, showLearn: true, showLearnOutline: true, showIgnore: true, showSpecial: true }, COL);
const SAMPLE = "Last summer I travelled alone to a small coastal village near Lisbon. The weather was terrible, so I spent 12 mornings in a cosy café, reading old newspapers and watching fishermen repair their nets.\n\nOne evening, an elderly woman named Maria noticed my accent and asked where I was from. We chatted for hours. She described how the harbour had changed, and confessed that she missed the lively festivals of her childhood.\n\nBefore I left, she handed me a tiny envelope containing a seashell. “Keep it,” she whispered, “and come back someday.”";
let S = Object.assign({}, D);
const $ = id => document.getElementById(id);
VS_SAVED = new Set(["envelope", "harbour"]);
function vars() { const st = document.documentElement.style; st.setProperty("--ck", S.colKnown); st.setProperty("--cs", S.colSuggest); st.setProperty("--ci", S.colIgnore); st.setProperty("--cp", S.colSpecial); }
function renderTiers() {
  const box = $("tiers"); box.innerHTML = "";
  const z = document.createElement("div"); z.className = "row zero" + (S.level === 0 ? " known edge" : ""); z.dataset.r = 0;
  z.innerHTML = '<span class="n">0</span>我还不知道任何单词。'; box.append(z);
  TIERS.forEach(t => {
    const d = document.createElement("div"); d.dataset.r = t.r;
    d.className = "row" + (S.level >= t.r ? " known" : "") + (S.level === t.r ? " edge" : "");
    d.innerHTML = '<span class="n">' + t.r + "</span>" + t.w.map(w => '<span class="c">' + w + "</span>").join("");
    box.append(d);
  });
}
function renderSample() {
  const esc = s => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  vars(); $("sample").innerHTML = SAMPLE.split("\n\n").map(p => "<p>" + vsMark(esc(p), S, "w") + "</p>").join("");
}
function refresh() { renderTiers(); renderSample(); }
function fill() {
  document.querySelectorAll("[data-k]").forEach(el => { if (el.type === "checkbox") el.checked = !!S[el.dataset.k]; else el.value = String(S[el.dataset.k]); });
  document.querySelectorAll("[data-c]").forEach(el => (el.value = S[el.dataset.c]));
}
$("tiers").addEventListener("click", e => { const r = e.target.closest(".row"); if (!r) return; S.level = +r.dataset.r; refresh(); $("msg").textContent = ""; });
document.querySelectorAll("[data-k]").forEach(el => (el.onchange = () => { S[el.dataset.k] = el.type === "checkbox" ? el.checked : +el.value; renderSample(); }));
document.querySelectorAll("[data-c]").forEach(el => (el.oninput = () => { S[el.dataset.c] = el.value; renderSample(); }));
$("rc").onclick = e => { e.preventDefault(); Object.assign(S, COL); fill(); renderSample(); };
$("save").onclick = () => {
  if (S.level < 0) { $("msg").textContent = "请先点击一行选择水平"; return; }
  const o = {}; Object.keys(D).forEach(k => { if (k !== "showMarks") o[k] = S[k]; });
  chrome.storage.sync.set(o, () => { $("msg").textContent = "✓ 已保存：词汇量约 " + S.level + " 词，视频里立即生效"; });
};
chrome.storage.sync.get(D, v => { S = Object.assign({}, D, v); fill(); refresh(); });
