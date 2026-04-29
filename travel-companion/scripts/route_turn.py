#!/usr/bin/env python3
"""Classify a user turn into one of the two skill tracks.

Track A — Trip Talk: extract entities, recommendations, refresh the
                     knowledge base. Default for anything that mentions a
                     real-world place, person, dish, era, etc.

Track B — Explorer Dev: modify the React SPA under web/ and rebuild
                        assets/explorer.html. Triggered by UI words.

Usage:
    python3 scripts/route_turn.py "<the user message>"

Output (JSON, one line, stdout):
    {
      "track": "A" | "B" | "AB",
      "confidence": 0.0–1.0,
      "matched": ["布局", "字号"],
      "rationale": "human readable"
    }

The script is intentionally simple keyword matching — it gives the agent
a fast prior. The agent can override based on richer context.
"""
from __future__ import annotations

import argparse
import json
import re
import sys


# --- Track B ----------------------------------------------------------------
# UI / explorer / build vocabulary. Chinese + English. Matched as
# substrings (case-insensitive for ASCII).
TRACK_B_TERMS = [
    # generic UI
    "界面", "布局", "样式", "颜色", "配色", "主题", "暗色", "夜间", "浅色",
    "字号", "字体", "行距", "间距", "图标", "icon", "ui", "css", "样式表",
    # widgets
    "按钮", "面板", "抽屉", "侧栏", "侧边栏", "topbar", "顶栏", "底栏",
    "弹窗", "弹层", "tooltip", "图例", "时间轴", "时间线",
    "legend", "drawer", "panel", "detail panel", "sidebar", "modal",
    "timeline", "search bar", "search box",
    # widget verbs (english)
    "restyle", "redesign", "rework",
    # explorer-specific
    "地图", "图谱", "关系图", "节点", "边", "高亮", "聚焦", "筛选", "过滤",
    "搜索框", "搜索栏", "缩放", "默认显示", "默认放大", "默认聚焦",
    "the map", "the graph", "zoom level", "default zoom",
    "map view", "graph view", "node", "edge", "highlight", "filter",
    # files & tooling
    "web/", "vite", "tsx", "react", "index.html", "explorer.html",
    "app.tsx", "store.ts", "index.css", "build", "构建", "打包",
    "hmr", "hot reload", "热更新", "dev server",
]

# Verbs paired with the above to bump confidence.
TRACK_B_VERBS = [
    "改", "调整", "修改", "加", "新增", "添加", "去掉", "删除", "隐藏",
    "显示", "切换", "重做", "重写", "优化", "美化", "fix", "tweak",
    "redesign", "rework", "rewrite",
]

# --- Track A ----------------------------------------------------------------
# Trip / content vocabulary. Hits push toward A.
TRACK_A_TERMS = [
    # generic trip planning
    "旅行", "旅游", "出行", "行程", "路线", "线路", "去玩", "想去", "打算去",
    "下个月", "下周", "暑假", "国庆", "春节",
    "trip", "travel", "itinerary", "visit", "going to", "plan to visit",
    # content categories
    "拍照", "拍摄", "摄影", "出片", "美食", "吃的", "餐厅", "小吃", "夜景",
    "景点", "看点", "门票", "开放时间", "推荐",
    "shots", "food", "restaurant", "must see", "must visit",
    # historical / cultural — generic prompts
    "历史", "文化", "王朝", "法老", "皇帝", "君主", "神祇", "神话",
    "history", "culture", "dynasty", "pharaoh", "deity", "myth",
    # place-type words (commonly named entities)
    "神庙", "庙", "陵墓", "古墓", "古迹", "遗址", "宫殿", "城堡", "教堂",
    "大教堂", "清真寺", "佛寺", "道观", "博物馆", "美术馆", "艺术馆",
    "山脉", "湖泊", "瀑布", "海岸", "沙漠", "绿洲", "古城", "老城",
    "temple", "tomb", "ruins", "palace", "castle", "church", "cathedral",
    "mosque", "shrine", "museum", "gallery", "old town", "old city",
]


def _count_hits(text: str, vocab: list[str]) -> tuple[int, list[str]]:
    """Return (#hits, distinct matched terms)."""
    lower = text.lower()
    matched: list[str] = []
    for term in vocab:
        t = term.lower()
        # word-ish boundary for ASCII; raw substring for CJK
        if re.search(r"[a-z0-9]", t):
            if re.search(rf"(?<![a-z0-9]){re.escape(t)}(?![a-z0-9])", lower):
                matched.append(term)
        else:
            if t in lower:
                matched.append(term)
    return len(matched), matched


def classify(text: str) -> dict:
    b_hits, b_matched = _count_hits(text, TRACK_B_TERMS)
    a_hits, a_matched = _count_hits(text, TRACK_A_TERMS)
    v_hits, _ = _count_hits(text, TRACK_B_VERBS)

    # Verb pairing roughly doubles a Track B signal.
    b_score = b_hits + (1 if b_hits and v_hits else 0)
    a_score = a_hits

    if b_score == 0 and a_score == 0:
        # No clear signal — default to A (safe, never breaks SPA build).
        return {
            "track": "A",
            "confidence": 0.4,
            "matched": [],
            "rationale": "no keywords matched; defaulting to Trip Talk",
        }

    if b_score and a_score:
        # Both fire — likely a mixed turn (talk about Edfu, also tweak font).
        # Recommend running A first, then B.
        total = b_score + a_score
        return {
            "track": "AB",
            "confidence": round(min(0.95, 0.5 + 0.1 * total), 2),
            "matched": sorted(set(a_matched + b_matched)),
            "rationale": "both content and UI signals — run Track A then Track B",
        }

    if b_score >= a_score:
        return {
            "track": "B",
            "confidence": round(min(0.95, 0.5 + 0.1 * b_score), 2),
            "matched": sorted(set(b_matched)),
            "rationale": f"UI vocabulary dominates ({b_score} hits)",
        }

    return {
        "track": "A",
        "confidence": round(min(0.95, 0.5 + 0.1 * a_score), 2),
        "matched": sorted(set(a_matched)),
        "rationale": f"trip-content vocabulary dominates ({a_score} hits)",
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Classify a user turn into Track A or B.")
    ap.add_argument("text", nargs="?", help="The user message. If omitted, read stdin.")
    args = ap.parse_args()

    text = args.text if args.text is not None else sys.stdin.read()
    text = text.strip()
    if not text:
        print(json.dumps({"track": "A", "confidence": 0.0, "matched": [],
                          "rationale": "empty input"}, ensure_ascii=False))
        return 0

    print(json.dumps(classify(text), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
