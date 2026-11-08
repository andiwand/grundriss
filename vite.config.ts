import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import type { OutputBundle } from "rollup";

/** Files of the build up to this size go to the cache at the install of the app. */
const PRECACHE_LIMIT = 1_000_000;

/**
 * Writes the service worker of the app (src/pwa/sw.js) into the build. The service worker gets a
 * new version with each build, and the list of the files that the app needs: the page, the code
 * and the CSS of the build, and the files of the installed app. Files over PRECACHE_LIMIT (OpenCV
 * and the runtime of the recognition, together about 28 MB) go to the cache at their first use.
 */
function serviceWorker(): Plugin {
  return {
    name: "grundriss-service-worker",
    apply: "build",
    generateBundle(_options, bundle: OutputBundle) {
      const size = (file: OutputBundle[string]) =>
        file.type === "chunk" ? Buffer.byteLength(file.code) : Buffer.from(file.source).length;
      const needed = Object.values(bundle)
        .filter((file) => file.fileName.startsWith("assets/") && size(file) <= PRECACHE_LIMIT)
        .map((file) => file.fileName);
      const precache = [
        "./",
        "./manifest.webmanifest",
        "./icon.svg",
        "./icons/icon-192.png",
        "./icons/icon-512.png",
        "./icons/maskable-512.png",
        "./icons/apple-touch-icon.png",
        ...[...needed].sort().map((name) => `./${name}`),
      ];
      const version = Date.now().toString(36);
      const source = readFileSync(new URL("src/pwa/sw.js", import.meta.url), "utf8")
        .replace("__VERSION__", version)
        .replace("__PRECACHE__", JSON.stringify(precache, null, 2));
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

const { version } = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8"));

export default defineConfig({
  // Relative paths, so the app works from any directory of a web server.
  base: "./",
  // The version of the app, for the help dialog.
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [serviceWorker()],
  build: {
    target: "es2022",
    // Three.js is most of the code and changes less often than the app. A separate chunk lets the
    // browser keep it in its cache after an update of the app.
    chunkSizeWarningLimit: 700,
    rollupOptions: { output: { manualChunks: { three: ["three"] } } },
  },
});
