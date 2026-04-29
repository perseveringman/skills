import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Inject fixture trip.json into the __TRIP_DATA__ placeholder so the
// explorer is fully populated without needing the inject.py pipeline.
// Default fixture is the Egypt south route. Override via the FIXTURE env
// var: `FIXTURE=other-route npm run dev`.
//
// Active in:
//   - `npm run dev` (always)
//   - any build where INJECT_FIXTURE=1 (e.g. Vercel preview builds)
//
// Plain `npm run build` leaves the placeholder as `null` so the upstream
// Python pipeline (scripts/inject.py) can swap in real trip data at
// deploy time.
function fixtureInjectPlugin(): Plugin {
  const enabledForBuild = process.env.INJECT_FIXTURE === "1";
  return {
    name: "travel-companion-fixture-inject",
    apply(_config, env) {
      return env.command === "serve" || enabledForBuild;
    },
    transformIndexHtml(html) {
      const fixtureName = process.env.FIXTURE || "egypt-south";
      const fixturePath = resolve(
        __dirname,
        "..",
        "fixtures",
        fixtureName,
        "data",
        "trip.json",
      );
      if (!existsSync(fixturePath)) {
        console.warn(
          `[travel-companion] fixture not found: ${fixturePath}\n` +
            `  Tip: run \`python3 scripts/export_data.py --trip-root fixtures/${fixtureName}\` first.`,
        );
        return html;
      }
      const json = readFileSync(fixturePath, "utf-8").trim();
      console.log(
        `[travel-companion] injecting fixture: ${fixtureName} (${json.length} bytes)`,
      );
      return html.replace(
        /\/\*__TRIP_DATA_BEGIN__\*\/[\s\S]*?\/\*__TRIP_DATA_END__\*\//,
        `/*__TRIP_DATA_BEGIN__*/${json}/*__TRIP_DATA_END__*/`,
      );
    },
  };
}

// Build a single self-contained HTML. All JS/CSS is inlined.
// Leaflet CSS is loaded from CDN via <link> in index.html — this lets us keep
// the bundle small; the tile layer already needs a network hit anyway.
//
// Two output targets:
//   - default (`npm run build`)        → ../assets/explorer.html
//   - preview (`npm run build:preview`) → ./dist/index.html (used by Vercel)
const isPreviewBuild = process.env.BUILD_TARGET === "preview";

export default defineConfig({
  plugins: [react(), fixtureInjectPlugin(), viteSingleFile()],
  build: {
    target: "es2020",
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 5000,
    rollupOptions: { output: { inlineDynamicImports: true } },
    outDir: isPreviewBuild ? "dist" : "../assets",
    emptyOutDir: isPreviewBuild,
  },
});
