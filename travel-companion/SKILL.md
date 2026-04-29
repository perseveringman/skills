---
name: travel-companion
cn_name: 旅行伴侣
description: >-
  Persistent travel knowledge companion. Activates whenever the user is
  planning a trip, discussing a destination, asking about the history /
  culture / scenery of a place, seeking photo / food / itinerary /
  attraction recommendations — OR asking to change how the explorer site
  looks/behaves. The skill routes every turn into one of two tracks:
  (A) Trip Talk — extract entities & recommendations into a markdown
  wiki under trips/<slug>/, refresh data/trip.json, then git commit &
  push so Vercel redeploys the live site within ~30 seconds; or
  (B) Explorer Dev — modify the React SPA under web/, hot-reload against
  a fixture, then git push for Vercel to rebuild. Load this skill at the
  start of any trip conversation so the knowledge base grows turn by
  turn and is always reflected at the live URL.
---

# Travel Companion

A persistent travel-knowledge companion. It turns a trip conversation into
a growing, explorable knowledge base — entities, relationships, map,
graph, and four kinds of recommendations — all as plain markdown +
single-file HTML, saved to the working directory so the user keeps it
forever.

The same skill also owns the **explorer SPA** that renders that knowledge
base, and knows how to safely edit it.

---

## When to activate

Activate (and keep activated for the rest of the session) whenever the user:

- Starts talking about a trip: *"我下个月要去埃及"*, *"planning a Kyoto trip"*
- Asks about the history / culture / geography / people of a real-world place
- Asks for photo, video, food, itinerary or attraction recommendations
- Wants to see a knowledge graph or a map of what has been discussed
- Opens / resumes a folder that already contains `.trip/SCHEMA.md`
- Asks to change the explorer's UI (*"地图能不能默认放大些"*, *"加个分类
  筛选"*, *"右抽屉文字太挤"*) — this is **Track B**, see below

Once activated, **every turn is auto-routed** — do not wait for the user
to say "save this" or "rebuild the page".

---

## Two tracks — choose first, act second

Every user turn falls into one of two tracks. Decide *before* doing
anything else; then follow that track's pipeline. If the turn mixes both
(e.g. *"再聊聊埃德富，顺便把详情面板字号调大"*), run **Track A first**, then
Track B.

```
                    ┌─────────────────────────────────────┐
                    │        classify the user turn        │
                    └──────────────┬──────────────────────┘
                                   │
        ┌──────────────────────────┴───────────────────────────┐
        │                                                      │
        ▼                                                      ▼
┌───────────────────┐                                ┌─────────────────────┐
│  Track A          │                                │  Track B            │
│  Trip Talk        │                                │  Explorer Dev       │
│  (data → wiki)    │                                │  (UI → web/ + build)│
└────────┬──────────┘                                └──────────┬──────────┘
         │                                                       │
         ▼                                                       ▼
  append_log → extract → upsert →                         classify ui ask →
  geocode → recommend → export_data →                     edit web/src/* →
  inject → reply                                          dev verify →
                                                          build → reply
```

### How to classify

| Signal in the user turn                                   | Track |
| --------------------------------------------------------- | ----- |
| Names a place, person, dish, era, deity, festival, route  |   A   |
| Asks for itinerary / shots / food / attractions           |   A   |
| Asks "what do we know about X" / "show me the graph"      |   A   |
| Pushes back on a recommendation's content                 |   A   |
| "界面 / 布局 / 颜色 / 按钮 / 抽屉 / 字号 / 主题 / 图标"   |   B   |
| "地图 / 图谱 / 时间轴 + 改 / 加 / 去掉 / 默认 / 切换"     |   B   |
| "把 X 放大 / 缩小 / 移动 / 隐藏 / 默认显示 / 加一个 X"    |   B   |
| References `web/` , `vite`, `tsx`, `index.css`, `App.tsx` |   B   |
| Mentions HMR / hot reload / build / explorer.html         |   B   |

You can also call the helper script for a fast keyword-based prior:

```bash
python3 scripts/route_turn.py "<the user message>"
# → {"track": "A" | "B" | "AB", "confidence": 0.0–1.0, "matched": [...], ...}
```

It returns `"AB"` when both signals fire — that means **run Track A first
to ingest content, then Track B to satisfy the UI ask**. Use the
classifier as a hint, not gospel; the LLM has the final call.

