import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Landing page (GitHub Pages). It renders the extension's real player and settings
// components against a fake `chrome` API, so it shares `src/` through the `@` alias.
export default defineConfig({
  root: resolve(__dirname, "site"),
  base: "./",
  plugins: [react()],
  define: {
    __DEBUG_TOOLS__: "false",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: resolve(__dirname, "site-dist"),
    emptyOutDir: true,
  },
});
