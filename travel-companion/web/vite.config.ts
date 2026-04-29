import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// In `npm run dev` we inject a fixture trip.json into the __TRIP_DATA__
// placeholder so the explorer is fully populated without needing the
// inject.py pipeline. Default fixture is the Egypt south route. Override
// via the FIXTURE env var: `FIXTURE=other-route npm run dev`.
//
// In `npm run build` this plugin is a no-op — the placeholder is left as
// `null` so the upstream Python pipeline (scripts/inject.py) can swap in
// real trip data at deploy time.
function devFixturePlugin(): Plugin {
  return {
    name: "travel-companion-dev-fixture",
    apply: "serve",
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
export default defineConfig({
  plugins: [react(), devFixturePlugin(), viteSingleFile()],
  build: {
    target: "es2020",
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 5000,
    rollupOptions: { output: { inlineDynamicImports: true } },
    outDir: "../assets",
    emptyOutDir: false,
  },
});
