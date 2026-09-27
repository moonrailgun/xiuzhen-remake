#!/usr/bin/env python3
"""地图素材：从原生 1:1 截图按菱形网格裁真像素（地块、小人、他人头像、选中框、滚屏箭头、墨框）。

为什么不再画：06 §6.3 当年判「只能临摹重绘」，但原版 map.jsp 的 DOM 给了精确的格子公式
（06 §1.2：imgx = 192 + 32(dx+dy)，imgy = floor(17.5·r) − 17，r = dx − dy + 7），把网格对回
截图后，每格 64×35 的地面菱形和它上方的地物都能按格取出来；同一地块在一屏里出现多次，
逐像素投票就把邻格遮挡、头像和 JPEG 噪点投掉了。

- 网格原点 = 墨框内沿左上角（逐行/逐列统计深色像素得到的框线内侧）。
- 三档范围（06 §1.4）按格到玩家的曼哈顿距离定：green = 移动范围（地面偏灰、地物最深）、
  blue = 视野（地面淡蓝白、地物正常）、无后缀 = 范围外。每张截图的两个半径由地面色实测。
- 绿↔蓝换色 = 同一片森林在两档里的真样本按通道做仿射拟合；范围外按基准期（2009-06 #12）取
  去色：先套 #88 里量出的 2010 褪色仿射，再转灰度。
- 判「像不像地面」只参照本格及相邻格可能出现的档的地面色（整屏调色板会把淡色山湖误判成地面）。

用法：python3 tools/assets/mapcrop.py            # 写入 public/img/
      python3 tools/assets/mapcrop.py --sheet    # 另在 tools/parity/shots/mapcrop-sheet.png 出对照表
"""
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
    import numpy as np
except ImportError:
    sys.exit("需要 Pillow 与 numpy：pip3 install Pillow numpy")

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "img"

# 原生 1:1 截图：文件、mapdiv 原点（墨框内沿左上角）、(移动半径, 视野半径)（地面色实测）
SHOTS = {
    "106": ("reference/images/17173-live/20100721110246898/z0721xz01.jpg", (34, 159), (2, 6)),   # 2010-07 男，益州青山
    "88": ("reference/images/17173-live/20100531153113196/xazz0.jpg", (26, 177), (2, 4)),        # 2010-05 女，荆州平原
    "104": ("reference/images/17173-live/20100706111951977/z0706xz01.jpg", (33, 179), (2, 4)),   # 2010-07 男，益州森林
}
CELL_W, CELL_H, TILE_H = 64, 35, 120
VIEW_W, VIEW_H = 448, 245
ABOVE = 45          # 地物最高只到菱形上方约 35px，取 45 留余量
STATES = ("green", "blue", "")


def imgxy(dx: int, dy: int) -> tuple[int, int]:
    r = dx - dy + 7
    return 192 + 32 * (dx + dy), int(17.5 * r) - 17


def all_cells() -> list[tuple[int, int]]:
    return [(dx, dy) for dx in range(-7, 8) for dy in range(-7, 8) if abs(dx + dy) <= 7 and abs(dx - dy) <= 7]


_shots: dict[str, np.ndarray] = {}


def shot(tag: str) -> np.ndarray:
    if tag not in _shots:
        _shots[tag] = np.asarray(Image.open(ROOT / SHOTS[tag][0]).convert("RGB")).astype(np.float64)
    return _shots[tag]


def cell_origin(tag: str, dx: int, dy: int) -> tuple[int, int]:
    ox, oy = SHOTS[tag][1]
    ix, iy = imgxy(dx, dy)
    return ox + ix, oy + iy


def state_of(tag: str, dx: int, dy: int) -> str:
    d = abs(dx) + abs(dy)
    walk, sight = SHOTS[tag][2]
    return "green" if d <= walk else "blue" if d <= sight else ""


def crop_cell(tag: str, dx: int, dy: int, above: int = ABOVE) -> np.ndarray:
    """截图里一格：菱形 64×35 及其上方 above 行，形状 (above+35, 64, 3)。视口外补 0。"""
    x0, y0 = cell_origin(tag, dx, dy)
    im = shot(tag)
    out = np.zeros((above + CELL_H, CELL_W, 3))
    ys, ye = y0 - above, y0 + CELL_H
    sy, sx = max(ys, 0), max(x0, 0)
    ey, ex = min(ye, im.shape[0]), min(x0 + CELL_W, im.shape[1])
    out[sy - ys:ey - ys, sx - x0:ex - x0] = im[sy:ey, sx:ex]
    return out


