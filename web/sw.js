/* 只缓存超市价格清单相关资源；其它页面照常走网络 */
const IMG='kl-img-v1',PAGE='kl-page-v1',FONT='kl-font-v1';
self.addEventListener('install',e=>{self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim());});
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const u=new URL(req.url);
  if(u.origin===location.origin&&/\/shop-(thumbs|photos)\//.test(u.pathname)){
    e.respondWith(caches.open(IMG).then(c=>c.match(req,{ignoreSearch:true}).then(hit=>hit||fetch(req).then(res=>{if(res.ok)c.put(req,res.clone());return res;}))));
  }else if(u.origin===location.origin&&/\/kl-prices\.html$/.test(u.pathname)){
    e.respondWith(fetch(req).then(res=>{if(res.ok){const cp=res.clone();caches.open(PAGE).then(c=>c.put('kl-prices.html',cp));}return res;}).catch(()=>caches.open(PAGE).then(c=>c.match('kl-prices.html')).then(h=>h||caches.open(IMG).then(c=>c.match('kl-prices.html')))));
  }else if(/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)){
    e.respondWith(caches.open(FONT).then(c=>c.match(req).then(hit=>{const net=fetch(req).then(res=>{if(res.ok)c.put(req,res.clone());return res;}).catch(()=>hit);return hit||net;})));
  }
});
