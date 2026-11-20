#!/usr/bin/env python3
"""把 Cloudflare 上的原声和截图备份成普通文件（GitHub Actions 每 6 小时跑一次，也能本机手动跑）。

读 data/ext.json 里的录音截图索引（"med|med:w:apple" → 签名），只下载新增或改过的，存到 data/media/：
  data/media/w/apple.webm      原声
  data/media/w/apple-1.jpg     这一句开头的画面
  data/media/w/apple-2.jpg     这一句结尾的画面
  data/media/w/apple.json      其它信息（原句、译文、视频、时间、键名 k、签名 sig）
  data/media/index.json        键名 → 文件名和签名
w = 单词，s = 句子和短语。网站上删掉的，备份里保留（Git 历史里也有）。
还原：python3 tools/restore-media.py（把这里的文件重新传回 Cloudflare）。
家人（多用户）：python3 tools/backup-media.py --user u2 → 读 data/users/u2/ext.json，存到 data/users/u2/media/。
"""
import base64, json, os, re, sys, urllib.parse, urllib.request

SITE = "https://ruilearning-my.pages.dev"
USER = sys.argv[sys.argv.index("--user") + 1] if "--user" in sys.argv else ""  # 家人的 id（空 = 主人）
if USER and not re.fullmatch(r"[a-z0-9]{1,12}", USER):
    sys.exit("bad --user")
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", *(["users", USER] if USER else []))
OUT = os.path.join(ROOT, "media")
UQ = "&u=" + USER if USER else ""
EXT = {"audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mp4": ".m4a", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "ruilearning-backup"})  # Cloudflare 会拦 Python 默认的请求头
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def safe(key):  # med:w:apple → ("w", "apple")；med:s:ph|pump fake → ("s", "ph_pump_fake")
    kind = "s" if key.startswith("med:s:") else "w"
    name = re.sub(r"[^a-z0-9]+", "_", key.split(":", 2)[2].lower()).strip("_")[:80] or "x"
    return kind, name


def save_data_url(s, path_noext):
    m = re.match(r"data:([\w/+.-]+)(?:;[^,]*)?;base64,(.*)$", s or "", re.S)
    if not m:
        return None
    ext = EXT.get(m.group(1).split(";")[0], ".bin")
    with open(path_noext + ext, "wb") as f:
        f.write(base64.b64decode(m.group(2)))
    return os.path.basename(path_noext + ext)


def main():
    items = json.load(open(os.path.join(ROOT, "ext.json")))["items"]
    want = {k[4:]: v["v"] for k, v in items.items() if k.startswith("med|")}
    idx_path = os.path.join(OUT, "index.json")
    idx = json.load(open(idx_path)) if os.path.exists(idx_path) else {}
    used = {(e["dir"], e["name"]) : k for k, e in idx.items()}
    n = 0
    for key, sig in sorted(want.items()):
        if idx.get(key, {}).get("sig") == sig:
            continue
        try:
            rec = get(SITE + "/api/media?k=" + urllib.parse.quote(key) + UQ).get("rec")
        except Exception as e:
            print("下载失败，下次再试：", key, e, file=sys.stderr)
            continue
        if not rec:
            continue
        kind, name = safe(key)
        if used.get((kind, name), key) != key:  # 两个键名变成同一个文件名：加个编号
            i = 2
            while (kind, f"{name}_{i}") in used and used[(kind, f"{name}_{i}")] != key:
                i += 1
            name = f"{name}_{i}"
        used[(kind, name)] = key
        d = os.path.join(OUT, kind)
        os.makedirs(d, exist_ok=True)
        base = os.path.join(d, name)
        files = {}
        for field, suffix in (("aud", ""), ("img", "-1"), ("img2", "-2")):
            fn = save_data_url(rec.get(field), base + suffix)
            if fn:
                files[field] = fn
        meta = {k: v for k, v in rec.items() if k not in ("aud", "img", "img2")}
        meta.update({"k": key, "sig": sig, "files": files})
        with open(base + ".json", "w") as f:
            json.dump(meta, f, ensure_ascii=False, indent=1)
        idx[key] = {"dir": kind, "name": name, "sig": sig}
        n += 1
    os.makedirs(OUT, exist_ok=True)
    with open(idx_path, "w") as f:
        json.dump(dict(sorted(idx.items())), f, ensure_ascii=False, indent=1)
    print(f"原声截图：共 {len(want)} 条，这次下载 {n} 条")


if __name__ == "__main__":
    main()