def viewport_mask(tag: str, dx: int, dy: int, above: int = ABOVE) -> np.ndarray:
    """crop_cell 同形状的布尔图：落在 mapdiv 视口内的像素才可信（墨框、页面白不属于任何地块）。"""
    x0, y0 = cell_origin(tag, dx, dy)
    ox, oy = SHOTS[tag][1]
    ys = np.arange(y0 - above, y0 + CELL_H)[:, None]
    xs = np.arange(x0, x0 + CELL_W)[None, :]
    return (ys >= oy) & (ys < oy + VIEW_H) & (xs >= ox) & (xs < ox + VIEW_W)


def diamond_mask(grow: float = 0.0) -> np.ndarray:
    """64×35 菱形。grow 是外扩像素：行距 17.5 取整交替 17/18，严格菱形拼不严会漏出细白缝，
    地面外扩 1px 让相邻格互相压住（原版软边地面本来也是互相叠着的）。"""
    m = np.zeros((CELL_H, CELL_W), bool)
    for v in range(CELL_H):
        half = (v + 0.5) / 17.5 * 32 if v < 17.5 else (CELL_H - (v + 0.5)) / 17.5 * 32
        half += grow * 32 / 17.5
        lo, hi = max(0, int(round(32 - half))), min(CELL_W, int(round(32 + half)))
        m[v, lo:hi] = True
    return m


DIA = diamond_mask(1.0)


def ground_color(crop: np.ndarray) -> np.ndarray:
    """一格的地面色：菱形下部（地物很少压到）的中值。"""
    band = crop[-CELL_H:][22:33]
    return np.median(band[DIA[22:33]], axis=0)


_tones: dict[str, dict[str, np.ndarray]] = {}


def state_tones(tag: str) -> dict[str, np.ndarray]:
    """每档地面色：该档所有完整格地面中值的中值（空地占多数，地物格被中值压掉）。"""
    if tag not in _tones:
        by: dict[str, list] = {s: [] for s in STATES}
        for dx, dy in all_cells():
            if viewport_mask(tag, dx, dy, 0).all():
                by[state_of(tag, dx, dy)].append(ground_color(crop_cell(tag, dx, dy, 0)))
        _tones[tag] = {s: np.median(np.array(v), axis=0) for s, v in by.items() if v}
    return _tones[tag]


def palette_for(tag: str, dx: int, dy: int) -> np.ndarray:
    """本格与六个邻格会出现的档的地面色 + 纸白。"""
    tones = state_tones(tag)
    states = {state_of(tag, dx + a, dy + b) for a, b in ((0, 0), (-1, 0), (0, 1), (-1, 1), (0, -1), (1, 0), (1, -1))}
    cols = [tones[s] for s in states if s in tones] + [np.array([255.0, 255.0, 255.0])]
    return np.array(cols)


def nonground(crop: np.ndarray, palette: np.ndarray) -> np.ndarray:
    """与最近一种地面色的 L1 距离，0..1 软阈值（24 以内算地面，54 以上算地物）。"""
    d = np.min(np.abs(crop[:, :, None, :] - palette[None, None, :, :]).sum(axis=3), axis=2)
    return np.clip((d - 24) / 30.0, 0, 1)


def _fill_holes(mask: np.ndarray) -> np.ndarray:
    """把被地物包住的「像地面」的洞补成地物（山体内部的淡色）。"""
    h, w = mask.shape
    outside = np.zeros_like(mask)
    outside[0, :] = ~mask[0, :]
    outside[-1, :] = ~mask[-1, :]
    outside[:, 0] = ~mask[:, 0]
    outside[:, -1] = ~mask[:, -1]
    while True:
        grown = outside.copy()
        grown[1:] |= outside[:-1]
        grown[:-1] |= outside[1:]
        grown[:, 1:] |= outside[:, :-1]
        grown[:, :-1] |= outside[:, 1:]
        grown &= ~mask
        if (grown == outside).all():
            return mask | ~outside
        outside = grown


def dilate(mask: np.ndarray) -> np.ndarray:
    """8 邻域膨胀 1px，不像 np.roll 那样在图边回绕。"""
    out = mask.copy()
    out[1:] |= mask[:-1]
    out[:-1] |= mask[1:]
    out[:, 1:] |= mask[:, :-1]
    out[:, :-1] |= mask[:, 1:]
    out[1:, 1:] |= mask[:-1, :-1]
    out[1:, :-1] |= mask[:-1, 1:]
    out[:-1, 1:] |= mask[1:, :-1]
    out[:-1, :-1] |= mask[1:, 1:]
    return out


