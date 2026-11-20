#!/usr/bin/env python3
"""把 data/media/ 里备份的原声和截图重新传回 Cloudflare（/api/media）。

用法：python3 tools/restore-media.py            全部传回
      python3 tools/restore-media.py apple kebab  只传这几个词（或句子文件名）
      python3 tools/restore-media.py --user u2    家人的（data/users/u2/media/ 传回他自己的那份）
传回后，插件下次同步会自动下载到本机。录音截图的索引在 data/ext.json 里，需要的话一起还原（见 流程说明.md「备份与还原」）。
"""
import base64, json, os, re, sys, urllib.request

SITE = "https://ruilearning-my.pages.dev"
args = sys.argv[1:]
USER = ""
if "--user" in args:
    i = args.index("--user"); USER = args[i + 1]; del args[i:i + 2]
    if not re.fullmatch(r"[a-z0-9]{1,12}", USER):
        sys.exit("bad --user")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", *(["users", USER] if USER else []), "media")
MIME = {".webm": "audio/webm", ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}

idx = json.load(open(os.path.join(OUT, "index.json")))
only = set(args)
n = 0
for key, e in idx.items():
    if only and e["name"] not in only and key.split(":", 2)[2] not in only:
        continue
    base = os.path.join(OUT, e["dir"], e["name"])
    meta = json.load(open(base + ".json"))
    rec = {k: v for k, v in meta.items() if k not in ("k", "sig", "files")}
    for field, fn in meta.get("files", {}).items():
        ext = os.path.splitext(fn)[1]
        with open(os.path.join(OUT, e["dir"], fn), "rb") as f:
            rec[field] = "data:" + MIME.get(ext, "application/octet-stream") + ";base64," + base64.b64encode(f.read()).decode()
    body = json.dumps({"k": key, "rec": rec}).encode()
    req = urllib.request.Request(SITE + "/api/media" + ("?u=" + USER if USER else ""), data=body, method="POST", headers={"Content-Type": "application/json", "User-Agent": "ruilearning-backup"})
    urllib.request.urlopen(req, timeout=60).read()
    n += 1
    print("已传回", key)
print(f"共传回 {n} 条")
