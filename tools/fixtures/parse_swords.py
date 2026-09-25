#!/usr/bin/env python3
"""把玩家粘贴的原版飞剑物品窗解析成结构化 JSON。

来源：reference/text/forum162/article-94153-p1.txt（2009-04-16，资料片前）
标题「飞剑属性及消耗！（水）」，正文自述：
  - 「水属性为例，其他属性的人物只是五行真气需求量不同，每把剑消耗真气量不同属性人物的总合是一样的！」
  - 「炼制需要时间为0级手熟无他的时间！」
所以这份表是【水属性角色 + 手熟无他 0 级】这一基准下的原版数值。

基础属性写成「废品~极品」区间（如 8~80）→ 极品/废品 = 10，印证品质倍率 ×10。
五行数值顺序为 金木水火土（据每小时耗气第 5 项恒为 0 = 水属性角色的克我=土 判定）。

解析用剑名白名单定位，因为各条记录的描述行数不一（天雷万磁剑有 3 行特殊说明，
三阴绝脉剑则写着「暂无介绍，回头补齐！」），且个别字段写成 `2` 而非 `2~2`。

用法：python3 tools/fixtures/parse_swords.py > tools/fixtures/swords.json
"""
import json
import re
import sys
from pathlib import Path

SRC = Path("reference/text/forum162/article-94153-p1.txt")

# 14 把飞剑的完整名单，出处：reference/images/17173-live/200908051106523841/yyxzc4001.jpg（截图 #13）
SWORD_NAMES = [
    "玉虚桃木剑", "青龙伏魔剑", "古纹青石剑", "破山断岳剑", "三阳一煞剑",
    "南明离火剑", "天雷万磁剑", "三阴绝脉剑", "墨叶血浪剑", "冰魄寒光剑",
    "乌光玄铁剑", "上善若水剑", "太乙金光剑", "七星磐龙剑",
]

TAGS = re.compile(r"^【(.+?)】【(.+?)】【(.+?)】$")
CRAFT_COND = re.compile(r"^炼制条件[:：]\s*铸剑之术(\d+)级$")
USE_COND = re.compile(r"^使用条件[:：]\s*御剑术(\d+)级$")
DURATION = re.compile(r"^需要时间\s*(\d+):(\d\d):(\d\d)$")
# 允许 `8~80`、`2~2`、`2`、`0`
VALUE = re.compile(r"^(\d+)(?:~(\d+))?$")


def value_pair(s):
    m = VALUE.match(s)
    if not m:
        return None
    lo = int(m.group(1))
    hi = int(m.group(2)) if m.group(2) else lo
    return [lo, hi]


