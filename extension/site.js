// 在生词本网站上运行：告诉网页「这台电脑装了插件」、插件的 ID 和插件同步的是哪个家人（data-ban-user，空 = 主人），
// 网站「⭐ 已保存」在同一个人时直接嵌入插件的页面（能编辑），不是同一个人时显示网站版
chrome.storage.local.get({ siteUser: "" }, v => {
  document.documentElement.setAttribute("data-ban-user", (v && v.siteUser) || "");
  document.documentElement.setAttribute("data-ban-ext", chrome.runtime.id);
  window.dispatchEvent(new Event("ban-ext"));
});
