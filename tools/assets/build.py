#!/usr/bin/env python3
"""按 manifest.json 生成 public/img/ 下的素材。

四档做法（见 docs/PLAN.md §3「美术四档」）：
  A 原件级  —— 从原生 1:1 截图按 bbox 整格裁出，不做处理
  B 裁切修补 —— 裁出后去 JPEG 块噪；需要抠底的另见 --matte
  C 程序化  —— 由 gen.py 画出来（按钮、图标、渐变、地块调色等）
  D 占位    —— 没有任何原图，用原版自带的占位件或简单生成

本脚本只负责 A/B（裁切类）。C/D 见 tools/assets/gen.py。

用法：
  python3 tools/assets/build.py            # 生成 A/B 档
  python3 tools/assets/build.py --list     # 只列出将要生成什么
"""
import json
import sys
from pathlib import Path

try:
    from PIL import Image, ImageFilter
except ImportError:
    sys.exit("需要 Pillow：pip3 install Pillow")

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "tools" / "assets" / "manifest.json"
OUT_ROOT = ROOT / "public"


def load_manifest():
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    return data if isinstance(data, list) else data.get("assets", data)


def source_path(src: str) -> Path | None:
    """manifest 里的 source 形如 `reference/images/... (#2)`，取出路径部分。"""
    if not src:
        return None
    path = src.split(" (")[0].strip()
    p = ROOT / path
    return p if p.exists() else None


def denoise(img: Image.Image) -> Image.Image:
    """只去 JPEG 块噪，**不做阈值化**——水墨与渐变一量化就毁了。"""
    return img.filter(ImageFilter.MedianFilter(size=3))


def main() -> int:
    items = load_manifest()
    only_list = "--list" in sys.argv

    todo = [x for x in items if x.get("tier") in ("A", "B") and x.get("bbox") and x.get("source")]
    print(f"A/B 档共 {len(todo)} 项")

    ok = skipped = failed = 0
    missing_sources: dict[str, int] = {}

    for item in todo:
        out = OUT_ROOT / item["path"]
        src = source_path(item["source"])
        if src is None:
            key = item["source"].split(" (")[0]
            missing_sources[key] = missing_sources.get(key, 0) + 1
            skipped += 1
            continue

        if only_list:
            print(f"  {item['path']:34s} ← {src.name} {item['bbox']}")
            ok += 1
            continue

        try:
            x, y, w, h = item["bbox"]
            with Image.open(src) as im:
                im = im.convert("RGBA")
                # bbox 越界时钳制，避免整批失败
                x2, y2 = min(x + w, im.width), min(y + h, im.height)
                if x >= im.width or y >= im.height or x2 <= x or y2 <= y:
                    raise ValueError(f"bbox {item['bbox']} 超出原图 {im.size}")
                crop = im.crop((x, y, x2, y2))
                if item["tier"] == "B":
                    crop = denoise(crop)
                out.parent.mkdir(parents=True, exist_ok=True)
                # 统一存 PNG 字节流，但保留原版的 .gif/.jpg 文件名（浏览器按内容嗅探）
                crop.save(out, format="PNG")
            ok += 1
        except Exception as e:  # noqa: BLE001 - 逐项容错，末尾汇总
            print(f"  ✗ {item['path']}: {e}")
            failed += 1

    print(f"\n生成 {ok}，跳过 {skipped}，失败 {failed}")
    if missing_sources:
        print("\n找不到来源图（前 10 个）：")
        for k, n in sorted(missing_sources.items(), key=lambda kv: -kv[1])[:10]:
            print(f"  ×{n}  {k}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
