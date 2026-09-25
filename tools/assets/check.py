#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""素材清单对账：07 §7.2 的原版文件名全集必须逐个落在 manifest.json 的某一档，缺一个就报错。

    python3 tools/assets/check.py
"""
import json, os, sys
from collections import Counter

ROOT = os.path.dirname(os.path.abspath(__file__))

def names(prefix, s):
    return [prefix + n for n in s.split()]

# ---- 07 §7.2「图片（按目录）」逐字誊抄的文件名全集，共 120 个 ----
ORIGINAL = []
ORIGINAL += names("img/", """
 1.gif loading.gif closewindow.gif closewindows.gif top.gif ahead.gif back.gif bottom.gif
 talk.gif friend.gif halftime.gif end.gif giveupquest.gif
 people11.gif people12.gif people21.gif player1.gif maptarget.gif maptarget2.gif
 indexback.jpg indexloginbg.gif indexregisterbg.gif indexnewsbg.gif""")
ORIGINAL += names("img/top/", "back2.jpg")
ORIGINAL += names("img/title/", "titlecreatechr.gif titlerank.gif titleproduce.gif titlebattle.gif")
ORIGINAL += names("img/btn/", """
 index.gif help.gif rank.gif playerdir.gif vip.gif bbs.gif about.gif
 player_1.gif skill_1.gif item_1.gif map_1.gif map_2.gif ally_1.gif trade_1.gif msg_1.gif
 turn_1.gif btnok.gif btncancel.gif mover1.gif""")
ORIGINAL += names("img/button/", "login.gif register.gif back.gif del.gif")
ORIGINAL += names("img/res/", "gold.gif wood.gif water.gif fire.gif earth.gif coin.gif")
ORIGINAL += names("img/event/", "mark.gif attack.gif back.gif")
ORIGINAL += names("img/avatar/", """
 random.gif shushanm.gif shushanf.gif kunlunm.gif kunlunf.gif
 tongtianm.gif tongtianf.gif escort.gif""")
ORIGINAL += names("img/scene/", """
 plain01.gif forest01.gif forest02.gif mountain01.gif mountain02.gif mountain03.gif
 river01.gif river02.gif""")
ORIGINAL += names("img/map/", """
 plain0.gif plain1.gif plain2.gif plain3.gif forest0.gif forest1.gif
 mountain0.gif mountain1.gif mountain2.gif river0.gif river1.gif
 plain0blue.gif plain1blue.gif plain2blue.gif plain3blue.gif plain0green.gif plain1green.gif
 forest1blue.gif mountain0blue.gif mountain1blue.gif mountain2blue.gif mountain2green.gif
 river1blue.gif""")
ORIGINAL += names("img/pos/", " ".join(
    "%s.gif %so.gif" % (k, k) for k in "lt mt rt lm rm lb mb rb".split()))
ORIGINAL += names("img/skill/", "101.gif 106.gif 107.gif bgproducek.gif")
ORIGINAL += names("img/pipe/", "chrbgs.gif")

FIELDS = {"path", "tier", "purpose", "source", "bbox", "method", "issues", "confidence"}


def main():
    with open(os.path.join(ROOT, "manifest.json"), encoding="utf-8") as fh:
        rows = json.load(fh)

    errors = []
    seen = set()
    for i, r in enumerate(rows):
        if set(r) != FIELDS:
            errors.append("第 %d 项字段不符：%s" % (i, sorted(set(r) ^ FIELDS)))
        if r["path"] in seen:
            errors.append("重复条目：%s" % r["path"])
        seen.add(r["path"])
        if r["tier"] not in "ABCD":
            errors.append("%s：非法档位 %r" % (r["path"], r["tier"]))
        if r["tier"] in "AB":
            if not r["source"]:
                errors.append("%s：A/B 档必须有 source" % r["path"])
            if not (isinstance(r["bbox"], list) and len(r["bbox"]) == 4):
                errors.append("%s：A/B 档必须有 [x,y,w,h] 裁切框" % r["path"])
        else:
            if r["bbox"]:
                errors.append("%s：C/D 档 bbox 必须为 null" % r["path"])
        if not r["method"]:
            errors.append("%s：缺 method" % r["path"])

    missing = [n for n in ORIGINAL if n not in seen]
    if missing:
        errors.append("07 §7.2 里有但未归类的（必须为空）：\n  " + "\n  ".join(missing))

    tiers = Counter(r["tier"] for r in rows)
    print("07 §7.2 文件名全集：%d 个，已归类 %d 个，未归类 %d 个" %
          (len(ORIGINAL), len(ORIGINAL) - len(missing), len(missing)))
    print("清单条目：%d（含 %d 条原版未实见、按命名规律补的推断项）" %
          (len(rows), len(rows) - len(ORIGINAL)))
    print("各档数量：" + "  ".join("%s=%d" % (t, tiers[t]) for t in "ABCD"))

    errors += check_topbar()

    if errors:
        print("\n对账失败：")
        for e in errors:
            print(" - " + e)
        return 1
    print("对账通过。")
    return 0


def check_topbar():
    """顶栏横幅：尺寸对不对、保留下来的部分有没有被重采样/抹平。

    不能量「整图高频能量」：
      - 旧版有一层没擦干净的 UI 鬼影，鬼影本身就是高频，把数字撑到 25；
      - 新版把 31% 的像素擦掉补平了，全图高频自然降到 11 —— 但它明显更清楚。
    也不能量文件体积：补平的区域压得更小（19KB < 旧版 66KB）。

    真正该钉死的是：**没被擦的那些像素，必须还是原生截图的像素**。
    只要这条成立，「修真」和山就不可能糊，因为它们压根没被动过。
    """
    path = os.path.join(ROOT, "..", "..", "public", "img", "top", "back2.jpg")
    if not os.path.exists(path):
        return ["顶栏横幅 img/top/back2.jpg 不在了"]
    try:
        import numpy as np
        from PIL import Image
        sys.path.insert(0, ROOT)
        from rebuild_topbar import SRC, BAND, WATERMARK_RECT, dirty_mask
    except Exception:
        return []  # 没装 PIL 就跳过，别拦住别人跑对账

    im = Image.open(path).convert("RGB")
    out = []
    if im.size != (1000, 98):
        out.append("顶栏横幅应是 1000×98（顶栏宽 1000），实得 %dx%d" % im.size)
        return out

    src = np.asarray(Image.open(SRC).convert("RGB").crop(BAND)).astype(float)
    got = np.asarray(im).astype(float)

    keep = ~dirty_mask(np.asarray(Image.open(SRC).convert("RGB").crop(BAND)).astype(np.uint8))
    # logo 那块是从 #114 换过来的，不参与和 #2 的比对
    x0, y0, x1, y1 = WATERMARK_RECT
    keep[y0:y1, x0:x1] = False

    # 实测标定：原样写出 0.72（只有 JPEG 量化误差）；高斯 r=0.6 → 1.16、
    # r=1.2 → 2.44、r=2.0 → 4.06；当年那张糊版 → 18.40。取 1.0 能抓到肉眼可见的软化。
    diff = np.abs(got - src)[keep].mean()
    if diff > 1.0:
        out.append(
            "顶栏横幅保留区与原生截图平均差 %.2f（应 ≤1.0，原样写出约 0.7）—— "
            "说明那部分被重采样/模糊/抹平过，不再是原图像素" % diff
        )
    return out


if __name__ == "__main__":
    sys.exit(main())