def parse(lines):
    # 每把剑的记录从「剑名」行开始，到下一把剑名或文末结束。
    # 多数剑名独占一行；三阴绝脉剑写成「三阴绝脉剑暂无介绍，回头补齐！」，所以用前缀匹配。
    starts = []
    for i, ln in enumerate(lines):
        for n in SWORD_NAMES:
            if ln == n or ln.startswith(n):
                starts.append((i, n))
                break

    swords = []
    seen = set()
    for idx, (i, name) in enumerate(starts):
        if name in seen:
            continue
        end = starts[idx + 1][0] if idx + 1 < len(starts) else len(lines)
        blk = lines[i:end]

        # 多数条目有【可否交易】【五行】【类别】标签行；三阴绝脉剑那条原帖就没写。
        tag_idx = next((k for k, ln in enumerate(blk) if TAGS.match(ln)), None)
        tm = TAGS.match(blk[tag_idx]) if tag_idx is not None else None
        if tm and tm.group(3) != "飞剑":
            continue
        if tag_idx is None:
            # 没有标签行时，至少要有炼制/使用条件才算一条记录（否则是目录里的提及）
            if not any(CRAFT_COND.match(ln) for ln in blk):
                continue
            tag_idx = 1

        def find(rx):
            for ln in blk:
                m = rx.match(ln)
                if m:
                    return m
            return None

        craft, use, dur = find(CRAFT_COND), find(USE_COND), find(DURATION)
        if not craft or not use:
            continue

        # 基础属性：「基础属性」之后按 攻击/耐久/吸收/速度/敏捷/击退 顺序出现 6 个数值
        try:
            base_at = blk.index("基础属性")
        except ValueError:
            continue
        # 按字段标题行切分，因为个别条目缺字段：
        #  - 三阴绝脉剑没有「速度/敏捷」那一组（原帖就漏了）
        #  - 冰魄寒光剑的击退写成 `-`（原帖未填）
        field_vals: dict[str, list] = {}
        current: list[str] | None = None
        for ln in blk[base_at + 1:]:
            if ln in ("每小时消耗真气", "炼制消耗"):
                break
            if ln in ("攻击", "耐久", "吸收", "速度", "敏捷", "击退"):
                current = [ln]
                field_vals.setdefault(ln, None)
                continue
            v = value_pair(ln)
            if v is None:
                continue
            # 数值按标题出现顺序回填：三个标题连着出现，然后三个数值连着出现
            for key in ("攻击", "耐久", "吸收", "速度", "敏捷", "击退"):
                if key in field_vals and field_vals[key] is None:
                    field_vals[key] = v
                    break

        attack = field_vals.get("攻击")
        durability = field_vals.get("耐久")
        absorb = field_vals.get("吸收")
        speed = field_vals.get("速度")
        agility = field_vals.get("敏捷")
        knockback = field_vals.get("击退")
        if not (attack and durability and absorb):
            continue

        five = {}
        for label in ("每小时消耗真气", "炼制消耗"):
            if label not in blk:
                continue
            k = blk.index(label)
            got = []
            for ln in blk[k + 1:]:
                if ln.isdigit():
                    got.append(int(ln))
                    if len(got) == 5:
                        break
                elif got:
                    break
            if len(got) == 5:
                five[label] = got

        # 描述文案 = 剑名与标签行之间的所有行
        flavor = [ln for ln in blk[1:tag_idx] if ln and "暂无介绍" not in ln]

        seen.add(name)
        swords.append({
            "name": name,
            "flavor": flavor,
            "element": tm.group(2) if tm else None,
            "tradable": (tm.group(1) == "可以交易") if tm else None,
            "forgeLevel": int(craft.group(1)),
            "wieldLevel": int(use.group(1)),
            "attack": attack,          # [废品, 极品]
            "durability": durability,
            "absorb": absorb,
            "speed": speed[0] if speed else None,         # 不随品质变化
            "agility": agility[0] if agility else None,
            "knockback": knockback[0] if knockback else None,
            "upkeepPerHour": five.get("每小时消耗真气"),  # 金木水火土
            "craftCost": five.get("炼制消耗"),
            "craftSeconds": (int(dur.group(1)) * 3600 + int(dur.group(2)) * 60 + int(dur.group(3)))
            if dur else None,
        })
    return swords


def main():
    if not SRC.exists():
        sys.exit(f"找不到 {SRC}（请在项目根目录运行）")
    lines = [l.strip() for l in SRC.read_text(encoding="utf-8", errors="ignore").split("\n")]
    lines = [l for l in lines if l]
    swords = parse(lines)

    json.dump({
        "source": str(SRC),
        "sourceNote": "水属性角色、手熟无他 0 级；五行顺序 金木水火土；攻击/耐久/吸收为 [废品, 极品] 区间",
        "date": "2009-04-16",
        "swords": swords,
    }, sys.stdout, ensure_ascii=False, indent=2)
    print()

    print(f"# 解析出 {len(swords)}/14 把飞剑", file=sys.stderr)
    for s in swords:
        lo, hi = s["attack"]
        fmt = lambda v: "?" if v is None else v
        print(f"#   {s['name']} {(s['element'] or '?'):4s} 铸{s['forgeLevel']:2d}/御{s['wieldLevel']:2d} "
              f"攻{lo}~{hi} 耐{s['durability'][0]}~{s['durability'][1]} "
              f"吸{s['absorb'][0]}~{s['absorb'][1]} 速{fmt(s['speed'])} 敏{fmt(s['agility'])} "
              f"退{fmt(s['knockback'])} 耗气{s['upkeepPerHour']} 耗时{s['craftSeconds']}s", file=sys.stderr)
    missing = [n for n in SWORD_NAMES if n not in {s["name"] for s in swords}]
    if missing:
        print(f"# 缺: {missing}", file=sys.stderr)


if __name__ == "__main__":
    main()
