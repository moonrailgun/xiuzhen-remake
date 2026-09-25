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

    if errors:
        print("\n对账失败：")
        for e in errors:
            print(" - " + e)
        return 1
    print("对账通过。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
