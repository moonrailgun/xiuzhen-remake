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




# ============================================================
# 人体剪影着色：从 B 档裁出的线稿派生 12 个五行着色态
# manifest 说法：「对线稿做自上而下由浅到深的渐变填充（头/肩很淡、小腿最饱和）」
# 做法：先洪水填充出「人体外部」，剩下的非线条区域即内部，按竖向渐变上色。
# ============================================================

BODY_GRADIENTS = {
    "gold": [(240, 240, 112), (240, 240, 16)],
    "wood": [(208, 232, 184), (192, 224, 160)],
    "water": [(192, 224, 240), (96, 160, 208), (16, 112, 192)],
    "fire": [(240, 144, 144), (240, 0, 0)],
    "earth": [(176, 176, 160), (128, 128, 112)],
}


def _lerp_stops(stops, t):
    if len(stops) == 1:
        return stops[0]
    seg = t * (len(stops) - 1)
    i = min(int(seg), len(stops) - 2)
    k = seg - i
    a, b = stops[i], stops[i + 1]
    return tuple(round(a[j] + (b[j] - a[j]) * k) for j in range(3))


def tint_body(src: Path, stops) -> Image.Image:
    """把线稿内部染成竖向渐变，线条保持深色，外部透明。"""
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    gray = im.convert("L")
    px = gray.load()

    # 线条 = 暗像素
    ink = Image.new("L", (w, h), 0)
    ink_px = ink.load()
    for y in range(h):
        for x in range(w):
            if px[x, y] < 150:
                ink_px[x, y] = 255

    # 洪水填充找外部：从四角灌水，只在「非线条」区域扩散
    outside = Image.new("L", (w, h), 0)
    out_px = outside.load()
    stack = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    while stack:
        x, y = stack.pop()
        if not (0 <= x < w and 0 <= y < h):
            continue
        if out_px[x, y] or ink_px[x, y]:
            continue
        out_px[x, y] = 255
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    result = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    res_px = result.load()
    for y in range(h):
        color = _lerp_stops(stops, y / max(1, h - 1))
        for x in range(w):
            if ink_px[x, y]:
                # 线条：保留原始深浅，避免把毛笔线压成死黑
                v = px[x, y]
                res_px[x, y] = (v // 3, v // 3, v // 3, 255)
            elif not out_px[x, y]:
                res_px[x, y] = color + (255,)
    return result


def gen_body_tints() -> int:
    n = 0
    for g in ("m", "f"):
        line = OUT / "pipe" / f"body{g}.gif"
        if not line.exists():
            continue
        for key, stops in BODY_GRADIENTS.items():
            save(tint_body(line, stops), f"pipe/body{g}{key}.gif")
            n += 1
        # 金丹视图：线稿整体黑填充 + 浅色外描边
        im = Image.open(line).convert("RGBA")
        gray = im.convert("L")
        w, h = im.size
        out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        gp, op = gray.load(), out.load()
        for y in range(h):
            for x in range(w):
                if gp[x, y] < 200:
                    op[x, y] = (0, 0, 0, 255)
        save(out, f"pipe/body{g}jindan.gif")
        n += 1
    return n


# —— 事件栏与操作小图标 ——


def gen_event_icons() -> int:
    icons = {
        "mark.gif": "tri",      # 4×7 实心右三角（原版列表前缀）
        "sword.gif": "sword",
        "attack.gif": "sword",
        "spy.gif": "circle",
        "quest.gif": "quest",
        "cancel.gif": "cross",
        "move.gif": "tri",
        "back.gif": "tri",
    }
    for name, kind in icons.items():
        if kind == "tri":
            im = Image.new("RGBA", (8, 9), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            d.polygon([(1, 1), (7, 4), (1, 8)], fill=(80, 80, 80, 255))
        elif kind == "sword":
            im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            d.line((3, 13, 12, 3), fill=(120, 120, 130, 255), width=2)
            d.line((2, 12, 5, 15), fill=(150, 110, 60, 255), width=2)
        elif kind == "circle":
            im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            d.ellipse((1, 1, 14, 14), outline=(90, 90, 90, 255))
            d.ellipse((6, 6, 9, 9), fill=(90, 90, 90, 255))
        elif kind == "quest":
            im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            centered(d, (0, 0, 16, 16), "?", font(13), (60, 90, 160, 255))
        else:  # cross
            im = Image.new("RGBA", (12, 12), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            d.line((2, 2, 9, 9), fill=(190, 40, 40, 255), width=2)
            d.line((9, 2, 2, 9), fill=(190, 40, 40, 255), width=2)
        save(im, f"event/{name}")
    return len(icons)


def gen_placeholders() -> int:
    """D 档：复用原版自带的占位件。"""
    n = 0
    rnd = OUT / "avatar" / "random.gif"
    if rnd.exists():
        base = Image.open(rnd).convert("RGBA")
        for name in ("shushanm", "shushanf", "kunlunf", "tongtianm", "tongtianf", "escort"):
            save(base, f"avatar/{name}.gif")
            n += 1
    # 昆仑水印只有缩放图，暂用蜀山（竹）占位
    s = OUT / "pipe" / "chrbgs.gif"
    if s.exists():
        save(Image.open(s).convert("RGBA"), "pipe/chrbgk.gif")
        n += 1
    # 页标题图：墨迹条 148×28 + 字间留空的页名
    titles = {
        "titleplayer.gif": "人 物", "titleskill.gif": "法 术", "titleitem.gif": "法 宝",
        "titlemap.gif": "地 图", "titleally.gif": "门 派", "titletrade.gif": "市 场",
        "titlerank.gif": "排 行 榜", "titlecreatechr.gif": "创 建 人 物",
    }
    f = font(14)
    for name, label in titles.items():
        im = Image.new("RGBA", (150, 30), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        # 一道淡墨横向笔触
        for y in range(4, 26):
            a = int(38 * (1 - abs(y - 15) / 12))
            d.line([(6, y), (143, y)], fill=(120, 120, 120, max(0, a)))
        d.text((12, 6), label, font=f, fill=(70, 70, 70, 255))
        save(im, f"title/{name}")
        n += 1
    # titlebg2 墨迹标题条 458×20
    im = Image.new("RGBA", (458, 20), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for y in range(20):
        a = int(30 * (1 - abs(y - 10) / 11))
        d.line([(0, y), (457, y)], fill=(130, 130, 130, max(0, a)))
    save(im, "titlebg2.gif")
    n += 1
    return n




# ============================================================
# 经脉视图的人体剪影：用 #153（新浪版 449×450，原生 1:1）。
#
# 为什么不用 manifest 原定的「裁线稿 → 程序化填充」：那份线稿取自本体视图，
# 上面烧着 8 个节点、引线与篆书标签，毛笔勾线并不闭合，洪水填充会漏色。
# 也不用 #5：它带 17173 的粉色水印，压在人体上半身，擦不干净。
# #153 是同内容的新浪版，**无水印**、新号（12 节点全 0 级）、还自带蜀山竹水印。
#
# 头节点实测在 (110,78)（白盘中心 RGB≈245,244,250，外环蓝色发光）；
# 其余 11 个由 04 §4.2 的相对偏移推出。
# ============================================================

BODY_SRC = "reference/images/sina-live/2010-03-31-1641387364/U4514P115T9D387364F168DT20100331164134_c.jpg"
BODY_HEAD = (110, 78)
BODY_CROP = (25, 50, 205, 440)     # 人体范围，避开右下角的门派水印
NODE_OFFSETS_ABS = [
    (0, 0), (-54, 81), (-64, 175),
    (16, 50), (59, 91), (57, 153),
    (3, 110), (-23, 222), (-25, 311),
    (4, 165), (33, 246), (32, 337),
]


def _inpaint_disc(im: Image.Image, cx: int, cy: int, r: int) -> None:
    """用环外一圈的中值色填掉一个圆盘（去掉烧在剪影上的节点与其发光核心）。"""
    import math
    px = im.load()
    w, h = im.size
    ring = []
    for a in range(0, 360, 6):
        x = int(cx + (r + 6) * math.cos(math.radians(a)))
        y = int(cy + (r + 6) * math.sin(math.radians(a)))
        if 0 <= x < w and 0 <= y < h:
            p = px[x, y]
            if p[3] > 40:
                ring.append(p)
    if not ring:
        return
    ring.sort(key=lambda c: c[0] + c[1] + c[2])
    med = ring[len(ring) // 2]
    for y in range(max(0, cy - r), min(h, cy + r + 1)):
        for x in range(max(0, cx - r), min(w, cx + r + 1)):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                px[x, y] = med


def _recolor(im: Image.Image, target: tuple[int, int, int]) -> Image.Image:
    """换色系：保留明度层次（剪影是自上而下由浅入深的渐变），替换色相。"""
    out = im.copy()
    px = out.load()
    w, h = out.size
    tr, tg, tb = target
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 20:
                continue
            lum = (r * 299 + g * 587 + b * 114) / 1000 / 255
            k = 1 - lum
            px[x, y] = (
                round(255 - (255 - tr) * k),
                round(255 - (255 - tg) * k),
                round(255 - (255 - tb) * k),
                a,
            )
    return out


BODY_TARGET = {
    "wood": (120, 200, 90),
    "gold": (226, 200, 40),
    "water": (40, 120, 200),
    "fire": (220, 60, 50),
    "earth": (140, 110, 60),
}


def gen_body_from_meridian_view() -> int:
    src = ROOT / BODY_SRC
    if not src.exists():
        return 0
    im = Image.open(src).convert("RGBA").crop(BODY_CROP)
    px = im.load()
    w, h = im.size
    # 纸白转透明
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r > 236 and g > 236 and b > 236:
                px[x, y] = (r, g, b, 0)
    # 抹掉烧在剪影上的 12 个节点
    ox, oy = BODY_CROP[0], BODY_CROP[1]
    for (dx, dy) in NODE_OFFSETS_ABS:
        _inpaint_disc(im, BODY_HEAD[0] + dx - ox, BODY_HEAD[1] + dy - oy, 14)

    n = 0
    for key, target in BODY_TARGET.items():
        tinted = im if key == "wood" else _recolor(im, target)
        for g in ("m", "f"):
            save(tinted, f"pipe/body{g}{key}.gif")
            n += 1
    return n




# ============================================================
# 地图地块（img/map/*.gif）
#
# 原版是 64×120 的 GIF：菱形只占底部 64×35，上方 85px 透明，留给山/树「长高」。
# 没有干净的原始素材（地块在截图里互相遮挡、还压着头像），所以程序化画：
# 菱形底面 + 地形装饰。三套色（原色 / blue 感应范围 / green 视野内）由同一基础块调色派生，
# 不裁三遍 —— 依据是 09 §3.4：后缀只是同一地块的染色版。
# ============================================================

TILE_W, TILE_H, DIAMOND_H = 64, 120, 35

# 地形底面色（取自地图截图的菱形中心区）
TERRAIN_BASE = {
    "plain": (232, 238, 232),
    "forest": (214, 232, 208),
    "mountain": (226, 232, 236),
    "river": (206, 226, 240),
    "village": (232, 228, 214),
    "town": (230, 224, 210),
    "city": (226, 218, 204),
    "fudi": (226, 236, 222),
    "dongtian": (216, 224, 236),
}


def _diamond_points(w=TILE_W, h=DIAMOND_H, y0=TILE_H - DIAMOND_H):
    return [(w // 2, y0), (w - 1, y0 + h // 2), (w // 2, y0 + h - 1), (0, y0 + h // 2)]


def _make_tile(kind: str, variant: int) -> Image.Image:
    import math
    base = TERRAIN_BASE.get(kind, TERRAIN_BASE["plain"])
    im = Image.new("RGBA", (TILE_W, TILE_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pts = _diamond_points()
    d.polygon(pts, fill=base + (255,), outline=(208, 214, 208, 255))

    cx, cy = TILE_W // 2, TILE_H - DIAMOND_H // 2
    if kind == "forest":
        for i, (ox, oy) in enumerate(((-14, 2), (0, -4), (13, 3), (-4, 8))[: 2 + variant]):
            x, y = cx + ox, cy + oy
            d.polygon([(x, y - 13), (x - 7, y + 3), (x + 7, y + 3)], fill=(96, 148, 84, 255))
            d.rectangle((x - 1, y + 3, x + 1, y + 7), fill=(110, 90, 60, 255))
    elif kind == "mountain":
        for i, (ox, scale) in enumerate(((-10, 1.0), (6, 1.25), (16, 0.8))[: 1 + variant]):
            x = cx + ox
            hgt = int(22 * scale)
            d.polygon([(x, cy - hgt), (x - 14, cy + 6), (x + 14, cy + 6)], fill=(158, 170, 178, 255))
            d.polygon([(x, cy - hgt), (x - 5, cy - hgt + 8), (x + 5, cy - hgt + 8)], fill=(238, 242, 246, 255))
    elif kind == "river":
        for k in range(3):
            y = cy - 6 + k * 6
            d.arc((cx - 22, y - 4, cx + 22, y + 4), 200, 340, fill=(120, 170, 210, 255), width=2)
    elif kind in ("village", "town", "city"):
        n = {"village": 1, "town": 2, "city": 3}[kind]
        for i in range(n):
            x = cx - 12 + i * 13
            d.rectangle((x - 5, cy - 8, x + 5, cy + 4), fill=(206, 190, 168, 255), outline=(120, 104, 84, 255))
            d.polygon([(x - 8, cy - 8), (x + 8, cy - 8), (x, cy - 16)], fill=(128, 108, 88, 255))
    elif kind == "plain" and variant > 0:
        for i in range(variant * 2):
            x = cx - 16 + i * 9
            d.line((x, cy + 4, x, cy - 2), fill=(176, 194, 164, 255))
    return im


def _tint_tile(im: Image.Image, tint: tuple[int, int, int], strength: float) -> Image.Image:
    out = im.copy()
    px = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            px[x, y] = (
                round(r + (tint[0] - r) * strength),
                round(g + (tint[1] - g) * strength),
                round(b + (tint[2] - b) * strength),
                a,
            )
    return out


def gen_map_tiles() -> int:
    variants = {"plain": 4, "forest": 2, "mountain": 3, "river": 2,
                "village": 1, "town": 1, "city": 1, "fudi": 1, "dongtian": 1}
    n = 0
    for kind, cnt in variants.items():
        for v in range(cnt):
            base = _make_tile(kind, v)
            save(base, f"map/{kind}{v}.gif")
            # green = 视野内（略偏绿、更亮）；blue = 感应范围（偏蓝、稍暗）
            save(_tint_tile(base, (150, 220, 140), 0.22), f"map/{kind}{v}green.gif")
            save(_tint_tile(base, (120, 170, 220), 0.26), f"map/{kind}{v}blue.gif")
            n += 3
    # 选中框（蓝灰双线菱形）与悬停框（同款黄绿）
    for name, color in (("maptarget2.gif", (70, 110, 180)), ("maptarget.gif", (150, 190, 70))):
        im = Image.new("RGBA", (TILE_W, DIAMOND_H), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        pts = _diamond_points(y0=0)
        d.line(pts + [pts[0]], fill=color + (255,), width=2)
        save(im, name)
        n += 1
    # 8 向滚屏箭头 + hover 态
    dirs = {"lt": (-1, -1), "mt": (0, -1), "rt": (1, -1), "lm": (-1, 0),
            "rm": (1, 0), "lb": (-1, 1), "mb": (0, 1), "rb": (1, 1)}
    for key, (dx, dy) in dirs.items():
        for suffix, col in (("", (110, 110, 110)), ("o", (60, 130, 60))):
            im = Image.new("RGBA", (17, 17), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            cx = cy = 8
            tip = (cx + dx * 7, cy + dy * 7)
            l = (cx + dy * 5 - dx * 2, cy - dx * 5 - dy * 2)
            r = (cx - dy * 5 - dx * 2, cy + dx * 5 - dy * 2)
            d.polygon([tip, l, r], fill=col + (255,))
            save(im, f"pos/{key}{suffix}.gif")
            n += 1
    # 地图菜单按钮
    im = Image.new("RGBA", (70, 20), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 69, 19), fill=(240, 240, 224, 255), outline=(118, 113, 109, 255))
    centered(d, (0, 0, 70, 20), "移动到此", font(12), (0, 0, 0, 255))
    save(im, "btn/mover1.gif")
    n += 1
    # people 变体：从 people11 派生（多人加一个偏移副本，视野外去饱和）
    p11 = OUT / "people11.gif"
    if p11.exists():
        b = Image.open(p11).convert("RGBA")
        two = Image.new("RGBA", (b.width + 6, b.height), (0, 0, 0, 0))
        two.paste(b, (6, 0), b)
        two.paste(b, (0, 2), b)
        save(two, "people12.gif")
        for src, dst in ((b, "people21.gif"), (two, "people22.gif")):
            faded = src.copy()
            px = faded.load()
            for y in range(faded.height):
                for x in range(faded.width):
                    r, g, bb, a = px[x, y]
                    if a:
                        v = (r * 299 + g * 587 + bb * 114) // 1000
                        px[x, y] = (v, v, v, int(a * 0.7))
            save(faded, dst)
        n += 4
    return n


# ============================================================
# 法术树背景图（img/skill/bg*.gif）与按 id 落盘的图标
#
# 04 §7.1：整棵树是一张 460×425 的背景图，**箭头与「Lv.N」标注都画在这张图上**，
# 图标只是叠在上面的绝对定位元素。所以背景图必须自己画。
# 几何来自 04 §7.2（截图实测，四张源图都是原生 1:1）：
#   图标外框 64×64，列左缘 x = 58/198/338，行上缘 y = 0/120/240/360。
# 画法来自 04 §7.2 末段：3px 粗黑线 + 实心三角箭头（≈13 宽 × 12 长），
# 直角拐弯无圆角，线中间断开放 14px 手写斜体的「Lv.N」。
# 箭头清单来自 04 §7.3 的三张表（炼器 / 术数 / 剑术）。
# ============================================================

SKILL_COL_X = (58, 198, 338)
SKILL_ROW_Y = (0, 120, 240, 360)
SKILL_CELL = 64
SKILL_BG = (460, 425)

# 每条箭头 = (途经点序列, 标注)。点用 (列, 行, 出口) 表示，出口 ∈ 上/下/左/右/心。
SKILL_ARROWS = {
    # 炼器：c1r0 ─Lv.1↓→ c1r1；c1r1 ─Lv.3→ c2r1；c1r1 ─Lv.5↓→ c1r2；c2r1 ─Lv.5↓→ c2r2
    "produce": [
        ([(1, 0, "d"), (1, 1, "u")], "Lv.1"),
        ([(1, 1, "r"), (2, 1, "l")], "Lv.3"),
        ([(1, 1, "d"), (1, 2, "u")], "Lv.5"),
        ([(2, 1, "d"), (2, 2, "u")], "Lv.5"),
    ],
    # 剑术：c1r0 左出折下→c0r1；右出折下→c2r1；c0r1 ─Lv.3→ c1r1 ←Lv.3─ c2r1；
    #       c1r1 ─Lv.5↓→ c1r2；c0r1 下出跨两行折右 ─Lv.5→ c1r3
    "sword": [
        ([(1, 0, "l"), (0, 0, "c"), (0, 1, "u")], "Lv.1"),
        ([(1, 0, "r"), (2, 0, "c"), (2, 1, "u")], "Lv.1"),
        ([(0, 1, "r"), (1, 1, "l")], "Lv.3"),
        ([(2, 1, "l"), (1, 1, "r")], "Lv.3"),
        ([(1, 1, "d"), (1, 2, "u")], "Lv.5"),
        ([(0, 1, "d"), (0, 3, "c"), (1, 3, "l")], "Lv.5"),
    ],
    # 术数：c0r0 右出折下 ─Lv.5→ c1r1；c0r0 ─Lv.64↓（跨两行）→ c0r2；c1r1 ─Lv.3→ c2r1；
    #       c1r1 下出折左 ─Lv.20→ c0r2；c2r0 ─Lv.1↓→ c2r1；c2r1 ─Lv.1↓→ c2r2
    "math": [
        ([(0, 0, "r"), (1, 0, "c"), (1, 1, "u")], "Lv.5"),
        ([(0, 0, "d"), (0, 2, "u")], "Lv.64"),
        ([(1, 1, "r"), (2, 1, "l")], "Lv.3"),
        ([(1, 1, "d"), (1, 2, "c"), (0, 2, "r")], "Lv.20"),
        ([(2, 0, "d"), (2, 1, "u")], "Lv.1"),
        ([(2, 1, "d"), (2, 2, "u")], "Lv.1"),
    ],
}

# 图标按 src/pages/skill.ts 的 id 落盘（原版路径是 img/skill/{id}.gif）。
# 101/106/107 是 DOM 原文的 id，其余是 skill.ts 里标了 [推断] 的编号。
# 没有对应美术的一律复用未解锁的「?」框（manifest 记「占位」）。
SKILL_ICON_ART = {
    102: "liandan", 103: "zhujian", 104: None, 101: None, 107: None, 106: None,
    201: "yujian", 202: "liantai", 203: "kuanren", 204: None, 205: None, 206: None,
    301: "yijing", 302: "jiugong", 303: None, 304: None, 305: None, 306: None,
}


def _skill_port(col: int, row: int, side: str):
    """格子某一侧的出入点（心 = 中心，用来做折线拐点）。"""
    x, y = SKILL_COL_X[col], SKILL_ROW_Y[row]
    cx, cy = x + SKILL_CELL // 2, y + SKILL_CELL // 2
    return {
        "u": (cx, y), "d": (cx, y + SKILL_CELL),
        "l": (x, cy), "r": (x + SKILL_CELL, cy),
        "c": (cx, cy),
    }[side]


def _arrow_head(d: ImageDraw.ImageDraw, a, b, fill=(8, 5, 0, 255)):
    """在 b 处画一个指向 a→b 方向的实心三角（≈13 宽 × 12 长）。"""
    bx, by = b
    if a[0] == b[0]:
        s = 1 if by > a[1] else -1
        d.polygon([(bx, by), (bx - 6, by - 12 * s), (bx + 6, by - 12 * s)], fill=fill)
    else:
        s = 1 if bx > a[0] else -1
        d.polygon([(bx, by), (bx - 12 * s, by - 6), (bx - 12 * s, by + 6)], fill=fill)


def _skill_bg(tree: str) -> Image.Image:
    im = Image.new("RGBA", SKILL_BG, (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    fnt = font(14)
    for path, label in SKILL_ARROWS[tree]:
        pts = [_skill_port(*p) for p in path]
        for a, b in zip(pts, pts[1:]):
            d.line([a, b], fill=(8, 5, 0, 255), width=3)
        _arrow_head(d, pts[-2], pts[-1])
        # 标注压在最后一段的中点上，先用白底把线「断开」
        ax, ay = pts[-2]
        bx, by = pts[-1]
        mx, my = (ax + bx) // 2, (ay + by) // 2
        l, t, r, b2 = d.textbbox((0, 0), label, font=fnt)
        w, h = r - l, b2 - t
        d.rectangle([mx - w // 2 - 3, my - h // 2 - 2, mx + w // 2 + 3, my + h // 2 + 2],
                    fill=(255, 255, 255, 255))
        d.text((mx - w // 2 - l, my - h // 2 - t), label, font=fnt, fill=(8, 5, 0, 255))
    return im


def gen_skill_trees() -> int:
    n = 0
    # 炼器树按道源分三套（bgproducek.gif 是 DOM 原文，另两套按同名推）
    produce = _skill_bg("produce")
    for suffix in ("k", "s", "t"):
        save(produce, f"skill/bgproduce{suffix}.gif")
        n += 1
    save(_skill_bg("sword"), "skill/bgsword.gif")
    save(_skill_bg("math"), "skill/bgmath.gif")
    n += 2

    # 按 id 落盘图标：有美术的复制美术，没有的复用「?」框
    unknown = OUT / "skill" / "unknown.gif"
    if unknown.exists():
        fallback = Image.open(unknown).convert("RGBA")
        for skill_id, art in SKILL_ICON_ART.items():
            src = OUT / "skill" / f"{art}.gif" if art else None
            im = Image.open(src).convert("RGBA") if src and src.exists() else fallback
            save(im, f"skill/{skill_id}.gif")
            n += 1

    # 秘笈标签的页标题图（与 gen_placeholders 的墨迹条同一配方）
    im = Image.new("RGBA", (150, 30), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for y in range(4, 26):
        a = int(38 * (1 - abs(y - 15) / 12))
        d.line([(6, y), (143, y)], fill=(120, 120, 120, max(0, a)))
    d.text((12, 6), "秘 笈", font=font(14), fill=(70, 70, 70, 255))
    save(im, "title/titlebook.gif")
    n += 1
    return n


# ============================================================
# 收件箱分页键 + 任务窗底部的图片按钮
#
# 规格照 tools/assets/manifest.json：
#  - img/{top,ahead,back,bottom}.gif：16×16，按钮通式底 + 黑色实心三角，
#    到头的两键（首页/尾页）另加一道竖线。分页条零截图，尺寸为估读。
#  - img/{giveupquest,closewindows}.gif：按钮通式 —— 内部 #f0f0e0、边缘 #c0c0c0、
#    1px 深灰褐边 #76716d、四角约 5px 回纹折角、12px 宋体黑字居中。
#    字样取截图 #83 的逐字转录（docs/research/05 §11.1「领取奖励　关闭窗口」），
#    所以 closewindows 写「关闭窗口」而不是 manifest 里估的「关闭」。
#  - img/getreward.gif：#83 上确有这个按钮，但**原版文件名没留下**（不在 07 §7.2 的
#    文件名全集里），名字是重建的；外观走同一套按钮通式。
# ============================================================

BTN_FACE = (240, 240, 224)      # 米灰底内部
BTN_EDGE = (192, 192, 192)      # 底的边缘一圈
BTN_LINE = (118, 113, 109)      # 1px 深灰褐边 #76716d
PAGE_BTN = 16                   # 分页键边长


def _button_base(w: int, h: int) -> Image.Image:
    """按钮通式的底：米灰面 + 1px 深灰褐边 + 四角 5px 回纹折角。"""
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, w - 1, h - 1), fill=BTN_FACE + (255,), outline=BTN_LINE + (255,))
    d.rectangle((1, 1, w - 2, h - 2), outline=BTN_EDGE + (255,))
    # 四角回纹：每角画一个 5px 的直角折线（内缩 2px）
    k = 5
    for sx, sy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        cx = 2 if sx > 0 else w - 3
        cy = 2 if sy > 0 else h - 3
        d.line([(cx, cy), (cx + sx * k, cy)], fill=BTN_LINE + (255,))
        d.line([(cx, cy), (cx, cy + sy * (k - 2))], fill=BTN_LINE + (255,))
    return im


def gen_page_and_quest_buttons() -> int:
    n = 0

    # —— 分页四键：三角朝向 + 到头两键的竖线 ——
    # (文件名, 朝左?, 到头?)
    pagers = (("top.gif", True, True), ("ahead.gif", True, False),
              ("back.gif", False, False), ("bottom.gif", False, True))
    for name, left, end in pagers:
        im = _button_base(PAGE_BTN, PAGE_BTN)
        d = ImageDraw.Draw(im)
        ink = (0, 0, 0, 255)
        # 三角：高 7px，居中；到头的键把三角让开 2px 给竖线
        shift = -1 if (left and end) else (1 if (not left and end) else 0)
        cx, cy = PAGE_BTN // 2 + shift, PAGE_BTN // 2
        if left:
            d.polygon([(cx + 2, cy - 4), (cx + 2, cy + 4), (cx - 3, cy)], fill=ink)
            if end:
                d.line([(cx - 4, cy - 4), (cx - 4, cy + 4)], fill=ink)
        else:
            d.polygon([(cx - 2, cy - 4), (cx - 2, cy + 4), (cx + 3, cy)], fill=ink)
            if end:
                d.line([(cx + 4, cy - 4), (cx + 4, cy + 4)], fill=ink)
        save(im, name)
        n += 1

    # —— 任务窗底部的图片按钮 ——
    for name, label in (("giveupquest.gif", "放弃任务"),
                        ("closewindows.gif", "关闭窗口"),
                        ("getreward.gif", "领取奖励")):
        im = _button_base(72, 20)
        centered(ImageDraw.Draw(im), (0, 0, 72, 20), label, font(12), (0, 0, 0, 255))
        save(im, name)
        n += 1

    return n


def main() -> int:
    total = 0
    total += gen_element_icons()
    total += gen_main_tabs()
    total += gen_little_buttons()
    total += gen_misc()
    total += gen_body_from_meridian_view()
    total += gen_event_icons()
    total += gen_placeholders()
    total += gen_map_tiles()
    total += gen_skill_trees()
    total += gen_page_and_quest_buttons()
    print(f"生成 C/D 档素材 {total} 个 → public/img/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
