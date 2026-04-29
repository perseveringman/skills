---
name: travel-companion
cn_name: 旅行伴侣
description: >-
  Persistent travel knowledge companion. Activates automatically whenever the
  user is planning a trip, discussing a destination, asking about the history /
  culture / scenery of a place, or seeking photo / food / itinerary / attraction
  recommendations. Every conversational turn is automatically ingested:
  entities (people, places, events, dynasties, cuisine, artworks, concepts —
  decided dynamically by the LLM based on the destination) are extracted,
  cross-linked, geocoded, and written to a durable markdown knowledge base in
  the working directory. For every place discovered, four recommendation sheets
  are generated (shots / food / itinerary / spots). An interactive knowledge
  graph (Cytoscape.js) and a map (Leaflet + CartoDB Voyager) are rebuilt as
  single-file HTML after each turn. Load this skill at the start of any trip
  conversation so the knowledge base grows turn by turn and becomes the user's
  permanent memento of the trip.
---

# Travel Companion

A persistent travel-knowledge companion. It turns a trip conversation into a
growing, explorable knowledge base — entities, relationships, map, graph,
and four kinds of recommendations — all as plain markdown + single-file HTML,
saved to the working directory so the user keeps it forever.

---

## When to activate

Activate (and keep activated for the rest of the session) whenever the user:

- Starts talking about a trip: *"我下个月要去埃及"*, *"planning a Kyoto trip"*
- Asks about the history / culture / geography / people of a real-world place
- Asks for photo, video, food, itinerary or attraction recommendations tied to a place
- Wants to see a knowledge graph or a map of what has been discussed
- Opens / resumes a folder that already contains `.trip/SCHEMA.md`

Once activated, **every turn is ingested automatically** — do not wait for
the user to say "save this".

---

## Core idea

The skill follows the **LLM-Wiki** pattern: you (the agent) *incrementally
compile* the conversation into a persistent markdown wiki, rather than
re-searching the raw log each time. Three layers:

1. **Raw log** — `.trip/session-log.jsonl`, immutable, one line per turn.
2. **Wiki** — `wiki/entities/*.md`, the compiled knowledge. Each entity has
   YAML frontmatter (id, type, coords, related, …) that is both
   human-readable and machine-parsable.
