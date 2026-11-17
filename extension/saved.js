const $ = id => document.getElementById(id);
let words = [];
function draw() {
  $("list").innerHTML = words.length ? words.map((w, i) => '<span class="chip"><b></b><i data-i="' + i + '" title="删除">×</i></span>').join("") : '<span style="color:#7C8794">还没有收集的词。看视频时点单词卡片上的“＋ 加入生词本”。</span>';
  [...document.querySelectorAll(".chip b")].forEach((b, i) => (b.textContent = words[i]));
}
chrome.storage.local.get({ saved: [] }, v => { words = v.saved; draw(); });
$("list").onclick = e => { const i = e.target.dataset.i; if (i === undefined) return; words.splice(+i, 1); chrome.storage.local.set({ saved: words }); draw(); };
$("copy").onclick = async () => { try { await navigator.clipboard.writeText(words.join("\n")); $("msg").textContent = "✓ 已复制 " + words.length + " 个词"; } catch (e) { $("msg").textContent = "复制失败"; } };
$("clear").onclick = () => { if (confirm("清空本地备份？（不影响生词本网站里的队列）")) { words = []; chrome.storage.local.set({ saved: [] }); draw(); } };