Borderline turns: ask one short clarifying question, or default to **A**
(safer — never breaks the SPA build).

---

## Shared concept — LLM-Wiki

The skill follows the **LLM-Wiki** pattern: you (the agent) *incrementally
compile* the conversation into a persistent markdown wiki, rather than
re-searching the raw log each time. Three layers:

1. **Raw log** — `.trip/session-log.jsonl`, immutable, one line per turn.
2. **Wiki** — `wiki/entities/*.md`, the compiled knowledge. Each entity
   has YAML frontmatter (id, type, coords, related, …) that is both
   human-readable and machine-parsable.
3. **Views** — `data/trip.json` + `explorer.html`. All regenerated from
   the wiki; never a source of truth.

Entity **types are not fixed**. The LLM decides what types are meaningful
for the current destination (`pharaoh`, `dynasty`, `temple`, `ryokan`,
`onsen`, `izakaya`, `samurai`, `festival`, `concept`, …). See
`references/entity-types.md` for guidance.

---

# Track A — Trip Talk pipeline

Run this **after** you finish replying to the user in any turn classified
as Track A. Steps marked *(LLM)* require reasoning — read
`references/extraction-prompts.md`. Everything else is scripted.

```
0. resolve_trip     (LLM+script) determine which trips/<slug>/ to write to
1. append_log       (script)     scripts/ingest.py append
2. extract          (LLM)        using extraction-prompts.md
3. upsert_entities  (script)     scripts/ingest.py upsert
4. geocode          (script)     scripts/geocode.py
5. recommend        (LLM)        per new place, 4 categories
6. export_data      (script)     scripts/export_data.py
7. publish          (script)     scripts/publish.py    ← commits + pushes
                                                          Vercel auto-redeploys
```

### A0 — resolve_trip (which trip is this turn about?)

This is the answer to *"where do I commit this conversation?"*. The
**active trip** for the current cwd is stored in `.workbuddy/active-trip`
(a tiny JSON pointer). Every cwd / terminal can track its own trip in
parallel.

The mechanism is **auto-detect + confirm in one line**: never silently
write to a freshly-guessed slug — but also never block the conversation
with a clarifying question when intent is obvious.

```
┌──────────────────────────────────────────────────────────────────┐
│  per-turn resolution (run BEFORE A1)                             │
└──────────────────────────────────────────────────────────────────┘
1. read .workbuddy/active-trip
   ├── exists  → reuse that slug. Done. Do NOT re-confirm.
   └── missing → step 2

2. LLM derives a short hint from the recent turns:
   - explicit destination ("我想去京都" → hint = "京都", high confidence)
   - explicit naming      ("叫它 hokkaido-2026" → hint = "hokkaido-2026")
   - vague                ("有什么好玩的" → no hint, low confidence)

3. If hint confidence is LOW (no place name, no era, no clear region):
   - DO NOT call active_trip.py. Reply normally and end with one short
     question: *"想把这段聊天归到哪段旅行？比如『京都春樱』或一个 slug。"*
   - Skip A1–A7 this turn.

4. If hint confidence is HIGH:
   python3 scripts/active_trip.py resolve "<hint>"
       --title "<the human-readable title you'd put on the card>"
       --destination "<country/region>"
   → fuzzy-matches against trips/*/.trip/meta.json
   → action = "resumed" | "created"
   → script writes .workbuddy/active-trip and returns the resolved slug.

5. **Confirm in your reply** with one line — this is mandatory the first
   time A0 runs in a cwd (or after a switch / rename / clear):
   - resumed: *"📍 续上 trips/<slug>/（已有 N 个实体）。要换/改名说一声。"*
   - created: *"📍 这次我会记到 trips/<slug>/。不喜欢 slug 就告诉我，
                可以改成别的。"*
   On subsequent turns in the same cwd, do NOT repeat — silence is the
   confirmation that nothing changed.
```

#### Switching, renaming, pausing

Treat these phrasings as explicit commands:

