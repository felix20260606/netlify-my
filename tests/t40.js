// 语法下划线下方的缩写标注
const { chromium } = require('playwright'); const fs=require('fs');
(async () => {
  fs.rmSync('/tmp/pw-prof40',{recursive:true,force:true});
  const ctx = await chromium.launchPersistentContext('/tmp/pw-prof40', { channel:'chromium', headless: true, deviceScaleFactor: 2, args: ['--disable-extensions-except=/home/claude/ext','--load-extension=/home/claude/ext','--no-sandbox','--autoplay-policy=no-user-gesture-required'] });
  const events=[{tStartMs:0,dDurationMs:60000,segs:[{utf8:"She wrote papers, has written a bigger one, but it wasn't done."}]}];
  await ctx.route('https://www.youtube.com/**', r => { const u=r.request().url();
    if(u.includes('/api/timedtext')) return r.fulfill({contentType:'application/json',body:JSON.stringify({events})});
    if(u.endsWith('tv.webm')) return r.fulfill({contentType:'video/webm',body:fs.readFileSync('/tmp/tv.webm')});
    r.fulfill({contentType:'text/html',body:'<html><body style="margin:0"><div id="movie_player" style="position:relative;width:900px;height:500px;background:#333"><video class="html5-main-video" width=900 height=500 src="/tv.webm" muted></video></div><script>setTimeout(()=>fetch("/api/timedtext?v=abc&lang=en"),300)</script></body></html>'}); });
  await ctx.route(/translate\.googleapis/, r=>r.fulfill({contentType:'application/json',body:JSON.stringify([[["我写了论文，她写了一篇更大的，但还没写完。","x"]],null,"en"])}));
  const p = await ctx.newPage(); let fail=0; const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}}; p.on('pageerror',e=>{fail++;console.log('PAGEERR',e.message)});
  await p.setViewportSize({width:900,height:520});
  await p.goto('https://www.youtube.com/watch?v=abc'); await p.waitForTimeout(1200); await p.evaluate(()=>document.querySelector('video').play()); await p.waitForTimeout(1500);
  const lab=await p.$$eval('#vs-sub .vs-o .vs-w',els=>els.map(e=>e.textContent+':'+getComputedStyle(e,'::after').content.replace(/"/g,'')).filter(x=>!/:none$|:normal$/.test(x)));
  console.log(lab.join(' '));
  ok(lab.includes('wrote:PST'),'PST'); ok(lab.some(x=>/^(has|written):PRF$/.test(x)),'PRF'); ok(lab.filter(x=>/:PRF$/.test(x)).length===1,'PRF once'); ok(lab.includes('papers:PL'),'PL'); ok(lab.includes('bigger:CMP'),'CMP'); ok(lab.some(x=>/:ART$/.test(x)),'ART'); ok(lab.some(x=>/:(NEG|PASS)$/.test(x)),'NEG/PASS');
  ok(await p.evaluate(()=>document.documentElement.classList.contains('vs-gab')),'class on');
  const b=await p.evaluate(()=>{const s=document.querySelector('#vs-sub').getBoundingClientRect(),m=document.querySelector('#movie_player').getBoundingClientRect();return{b:s.bottom,mb:m.bottom}}); ok(b.b<=b.mb,'inside player');
  await p.screenshot({path:process.argv[2]||'/tmp/t40.png',clip:{x:0,y:300,width:900,height:200}});
  console.log(fail?'t40 FAILED':'t40 ok'); await ctx.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
