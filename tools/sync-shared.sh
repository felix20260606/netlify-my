#!/bin/bash
# 插件和网站共用的模块：词频、按水平上色、语法下划线、句型、习语 / 短语动词 / 单词注释的数据和代码。
# 源文件在 extension/（插件里改），这里复制到 web/vs/ 给网站「🎬 视频」页用，保证两边判断一模一样。
# 改了 extension/ 里这些文件后跑一次：bash tools/sync-shared.sh；然后提交、推送（网站自动部署）。
set -e
cd "$(dirname "$0")/.."
for f in freq.js vlevel.js gram.js pattern.js data-phrases.js data-words.js data-morph.js notes.js; do
  cp "extension/$f" "web/vs/$f"
done
# 网站加载时用文件内容的指纹当版本号，改了就自动换新，不吃浏览器缓存
v=$(cat web/vs/*.js | shasum | cut -c1-8)
printf '%s\n' "$v" > web/vs/VERSION
echo "已同步到 web/vs/（版本 $v）"
