(function(){
var K="__KEY__",S="__SITE__",D=document,L=location;
if(!/(^|\.)youtube\.com$/.test(L.hostname)){alert("请先在 Safari 里打开 YouTube 的视频页，再点这个书签");return;}
var m=L.href.match(/[?&]v=([\w-]{11})/)||L.href.match(/\/shorts\/([\w-]{11})/);
if(!m){alert("请先打开一个 YouTube 视频，再点这个书签");return;}
var v=m[1],p=D.getElementById("movie_player")||D.querySelector(".html5-video-player"),done=false,hit=false;
var box=D.createElement("div");box.style.cssText="position:fixed;left:12px;right:12px;top:12px;z-index:2147483647;background:#0c9370;color:#fff;font:600 15px/1.4 system-ui;padding:12px 14px;border-radius:12px;text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.35)";
var say=function(t){box.textContent=t;if(!box.parentNode)D.body.appendChild(box);};
say("正在读取字幕…");
function parse(t){var j=JSON.parse(t),c=[],i,e,s;for(i=0;i<(j.events||[]).length;i++){e=j.events[i];if(!e.segs)continue;s=e.segs.map(function(x){return x.utf8||""}).join("").replace(/\s+/g," ").trim();if(!s)continue;c.push({s:(e.tStartMs||0)/1000,e:((e.tStartMs||0)+(e.dDurationMs||0))/1000,t:s});}
for(i=0;i<c.length-1;i++)if(c[i].e>c[i+1].s)c[i].e=c[i+1].s;return c.filter(function(x){return x.e>x.s});}
function send(c,lang){if(done||!c.length)return;done=true;hit=true;say("共 "+c.length+" 句（"+c.filter(function(x){return x.r}).length+" 句有中文），正在保存…");var a="";try{a=p.getVideoData().author||""}catch(e){}
F.call(window,S+"/.netlify/functions/cap",{method:"POST",headers:{"Content-Type":"application/json","X-Key":K},body:JSON.stringify({v:v,tl:"zh-CN",title:D.title.replace(/^\(\d+\)\s*/,"").replace(/ - YouTube$/,""),author:a,lang:lang||"en",cues:c})}).then(function(r){return r.json()}).then(function(r){if(r&&r.ok){say("已保存，正在打开学习页…");L.href=S+"/?v="+v;}else{done=false;say("保存失败："+((r&&r.error)||"未知错误"));}}).catch(function(){done=false;say("保存失败：网络问题，请再点一次书签");});}
var F=window.fetch,O=XMLHttpRequest.prototype.open,seen={};
function cl(t){t=String(t||"").replace(/\[[^\]]*\]|\u266a|>>+|\u00bb/g," ").replace(/\s+/g," ").trim();return /^\([^)]*\)$/.test(t)?"":t;}
function merge(c,z){var m={},i,k,b,d;for(i=0;i<z.length;i++)m[Math.round(z[i].s*10)]=z[i].t;
for(i=0;i<c.length;i++){k=Math.round(c[i].s*10);c[i].r=m[k]||m[k-1]||m[k+1]||"";if(!c[i].r&&z.length){b=null;for(d=0;d<z.length;d++)if(z[d].s<c[i].e&&z[d].e>c[i].s&&Math.abs(z[d].s-c[i].s)<1.5){b=z[d];break;}if(b)c[i].r=b.t;}}
var o=[];for(i=0;i<c.length;i++){c[i].t=cl(c[i].t);c[i].r=cl(c[i].r);if(c[i].t)o.push(c[i]);}return o;}
function grab(u){if(done||!/\/api\/timedtext/.test(u))return;var a;try{a=new URL(u,L.href)}catch(e){return}if(a.searchParams.get("v")&&a.searchParams.get("v")!==v)return;a.searchParams.delete("tlang");a.searchParams.set("fmt","json3");var k=a.href;if(seen[k])return;seen[k]=1;var lang=a.searchParams.get("lang")||"en";
F.call(window,k).then(function(r){return r.ok?r.text():""}).then(function(t){if(!t||done)return;var c=parse(t);if(!c.length)return;say("拿到 "+c.length+" 句字幕，正在取中文…");a.searchParams.set("tlang","zh-Hans");
return F.call(window,a.href).then(function(r){return r.ok?r.text():""}).then(function(x){var z=[];try{z=x?parse(x):[]}catch(e){}send(merge(c,z),lang)},function(){send(merge(c,[]),lang)});}).catch(function(){seen[k]=0});}
XMLHttpRequest.prototype.open=function(a,u){try{grab(String(u))}catch(e){}return O.apply(this,arguments);};
window.fetch=function(i){try{grab(String(typeof i==="string"?i:(i&&i.url)||""))}catch(e){}return F.apply(this,arguments);};
var scan=function(){if(done)return;var es=performance.getEntriesByType("resource"),i;for(i=es.length-1;i>=0;i--)grab(es[i].name);};
var kick=function(){if(done||!p)return;try{p.loadModule&&p.loadModule("captions");var tl=p.getOption("captions","tracklist")||[],en=tl.filter(function(x){return /^en/.test(x.languageCode)}),tr=en.filter(function(x){return x.kind!=="asr"})[0]||en[0]||tl[0];p.setOption("captions","track",{});if(tr)setTimeout(function(){try{p.setOption("captions","track",{languageCode:tr.languageCode})}catch(e){}},350);else if(p.toggleSubtitlesOn)p.toggleSubtitlesOn();}catch(e){}};
scan();setTimeout(function(){if(!done)kick()},1200);setTimeout(kick,4000);setTimeout(kick,7500);var iv=setInterval(function(){if(done)clearInterval(iv);else scan()},700);setTimeout(function(){clearInterval(iv)},11000);
setTimeout(function(){if(!hit)say("没拿到字幕：这个视频可能没有字幕。请先点一下播放，再点一次书签试试");setTimeout(function(){if(!hit&&box.parentNode)box.parentNode.removeChild(box)},6000);},11000);
})();
