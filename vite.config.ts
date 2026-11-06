import { defineConfig } from "vite";

export default defineConfig({
  // Relative paths, so the app works from any directory of a web server.
  base: "./",
  build: {
    target: "es2022",
    // Three.js is most of the code and changes less often than the app. A separate chunk lets the
    // browser keep it in its cache after an update of the app.
    chunkSizeWarningLimit: 700,
    rollupOptions: { output: { manualChunks: { three: ["three"] } } },
  },
});