| User says…                                | Do…                                          |
| ----------------------------------------- | -------------------------------------------- |
| "聊点别的，转到京都那次"                  | `switch kyoto` (or `resolve "京都"`)         |
| "开个新的，北海道冬游"                    | `resolve "北海道冬游" --title …`             |
| "回到上次那个埃及"                        | `switch egypt-south`                         |
| "把这次叫 hokkaido-2026 吧" / "改名为 X"  | `rename hokkaido-2026 --title …`             |
| "先别记了" / "停一下记笔记"               | `clear` → 跳过 A1–A7                         |

`rename` is specifically for the case where the user pushes back on the
auto-derived slug right after the first turn — it moves the directory
`trips/<old> → trips/<new>` AND updates `meta.json` AND the pointer in
one atomic step, so nothing in-flight is lost. It refuses if the target
slug already exists.

If the cwd already has an `active-trip` and the user clearly names a
*different* trip, prefer asking one short clarifying question — it
prevents accidentally writing 京都 facts into the 埃及 wiki. Be especially
careful when the cwd's active trip has lots of data; a slip will commit
unrelated content into git.

### A1 — append_log

```bash
python3 scripts/ingest.py append --trip-root trips/<slug> --role user|assistant --text "<the message>"
```

Appends to `trips/<slug>/.trip/session-log.jsonl` and bumps `state.json`.
The `<slug>` here is whatever A0 resolved.

> **Working directory convention.** Every trip lives in
> `travel-companion/trips/<slug>/`. The whole `<slug>` directory is part
> of the same git repo and is what Vercel sees on every push. Never write
> trip data outside `trips/`. `scripts/active_trip.py resolve` /  `new`
> auto-creates the scaffold (wiki/, recommendations/, data/, .trip/meta.json
> + .trip/SCHEMA.md), so you only need it when the user is explicitly
> overriding the layout.

### A2 — extract (LLM)

Read `references/extraction-prompts.md` → **Extraction prompt**. Run it
against the last user turn + your reply. The prompt forces a strict JSON
response shaped like:

```json
{
  "entities": [
    {"id": "图坦卡蒙", "type": "pharaoh", "aliases": ["Tutankhamun"],
     "summary": "...", "facts": ["9 岁登基"], "coords": null,
     "related": ["第十八王朝", "KV62墓"]}
  ],
  "relations": [{"from": "图坦卡蒙", "to": "KV62墓", "label": "葬于"}],
  "events":    [{"id": "卡特发现KV62", "year": 1922,
                 "places": ["帝王谷"], "actors": ["霍华德·卡特"]}]
}
```

If nothing new was discussed, return empty arrays — still run the rest of
the pipeline so `state.json` updates.

### A3 — upsert_entities

```bash
python3 scripts/ingest.py upsert --trip-root trips/<slug> --json-file /tmp/extract.json
```

Merges with existing entity files: new `facts` are appended, `related` is
unioned, `mentioned_at` gets the current timestamp. Existing
human-written prose is never overwritten. Stdout includes a `new_places`
list — feed it into A5.

### A4 — geocode

```bash
python3 scripts/geocode.py --trip-root trips/<slug>
```

Finds every entity whose `type` implies a location and whose `coords` is
null, then queries Nominatim. Cached in `.trip/geocache.json`. Respects
the 1 req/s policy and sends a proper `User-Agent`.

### A5 — recommendations (LLM)

For every **newly discovered place** in A3's `new_places`, read
`references/extraction-prompts.md` → **Recommendation prompts** and
generate four markdown files (under `trips/<slug>/recommendations/`):

- `shots/{slug}.md`     — camera / video shots + voice-over
- `food/{slug}.md`      — what to eat, where, why
- `itinerary/{slug}.md` — suggested half-day / day plan
- `spots/{region}.md`   — sibling attractions worth bundling

Use the exact templates so files stay consistent. If the user later pushes
back (*"拍摄推荐不够细"*), regenerate **only the relevant file** — don't
touch the others.

### A6 — export_data

```bash
python3 scripts/export_data.py --trip-root trips/<slug>
```

Scans every `wiki/entities/*.md`, every `recommendations/**/*.md`, the
session log, and the timeline; writes one aggregated
`trips/<slug>/data/trip.json`. Auto-fills `anchors` for any entity where
the LLM forgot.

### A7 — publish (auto commit + push → Vercel redeploy)

```bash
python3 scripts/publish.py --trip-root trips/<slug>
```

