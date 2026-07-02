import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * Dev-only: serve ./pr-output.json from a fixture under dev-runs/ so the
 * report boots during `pnpm dev`. The fixture deliberately lives OUTSIDE
 * public/ — production builds must ship an empty JSON slot that the CI
 * action fills per PR, never a baked-in client analysis export.
 * Override with DEV_PR_OUTPUT=/path/to/pr-output.json.
 */
function devPrOutputFixture(): Plugin {
  const fixture =
    process.env.DEV_PR_OUTPUT ??
    path.resolve(__dirname, "dev-runs/dev-fixture/pr-output.json");
  return {
    name: "dev-pr-output-fixture",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (url.endsWith("/pr-output.json") && fs.existsSync(fixture)) {
          res.setHeader("Content-Type", "application/json");
          fs.createReadStream(fixture).pipe(res);
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devPrOutputFixture()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Relative base — the report must work on file:// (artifact) and on
  // GitHub Pages pr-<n>/ subpaths alike.
  base: "./",
  build: {
    outDir: "report-dist",
  },
});