def _components(mask: np.ndarray) -> np.ndarray:
    """8 邻域连通块编号（0 = 背景）。"""
    h, w = mask.shape
    label = np.zeros((h, w), int)
    cur = 0
    for y in range(h):
        for x in range(w):
            if mask[y, x] and not label[y, x]:
                cur += 1
                stack = [(y, x)]
                label[y, x] = cur
                while stack:
                    cy, cx = stack.pop()
                    for ny in (cy - 1, cy, cy + 1):
                        for nx in (cx - 1, cx, cx + 1):
                            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not label[ny, nx]:
                                label[ny, nx] = cur
                                stack.append((ny, nx))
    return label


def keep_connected(hard: np.ndarray, seed: np.ndarray) -> np.ndarray:
    label = _components(hard)
    ids = set(np.unique(label[seed & hard])) - {0}
    return np.isin(label, list(ids)) if ids else np.zeros_like(hard)


def soft_edge(keep: np.ndarray, soft: np.ndarray) -> np.ndarray:
    """连通块外一圈保留 ramp 值，避免硬边。"""
    ring = dilate(keep) & ~keep
    return np.where(keep, 1.0, np.where(ring, soft, 0.0))


def own_sprite(soft: np.ndarray, seed_up: int = 0) -> np.ndarray:
    """归属判定：菱形内全算本格；菱形外只留与「菱形内地物」相连的连通块。
    seed_up > 0 时，把菱形顶点上方 seed_up 行、中间 24px 宽的一小块也当作种子区（村庄的茅屋是散的）。"""
    h = soft.shape[0]
    hard = _fill_holes(soft > 0.5)
    inside = np.zeros((h, CELL_W), bool)
    inside[-CELL_H:] = DIA
    seed = inside.copy()
    if seed_up:
        seed[h - CELL_H - seed_up:h - CELL_H, 20:44] = True
    keep = keep_connected(hard, seed)
    # 菱形外 <6px 的碎点（JPEG 噪点、邻格的软边）一律丢掉
    label = _components(keep & ~inside)
    sizes = np.bincount(label.ravel())
    keep &= ~np.isin(label, [i for i in range(1, len(sizes)) if sizes[i] < 6])
    alpha = soft_edge(keep, soft)
    alpha[inside] = 1.0
    return alpha


