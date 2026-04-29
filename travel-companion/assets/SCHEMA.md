# Trip Knowledge Base — Schema

This file lives at `.trip/SCHEMA.md` inside every trip directory.
It tells the LLM how to maintain the knowledge base in this folder.
Do not edit unless you know what you're doing.

## Directory layout

```
<trip-root>/
├── .trip/
│   ├── SCHEMA.md           # this file (copied from the skill)
│   ├── session-log.jsonl   # raw turns, append-only
│   ├── state.json          # skill state (last processed turn, counters)
│   └── geocache.json       # Nominatim cache
├── wiki/
│   ├── entities/*.md       # one file per entity, with frontmatter
│   ├── index.md            # auto-maintained directory
│   └── timeline.md         # auto-maintained events timeline
├── recommendations/
│   ├── shots/{slug}.md
│   ├── food/{slug}.md
│   ├── itinerary/{slug}.md
│   └── spots/{region}.md
├── graph/
│   ├── graph.json          # {nodes:[], edges:[]}
│   └── graph.html          # single-file Cytoscape view
└── map/
    └── map.html            # single-file Leaflet + CartoDB Voyager view
```

## Entity file format

File path: `wiki/entities/{slug}.md` where `slug` is a filesystem-safe
version of the entity id (Chinese is fine, but replace `/` `\` `:` with `-`).

```markdown
---
id: 图坦卡蒙
type: pharaoh
aliases: [Tutankhamun, 图坦卡门]
coords: null                 # [lat, lon] or null
coords_source: null          # nominatim | user | llm
summary: 古埃及第十八王朝法老，9 岁登基...
tags: [新王国时期, 第十八王朝]
related: [第十八王朝, KV62墓, 黄金面具, 霍华德·卡特]
mentioned_at: [2026-04-29T10:12:00+08:00]
created: 2026-04-29T10:12:00+08:00
updated: 2026-04-29T10:12:00+08:00
---

## Summary
...

## Facts
- 9 岁登基
- 在位约 10 年

## Relations
- 所属王朝: [[第十八王朝]]
- 墓葬: [[KV62墓]]

## Discussions
- 2026-04-29 —— 用户询问他的身世与 KV62 发掘过程
```

## Entity types

Types are **open**. The LLM picks what fits the destination. Common buckets:

- **People**: `person`, `pharaoh`, `emperor`, `artist`, `explorer`, `deity`
- **Places**: `place`, `city`, `region`, `site`, `temple`, `museum`,
  `landmark`, `natural_feature`, `district`
- **Time**: `event`, `dynasty`, `era`, `period`
- **Culture**: `cuisine`, `dish`, `artwork`, `myth`, `concept`, `festival`,
  `craft`

Only types that represent a physical location should get `coords`.
See `references/entity-types.md` (shipped with the skill) for the full
guidance.

## graph.json shape

```json
{
  "nodes": [
    {"data": {"id": "图坦卡蒙", "type": "pharaoh", "label": "图坦卡蒙"}}
  ],
  "edges": [
    {"data": {"source": "图坦卡蒙", "target": "KV62墓", "label": "葬于"}}
  ]
}
```

## state.json shape

```json
{
  "version": 1,
  "created": "2026-04-29T10:00:00+08:00",
  "turns_ingested": 12,
  "last_ingest": "2026-04-29T10:30:00+08:00",
  "places_known": 7
}
```
