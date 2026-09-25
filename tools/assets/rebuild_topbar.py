#!/usr/bin/env python3
"""
重做顶栏横幅 img/top/back2.jpg。

为什么要重做（原来那张的两个毛病）：
 1. **只有 750px 宽**，但顶栏是 1000px —— 右边 1/4（五行互化那一带）根本没有背景，
    墨迹到 750px 就断了；
 2. 烧在图上的按钮、五行数值、「人物/法术…」标签**没擦干净**：当年那次
    「横向邻域纹理克隆」既留下一层鬼影，又把周围的水墨抹花了。
    我们的 HTML 又在上面画一遍真的，看起来就是重影 + 模糊。

**不是分辨率问题**：两张源截图都是原生 1:1。
把顶栏 98 行的「每列暗度」做一维互相关，最佳解是 `scale=1.000, offset=9`
（r=0.987）—— #114 只是裁得窄（755px），不是 0.755 倍缩图。所以全程不缩放。

做法：
 - 底图整条取 #2 的 [5,0,1005,98]（截图左留白 5px，所以 页面x = 截图x − 5），原生分辨率不缩放；
 - 只擦「文字/按钮/图标」的像素，**不整块挖**——横幅中央那座山就在资源数值底下，
   整块挖会把山一起挖掉。靠「比局部亮底暗很多」或「饱和度高」来认这些像素；
 - 擦掉的洞用拉普拉斯扩散补（解 ∇²=0，边界取洞周围的干净像素）。
   水墨横幅是低频渐层，这样补出来接得上，比纹理克隆稳。

出处与台账见 `tools/assets/manifest.json` 的 `img/top/back2.jpg` 条目。
用法：python3 tools/assets/rebuild_topbar.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "reference/images/17173-live/20081225104603605_all/xiuzhen801.jpg"
# #114 没有 17173 水印，用来补 logo 那一块；它与 #2 是同尺度，只差 9px 平移
SRC_NOMARK = ROOT / "reference/images/17173-live/20100811104141572/z0811xz01.jpg"
OUT = ROOT / "public/img/top/back2.jpg"

# 页面坐标 = #2 坐标 − 5（#2 左留白 5px，见 oui.css 的注释）
BAND = (5, 0, 1005, 98)
# #114.x = #2.x − 9（实测互相关）→ 页面坐标转 #114：page.x + 5 − 9 = page.x − 4
NOMARK_DX = -4

# 17173 粉色水印压住「修」字左半。这一块整块从 #114 取（那张没水印），
# 不走掩码擦除 —— 否则会把「修」的墨迹当成文字一起擦掉。
WATERMARK_RECT = (8, 20, 200, 62)

# 要擦掉的 UI 区域（页面坐标，与 oui.css 里各元素的定位一一对应）。
# 只在这些框里找「文字/按钮」像素，框外的水墨一律不动。
# 框要**贴着字量**，不能按元素的外框放大：横幅中央那座山就在资源数值底下，
# 框开大一圈，山的墨迹就会被当成文字一起擦掉（试过 (300,24,1000,74)，
# 擦掉 34% 的像素，整条中带被抹平）。下面的 y 是对着 #2 逐行量的。
UI_RECTS = [
    (0, 0, 240, 20),      # #servertimebox 服务器时间
    (8, 80, 240, 98),     # #version 版本号
    (596, 2, 1000, 22),   # #littlemenu 右上 6 个按钮
    (300, 32, 1000, 62),  # #resource 两行数值（上行 35–46、下行 48–59）
    (300, 74, 782, 98),   # #bigmenu 七个主标签
    (840, 62, 1000, 98),  # #avgres 五行互化钮（蓝底带渐变，框给足）
]


def dirty_mask(rgb: np.ndarray) -> np.ndarray:
    """认出「烧在图上的 UI 像素」：比局部亮底暗一截的，或者颜色很艳的。"""
    img = Image.fromarray(rgb.astype(np.uint8))
    gray = np.asarray(img.convert("L")).astype(float)

    # 闭运算（先取大再取小）得到一张「没有细笔画的亮底」，
    # 半径要能吞掉字的笔画宽度（正文 12px 字，笔画 1–2px，半径 5 足够）
    light = np.asarray(
        img.convert("L").filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    ).astype(float)
    darker_than_bg = (light - gray) > 18

    # 彩色的（五行图标、付费功能的黄底、五行互化的蓝底）。
    # 阈值要低：图标带柔光边，0.22 只吃得到核心，留一圈彩色残影。
    # 水墨本身是灰的（饱和度近 0），所以放低不会误伤。
    mx = rgb.max(axis=2).astype(float)
    mn = rgb.min(axis=2).astype(float)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    colorful = (sat > 0.10) & (mx > 40)
    # 彩色区单独多胀两圈，把柔光边扫干净
    colorful = np.asarray(
        Image.fromarray((colorful * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))
    ) > 127

    mask = darker_than_bg | colorful

    # 只在 UI 框里生效
    inside = np.zeros(mask.shape, bool)
    for x0, y0, x1, y1 in UI_RECTS:
        inside[y0:y1, x0:x1] = True
    mask &= inside

    # 稍微胀一圈，把抗锯齿的半透明边一并吃掉（3 就够，5 会连带啃掉周围的水墨）
    m = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
    return np.asarray(m) > 127


def inpaint(rgb: np.ndarray, mask: np.ndarray, iters: int = 600) -> np.ndarray:
    """拉普拉斯扩散补洞：洞里反复取四邻平均，边界钉死为干净像素。"""
    out = rgb.astype(float).copy()
    # 先用每列的干净像素均值做初值，收敛快且不会把左右的深浅串味
    for c in range(3):
        ch = out[:, :, c]
        for x in range(ch.shape[1]):
            col_clean = ch[:, x][~mask[:, x]]
            if col_clean.size:
                ch[:, x][mask[:, x]] = col_clean.mean()
            else:
                ch[:, x][mask[:, x]] = ch[~mask].mean() if (~mask).any() else 255.0

    for _ in range(iters):
        for c in range(3):
            ch = out[:, :, c]
            pad = np.pad(ch, 1, mode="edge")
            avg = (pad[:-2, 1:-1] + pad[2:, 1:-1] + pad[1:-1, :-2] + pad[1:-1, 2:]) / 4.0
            ch[mask] = avg[mask]
    return np.clip(out, 0, 255).astype(np.uint8)


def main() -> None:
    band = Image.open(SRC).convert("RGB").crop(BAND)
    rgb = np.asarray(band).astype(np.uint8)
    assert rgb.shape[:2] == (98, 1000), f"横幅应是 1000×98，实得 {rgb.shape[:2][::-1]}"

    # logo 那块换成 #114 的同一块（无水印，同尺度，只平移）
    x0, y0, x1, y1 = WATERMARK_RECT
    patch = Image.open(SRC_NOMARK).convert("RGB").crop(
        (x0 + NOMARK_DX, y0, x1 + NOMARK_DX, y1)
    )
    rgb[y0:y1, x0:x1] = np.asarray(patch).astype(np.uint8)

    mask = dirty_mask(rgb)
    cleaned = inpaint(rgb, mask)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(cleaned).save(OUT, quality=92, subsampling=0)
    print(f"擦掉 {mask.sum()} 个像素（占 {mask.mean() * 100:.1f}%）")
    print(f"写出 {OUT.relative_to(ROOT)} 1000×98")


if __name__ == "__main__":
    main()
