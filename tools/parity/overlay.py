#!/usr/bin/env python3
"""生成「原版 / 复刻」并排对比图，供人眼验收。

只对 tools/parity/manifest.json 里 use == "overlay_2px"（原生 1:1）的截图做；
缩放过的图并排看会有误导（见 tools/parity/README.md）。

用法：先 `npm run dev`，再
  node tools/parity/shoot-cases.mjs   # 先出复刻侧截图
  python3 tools/parity/overlay.py
"""
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("需要 Pillow")

ROOT = Path(__file__).resolve().parents[2]
SHOTS = ROOT / "tools" / "parity" / "shots"

CASES = [
    ("main-2008", "reference/images/17173-live/20081225104603605_all/xiuzhen801.jpg",
     (5, 0, 1005, 588), "主界面（2008-12，原生 1:1）"),
    ("market-2008", "reference/images/17173-zone-systems-20081030/9-交易.jpg",
     None, "市场（2008-10，原生 1:1）"),
]


def font(size):
    for p in ("/System/Library/Fonts/Supplemental/Songti.ttc",):
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                pass
    return ImageFont.load_default()


def main():
    made = 0
    for name, orig_rel, crop, note in CASES:
        mine_p = SHOTS / f"mine-{name}.png"
        orig_p = ROOT / orig_rel
        if not mine_p.exists() or not orig_p.exists():
            print(f"跳过 {name}：缺 {'复刻截图' if not mine_p.exists() else '原图'}")
            continue

        orig = Image.open(orig_p).convert("RGB")
        if crop:
            orig = orig.crop(crop)
        mine = Image.open(mine_p).convert("RGB")

        gap, pad, header = 12, 10, 26
        w = pad * 2 + orig.width + gap + mine.width
        h = pad * 2 + header + max(orig.height, mine.height)
        canvas = Image.new("RGB", (w, h), (51, 51, 51))
        d = ImageDraw.Draw(canvas)
        f = font(13)
        d.text((pad, pad), f"原版 · {note}", font=f, fill=(255, 255, 255))
        d.text((pad + orig.width + gap, pad), "复刻", font=f, fill=(255, 255, 255))
        canvas.paste(orig, (pad, pad + header))
        canvas.paste(mine, (pad + orig.width + gap, pad + header))

        out = SHOTS / f"side-by-side-{name}.png"
        canvas.save(out)
        print(f"✔ {name} → {out.relative_to(ROOT)}")
        made += 1
    return 0 if made else 1


if __name__ == "__main__":
    sys.exit(main())
