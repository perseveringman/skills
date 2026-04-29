import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Build a single self-contained HTML. All JS/CSS is inlined.
// Leaflet CSS is loaded from CDN via <link> in index.html — this lets us keep
// the bundle small; the tile layer already needs a network hit anyway.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
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
