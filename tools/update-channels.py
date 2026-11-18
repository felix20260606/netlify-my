# 重新抓取 Notion「用油管足不出户自学流利英文·频道通关推荐」，生成 web/yt-channels.json（「🎬 视频」页的频道通关地图）
# 用法：python3 tools/update-channels.py   （只读公开页面；会去掉作者联系邮箱）
import json, re, urllib.request
BASE='https://sincere-numeric-f39.notion.site/api/v3/'
PID='20a86f84-b68d-800e-a7e6-e70ab345a75a'; SPACE='3e61a919-9fd2-4d35-8896-d2c7a92e2f5f'; VIEW='20a86f84-b68d-80df-a81d-000c894c2c0f'
def post(ep, body):
    req=urllib.request.Request(BASE+ep, data=json.dumps(body).encode(), headers={'content-type':'application/json','user-agent':'Mozilla/5.0'})
    return json.load(urllib.request.urlopen(req, timeout=30))
val=lambda x: (x or {}).get('value',{}).get('value') or (x or {}).get('value')
j=post('loadCachedPageChunk',{'page':{'id':PID},'limit':100,'cursor':{'stack':[]},'chunkNumber':0,'verticalColumns':False})
order=val(j['recordMap']['collection_view'][VIEW])['page_sort']
def blocks(ids):
    out={}
    for i in range(0,len(ids),80):
        r=post('syncRecordValuesMain',{'requests':[{'pointer':{'table':'block','id':x,'spaceId':SPACE},'version':-1} for x in ids[i:i+80]]})
        out.update(r['recordMap'].get('block',{}))
    return out
B=blocks(order)
P={';>y>':'url','Nj<U':'type','VXkv':'notes','ayh@':'topic','ozFG':'level','wYSq':'accent','title':'name'}
txt=lambda v: ''.join(x[0] for x in (v or []))
intro=[]; chans=[]
for bid in order:
    b=val(B.get(bid));
    if not b: continue
    o={}
    for k,n in P.items():
        v=(b.get('properties') or {}).get(k)
        if v is None: continue
        t=txt(v).strip()
        o[n]=[s.strip() for s in t.split(',') if s.strip()] if n in ('type','topic','level','accent') else t
    kids=b.get('content') or []
    KB=blocks(kids) if kids else {}
    body=[]
    for k in kids:
        c=val(KB.get(k))
        if not c: continue
        t=txt((c.get('properties') or {}).get('title')).strip()
        src=(c.get('format') or {}).get('display_source') or txt((c.get('properties') or {}).get('source'))
        body.append({'kind':c['type'],'text':t,'src':src})
    if (o.get('name') or '').startswith('介绍说明'):
        intro=[x for x in body if x['text']]; continue
    if not o.get('name') or not o.get('url'): continue
    samples=[]; label=''
    for x in body:
        if x['kind'] in ('video','embed') and x['src']:
            m=re.search(r'/embed/([\w-]{11})',x['src']); lst=re.search(r'list=([\w-]+)',x['src']); st=re.search(r'[?&]start=(\d+)',x['src'])
            if m: samples.append({'v':m.group(1),'t':int(st.group(1)) if st else 0,'label':label.rstrip('：:').strip() or 'Sample'})
            elif lst: samples.append({'list':lst.group(1),'label':label.rstrip('：:').strip() or '播放列表'})
            label=''
        elif x['text']: label=x['text']
    o['notes']=re.sub(r'\s*\n\s*',' / ',(o.get('notes') or '').strip()).strip(' /')
    o['name']=o['name'].strip()
    if samples: o['samples']=samples
    chans.append(o)
LV=['0基础','初阶','初中阶衔接','中阶','高阶']
for c in chans:
    c['level']=[l for l in LV if l in (c.get('level') or [])]
    acc=c.get('accent') or []; c['voice']=[a for a in acc if a in ('男','女')]; c['accent']=[a for a in acc if a not in ('男','女')]
data={'source':{'title':'用油管足不出户自学流利英文·频道通关推荐','url':'https://sincere-numeric-f39.notion.site/20a86f84b68d800ea7e6e70ab345a75a','fetched':__import__('datetime').date.today().isoformat()},
      'intro':[{'kind':x['kind'],'text':x['text']} for x in intro if 'ziyoumaoxianying' not in x['text']],'levels':LV,'channels':chans}
open(__import__('os').path.join(__import__('os').path.dirname(__file__),'..','web','yt-channels.json'),'w').write(json.dumps(data,ensure_ascii=False,indent=1))
print(len(chans),'channels;', sum(1 for c in chans if c.get('samples')),'with samples;', 'levels:', {l:sum(1 for c in chans if l in c['level']) for l in LV})
print('types:', sorted({t for c in chans for t in c.get('type',[])}))
