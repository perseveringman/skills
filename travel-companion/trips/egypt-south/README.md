# Egypt South Route — Test Fixtures

A ready-to-use test dataset for the **travel-companion** skill, covering the
classic upper-Egypt itinerary: **Aswan → Abu Simbel → Kom Ombo → Edfu →
Esna → Luxor**, plus the headline pharaohs, dynasties, and themes that
typically come up in a Nile-cruise conversation.

Use this fixture to:

- Exercise `scripts/ingest.py upsert` with a realistic extraction payload
- Smoke-test `scripts/geocode.py` (some entities ship with `coords: null`
  on purpose so the geocoder has work to do)
- Verify `scripts/rebuild_graph.py`, `scripts/export_data.py`, and
  `scripts/inject.py` against a non-trivial knowledge base
- Demo the explorer SPA without having to hold a real trip conversation

## Layout

```
fixtures/egypt-south/
├── README.md                       # this file
├── .trip/
│   └── session-log.jsonl           # sample 6-turn conversation
├── wiki/entities/                  # 14 pre-built entity markdown files
├── recommendations/                # one of each category (shots/food/itinerary/spots)
└── extraction.json                 # the LLM extraction payload that would
                                    # produce the entities above
```

## Quick load

### Web dev (推荐) — 直接在浏览器里看

```bash
cd web
npm install
npm run dev          # http://localhost:5173 — fixture 已自动注入
```

`web/vite.config.ts` 的 dev plugin 会自动把
`fixtures/egypt-south/data/trip.json` 注入到 `__TRIP_DATA__` 占位中。换数据集用：

```bash
FIXTURE=other-route npm run dev
```

### 产物 pipeline — 替代真实对话

从一个空的 trip 目录：

```bash
TRIP=$(mktemp -d)
cp -R fixtures/egypt-south/.trip            $TRIP/
cp -R fixtures/egypt-south/wiki             $TRIP/
cp -R fixtures/egypt-south/recommendations  $TRIP/

# Geocode the places that ship with coords: null
python scripts/geocode.py     --trip-root $TRIP

# Build graph + explorer
python scripts/export_data.py --trip-root $TRIP
python scripts/inject.py      --trip-root $TRIP

open $TRIP/explorer.html
```

### 重放 upsert pipeline

```bash
python scripts/ingest.py upsert \
    --trip-root $TRIP \
    --json-file fixtures/egypt-south/extraction.json
```

### 重新生成 fixture 的 data/trip.json

如果改了 fixture 内的 entity 或 recommendation：

```bash
python3 scripts/export_data.py --trip-root fixtures/egypt-south
```

## Coverage

- **Cities / regions:** 阿斯旺, 卢克索, 上埃及
- **Sites / temples / tombs:** 阿布辛贝勒神庙, 菲莱神庙, 康翁波神庙,
  埃德富神庙, 埃斯纳神庙, 卡尔纳克神庙, 卢克索神庙, 帝王谷, 哈特谢普苏特神庙
- **Pharaohs / deities:** 拉美西斯二世, 哈特谢普苏特, 荷鲁斯, 索贝克
- **Dynasties / events:** 第十九王朝, 阿布辛贝勒搬迁工程 (1964–1968)
- **Cuisine:** 库莎丽, 烤鸽子, 卡拉卡迪
- **Concept:** 尼罗河巡游

This is intentionally Chinese-first, matching the most common usage of the
skill.
