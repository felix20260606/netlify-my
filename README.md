# LearnVocab

个人英语学习工具，两部分：

- `extension/` — 浏览器插件「双语字幕 · 生词收集」：YouTube 双语字幕、悬停释义、点击词典、按词汇水平着色、短语提示、句子收藏、导出，并把生词同步到生词本的待整理队列。
- `site/` — 生词本网页（单文件 `index.html`，部署在 Netlify）。
- `tests/` — 用 Playwright 加模拟 YouTube 页面跑的回归测试脚本。

## 安装插件

1. 打开 `chrome://extensions`（Brave 为 `brave://extensions`），开启「开发者模式」
2. 「加载已解压的扩展程序」→ 选择 `extension/` 文件夹
3. 更新后点「重新加载」，再刷新 YouTube

使用说明见 `extension/README.txt`。

## 数据来源

- 词频：OpenSubtitles 2018 字幕语料（hermitdave/FrequencyWords，CC-BY-SA-4.0）
- 整句翻译：YouTube 自动翻译；单词释义：Google 翻译词典、Wiktionary；音标：Datamuse

## 同步密钥

生词本同步用的 JSONBin 密钥不进仓库：

- 插件：把 `extension/config.example.js` 复制为 `extension/config.js` 并填入（`config.js` 已在 `.gitignore` 里）。没有这个文件时，收词只存在浏览器本地。
- 网页：`site/index.html` 里的 `__SYNC_BIN__` 和 `__SYNC_KEY__` 是占位符，部署前替换成真实值。
