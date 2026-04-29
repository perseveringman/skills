# travel-companion

A Skill that turns any trip conversation into a persistent, explorable
knowledge base — entities, relationships, map, graph, and four kinds of
recommendations — saved as plain markdown + single-file HTML in the
working directory. Works in any Agent environment that supports Anthropic-
style "Skills" loading.

## What it produces (in the user's working directory)

```
<trip-root>/
├── .trip/              # schema, session log, state, geocode cache
├── wiki/entities/*.md  # one markdown per entity (with YAML frontmatter)
├── recommendations/
│   ├── shots/          # per-place photo / video / voice-over plans
│   ├── food/           # per-place food picks
│   ├── itinerary/      # per-place focused itinerary
│   └── spots/          # per-region attraction roundup
├── graph/graph.html    # interactive Cytoscape knowledge graph
└── map/map.html        # Leaflet + CartoDB Voyager map
```

Everything is turn-by-turn accumulated. Nothing is deleted automatically.

## How it runs

Per conversation turn:

1. `scripts/ingest.py append`      — append the turn to the log
2. **LLM extracts** entities / relations / events — prompt in `references/extraction-prompts.md`
3. `scripts/ingest.py upsert`      — create or merge entity markdown files
4. `scripts/geocode.py`            — Nominatim for new places (country-hint disambiguation)
5. **LLM generates** 4 recommendations per new place — same prompts file
6. `scripts/rebuild_graph.py`      — scan frontmatter → `graph.json`
7. `scripts/render.py`             — inject data into HTML templates

All scripts use the Python standard library only — no pip install.

## Portability

- **No dependencies** besides Python 3.9+ (standard library only).
- **HTML is fully viewable offline** once CDN assets (Leaflet, Cytoscape)
  are cached once. Works with `file://`.
- Trip root can be any directory; the skill never touches files outside
  it. Safe to run inside another project's workspace.

## Loading into an Agent

In Box: `use_skill("travel-companion")` or `use_skill("/path/to/this/folder")`.

In Claude Code: drop the folder into `.claude/skills/travel-companion/`.

In any other Agent framework that follows the Skills convention: place
the folder under that framework's skills root.

## Customization

- Entity types are **open vocabulary** — the LLM picks what fits the
  destination. See `references/entity-types.md` for guidance.
- Edit `references/extraction-prompts.md` to tweak recommendation styles
  (e.g. add "Family-friendly tips" or change voice-over language).
- Edit `assets/graph.html` or `assets/map.html` to restyle the views;
  `render.py` will pick up the changes on the next run.

## Testing

```bash
# append a mock turn
python scripts/ingest.py append --trip-root /tmp/egypt --role user \
    --text "我想了解吉萨金字塔"

# dry-run geocode
python scripts/geocode.py --trip-root /tmp/egypt --dry-run
```

## License

MIT.
