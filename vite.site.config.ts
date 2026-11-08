import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { LANGS, type Lang } from "./site/src/i18n";
import { renderPage } from "./site/src/page";

/**
 * Renders the pages of the website from the template in site/src/page.ts. Each HTML entry is a
 * small file that only gives the language in `<html lang>`. The plugin replaces it with the whole
 * page in that language, before Vite resolves the scripts and the styles.
 */
function pages(): Plugin {
  return {
    name: "grundriss-site-pages",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const lang = /<html lang="(\w+)"/.exec(html)?.[1] as Lang | undefined;
        if (!lang || !LANGS.includes(lang)) throw new Error(`Unknown language of a page: ${lang}`);
        return renderPage(lang);
      },
    },
  };
}

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// The website of Grundriss. It goes to the root of dist/, and the app goes to dist/app/, so that
// GitHub Pages serves the website at / and the app at /app/. The website draws its pictures with
// the engine of the app (src/model, src/export, src/view3d). The English page is at the root, and
// the German page is at de/.
export default defineConfig({
  root: "site",
  // Relative paths, because GitHub Pages serves the site under /grundriss/.
  base: "./",
  publicDir: "public",
  plugins: [pages()],
  build: {
    target: "es2022",
    outDir: "../dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: { en: page("site/index.html"), de: page("site/de/index.html") },
      output: { manualChunks: { three: ["three"] } },
    },
  },
});