Stages the trip directory, commits with a message derived from the latest
user turn, and pushes to `origin/<current branch>`. Vercel watches the
repo (see "Deployment" section below) so within ~30s the live URL serves
the new `trips/<slug>.json` and the Home grid reflects the updated
counts. Pass `--no-push` if the user explicitly asked you to hold the
release; pass `--strict` to refuse committing if other unrelated files
are staged.

> **The OLD `scripts/inject.py` is still around** — it produces a
> single-file `explorer.html` (with `data/trip.json` inlined into the
> HTML) for offline / file:// use. Run it manually if a user asks for the
> stand-alone HTML; it is no longer part of the per-turn pipeline.

### Track A response rules

- After the **first** ingest of a session, tell the user once: *"I'll
  keep a knowledge base in `trips/<slug>/` as we chat — every turn is
  pushed to git, so your live site at `<vercel-url>/#/t/<slug>` will
  reflect the latest within ~30 seconds."*
- Do **not** narrate every ingest. The work is background.
- When the user asks *"show me the graph"* / *"what do we know about X"*
  — read from the wiki (`trips/<slug>/wiki/entities/{slug}.md`), not
  from conversation memory. This enforces the LLM-Wiki discipline.

---

# Deployment — git push → Vercel → live site

The whole skill repo (https://github.com/perseveringman/skills) is also a
**Vercel project**. Track A's `scripts/publish.py` pushes after every
turn, so the deployed site is always live with the latest data.

### Layout

```
travel-companion/
├── trips/                          ← REAL trip data (git tracked)
│   └── <slug>/
│       ├── .trip/meta.json         (slug, title, subtitle, cover, ...)
│       ├── .trip/session-log.jsonl
│       ├── .trip/state.json
│       ├── wiki/entities/*.md
│       ├── recommendations/{shots,food,itinerary,spots}/*.md
│       └── data/trip.json          ← rebuilt by export_data.py
├── fixtures/                       ← test data (NOT shown on the site)
├── web/                            ← React/Vite SPA
│   ├── index.html  vite.config.ts
│   ├── src/main.tsx                ← hash router
│   ├── src/Home.tsx                ← grid of trips/manifest.json
│   ├── src/App.tsx                 ← single-trip explorer
│   └── public/trips/               ← generated at build time, gitignored
└── vercel.json                     ← buildCommand + cleanUrls + cache headers
```

### Build flow (Vercel runs this on every push)

1. Vercel clones the repo, runs `cd web && npm install && npm run build`
   (per `vercel.json#buildCommand`).
2. `vite build` invokes `tripsManifestPlugin` (in `web/vite.config.ts`)
   which calls `python3 scripts/build_trips_manifest.py`.
3. That script scans `trips/*/data/trip.json`, copies each into
   `web/public/trips/<slug>.json`, and emits
   `web/public/trips/manifest.json` with per-trip stats.
4. Vite copies `public/` into `dist/`, so the deployed site has:
   - `/`                   — Home (fetches `/trips/manifest.json`)
   - `/#/t/<slug>`         — Explorer (fetches `/trips/<slug>.json`)
5. `vercel.json#rewrites` sends every non-static path to `index.html`
   (hash router takes over client-side).

### One-time Vercel setup (only needs to happen once per repo)

In the Vercel dashboard:

1. **Import** `perseveringman/skills`.
2. **Root Directory:** leave empty (use repo root). `vercel.json` will
   handle paths.
3. **Framework Preset:** Other.
4. **Build & Output Settings:** override only if Vercel auto-detection
   fails (the `vercel.json` already declares them).
5. **Environment Variables:** none needed.
6. **Production Branch:** `main`.

After import, every `git push origin main` from `scripts/publish.py`
triggers a redeploy automatically.

### Local mirror of the deployed flow

```bash
# Re-export & rebuild manifest from real trips, then preview the site
python3 scripts/export_data.py        --trip-root trips/<slug>
cd web && npm run build && npm run preview -- --port 4173
open http://localhost:4173
```

### Track A response — when push fails

`scripts/publish.py` returns a non-zero exit and includes
`push_error: "..."` in its stdout JSON. Common reasons:

- detached HEAD → checkout `main` and re-run.
- non-fast-forward → `git pull --rebase origin main` and re-run.
- network → tell the user, suggest `--no-push` to commit locally.

Never recover with `--force-push`; ask first.

---

# Track B — Explorer Dev pipeline

Run this when the turn is about how the explorer **looks or behaves**, not
its data. The goal: produce an updated `assets/explorer.html` (the
shippable single-file SPA) without breaking Track A's pipeline.

```
B1. classify       (LLM)     scope = visual / interaction / new feature
B2. locate         (script)  ls web/src/{components,lib} & grep
B3. dev verify     (shell)   cd web && npm run dev   (fixture auto-loads)
B4. edit           (Edit)    web/src/**/*.{tsx,ts,css}
B5. type-check     (shell)   cd web && npx tsc --noEmit
B6. build          (shell)   cd web && npm run build
B7. re-inject      (script)  python3 scripts/inject.py --trip-root <any trip>
```

### B1 — classify the UI ask

Map the request to one of these scopes; this dictates which file you'll
edit:

| Scope                         | Likely file under `web/src/`           |
| ----------------------------- | -------------------------------------- |
| color / spacing / typography  | `index.css`                            |
| topbar / search               | `components/Topbar.tsx`                |
| map behavior                  | `components/MapView.tsx`               |
| graph behavior                | `components/GraphOverlay.tsx`          |
| right drawer / detail panel   | `components/DetailDrawer.tsx`          |
| timeline                     | `components/Timeline.tsx`              |
| legend                       | `components/Legend.tsx`                |
| mobile tab bar               | `components/MobileTabs.tsx`            |
| empty state                  | `components/EmptyState.tsx`            |
| layout / orchestration       | `App.tsx`                              |
| state / data shape           | `store.ts`, `lib/types.ts`             |
| anchors / type colors        | `lib/anchors.ts`, `lib/constants.ts`   |
| responsive breakpoints       | `lib/hooks.ts`                         |
| HTML shell / `__TRIP_DATA__` | `index.html`                           |
| build/dev plumbing           | `vite.config.ts`                       |

If the change spans 3+ scopes, propose a brief plan in chat first.

### B2 — locate

Don't guess line numbers. Always:

```bash
ls web/src/components/
grep -n "<keyword>" web/src/**/*.{tsx,ts,css}
```

Read the target file end-to-end before editing.

### B3 — dev verify (visual baseline)

```bash
cd web
npm install         # first time only
npm run dev         # http://localhost:5173 — fixture auto-loaded
```

`vite.config.ts` has a dev-only plugin that injects
`fixtures/<FIXTURE>/data/trip.json` into the `__TRIP_DATA__` placeholder,
so the explorer is fully populated without a real trip directory. Default
fixture is `egypt-south`. Override:

```bash
FIXTURE=<name> npm run dev
```

**Always boot dev *before* editing**, so you have a visual baseline. Use
the preview panel; HMR will reload after each save.

### B4 — edit

- Prefer the smallest possible diff; don't re-flow files.
- Reuse existing CSS variables in `index.css` (search `--`); don't
  hard-code colors.
- New props on a `Component`: also update its consumers in `App.tsx`.
- New data fields: extend `lib/types.ts` AND `scripts/export_data.py` so
  the contract stays in sync (this crosses into Track A territory — say
  so explicitly to the user).
- Never delete the `__TRIP_DATA__` placeholder comment in `index.html`;
  Track A's `scripts/inject.py` depends on it.

### B5 — type-check

```bash
cd web && npx tsc --noEmit
```

Run before every build. Fix all TS errors; the SPA is strict.

### B6 — build

```bash
cd web && npm run build
```

Writes `web/dist/` (multi-trip Vercel build). Includes `index.html`,
hashed assets, and a fresh `trips/manifest.json` + per-trip JSON copied
from `trips/*/data/trip.json`. To preview locally:

```bash
cd web && npm run preview -- --port 4173
```

If you also need the legacy single-file `assets/explorer.html` (for
offline `file://` use), run:

```bash
cd web && npm run build:single   # writes ../assets/explorer.html (~930 KB)
```

On macOS with Node 20+/24 you may hit a Rollup native-binding signing
issue. Fallback:

```bash
npm install @rollup/wasm-node
rm -rf node_modules/rollup
mv node_modules/@rollup/wasm-node node_modules/rollup
npm run build
```

### B7 — push (so Vercel picks up the new SPA)

```bash
git add web/ && git commit -m "ui: <one-line summary>" && git push
```

Vercel rebuilds on push and serves the new `index.html` + `assets/*.js`.
No re-injection needed — the deployed site loads each trip's data from
`trips/<slug>.json` at runtime.

### Track B response rules

- Show a one-line summary of the diff (*"调大了详情面板的标题字号到
  18px，并把抽屉宽度从 360 改为 400"*).
- Never claim "界面已更新" without having actually run B6 — the dev
  server's preview is not the shippable artifact.
- If the change is purely cosmetic, say so. If it changes data semantics
  (e.g. a new field), warn the user and update Track A's
  `references/extraction-prompts.md` template too.

---

## Updating vs. creating an entity (Track A)

An entity id is its canonical display name (Chinese preferred if the
conversation is Chinese, English otherwise). When you find the same thing
under a different name, prefer **adding an alias** over creating a
duplicate. The upsert script matches on `id` first, then scans `aliases`
of every existing file before creating a new one.

---

## Progressive disclosure

- Keep this SKILL.md as the stable spine.
- Read `references/extraction-prompts.md` **every time you run A2 or A5**
  — it contains the exact prompts and JSON schemas.
- Read `references/entity-types.md` when unsure what `type` to assign.
- Read `references/schemas.md` when writing custom queries against
  `data/trip.json` or the wiki frontmatter.
- Read `web/README.md` before any non-trivial Track B edit — it lists the
  component map, dev/build commands, and the Rollup workaround.
- Helper scripts you can call without reading source first:
  - `scripts/route_turn.py "<msg>"`     → Track A vs B classifier
  - `scripts/active_trip.py show`        → which trip is the cwd writing to?
  - `scripts/active_trip.py resolve "<hint>"` → resume-or-create + bind
  - `scripts/active_trip.py switch <slug>`    → force change
  - `scripts/active_trip.py new <slug>`       → scaffold without a hint
  - `scripts/active_trip.py rename <new-slug>` → rename active trip dir + meta + pointer
  - `scripts/active_trip.py clear`            → drop the binding
  - `scripts/publish.py --trip-root trips/<slug>` → commit + push

---

## Test fixtures vs. real trips

There are now **two** parallel directories:

| Directory                          | Purpose                                   | Shown on the deployed site?       |
| ---------------------------------- | ----------------------------------------- | --------------------------------- |
| `trips/<slug>/`                    | Real conversation-driven trips            | **Yes** (Vercel scans it on push) |
| `fixtures/<slug>/`                 | Test data for smoke-tests / dev verify    | No                                |

For backwards compatibility the dev plugin in `web/vite.config.ts` looks
in `trips/` first, then `fixtures/`. So `FIXTURE=egypt-south npm run dev`
prefers the live data; `FIXTURE=egypt-south-snapshot npm run dev` (if you
add a snapshot in `fixtures/`) hits the test copy.

`fixtures/egypt-south/` ships a 21-entity / 4-recommendation Aswan→Luxor
dataset useful for:

- **Track A smoke tests** — copy fixture into a temp dir and run the full
  pipeline (see `fixtures/egypt-south/README.md`).
- **Track B dev loop** — `cd web && npm run dev` auto-injects a fixture
  so the SPA is fully populated. Override with
  `FIXTURE=<name> npm run dev`, or `FIXTURE=none npm run dev` to test
  the Home + router behavior end-to-end.
- Onboarding: reading the entity files is the fastest way to learn the
  expected frontmatter shape and prose conventions.

After editing fixture content, regenerate its `data/trip.json`:

```bash
python3 scripts/export_data.py --trip-root fixtures/<name>
```

---

## Safety & etiquette

- Nominatim has a 1 req/s rate limit and requires a real `User-Agent`.
  The script enforces this; do not parallelize it.
- Never delete files in `wiki/`, `recommendations/`, `data/`, or any
  `*.html` view without explicit user request — the user considers them a
  memento.
- Coordinates from Nominatim can be wrong for obscure places. If a user
  corrects a coordinate, write it into the entity frontmatter and add
  `coords_source: user` so future runs don't overwrite it.
- Track B edits commit a new `assets/explorer.html`. That file is bundled
  with the skill — be conservative; if you're not sure, ask before
  shipping a UI change that affects every future trip.
