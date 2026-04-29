import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// ─── locate the trips directory ─────────────────────────────────────────
// Precedence:
//   1. TRIPS_DIR env var (absolute or relative to web/)
//   2. <skill>/trips/                    ← legacy / smoke-test
//   3. <skill>/fixtures/                 ← used as fallback for fixture lookups
function locateTripsDir(): string | null {
  if (process.env.TRIPS_DIR) {
    const p = resolve(__dirname, process.env.TRIPS_DIR);
    return existsSync(p) ? p : null;
  }
  const local = resolve(__dirname, "..", "trips");
  if (existsSync(local)) return local;
  return null;
}

// ─── dev fixture injection ──────────────────────────────────────────────
// In `npm run dev` we inline a fixture trip.json into the __TRIP_DATA__
// placeholder so the explorer is fully populated without needing the
// inject.py pipeline. Default fixture = `egypt-south`. Override via the
// FIXTURE env var:
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
      // Look in TRIPS_DIR first, then <skill>/trips, then <skill>/fixtures.
      const tripsDir = locateTripsDir();
      const candidates: string[] = [];
      if (tripsDir) {
        candidates.push(resolve(tripsDir, fixtureName, "data", "trip.json"));
      }
      candidates.push(
        resolve(__dirname, "..", "trips", fixtureName, "data", "trip.json"),
        resolve(__dirname, "..", "fixtures", fixtureName, "data", "trip.json"),
      );
      const found = candidates.find((p) => existsSync(p));
      if (!found) {
        console.warn(
          `[travel-companion] fixture not found: ${fixtureName}\n` +
            `  Tried:\n` +
            candidates.map((c) => `    ${c}`).join("\n"),
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
// Run scripts/build_trips_manifest.py before vite builds. The script
// itself respects TRIPS_DIR / cwd ancestor lookup, so we just pass it
// through.
//
// If the trips dir doesn't exist (typical for the standalone skill repo
// that doesn't own any real trips), we still emit an empty manifest so
// the SPA at least renders the empty-state Home.
function tripsManifestPlugin(): Plugin {
  return {
    name: "travel-companion-trips-manifest",
    apply: "build",
    buildStart() {
      const outDir = resolve(__dirname, "public", "trips");
      mkdirSync(outDir, { recursive: true });
      const tripsDir = locateTripsDir();
      if (!tripsDir) {
        console.warn(
          "[travel-companion] no trips dir found — emitting empty manifest. " +
            "Set TRIPS_DIR=<path> to point at a real trips/ directory.",
        );
        writeFileSync(resolve(outDir, "manifest.json"), "[]");
        return;
      }
      const skillRoot = resolve(__dirname, "..");
      const script = resolve(skillRoot, "scripts", "build_trips_manifest.py");
      const cmd = [
        "python3",
        JSON.stringify(script),
        "--trips-dir",
        JSON.stringify(tripsDir),
        "--out-dir",
        JSON.stringify(outDir),
      ].join(" ");
      console.log(`[travel-companion] ${cmd}`);
      execSync(cmd, { stdio: "inherit" });
    },
  };
}

// ─── modes ──────────────────────────────────────────────────────────────
// Default `npm run build`     → multi-trip site for Vercel. Outputs dist/.
// `BUILD_MODE=single`         → legacy single-file explorer.html for inject.py.
const buildMode = process.env.BUILD_MODE || "site";

const sharedPlugins = [react(), devFixturePlugin()];

void dirname; // keep import group tidy across linters

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
