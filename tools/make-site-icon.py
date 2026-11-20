#!/usr/bin/env python3
"""网站图标：和插件图标一样的「BAN」（紫→青渐变圆角方块、白色 BAN、一黄一淡蓝两条横线）。
生成 web/icon.svg（浏览器标签页）、web/icon-192.png / icon-512.png（装到桌面、apple-touch-icon）、web/favicon.ico（其它页面默认找的图标）。
尺寸按插件 extension/icons/128.png 量的（128 格坐标 × 4 = 512）。改了样式重新跑：python3 tools/make-site-icon.py"""
import os
from PIL import Image, ImageDraw, ImageFont

WEB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web")
FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
C0, C1, C2 = (120, 70, 201), (81, 81, 196), (22, 154, 132)  # 左上紫、中间蓝紫、右下青
YEL, BLU = (255, 215, 122), (166, 190, 217)

SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- 和插件图标一样：紫→青渐变圆角方块 + 白色 BAN + 一黄一淡蓝两条横线（由 tools/make-site-icon.py 生成） -->
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7846c9"/><stop offset=".5" stop-color="#5151c4"/><stop offset="1" stop-color="#169a84"/>
    </linearGradient>
    <radialGradient id="h" cx=".85" cy=".08" r=".55"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  <rect width="512" height="512" rx="112" fill="url(#h)"/>
  <text x="258" y="260" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="188" fill="#fff">BAN</text>
  <rect x="92" y="368" width="328" height="40" rx="20" fill="#ffd77a"/>
  <rect x="148" y="432" width="216" height="36" rx="18" fill="#a6bed9"/>
</svg>
"""

def lerp(a, b, t): return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

def draw(size=2048):
    s = size / 512
    im = Image.new("RGBA", (size, size))
    px = im.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            c = lerp(C0, C1, t * 2) if t < .5 else lerp(C1, C2, (t - .5) * 2)
            dx, dy = x / size - .85, y / size - .08; d = (dx * dx + dy * dy) ** .5 / .55
            a = max(0, 1 - d) * .16
            px[x, y] = tuple(round(c[i] + (255 - c[i]) * a) for i in range(3)) + (255,)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=112 * s, fill=255)
    im.putalpha(mask)
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(FONT, round(188 * s))
    d.text((258 * s, 260 * s), "BAN", font=f, fill="white", anchor="ms")
    d.rounded_rectangle((92 * s, 368 * s, 420 * s, 408 * s), radius=20 * s, fill=YEL)
    d.rounded_rectangle((148 * s, 432 * s, 364 * s, 468 * s), radius=18 * s, fill=BLU)
    return im

open(os.path.join(WEB, "icon.svg"), "w").write(SVG)
big = draw()
for n in (512, 192):
    big.resize((n, n), Image.LANCZOS).save(os.path.join(WEB, f"icon-{n}.png"), optimize=True)
big.resize((256, 256), Image.LANCZOS).save(os.path.join(WEB, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
print("ok")
