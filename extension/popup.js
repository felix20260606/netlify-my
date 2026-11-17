const D = { showGram: true, enabled: true, srcLang: "en", target: "zh-CN", engine: "youtube", showTrans: true, showHuman: false, hideMode: "off", merge: true, showMarks: true, hoverPause: true, speakOnClick: true, dictUrls: "", autoPause: false, rate: 1, ctlHidden: false, hideBar: false, panelOpen: true, below: false, arrowKeys: false, font: "", origSize: 100, trSize: 100, trColor: "#FFD77A", bgColor: "#0E141C", bgOpacity: 78, posBottom: 11, level: -1 };
const LOOK = ["font", "origSize", "trSize", "trColor", "bgColor", "bgOpacity", "posBottom"];
const $ = id => document.getElementById(id), els = [...document.querySelectorAll("[data-k]")];
let V = Object.assign({}, D);
function rgba(h, o) { h = h.replace("#", ""); const n = parseInt(h, 16); return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + o / 100 + ")"; }
function paint() {
  $("pvin").style.background = rgba(V.bgColor, V.bgOpacity); $("pvin").style.fontFamily = V.font || "";
  $("pvo").style.fontSize = 16 * V.origSize / 100 + "px"; $("pvt").style.fontSize = 14 * V.trSize / 100 + "px"; $("pvt").style.color = V.trColor;
  els.forEach(el => { if (el.type === "range") el.nextElementSibling.textContent = el.value + "%"; });
  $("sizePreset").value = V.origSize === V.trSize && [70, 85, 100, 125, 150].includes(V.origSize) ? String(V.origSize) : "";
  $("lvn").textContent = V.level >= 0 ? "（约 " + V.level + " 词）" : "（未设置）";
}
function show() {
  els.forEach(el => { const k = el.dataset.k, v = V[k]; if (el.type === "checkbox") el.checked = el.dataset.inv ? !v : !!v; else el.value = v; });
  paint();
}
function val(el) { if (el.type === "checkbox") return el.dataset.inv ? !el.checked : el.checked; if (el.type === "range" || el.dataset.num) return +el.value; return el.value; }
els.forEach(el => { const h = () => { V[el.dataset.k] = val(el); chrome.storage.sync.set({ [el.dataset.k]: V[el.dataset.k] }); paint(); }; el.addEventListener(el.type === "range" || el.type === "color" || el.tagName === "TEXTAREA" ? "input" : "change", h); });
$("sizePreset").onchange = e => { if (!e.target.value) return; V.origSize = V.trSize = +e.target.value; chrome.storage.sync.set({ origSize: V.origSize, trSize: V.trSize }); show(); };
$("rst").onclick = () => { const o = {}; LOOK.forEach(k => (o[k] = V[k] = D[k])); chrome.storage.sync.set(o); show(); };
$("lv").onclick = () => chrome.runtime.openOptionsPage();
$("sv").onclick = e => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL("saved.html") }); };
chrome.storage.sync.get(D, v => { V = v; show(); });
chrome.storage.onChanged.addListener((c, a) => { if (a !== "sync") return; for (const k in c) if (k in V) V[k] = c[k].newValue; show(); });
chrome.storage.local.get({ saved: [], trackLangs: [] }, v => {
  $("n").textContent = v.saved.length;
  const has = new Set(v.trackLangs.map(l => l.toLowerCase())), base = new Set(v.trackLangs.map(l => l.toLowerCase().split(/[-_]/)[0]));
  [...$("target").options].forEach(o => { const l = o.value.toLowerCase(); if (has.has(l) || base.has(l.split("-")[0])) o.textContent += " [人工翻译]"; });
});
chrome.storage.local.get({ audioTracks: [] }, v => { v.audioTracks.forEach((n, i) => { const o = document.createElement("option"); o.value = String(i); o.textContent = n; $("audio").append(o); }); });
$("audio").onchange = e => chrome.storage.local.set({ audioPick: { i: e.target.value === "" ? -1 : +e.target.value, at: Date.now() } });
