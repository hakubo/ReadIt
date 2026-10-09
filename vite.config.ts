import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

// Check build target
const buildTarget = process.env.BUILD_TARGET;
// Debug tools (debug panel) ship only in local builds. `npm run build:release`
// sets READIT_RELEASE=1, which makes __DEBUG_TOOLS__ false so the panel is
// tree-shaken out of content.js.
const debugTools = process.env.READIT_RELEASE !== "1";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  define: {
    __DEBUG_TOOLS__: JSON.stringify(debugTools),
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: buildTarget === undefined, // Only empty on first build
    rollupOptions:
      buildTarget === "content"
        ? {
            // Content script build - IIFE format
            input: resolve(__dirname, "src/content/index.tsx"),
            output: {
              format: "iife",
              inlineDynamicImports: true,
              entryFileNames: "content.js",
              assetFileNames: "[name].[ext]",
            },
          }
        : buildTarget === "offscreen"
          ? {
              // Offscreen document build - ES module
              input: resolve(__dirname, "offscreen.html"),
              output: {
                entryFileNames: "[name].js",
                chunkFileNames: "chunks/[name]-[hash].js",
                assetFileNames: "[name].[ext]",
              },
            }
          : {
              // Main build - popup and background
              input: {
                background: resolve(__dirname, "src/background/index.ts"),
              },
              output: {
                entryFileNames: "[name].js",
                chunkFileNames: "chunks/[name]-[hash].js",
                assetFileNames: (assetInfo) => {
                  if (assetInfo.name?.endsWith(".css")) {
                    return "[name].[ext]";
                  }
                  return "assets/[name]-[hash].[ext]";
                },
              },
            },
  },
  optimizeDeps: {
    exclude: ["espeak-ng", "onnxruntime-web"],
  },
  assetsInclude: ["**/*.wasm"],
});
