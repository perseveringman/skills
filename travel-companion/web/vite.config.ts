import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ─── dev fixture injection ──────────────────────────────────────────────
// In `npm run dev` we inline a fixture trip.json into the __TRIP_DATA__
// placeholder so the explorer is fully populated without needing the
// inject.py pipeline. Default fixture = `trips/egypt-south`. Override via
// the FIXTURE env var:
//
//     FIXTURE=other-trip npm run dev
//
// If you want the dev server to behave like the deployed site (Home + hash
// router fetching trips/<slug>.json), set FIXTURE=none.
function devFixturePlugin(): Plugin {
  return {
    name: "travel-companion-dev-fixture",
    apply: "serve",
    transformIndexHtml(html) {
      const fixtureName = process.env.FIXTURE || "egypt-south";
      if (fixtureName === "none") return html;
      // Look in trips/ first (real data), fall back to fixtures/ (test data).
      const candidates = [
        resolve(__dirname, "..", "trips", fixtureName, "data", "trip.json"),
        resolve(__dirname, "..", "fixtures", fixtureName, "data", "trip.json"),
      ];
      const found = candidates.find((p) => existsSync(p));
      if (!found) {
        console.warn(
          `[travel-companion] fixture not found in trips/ or fixtures/: ${fixtureName}\n` +
            `  Tip: run \`python3 scripts/export_data.py --trip-root trips/${fixtureName}\` first.`,
        );
        return html;
      }
      const json = readFileSync(found, "utf-8").trim();
      console.log(
        `[travel-companion] injecting fixture: ${fixtureName} (${json.length} bytes from ${found})`,
      );
      return html.replace(
        /\/\*__TRIP_DATA_BEGIN__\*\/[\s\S]*?\/\*__TRIP_DATA_END__\*\//,
        `/*__TRIP_DATA_BEGIN__*/${json}/*__TRIP_DATA_END__*/`,
      );
    },
  };
}

// ─── build-time trips manifest ──────────────────────────────────────────
// Run scripts/build_trips_manifest.py before vite builds, so the manifest
// + per-trip JSON are ready under public/trips/ and get copied to dist/.
function tripsManifestPlugin(): Plugin {
  return {
    name: "travel-companion-trips-manifest",
    apply: "build",
    buildStart() {
      const cwd = resolve(__dirname, "..");
      const cmd = "python3 scripts/build_trips_manifest.py --out-dir web/public/trips";
      console.log(`[travel-companion] ${cmd}`);
      execSync(cmd, { cwd, stdio: "inherit" });
    },
  };
}

// ─── modes ──────────────────────────────────────────────────────────────
// Default `npm run build`     → multi-trip site for Vercel. Outputs dist/.
// `BUILD_MODE=single`         → legacy single-file explorer.html for inject.py.
const buildMode = process.env.BUILD_MODE || "site";

const sharedPlugins = [react(), devFixturePlugin()];

export default defineConfig(() => {
  if (buildMode === "single") {
    return {
      plugins: [...sharedPlugins, viteSingleFile()],
      build: {
        target: "es2020",
        cssCodeSplit: false,
        assetsInlineLimit: 100_000_000,
        chunkSizeWarningLimit: 5000,
        rollupOptions: { output: { inlineDynamicImports: true } },
        outDir: "../assets",
        emptyOutDir: false,
      },
    };
  }

  // Default: multi-trip Vercel-style build.
  return {
    plugins: [...sharedPlugins, tripsManifestPlugin()],
    build: {
      target: "es2020",
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: false,
    },
  };
});
