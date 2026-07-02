import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * Single-file artifact variant: one underscore-report.html with JS/CSS
 * inlined. NOTE: vite-plugin-singlefile does NOT inline fetched JSON —
 * the CI action must inject pr-output.json into the HTML (embed it as
 * <script type="application/json" id="pr-output">…</script>); the
 * analysis store's loadReport() falls back to that element when
 * fetch('./pr-output.json') fails on file://.
 */
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  base: "./",
  build: {
    outDir: "report-dist-singlefile",
  },
});
