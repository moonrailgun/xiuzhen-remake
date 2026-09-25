#!/usr/bin/env python3
"""C 档素材：程序化生成（按钮、图标、渐变、关闭钮等）。

为什么不裁切：这些在截图里要么被文字压着、要么每个状态都得裁一遍、要么本来就是
纯色块+文字，画出来比抠图更准也更省。规格（尺寸与色值）来自 tools/assets/manifest.json
的 method 字段，那些值是从原生 1:1 截图实测的。

用法：python3 tools/assets/gen.py
"""
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("需要 Pillow：pip3 install Pillow")

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "img"

# macOS 自带宋体。原版是 2008 年 Windows 的中易宋体位图，这里取最接近的。
FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Songti.ttc",
    "/System/Library/Fonts/STHeiti Light.ttc",
]


def font(size: int) -> ImageFont.FreeTypeFont:
    for p in FONT_CANDIDATES:
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                continue
    return ImageFont.load_default()


def save(img: Image.Image, rel: str) -> None:
    p = OUT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    img.save(p, format="PNG")


def centered(draw: ImageDraw.ImageDraw, box, text, fnt, fill):
    x0, y0, x1, y1 = box
    l, t, r, b = draw.textbbox((0, 0), text, font=fnt)
    draw.text((x0 + (x1 - x0 - (r - l)) / 2 - l, y0 + (y1 - y0 - (b - t)) / 2 - t), text, font=fnt, fill=fill)


# —— 五行图标 16×16 ——
# 颜色依据游戏内指南原文：「黄=金 绿=木 蓝=水 红=火 褐=土」
ELEMENT_ICONS = {
    "gold": ("金", (226, 160, 46), (120, 74, 0)),
    "wood": ("木", (86, 168, 62), (26, 82, 20)),
    "water": ("水", (62, 122, 196), (14, 54, 110)),
    "fire": ("火", (198, 62, 52), (110, 18, 12)),
    "earth": ("土", (150, 112, 62), (72, 48, 18)),
    "coin": ("石", (150, 150, 150), (60, 60, 60)),
}


def gen_element_icons() -> int:
    f = font(11)
    for name, (ch, bg, fg) in ELEMENT_ICONS.items():
        im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.ellipse((0, 0, 15, 15), fill=bg + (255,), outline=fg + (255,))
        centered(d, (0, 0, 16, 16), ch, f, (255, 255, 255, 255))
        save(im, f"res/{name}.gif")
    return len(ELEMENT_ICONS)


# —— 主标签 60×20 ——
# 未选中：自上而下银灰渐变 #8d8d8d→#b1b1b1→#d7d7d7，1px 近黑外框
# 选中：顶部金色回纹 → 底部渐白，外框深褐，字深红褐
MAIN_TABS = {
    "player": "人物",
    "skill": "法术",
    "item": "法宝",
    "map": "地图",
    "ally": "门派",
    "trade": "交易",
    "msg": "消息",
}


def vgrad(size, stops):
    """竖向渐变。stops = [(位置0..1, (r,g,b)), ...]"""
    w, h = size
    im = Image.new("RGB", size)
    d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / max(1, h - 1)
        for i in range(len(stops) - 1):
            p0, c0 = stops[i]
            p1, c1 = stops[i + 1]
            if p0 <= t <= p1:
                k = (t - p0) / max(1e-6, p1 - p0)
                c = tuple(round(c0[j] + (c1[j] - c0[j]) * k) for j in range(3))
                d.line([(0, y), (w, y)], fill=c)
                break
    return im


def gen_main_tabs() -> int:
    f = font(13)
    n = 0
    for key, label in MAIN_TABS.items():
        # 原版两字之间空一格（「人 物」）
        text = f"{label[0]} {label[1]}" if len(label) == 2 else label
        for state in (1, 2):
            if state == 1:
                im = vgrad((60, 20), [(0, (141, 141, 141)), (0.5, (177, 177, 177)), (1, (215, 215, 215))])
                border, fg = (32, 32, 32), (0, 0, 0)
            else:
                im = vgrad((60, 20), [(0, (205, 186, 130)), (0.35, (217, 186, 93)), (1, (255, 255, 255))])
                border, fg = (53, 36, 0), (90, 10, 24)
            im = im.convert("RGBA")
            d = ImageDraw.Draw(im)
            d.rectangle((0, 0, 59, 19), outline=border)
            centered(d, (0, 0, 60, 20), text, f, fg)
            save(im, f"btn/{key}_{state}.gif")
            n += 1
    return n


# —— 右上小按钮 61×17 ——
LITTLE_BUTTONS = {
    "index": "首页",
    "help": "游戏指南",
    "rank": "排行榜",
    "playerdir": "个人资料",
    "vip": "付费功能",
    "bbs": "论坛",
    "about": "关于",
}


def gen_little_buttons() -> int:
    f = font(12)
    for key, label in LITTLE_BUTTONS.items():
        im = Image.new("RGBA", (61, 17), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rectangle((0, 0, 60, 16), fill=(240, 240, 224, 255), outline=(118, 113, 109, 255))
        centered(d, (0, 0, 61, 17), label, f, (0, 0, 0, 255))
        save(im, f"btn/{key}.gif")
    return len(LITTLE_BUTTONS)


# —— 其余通用件 ——


def gen_misc() -> int:
    n = 0

    # 关闭钮 15×15：1px 边框 + 浅灰底 + 居中暗红 ×（规格实测自 #3 的 [487,11,15,15]）
    for name, bg in (("closewindow.gif", (238, 238, 238)),):
        im = Image.new("RGBA", (15, 15), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rectangle((0, 0, 14, 14), fill=bg + (255,), outline=(162, 163, 158, 255))
        d.line((4, 4, 10, 10), fill=(160, 40, 56, 255))
        d.line((10, 4, 4, 10), fill=(160, 40, 56, 255))
        save(im, name)
        n += 1

    # 五行互化：蓝色水彩横刷 + 黄色粗体字
    im = vgrad((68, 18), [(0, (112, 144, 192)), (1, (144, 160, 192))]).convert("RGBA")
    d = ImageDraw.Draw(im)
    centered(d, (0, 0, 68, 18), "五行互化", font(12), (240, 238, 112, 255))
    save(im, "btn/turn_1.gif")
    n += 1

    # 确定 / 取消（按钮通式：米灰底 + 深灰褐边 + 12px 黑字）
    for name, label, w in (("btnok.gif", "确定", 60), ("btncancel.gif", "取消", 60)):
        im = Image.new("RGBA", (w, 22), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rectangle((0, 0, w - 1, 21), fill=(240, 240, 224, 255), outline=(118, 113, 109, 255))
        centered(d, (0, 0, w, 22), label, font(12), (0, 0, 0, 255))
        save(im, f"btn/{name}")
        n += 1

    # 1×1 全透明垫图（地图每格 <IMG src=img/1.gif> + background 贴地块）
    save(Image.new("RGBA", (1, 1), (0, 0, 0, 0)), "1.gif")
    n += 1

    # loading 占位
    im = Image.new("RGBA", (80, 20), (250, 250, 240, 255))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 79, 19), outline=(118, 113, 109, 255))
    centered(d, (0, 0, 80, 20), "载入中…", font(12), (60, 60, 60, 255))
    save(im, "loading.gif")
    n += 1

    return n


def main() -> int:
    total = 0
    total += gen_element_icons()
    total += gen_main_tabs()
    total += gen_little_buttons()
    total += gen_misc()
    print(f"生成 C 档素材 {total} 个 → public/img/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
