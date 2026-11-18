// 在生词本网站上运行：告诉网页「这台电脑装了插件」和插件的 ID，网站「英语」里就会出现「⭐ 已保存」「🔁 复习」，直接嵌入插件的这两个页面
document.documentElement.setAttribute("data-ban-ext", chrome.runtime.id);
window.dispatchEvent(new Event("ban-ext"));
