# travel-companion — Explorer SPA

The pre-built single-file SPA lives at `../assets/explorer.html`. End users
never need to touch this folder.

## When do I need this folder?

Only when you want to modify the explorer's UI:

```bash
cd web
npm install
npm run build       # writes ../assets/explorer.html
```

On macOS with Node 20+/24 you may hit a Rollup native binding signing
issue. Fallback: swap in the WASM rollup after `npm install`:

```bash
npm install @rollup/wasm-node
rm -rf node_modules/rollup
mv node_modules/@rollup/wasm-node node_modules/rollup
npm run build
```

## Dev loop

```bash
cd web
npm install     # first time only
npm run dev     # http://localhost:5173 — Egypt south fixture pre-loaded
```

`vite.config.ts` ships a small dev-only plugin that, on every page load,
inlines `fixtures/<FIXTURE>/data/trip.json` into the `__TRIP_DATA__`
placeholder of `index.html`. The default fixture is `egypt-south`; switch
with the `FIXTURE` env var:

```bash
FIXTURE=other-route npm run dev
```

The plugin is `apply: "serve"` only — `npm run build` leaves
`__TRIP_DATA__` as `null`, so the upstream `scripts/inject.py` pipeline
keeps full control of the production single-file output.

If a fixture has no `data/trip.json` yet, regenerate it:

```bash
python3 scripts/export_data.py --trip-root fixtures/egypt-south
```

## Architecture

- **React 18 + TypeScript** — strict mode, no JSX runtime import
- **Zustand** — global store, Map-based byId index
- **Leaflet** — map layer, CartoDB Voyager tiles
- **Cytoscape.js + fcose** — force-directed graph overlay
- **marked** — markdown rendering for "truth sources"
- **vite-plugin-singlefile** — inlines everything into one HTML

## File map

```
src/
├── App.tsx              top-level orchestration (responsive layout)
├── main.tsx             bootstrap + store injection
├── store.ts             Zustand store with per-instance factory
├── lib/
│   ├── anchors.ts       entity → map projection
│   ├── constants.ts     place-type set + deterministic colors
│   ├── hooks.ts         useIsMobile
│   └── types.ts         TripData contract (mirrored in export_data.py)
└── components/
    ├── Topbar.tsx       title + search with autocomplete
    ├── MapView.tsx      Leaflet map + halo highlighting on selection
    ├── GraphOverlay.tsx Cytoscape overlay with neighbors/all/geo modes
    ├── DetailDrawer.tsx right drawer (desktop) / bottom sheet (mobile)
    ├── Timeline.tsx     collapsible horizontal timeline
    ├── Legend.tsx       type color legend (collapsible)
    ├── MobileTabs.tsx   mobile-only tab bar (map ↔ graph)
    └── EmptyState.tsx   shown when data has no entities
```
