import { defineConfig } from "vite";

// The website of Grundriss. It goes to the root of dist/, and the app goes to dist/app/, so that
// GitHub Pages serves the website at / and the app at /app/. The website draws its pictures with
// the engine of the app (src/model, src/export, src/view3d).
export default defineConfig({
  root: "site",
  // Relative paths, because GitHub Pages serves the site under /grundriss/.
  base: "./",
  publicDir: "public",
  build: {
    target: "es2022",
    outDir: "../dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: { output: { manualChunks: { three: ["three"] } } },
  },
});
