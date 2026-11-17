// 运行在页面环境：拦截播放器自己请求的字幕地址，交给 content.js
(function () {
  var last = ""; // 最近一次字幕请求的地址：content.js 启动得晚，错过了可以回头来问
  function report(url) {
    try { if (/\/api\/timedtext/.test(url)) { last = new URL(url, location.href).href; window.postMessage({ src: "VS", type: "timedtext", url: last }, "*"); } } catch (e) {}
  }
  var open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, url) { report(String(url)); return open.apply(this, arguments); };
  var f = window.fetch;
  window.fetch = function (input) {
    try { report(typeof input === "string" ? input : input.url); } catch (e) {}
    return f.apply(this, arguments);
  };
  window.addEventListener("message", function (e) {
    if (e.source !== window || !e.data || e.data.src !== "VS-C") return;
    if (e.data.type === "get-last") { if (last) window.postMessage({ src: "VS", type: "timedtext", url: last }, "*"); return; }
    var pl = document.getElementById("movie_player"); if (!pl) return;
    if (e.data.type === "get-tracks") {
      var tracks = [], cur = null;
      try {
        var r = pl.getPlayerResponse();
        tracks = (r.captions.playerCaptionsTracklistRenderer.captionTracks || []).map(function (t) {
          return { lang: t.languageCode, kind: t.kind || "", baseUrl: t.baseUrl, name: (t.name && (t.name.simpleText || (t.name.runs || []).map(function (x) { return x.text; }).join(""))) || t.languageCode };
        });
        var c = pl.getOption("captions", "track"); cur = c && c.languageCode || null;
      } catch (x) {}
      window.postMessage({ src: "VS", type: "tracks", tracks: tracks, cur: cur }, "*");
    }
    if (e.data.type === "get-audio" || e.data.type === "set-audio") {
      try {
        var at = (pl.getAvailableAudioTracks && pl.getAvailableAudioTracks()) || [];
        var nm = function (t) { try { var li = t.getLanguageInfo && t.getLanguageInfo(); return (li && (li.getName ? li.getName() : li.name)) || t.name || t.id || "?"; } catch (x) { return "?"; } };
        if (e.data.type === "set-audio" && at.length) { var k = e.data.index; pl.setAudioTrack(k >= 0 && at[k] ? at[k] : at.filter(function (t) { try { var li = t.getLanguageInfo(); return li.getIsDefault ? li.getIsDefault() : li.isDefault; } catch (x) { return false; } })[0] || at[0]); }
        window.postMessage({ src: "VS", type: "audio", names: at.length > 1 ? at.map(nm) : [] }, "*");
      } catch (x) { window.postMessage({ src: "VS", type: "audio", names: [] }, "*"); }
    }
    if (e.data.type === "set-track") { try { pl.setOption("captions", "track", { languageCode: e.data.lang }); } catch (x) {} }
  });
})();
