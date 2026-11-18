使用说明
========

【本地预览】
  把「双击预览.command」放在 web 文件夹里（它不进仓库），双击 → 浏览器自动打开 http://localhost:8000
  停止：在弹出的黑色终端窗口按 Control + C

  ※ 第一次双击若提示「无法打开，来自未识别的开发者」：
     右键该文件 → 选「打开」→ 再点「打开」即可。
  ※ 不要直接双击 index.html（file:// 下图片和 tab 都加载不出来）

【部署到线上】
  网站托管在 Cloudflare Pages，网址 https://ruilearning-my.pages.dev
  连着 GitHub 仓库 felix20260606/ruilearning-my 的 main 分支，推送就自动部署
  （免费版每月 500 次构建，流量不限）。
  ※ 网站文件都在仓库的 web/ 文件夹里；仓库里的 extension/ 是浏览器插件，tests/ 是测试。
  ※ Cloudflare 构建设置：不需要构建命令，输出目录 web，只监听 web/ 的改动
     （改插件不会触发部署）。
  ※ 视频字幕和生词本都存在 Cloudflare KV 里，Pages 项目绑定的 KV 变量名是 CAPTIONS。

【文件清单】
  index.html             主页面（顶部：英语 / 生活 / 视频）
  watch.js               「🎬 视频」：嵌入播放器 + 同步双语字幕 + 点词查词 + 书签小工具
  _worker.js             后台接口：视频字幕（/api/cap）和生词本（/api/vocab），数据在 Cloudflare KV；
                         不设口令；生词本每 6 小时自动备份到仓库 data/vocab.json，后台另存 30 天每日存档，可还原
  _routes.json           只让接口请求经过 _worker.js，其它文件直接当静态文件发
  fat-nav.html           减脂导航页（减脂 → 🧭导航，默认；全部减脂页面卡片目录）
  jianzhi-wrap.html      减脂·卷饼公式（减脂 → 卷饼公式，默认；照用户实拍小票+超市目录规划）
  jianzhi-exec10.html    减脂·10天傻瓜执行版（减脂 → 10天执行，默认；178cm/91kg定制，照做即可）
  jianzhi-14day.html     减脂·2周冲刺计划（减脂 → 2周计划，默认；16:8断食+高低碳+每天训练）
  jianzhi-10day.html     10天具体食谱（每顿吃啥·份量·随机搭·可换一批；从2周计划页按钮进）
  jianzhi-kl.html        减脂·吉隆坡版（减脂 → 吉隆坡；内含「照超市实拍买什么」）
  shop-thumbs/           557 张单品实拍小图（从高清原图逐个裁出，价格清单每行左侧+卷饼页引用）
  shop-photos/           81 张超市货架实拍（kl-prices.html 图库引用，压缩版）
  kl-prices.html         吉隆坡超市价格清单（786种实拍·RM原价+可换算RMB，从减脂吉隆坡版链接进）
                         含：推荐星级/做法/购物清单/蛋白性价比/10天采购/收藏打分/离线（sw.js）
  sw.js                  只缓存 kl-prices 的页面与商品图，供超市离线查看
  jianzhi-calc.html      @谭成义 系数营养计算器（减脂 📐营养计算 tab）
  jianzhi-linyi.html     减脂·临沂版（减脂 → 临沂）
  jianzhi-plan.html      减脂·曼谷版（减脂 → 曼谷）
  dongbei-trip.html      东北自驾行程手册（旅游 → 东北）
  malacca.html           马六甲 2天1晚行程（旅游 → 马六甲2日）
  trip-nav.html          旅游导航页（旅游 → 🧭导航，默认；全部行程卡片目录）
  langkawi-trip.html     兰卡威3天2晚（旅游 → 兰卡威，默认；KL直飞+天空之桥+芭雅岛浮潜，11-3月当季）
  penang-trip.html       槟城3天2晚（旅游 → 槟城，默认；TBS来回+Cititel+猫沙滩/MonkeyBeach）
  sg-2day.html           新加坡2天1夜（旅游 → 新加坡2天1夜，默认；8/19-21定制+存包攻略）
  sg-trip.html           吉隆坡→新加坡 3天2晚（旅游 → 新加坡，默认；入境清单+大巴过关+行程）
  malacca-1day.html      马六甲一日游·古城暴走（旅游 → 马六甲1日）
  ielts-notes.html       雅思手写笔记（雅思 → 笔记）
  dongbei-route.svg      路线示意图（矢量）
  dongbei-route.png      路线示意图（图片）
  dongbei-handbook.pdf   可打印行程手册
  dongbei-handbook.docx  Word 版行程手册
  双击预览.command        本地预览小工具

【小提示】
  想改旅游 tab 的按钮名字或增删文件：
  打开 index.html 搜索 TRIP_FILES，改那几行即可。
