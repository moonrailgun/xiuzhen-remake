#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把论坛里粘贴的《修真》战报（缠斗结果信）解析成回归测试夹具。

用法：
    python3 tools/fixtures/parse_battle_reports.py            # 写 battle-reports.json
    python3 tools/fixtures/parse_battle_reports.py --selftest # 断言式自检

数据源：reference/text/**/*.txt（已从 reference/raw/ 的 GBK/UTF-8 混杂 HTML 解码好的纯文本，
两侧文件一一对应，含战报的 36 个文件完全重合，所以不必再碰 raw/ 的编码）。

战报版式（见 docs/research/03-forum-verbatim-mining.md §1.2）：
    双方的法宝交缠在一起拼斗，……终于分出结果来了！
    攻击方
    攻击  耐久  受到伤害  结果
    来自{玩家}的{品质}{名称}[+N]   {完好无损|惨被斩断}
    {攻击} {耐久} {受到伤害}
    ...
    防御方
    ...
玩家粘贴出来有两种排版：四格挤在一行（紧凑），或每格单独一行（展开）。
把全文空白折叠成单空格后两者一模一样，所以统一在折叠后的扁平串上扫。

官方客服：己方飞剑被斩断时战报不显示对方的飞剑 → 只有半张表，标记 half_table=True。
"""

import argparse
import bisect
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEXT_DIR = os.path.join(ROOT, "reference", "text")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "battle-reports.json")

# 开场白 / 表头 / 每把剑两行。三者合成一个 token 流。
# side 的 lookahead 用来甩掉帖子正文里的散装「攻击方 攻击约1500万」这类议论。
TOKEN = re.compile(
    r"(?P<open>终于分出结果来了)"
    r"|(?P<side>攻击方|防御方)(?=[^来]{0,40}来自)"
    # owner 可能被抽取器吃光（article-97581「来自的上品七星磐龙剑」），也可能带空格
    # （article-4288「来自 A君 的…」）；淬炼号的 "+" 偶尔也会丢（article-108206
    # 「凡品南明离火剑 6 惨被斩断」，按 72×1.25×2^6×1.32=7603 验证确为 +6）。
    r"|来自(?P<owner>.{0,24}?)的"
    r"(?P<quality>废品|凡品|上品|极品)?"
    # 法宝名里没有「的」，排掉它才能让玩家名本身以「的」结尾（"来自跑商的的凡品…"）
    r"(?P<name>(?:(?!的)[一-龥]){2,7}?(?:剑|碑|鉴|图|幡|钟))"
    r"(?:\s*\+?\s*(?P<refine>\d{1,2}))?\s*"
    r"(?P<result>完好无损|惨被斩断)\s*"
    r"(?P<attack>\d+)\s+(?P<dura>\d+)\s+(?P<taken>\d+)"
)
DATE = re.compile(r"(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?")
WAYBACK = re.compile(r"/web/(\d{4})(\d{2})(\d{2})\d*")
# 两份战报之间隔了太多闲聊就当作换场（1 楼 2 楼之间的回帖元信息只有几十字）
GAP_CHARS = 400


def flatten(lines):
    """折叠空白，同时留下 offset -> 行号 的映射。"""
    flat, starts, linenos = [], [], []
    pos = 0
    for i, line in enumerate(lines):
        s = re.sub(r"\s+", " ", line.replace("　", " ").replace("\xa0", " ")).strip()
        if not s:
            continue
        starts.append(pos)
        linenos.append(i)
        flat.append(s)
        pos += len(s) + 1
    return " ".join(flat), starts, linenos


def line_of(starts, linenos, offset):
    return linenos[max(0, bisect.bisect_right(starts, offset) - 1)]


def date_before(flat, offset, fallback):
    """取报告之前最近的一个日期；战报信自带「发信时间 2009-03-01 13:01:20」。"""
    last = None
    for m in DATE.finditer(flat, 0, offset):
        last = m
    if not last:
        return fallback
    d = "%s-%s-%s" % last.group(1, 2, 3)
    return d + " " + last.group(4) if last.group(4) else d


def parse_file(path, rel):
    with open(path, encoding="utf-8", errors="replace") as fh:
        lines = fh.read().splitlines()
    flat, starts, linenos = flatten(lines)
    if "受到伤害" not in flat:
        return [], 0

    m = WAYBACK.search(flat)
    fallback_date = "%s-%s-%s" % m.group(1, 2, 3) if m else None

    reports, cur, side, last_end = [], None, None, None
    orphans = 0

    def flush():
        nonlocal cur, side
        if cur and (cur["attacker_swords"] or cur["defender_swords"]):
            cur["end_line"] = line_of(starts, linenos, last_end or cur["_off"])
            reports.append(cur)
        cur, side = None, None

    def start(off):
        nonlocal cur
        flush()
        cur = {
            "source": "%s#L%d" % (rel, line_of(starts, linenos, off) + 1),
            "date": date_before(flat, off, fallback_date),
            "attacker_swords": [],
            "defender_swords": [],
            "_off": off,
            "start_line": line_of(starts, linenos, off),
        }

    for t in TOKEN.finditer(flat):
        if cur and last_end is not None and t.start() - last_end > GAP_CHARS:
            flush()
        if t.group("open"):
            start(t.start())
            side = None
        elif t.group("side"):
            want = "attacker" if t.group("side") == "攻击方" else "defender"
            if cur is None:
                start(t.start())
            elif cur[want + "_swords"]:
                # 同一侧第二次出现表头 = 新的一场
                start(t.start())
            side = want
        else:
            if cur is None:
                start(t.start())
                orphans += 1
            if side is None:
                side = "attacker"
            cur[side + "_swords"].append({
                "owner": t.group("owner"),
                "quality": t.group("quality"),
                "name": t.group("name"),
                "refine": int(t.group("refine")) if t.group("refine") else None,
                "attack": int(t.group("attack")),
                "durability": int(t.group("dura")),
                "damage_taken": int(t.group("taken")),
                "result": t.group("result"),
            })
            last_end = t.end()
    flush()

    for r in reports:
        r["raw_text"] = "\n".join(lines[r.pop("start_line"):r.pop("end_line") + 1]).strip()
        shown = r["attacker_swords"] + r["defender_swords"]
        r["half_table"] = not (r["attacker_swords"] and r["defender_swords"])
        # 官方客服：己方飞剑被斩断时战报不渲染对方 → 真·半表里己方应该全断。
        # 半表但还有剑完好，多半只是发帖人没把整张表贴全，不能当作半表证据用。
        r["half_table_all_broken"] = (
            r["half_table"] and all(s["result"] == "惨被斩断" for s in shown))
        r.pop("_off")
    return reports, orphans


def collect():
    reports, orphans, markers = [], 0, 0
    for dirpath, _, files in os.walk(TEXT_DIR):
        for fn in sorted(files):
            if not fn.endswith(".txt"):
                continue
            path = os.path.join(dirpath, fn)
            rel = os.path.relpath(path, os.path.join(ROOT, "reference"))
            with open(path, encoding="utf-8", errors="replace") as fh:
                blob = fh.read()
            if "受到伤害" not in blob:
                continue
            markers += blob.count("完好无损") + blob.count("惨被斩断")
            rs, o = parse_file(path, rel)
            reports.extend(rs)
            orphans += o

    # 同一场战报常被转贴两次，或先贴半截再补全（如 threads-unknown/64141 的 #12
    # 「我没把图全贴出来」、article-102139 的「第一场」）。两侧剑表都是别人前缀的，
    # 就是截短的重复粘贴，丢掉。
    def sig(r):
        return tuple(tuple((s["owner"], s["quality"], s["name"], s["refine"], s["attack"],
                            s["durability"], s["damage_taken"], s["result"]) for s in r[k])
                     for k in ("attacker_swords", "defender_swords"))

    sigs = [sig(r) for r in reports]

    def prefix(a, b):
        return len(a) <= len(b) and b[:len(a)] == a

    keep, dropped = [], 0
    for i, r in enumerate(reports):
        a = sigs[i]
        redundant = any(
            j != i and prefix(a[0], b[0]) and prefix(a[1], b[1])
            and (a != b or j < i)
            for j, b in enumerate(sigs))
        if redundant:
            dropped += 1
        else:
            keep.append(r)
    keep.sort(key=lambda r: (r["date"] or "", r["source"]))
    return keep, {"orphan_swords": orphans, "result_markers_in_source": markers,
                  "truncated_or_duplicate_dropped": dropped}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()

    reports, stats = collect()
    swords = sum(len(r["attacker_swords"]) + len(r["defender_swords"]) for r in reports)
    half = sum(1 for r in reports if r["half_table"])

    if args.selftest:
        # 魁首 2009-02-03 那场（guides/41053-p2）：5 攻 vs 10 防，首剑 22407/44816/44816
        kui = [r for r in reports if r["source"].startswith("text/guides/41053-p2")
               and len(r["attacker_swords"]) == 5 and len(r["defender_swords"]) == 10]
        assert len(kui) == 1, kui
        a = kui[0]["attacker_swords"]
        assert a[0] == {"owner": "魁首", "quality": "凡品", "name": "古纹青石剑", "refine": 1,
                        "attack": 22407, "durability": 44816, "damage_taken": 44816,
                        "result": "惨被斩断"}, a[0]
        assert a[4]["refine"] == 10 and a[4]["attack"] == 72990 and a[4]["damage_taken"] == 0
        assert kui[0]["half_table"] is False
        # 展开排版也要解出同一把剑：魁首 #50 的「凡品古纹青石剑」无 +N
        assert any(s["name"] == "古纹青石剑" and s["refine"] is None and s["attack"] == 36547
                   for r in reports for s in r["attacker_swords"])
        # 截短的重复粘贴要被吃掉：64141 里 #12 补全后只剩一份整表
        h = [r for r in reports if r["source"].startswith("text/threads-unknown/64141")]
        assert len(h) == 1 and not h[0]["half_table"], h
        # 半表：攻方飞剑被斩断，战报不渲染防御方（article-104251「为什么我的剑被断了」）
        d = [r for r in reports if r["source"].startswith("text/forum162/article-104251")]
        assert len(d) == 1 and d[0]["half_table"] and not d[0]["defender_swords"], d
        assert d[0]["attacker_swords"][0]["attack"] == 30689
        # 护身法宝也在同一张表里（article-98170 的上品指玄道藏碑+1 360/360/360）
        assert any(s["name"] == "指玄道藏碑" and s["attack"] == s["durability"] == 360
                   for r in reports for s in r["defender_swords"])
        # 受到伤害 = min(分摊伤害, 耐久)；等于耐久 <=> 惨被斩断。法宝名必须是已知的那 19 个。
        KNOWN = {"玉虚桃木剑", "墨叶血浪剑", "冰魄寒光剑", "青龙伏魔剑", "乌光玄铁剑", "古纹青石剑",
                 "上善若水剑", "破山断岳剑", "三阳一煞剑", "太乙金光剑", "南明离火剑", "七星磐龙剑",
                 "三阴绝脉剑", "天雷万磁剑", "指玄道藏碑", "六阳神火鉴", "先天太极图", "镜花水月幡",
                 "东皇太一钟"}
        for r in reports:
            for s in r["attacker_swords"] + r["defender_swords"]:
                assert s["name"] in KNOWN, (r["source"], s)
                assert s["damage_taken"] <= s["durability"], (r["source"], s)
                assert (s["damage_taken"] == s["durability"]) == (s["result"] == "惨被斩断"), (r["source"], s)
        print("selftest OK: %d 场 / %d 把剑 / %d 场半表" % (len(reports), swords, half))
        return

    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(reports, fh, ensure_ascii=False, indent=1)
    print("战报 %d 场，飞剑记录 %d 把，半表 %d 场 -> %s" % (len(reports), swords, half, OUT))
    print("文件数 %d；%s" % (len({r["source"].split("#")[0] for r in reports}), stats))


if __name__ == "__main__":
    main()
