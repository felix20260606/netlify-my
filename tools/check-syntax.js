// 语法检查（GitHub Actions 自动测试用）：web/ 下所有 .js 和 index.html 里的内联 <script>，有语法错就失败
const fs = require("fs"), path = require("path"), vm = require("vm"), { execFileSync } = require("child_process");
const web = path.join(__dirname, "..", "web"); let bad = 0;
for (const f of fs.readdirSync(web).filter(f => f.endsWith(".js"))) {
  try { execFileSync(process.execPath, ["--check", path.join(web, f)], { stdio: "pipe" }); } catch (e) { bad++; console.log("✗ " + f + "\n" + String(e.stderr || e.message).split("\n").slice(0, 6).join("\n")); }
}
for (const f of fs.readdirSync(web).filter(f => f.endsWith(".html"))) {
  const html = fs.readFileSync(path.join(web, f), "utf8"); let i = 0;
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="(?:application\/ld\+json|text\/template|module)")[^>]*>([\s\S]*?)<\/script>/gi)) {
    i++; try { new vm.Script(m[1], { filename: f + "#script" + i }); } catch (e) { bad++; console.log("✗ " + f + " 第 " + i + " 段内联脚本：" + e.message); }
  }
}
console.log(bad ? bad + " 个语法错误" : "语法检查通过"); process.exit(bad ? 1 : 0);