def to_canvas(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """放到 64×120 画布底部（菱形占最后 35 行），返回 RGBA float。"""
    h = rgb.shape[0]
    canvas = np.zeros((TILE_H, CELL_W, 4))
    canvas[TILE_H - h:, :, :3] = rgb
    canvas[TILE_H - h:, :, 3] = alpha * 255
    return canvas


def save(canvas: np.ndarray, rel: str) -> None:
    im = Image.fromarray(np.clip(canvas, 0, 255).round().astype(np.uint8), "RGBA")
    p = OUT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    im.save(p, format="PNG")


# —— 换色（三档范围） ——

def fit_affine(pairs: list[tuple[np.ndarray, np.ndarray]]) -> np.ndarray:
    """按通道最小二乘 out = a·in + b；三轮剔除大残差（邻格遮挡、头像）。返回 (3,2)。"""
    src = np.concatenate([a.reshape(-1, 3) for a, _ in pairs])
    dst = np.concatenate([b.reshape(-1, 3) for _, b in pairs])
    keep = np.ones(len(src), bool)
    ab = np.zeros((3, 2))
    for _ in range(3):
        for c in range(3):
            A = np.stack([src[keep, c], np.ones(keep.sum())], axis=1)
            ab[c] = np.linalg.lstsq(A, dst[keep, c], rcond=None)[0]
        res = np.abs(src * ab[:, 0] + ab[:, 1] - dst).sum(axis=1)
        keep = res < np.percentile(res, 80)
    return ab


def apply_affine(canvas: np.ndarray, ab: np.ndarray) -> np.ndarray:
    out = canvas.copy()
    out[..., :3] = canvas[..., :3] * ab[:, 0] + ab[:, 1]
    return out


def invert_affine(ab: np.ndarray) -> np.ndarray:
    inv = np.zeros_like(ab)
    inv[:, 0] = 1 / ab[:, 0]
    inv[:, 1] = -ab[:, 1] / ab[:, 0]
    return inv


def compose_affine(first: np.ndarray, then: np.ndarray) -> np.ndarray:
    out = np.zeros_like(first)
    out[:, 0] = then[:, 0] * first[:, 0]
    out[:, 1] = then[:, 0] * first[:, 1] + then[:, 1]
    return out


def desaturate(canvas: np.ndarray) -> np.ndarray:
    out = canvas.copy()
    g = canvas[..., 0] * 0.299 + canvas[..., 1] * 0.587 + canvas[..., 2] * 0.114
    out[..., 0] = out[..., 1] = out[..., 2] = g
    return out


# 同一片森林在不同档里的真样本（森林是这屏里重复最多、颜色最饱和的地块，拟合最稳）
FIT_PAIRS = {
    ("green", "blue"): [(("106", (2, 0)), ("106", (-1, -3))), (("106", (0, -2)), ("106", (5, 1)))],
    ("green", ""): [(("88", (-1, 1)), ("88", (-4, -1)))],
}


def fit_transforms() -> dict[tuple[str, str], np.ndarray]:
    T = {}
    for key, pairs in FIT_PAIRS.items():
        T[key] = fit_affine([(crop_cell(a[0], *a[1])[10:], crop_cell(b[0], *b[1])[10:]) for a, b in pairs])
    T[("blue", "green")] = invert_affine(T[("green", "blue")])
    T[("blue", "")] = compose_affine(T[("blue", "green")], T[("green", "")])
    T[("", "green")] = invert_affine(T[("green", "")])
    T[("", "blue")] = compose_affine(T[("", "green")], T[("green", "blue")])
    return T


def restate(canvas: np.ndarray, s0: str, s1: str, T) -> np.ndarray:
    """s0 档的样本换到 s1 档。范围外一律再去色（基准期 #12 的灰度雾）。"""
    if s1 == "":
        colored = canvas if s0 == "" else apply_affine(canvas, T[(s0, "")])
        return desaturate(colored)
    return canvas if s1 == s0 else apply_affine(canvas, T[(s0, s1)])


# —— 地块清单：每种地块的样本格（同档多格投票；键 = 文件基名） ——
# 挑格原则：地物底座落在本格菱形中心、前排三格没有地物闯进本格菱形。见 06 §1.3 的文件名。
TILES: dict[str, dict] = {
    "plain0": {"cells": [("106", (-4, -2)), ("106", (-1, -4)), ("106", (1, -4)), ("106", (3, -2)), ("106", (3, 2)), ("106", (6, 0))]},
    "plain1": {"cells": [("88", (-3, 0))], "erase": [(0, 20, 16, 35)]},   # 左下角闯进一间茅屋
    "plain2": {"cells": [("106", (3, 1))]},
    "plain3": {"cells": [("104", (-3, 0))], "erase": [(0, 20, 16, 35), (12, 30, 44, 35)]},   # 左下角闯进一个头像，底尖压着前排格的山尖
    "forest0": {"cells": [("106", (-2, -3)), ("106", (-1, -3)), ("106", (2, -2)), ("106", (2, 3)), ("106", (4, -1)), ("106", (5, 1)), ("106", (4, 0))], "erase": [(0, 18, 14, 35)]},   # 左下角有块别的树冠，在游戏里会被前排格盖住，裁掉图干净
    "mountain0": {"cells": [("104", (0, -2)), ("106", (-2, 0)), ("104", (-4, 0))], "drop_forest": True, "erase": [(0, 22, 8, 35)]},   # 左下角树冠淡处去不净          # 大双峰山（06 §2 的 c）
    "mountain1": {"cells": [("106", (2, 2)), ("106", (1, 3))], "drop_forest": True},                              # 横向条纹山脊（b）
    "mountain2": {"cells": [("106", (5, 0)), ("106", (3, -1)), ("104", (-2, -1)), ("104", (4, 0))], "drop_forest": True},   # 单峰圆丘（a）
    "river0": {"cells": [("106", (0, 2)), ("106", (1, 0)), ("104", (1, 1)), ("88", (0, -2)), ("88", (0, 1))]},   # 深色小湖
    "river1": {"cells": [("106", (1, -5)), ("106", (4, -2)), ("104", (-2, 1)), ("104", (1, -3))]},               # 浅色小湖
    "village0": {"cells": [("88", (-3, 1))], "seed_up": 14},
    "town0": {"cells": [("88", (-1, 5))], "seed_up": 14, "erase": [(0, 14, 16, 35)]},   # 左下角压着一道别的墨迹
}
# 没有第二种样本 / 没有任何样本的地块：复用（清单里标明）
TILE_ALIASES = {"forest1": "forest0", "city0": "town0", "fudi0": "plain0", "dongtian0": "plain0"}


def vote(stack: np.ndarray, softs: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """多实例逐像素投票。本格地物在每个实例里都在同一位置，邻格闯入只在个别实例里出现，
    所以：n≤4 要全体实例都判地物、n≥5 允许 1 个例外，才算地物；不算地物的像素优先取
    「像地面」的那些实例的中值（把闯入的树冠投掉）。"""
    n = len(stack)
    hard = softs > 0.5
    need = n if n <= 4 else n - 1
    votes = hard.sum(axis=0)
    is_sprite = votes >= need
    rgb = np.median(stack, axis=0)
    soft = np.where(is_sprite, np.median(softs, axis=0), 0.0)
    for y, x in zip(*np.nonzero(is_sprite)):
        rgb[y, x] = np.median(stack[hard[:, y, x], y, x], axis=0)
    mixed = (~is_sprite) & (votes > 0)
    for y, x in zip(*np.nonzero(mixed)):
        rgb[y, x] = np.median(stack[~hard[:, y, x], y, x], axis=0)
    return rgb, soft


def inpaint_intrusions(rgb: np.ndarray, soft: np.ndarray, plain: np.ndarray | None) -> np.ndarray:
    """菱形内与中心区不相连、大于 40px 的地物块是前排邻格闯进来的，用同档空地（plain0）的像素补掉。"""
    if plain is None:
        return rgb
    h = rgb.shape[0]
    inside = np.zeros((h, CELL_W), bool)
    inside[-CELL_H:] = DIA
    hard = (soft > 0.5) & inside
    label = _components(hard)
    seed = np.zeros_like(hard)
    seed[-CELL_H + 4:-CELL_H + 22, 18:46] = True
    main_ids = set(np.unique(label[seed & hard])) - {0}
    out = rgb.copy()
    for i in range(1, label.max() + 1):
        if i in main_ids:
            continue
        blob = label == i
        if blob.sum() > 40:
            out[blob] = plain[blob]
    return out


def plain_ground(plain: dict[str, np.ndarray], s0: str, T) -> np.ndarray:
    """补地用的空地像素：s0 档的彩色版（范围外不去色，去色是最后一步）。"""
    base = plain["blue"]
    return base if s0 == "blue" else apply_affine(base, T[("blue", s0)])


def build_tile(name: str, T, plain: dict[str, np.ndarray] | None = None) -> dict[str, np.ndarray]:
    spec = TILES[name]
    cells = spec["cells"]
    s0 = state_of(cells[0][0], *cells[0][1])
    same = [(tag, c) for tag, c in cells if state_of(tag, *c) == s0]
    stack = np.stack([crop_cell(tag, *c) for tag, c in same])
    softs = np.stack([nonground(crop_cell(tag, *c), palette_for(tag, *c)) for tag, c in same])
    vis = np.stack([viewport_mask(tag, *c) for tag, c in same])
    softs = softs * vis
    if len(same) >= 2:
        rgb, soft = vote(stack, softs)
    else:
        rgb, soft = stack[0], softs[0]
    plain_rgb = plain_ground(plain, s0, T)[TILE_H - rgb.shape[0]:, :, :3] if plain is not None else None
    for x0, y0, x1, y1 in spec.get("erase", []):   # 手工指定的杂物（截图里压在格上的别的东西）
        soft[ABOVE + y0:ABOVE + y1, x0:x1] = 0.0
        if plain_rgb is not None:
            band = np.zeros(soft.shape, bool)
            band[ABOVE + y0:ABOVE + y1, x0:x1] = True
            inside = np.zeros(soft.shape, bool)
            inside[-CELL_H:] = DIA
            rgb = np.where((band & inside)[..., None], plain_rgb, rgb)
    if spec.get("drop_forest") and plain_rgb is not None:
        # 山脚贴着的树冠：树冠绿（g−b、g−r 都大）且不在山体主连通块之内的像素，才当作闯入
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        greenish = (g - b > 16) & (g - r > 16)
        inside = np.zeros(soft.shape, bool)
        inside[-CELL_H:] = DIA
        body = _fill_holes((soft > 0.5) & ~greenish)
        body = keep_connected(body, inside)
        body = dilate(body)
        forest = greenish & ~body
        soft = np.where(forest, 0.0, soft)
        rgb = np.where((forest & inside)[..., None], plain_rgb, rgb)
    alpha = own_sprite(soft, spec.get("seed_up", 0))
    if len(same) == 1:
        alpha = alpha * vis[0]
    if plain_rgb is not None and name != "plain0":
        rgb = inpaint_intrusions(rgb, soft, plain_rgb)
    base = to_canvas(rgb, alpha)
    return {s: restate(base, s0, s, T) for s in STATES}


# —— 非地块：小人、头像、选中框、箭头、墨框 ——

def sprite_from_cell(tag: str, dx: int, dy: int, box: tuple[int, int, int, int], T, erase: np.ndarray | None = None, drop_green: bool = False) -> np.ndarray:
    """按格取一个站在格子上的精灵（小人/头像）：box = 相对菱形左上角的 (x0, y0, x1, y1)，
    只留 box 内、与 box 中心区相连的非地面像素；erase 为同尺寸 alpha（选中框）时先扣掉它。
    返回 64×120 画布（与地块同一贴底规则，页面按 top−85 摆）。"""
    crop = crop_cell(tag, dx, dy)
    soft = nonground(crop, palette_for(tag, dx, dy)) * viewport_mask(tag, dx, dy)
    h = crop.shape[0]
    x0, y0, x1, y1 = box
    win = np.zeros((h, CELL_W), bool)
    win[ABOVE + y0:ABOVE + y1, x0:x1] = True
    soft = soft * win
    if erase is not None:
        near = np.abs(crop - erase[..., :3]).sum(axis=2) < 60
        soft = np.where((erase[..., 3] > 0.3) & near, 0.0, soft)
    if drop_green:   # 身后紧贴的树冠：绿色像素一律不算小人（衣服是蓝的、头发是黑的）
        r, g, b = crop[..., 0], crop[..., 1], crop[..., 2]
        soft = np.where((g > r + 15) & (g > b + 5), 0.0, soft)
    hard = _fill_holes(soft > 0.5)
    seed = np.zeros_like(hard)
    cx, cy = (x0 + x1) // 2, ABOVE + (y0 + y1) // 2
    seed[cy - 8:cy + 8, cx - 6:cx + 6] = True
    alpha = soft_edge(keep_connected(hard, seed), soft)
    return to_canvas(crop, alpha)


def frame_from_cell(tag: str, dx: int, dy: int, hidden: tuple[int, int, int, int] | None = None) -> np.ndarray:
    """64×35 的菱形选框：非地面像素的软 alpha（不补洞，框是空心的）；
    hidden = 被小人挡住的 (x0,y0,x1,y1)，用上下对称的另一半补回来（原图双线菱形 + 四顶点小环，上下左右对称）。"""
    crop = crop_cell(tag, dx, dy, 0)
    soft = nonground(crop, palette_for(tag, dx, dy)) * viewport_mask(tag, dx, dy, 0)
    rgba = np.zeros((CELL_H, CELL_W, 4))
    rgba[..., :3] = crop
    rgba[..., 3] = soft * 255
    if hidden:
        x0, y0, x1, y1 = hidden
        flipped = rgba[::-1]
        rgba[y0:y1, x0:x1] = flipped[y0:y1, x0:x1]
    # 只留线条：≥30px 的连通块及其外一圈软边，淡色地面斑全部丢掉
    hard = rgba[..., 3] > 150
    label = _components(hard)
    sizes = np.bincount(label.ravel())
    keep = np.isin(label, [i for i in range(1, len(sizes)) if sizes[i] >= 30])
    rgba[..., 3] = soft_edge(keep, rgba[..., 3] / 255) * 255
    return rgba


def recolor_frame(shape: np.ndarray, colored: np.ndarray) -> np.ndarray:
    """选中框（蓝灰）被小人挡了顶点：用悬停框（黄绿、干净）的形状，把线色整体平移到蓝灰。
    颜色样本只取 colored 左右各 1/4（小人挡不到的地方）。"""
    side = np.zeros((CELL_H, CELL_W), bool)
    side[:, :16] = True
    side[:, 48:] = True
    src = shape[..., :3][(shape[..., 3] > 150)]
    dst = colored[..., :3][(colored[..., 3] > 150) & side]
    shift = np.median(dst, axis=0) - np.median(src, axis=0)
    out = shape.copy()
    out[..., :3] = shape[..., :3] + shift
    return out


def arrow_from_shot(tag: str, box: tuple[int, int, int, int]) -> tuple[np.ndarray, tuple[int, int]]:
    """在 box 里找深色实心三角，按其包围盒裁下；淡色底转透明。返回 (RGBA, 相对 mapdiv 原点的左上角)。"""
    im = shot(tag)
    x0, y0, x1, y1 = box
    reg = im[y0:y1, x0:x1]
    lum = reg.mean(axis=2)
    ink = lum < 35
    for _ in range(1):
        grown = ink.copy()
        grown[1:] |= ink[:-1]
        grown[:-1] |= ink[1:]
        grown[:, 1:] |= ink[:, :-1]
        grown[:, :-1] |= ink[:, 1:]
        ink = grown
    gray = (lum >= 35) & (lum < 175) & ~ink
    # 开运算：先腐蚀 1px 去掉墨线的软边细带，再把最大块膨胀回来
    eroded = ~dilate(~gray)
    label = _components(eroded)
    sizes = np.bincount(label.ravel())
    sizes[0] = 0
    core = label == sizes.argmax()
    dark = dilate(core) & gray
    ys, xs = np.nonzero(dark)
    bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    sub = reg[by0:by1, bx0:bx1]
    alpha = np.clip((235 - sub.mean(axis=2)) / 60.0, 0, 1) * 255
    rgba = np.concatenate([sub, alpha[..., None]], axis=2)
    ox, oy = SHOTS[tag][1]
    return rgba, (x0 + bx0 - ox, y0 + by0 - oy)


def frame_image(tag: str, pad: int = 8) -> tuple[np.ndarray, tuple[int, int]]:
    """墨框：视口外扩 pad 的一圈，墨色深浅当 alpha，视口内全透明。返回 (RGBA, 相对 mapdiv 原点的左上角)。"""
    im = shot(tag)
    ox, oy = SHOTS[tag][1]
    x0, y0, x1, y1 = ox - pad, oy - pad, ox + VIEW_W + pad, oy + VIEW_H + pad
    reg = im[y0:y1, x0:x1]
    alpha = np.clip((215 - reg.mean(axis=2)) / 150.0, 0, 1) * 255
    alpha[pad:pad + VIEW_H, pad:pad + VIEW_W] = 0
    rgba = np.concatenate([reg, alpha[..., None]], axis=2)
    return rgba, (-pad, -pad)


# 8 个滚屏箭头在 #106 里的搜索框（06 §1.1 的 DOM 位置 ± 余量）
# 四边中点的箭头贴着墨线，搜索框停在墨线外侧（少掉 1–2px 底边）
ARROW_BOXES = {
    "lt": (10, 136, 45, 168), "mt": (236, 136, 270, 155), "rt": (475, 136, 508, 168),
    "lm": (8, 262, 30, 300), "rm": (488, 262, 510, 300),
    "lb": (10, 398, 45, 430), "mb": (236, 409, 270, 432), "rb": (475, 398, 508, 430),
}


def tint(rgba: np.ndarray, color: tuple[int, int, int], k: float) -> np.ndarray:
    out = rgba.copy()
    out[..., :3] = rgba[..., :3] * (1 - k) + np.array(color) * k
    return out


def main() -> int:
    want_sheet = "--sheet" in sys.argv
    T = fit_transforms()
    for k, ab in T.items():
        print("变换", k, np.round(ab, 3).tolist())
    n = 0
    sheet: list[tuple[str, np.ndarray]] = []

    tiles: dict[str, dict[str, np.ndarray]] = {"plain0": build_tile("plain0", T)}
    for name in TILES:
        if name != "plain0":
            tiles[name] = build_tile(name, T, tiles["plain0"])
    for alias, src in TILE_ALIASES.items():
        tiles[alias] = tiles[src]
    for name, per in tiles.items():
        for s, canvas in per.items():
            save(canvas, f"map/{name}{s}.gif")
            n += 1
            sheet.append((f"{name}{s}", canvas))
    print(f"地块 {n} 张 → public/img/map/")

    # 选中框（蓝灰）：#106 中心格，小人挡住了顶点附近，用下半边镜像补；悬停框（黄绿）：#88 (0,6) 干净
    hov = frame_from_cell("88", 0, 6)
    sel = recolor_frame(hov, frame_from_cell("106", 0, 0))
    save(sel, "maptarget2.gif")
    save(hov, "maptarget.gif")
    # 小人：站在选中格上，先把选中框像素扣掉再抠
    pad = np.zeros((ABOVE + CELL_H, CELL_W, 4))
    pad[ABOVE:, :, :3] = sel[..., :3]
    pad[ABOVE:, :, 3] = sel[..., 3] / 255
    player1 = sprite_from_cell("106", 0, 0, (16, -26, 48, 26), T, erase=pad)
    player2 = sprite_from_cell("88", 0, 0, (16, -26, 48, 26), T, erase=pad, drop_green=True)
    save(player1, "player1.gif")
    save(player2, "player2.gif")
    # 他人头像：视野内取 #106/#88 蓝档里的几个真头像投票；视野外取 #88 范围外的褪色头像再去色
    heads_in = [("106", (-3, -2)), ("106", (0, -5)), ("106", (2, -3)), ("88", (-3, -1)), ("88", (0, -4)), ("88", (1, 2)), ("88", (1, 3))]
    heads_out = [("88", (0, -5)), ("88", (3, 2)), ("88", (3, 3)), ("88", (4, -2)), ("88", (5, 0))]

    def head(cells, s0):
        stack = np.stack([crop_cell(t, *c) for t, c in cells])
        softs = np.stack([nonground(crop_cell(t, *c), palette_for(t, *c)) * viewport_mask(t, *c) for t, c in cells])
        rgb, soft = vote(stack, softs)
        win = np.zeros_like(soft, bool)
        win[ABOVE - 2:ABOVE + 30, 18:46] = True
        hard = _fill_holes((soft > 0.5) & win)
        seed = np.zeros_like(hard)
        seed[ABOVE + 8:ABOVE + 22, 26:38] = True
        alpha = soft_edge(keep_connected(hard, seed), soft * win)
        return to_canvas(rgb, alpha)

    people11 = head(heads_in, "blue")
    people21 = desaturate(head(heads_out, ""))
    for base_name, base in (("people1", people11), ("people2", people21)):
        save(base, f"{base_name}1.gif")
        two = base.copy()          # 多人：原版无样本，叠一个右移 6px 的副本 [重建]
        shifted = np.zeros_like(base)
        shifted[:, 6:] = base[:, :-6]
        a = shifted[..., 3:4] / 255
        two[..., :3] = shifted[..., :3] * a + base[..., :3] * (1 - a)
        two[..., 3] = np.maximum(base[..., 3], shifted[..., 3])
        save(two, f"{base_name}2.gif")
    # 箭头：#106 八个方向；hover 态原版没见过，按绿色调色 [重建]
    positions = {}
    for key, box in ARROW_BOXES.items():
        rgba, pos = arrow_from_shot("106", box)
        save(rgba, f"pos/{key}.gif")
        save(tint(rgba, (60, 130, 60), 0.6), f"pos/{key}o.gif")
        positions[key] = (pos, rgba.shape[1], rgba.shape[0])
    print("箭头（相对 mapdiv 原点的左上角, 宽, 高）:", positions)
    # 墨框
    frame, fpos = frame_image("106")
    save(frame, "map/mapbg.gif")
    print("墨框", frame.shape[1], "×", frame.shape[0], "相对 mapdiv 原点", fpos)

    if want_sheet:
        Z = 3
        cols = 6
        items = sheet + [("maptarget2", to_canvas(sel[..., :3], sel[..., 3] / 255)), ("maptarget", to_canvas(hov[..., :3], hov[..., 3] / 255)),
                         ("player1", player1), ("player2", player2), ("people11", people11), ("people21", people21)]
        rows = (len(items) + cols - 1) // cols
        H_KEEP = 70
        im = Image.new("RGB", (cols * (CELL_W * Z + 6), rows * (H_KEEP * Z + 16)), (255, 0, 255))
        d = ImageDraw.Draw(im)
        for i, (name, canvas) in enumerate(items):
            c = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8), "RGBA").crop((0, TILE_H - H_KEEP, CELL_W, TILE_H))
            bg = Image.new("RGBA", c.size, (255, 255, 255, 255))
            c = Image.alpha_composite(bg, c).convert("RGB").resize((CELL_W * Z, H_KEEP * Z), Image.NEAREST)
            x, y = (i % cols) * (CELL_W * Z + 6), (i // cols) * (H_KEEP * Z + 16)
            im.paste(c, (x, y + 14))
            d.text((x + 2, y), name, fill=(0, 0, 0))
        p = ROOT / "tools" / "parity" / "shots" / "mapcrop-sheet.png"
        p.parent.mkdir(parents=True, exist_ok=True)
        im.save(p)
        print("对照表 →", p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