3. **Views** — `graph/graph.html`, `map/map.html`, recommendations/*. All
   regenerated from the wiki; never a source of truth.

Entity **types are not fixed**. The LLM decides what types are meaningful
for the current destination (`pharaoh`, `dynasty`, `temple`, `ryokan`,
`onsen`, `izakaya`, `samurai`, `festival`, `concept`, …). See
`references/entity-types.md` for guidance.

---

## The per-turn workflow (MANDATORY — run after every user turn)

After you finish replying to the user in a trip conversation, run this exact
sequence. Steps 1–4 are scripted (deterministic). Step 3 (extraction) and
step 5 (recommendations) require LLM reasoning — read
`references/extraction-prompts.md` for the prompts to use.

```
1. append_log       → scripts/ingest.py append      (log the turn)
2. extract          → LLM, using extraction-prompts.md
3. upsert_entities  → scripts/ingest.py upsert      (write/merge wiki md)
4. geocode          → scripts/geocode.py            (Nominatim for new places)
5. recommend        → LLM, per new place, 4 categories
6. rebuild_graph    → scripts/rebuild_graph.py      (scan frontmatter)
7. render           → scripts/render.py             (inject data into HTML)
```

**Working directory convention:** the trip root is the agent's current
working directory unless the user specifies otherwise. The skill writes
into `./`, never outside it. If `.trip/SCHEMA.md` is missing, create it by
copying `assets/SCHEMA.md` and then proceed.

### Step 1 — append_log

```bash
python scripts/ingest.py append \
    --trip-root . \
    --role user|assistant \
    --text "<the message>"
```

This appends to `.trip/session-log.jsonl` and bumps `.trip/state.json`.

### Step 2 — extract (LLM reasoning)

Read `references/extraction-prompts.md` → **Extraction prompt**. Run it
against the last user turn + your reply. The prompt forces a strict JSON
response:

```json
{
  "entities": [
    {
      "id": "图坦卡蒙",
      "type": "pharaoh",
      "aliases": ["Tutankhamun"],
      "summary": "...",
      "facts": ["9 岁登基", "在位约 10 年"],
      "coords": null,
      "related": ["第十八王朝", "KV62墓", "黄金面具"]
    }
  ],
  "relations": [
    {"from": "图坦卡蒙", "to": "KV62墓", "label": "葬于"}
  ],
  "events": [
    {"id": "卡特发现KV62", "year": 1922, "places": ["帝王谷"], "actors": ["霍华德·卡特"]}
  ]
}
```

If nothing new was discussed, return empty arrays — still run the rest of
the pipeline so `state.json` updates.

### Step 3 — upsert_entities

Pipe the extraction JSON to:

```bash
python scripts/ingest.py upsert --trip-root . --json-file /tmp/extract.json
```

The script **merges** with existing entity files — new `facts` are
appended, `related` is unioned, `mentioned_at` gets the current timestamp.
Existing human-written prose is never overwritten.

### Step 4 — geocode

```bash
python scripts/geocode.py --trip-root .
```

Finds every entity whose `type` implies a location (`place`, `temple`,
`museum`, `city`, `region`, `landmark`, `site`, …) and whose `coords` is
null, then queries Nominatim. Results are cached in `.trip/geocache.json`.
Respects the Nominatim 1 req/s policy and sends a proper `User-Agent`.

### Step 5 — recommendations (LLM reasoning)

For every **newly discovered place** in this turn (use the script's stdout
`new_places` list), read `references/extraction-prompts.md` →
**Recommendation prompts** and generate four markdown files:

- `recommendations/shots/{slug}.md` — camera / video shots + voice-over
- `recommendations/food/{slug}.md`  — what to eat, where, why
- `recommendations/itinerary/{slug}.md` — suggested half-day / day plan
- `recommendations/spots/{region}.md` — sibling attractions worth bundling

Use the exact templates in `references/extraction-prompts.md` so the files
stay consistent across runs. If the user later pushes back
(*"拍摄推荐不够细"*), regenerate only the relevant file — don't touch others.

### Step 6 — export data

```bash
python scripts/export_data.py --trip-root .
```

Scans every `wiki/entities/*.md` (with frontmatter), every
`recommendations/**/*.md`, the session log, and the timeline; writes one
aggregated `data/trip.json`. Auto-fills `anchors` for any entity where
the LLM forgot (geo entities anchor to themselves; non-geo entities derive
anchors from their `related` entries whose type is a place).

### Step 7 — inject

```bash
python scripts/inject.py --trip-root .
```

Copies the pre-built `assets/explorer.html` (React SPA, ~930 KB
single file) to `<trip>/explorer.html` and inlines `data/trip.json` between
the `__TRIP_DATA_BEGIN__` markers. The user can double-click
`explorer.html` to open — no server, no build tool.

---

## Responding to the user

- After the first ingest of a session, tell the user once: *"I'll keep a
  knowledge base in `./` as we chat. Open `graph/graph.html` or
  `map/map.html` any time to explore."*
- Do **not** narrate every ingest. The work is background.
- When the user asks *"show me the graph"* / *"what do we know about X"* —
  read from the wiki (`wiki/entities/{id}.md`), not from conversation
  memory. This enforces the LLM-Wiki discipline.
- When the user pushes back on a recommendation, regenerate just that file
  and briefly summarize the change.

---

## Updating vs. creating an entity

An entity id is its canonical display name (Chinese preferred if the
conversation is Chinese, English otherwise). When you find the same thing
under a different name, prefer **adding an alias** over creating a
duplicate. The upsert script matches on `id` first, then scans `aliases`
of every existing file before creating a new one.

---

## Progressive disclosure

- Keep this SKILL.md as the stable spine.
- Read `references/extraction-prompts.md` **every time you run step 2 or
  step 5** — it contains the exact prompts and JSON schemas.
- Read `references/entity-types.md` when unsure what `type` to assign.
- Read `references/schemas.md` when writing custom queries against
  `graph.json` or the wiki frontmatter.

---

## Test fixtures

A ready-made dataset for the **Egypt south route** (Aswan → Abu Simbel →
Kom Ombo → Edfu → Esna → Luxor) ships under `fixtures/egypt-south/`.
It contains 21 pre-built entity markdown files, 4 recommendation samples
(one per category), an `extraction.json` that reproduces the same wiki via
the upsert pipeline, and a 10-line `session-log.jsonl`.

Use it when:

- Smoke-testing changes to `scripts/ingest.py`, `geocode.py`,
  `export_data.py`, or `inject.py` — copy the fixture into a temp dir and
  run the pipeline end-to-end (see `fixtures/egypt-south/README.md`).
- Iterating on the explorer UI — `cd web && npm run dev` auto-injects
  `fixtures/egypt-south/data/trip.json` into the `__TRIP_DATA__`
  placeholder so the SPA opens fully populated. Override the dataset with
  `FIXTURE=<name> npm run dev`.
- Onboarding: reading the entity files is the fastest way to learn the
  expected frontmatter shape and prose conventions.

Add new fixtures the same way (one folder per scenario) when a route
exposes a workflow that the Egypt fixture does not.

## Safety & etiquette

- Nominatim has a 1 req/s rate limit and requires a real `User-Agent`. The
  script enforces this; do not parallelize it.
- Never delete files in `wiki/`, `recommendations/`, `graph/`, `map/`
  without explicit user request — the user considers this a memento.
- Coordinates from Nominatim can be wrong for obscure places. If a user
  corrects a coordinate, write it into the entity frontmatter and add
  `coords_source: user` so future runs don't overwrite it.
