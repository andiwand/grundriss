// The page template of the website. The plugin in vite.site.config.ts calls `renderPage` for each
// HTML entry (site/index.html in English, site/de/index.html in German), in the dev server and in
// the build. So each language is a static page with its own URL, and all texts come from i18n.ts.
// This file runs in Node, so it must not use the DOM.

import { LANG_KEY, LANGS, TEXTS, langPath, type ChapterId, type Lang } from "./i18n";

/** The public address of the website, for the links between the languages. */
const SITE = "https://andiwand.github.io/grundriss/";
const GITHUB = "https://github.com/andiwand/grundriss";

/** The chapters of the scroll story in their order, with the icon of the rail. */
export const CHAPTERS: [ChapterId, string][] = [
  ["scan", "image"],
  ["plan", "wall"],
  ["walls", "split"],
  ["stories", "stair"],
  ["roof", "roof"],
  ["furnish", "sofa"],
  ["services", "plug"],
  ["heat", "flame"],
  ["sun", "bolt"],
  ["renovate", "coins"],
  ["visit", "pin"],
  ["export", "export"],
];

/**
 * The script of the English page that sends a visitor with a German browser to the German page.
 * It does nothing after the visitor chose a language with the switch.
 */
const REDIRECT = `try {
        if (!localStorage.getItem("${LANG_KEY}") && /^de\\b/i.test(navigator.language)) {
          location.replace("de/" + location.search + location.hash);
        }
      } catch (e) {}`;

/** The whole HTML of the page in the language. */
export function renderPage(lang: Lang): string {
  const t = TEXTS[lang];
  // The relative path from the page to the root of the website.
  const root = lang === LANGS[0] ? "./" : "../";
  const number = (i: number) => String(i + 1).padStart(2, "0");
  const chapterNumber = new Map(CHAPTERS.map(([id], i) => [id, number(i)]));

  const alternates = LANGS.map(
    (l) => `<link rel="alternate" hreflang="${l}" href="${SITE}${langPath(l)}" />`,
  ).join("\n    ");
  const switcher = LANGS.map(
    (l) =>
      `<a href="${root}${langPath(l)}" hreflang="${l}" lang="${l}" data-lang="${l}"${
        l === lang ? ' aria-current="page"' : ""
      }>${l.toUpperCase()}</a>`,
  ).join("");

  const uses = t.uses.items
    .map(
      (item) => `
            <a class="use" href="#${item.chapter}">
              <h3>${item.title}</h3>
              <p>${item.text}</p>
              <span class="use-link"
                ><span class="number">${chapterNumber.get(item.chapter)}</span>
                ${t.chapters[item.chapter].kicker} <span aria-hidden="true">→</span></span
              >
            </a>`,
    )
    .join("");

  const chapters = CHAPTERS.map(([id, icon], i) => {
    const c = t.chapters[id];
    return `
      <section class="chapter" id="${id}" data-chapter="${id}" data-icon="${icon}">
        <article class="card">
          <p class="kicker"><span class="number">${number(i)}</span> ${c.kicker}</p>
          <h2>${c.title}</h2>
          <p>${c.text}</p>${c.note ? `\n          <p class="note">${c.note}</p>` : ""}
          <div class="readout" data-readout="${id}"></div>
        </article>
      </section>`;
  }).join("\n");

  const facts = t.finale.facts
    .map((f) => `<div><strong>${f.title}</strong><span>${f.text}</span></div>`)
    .join("\n            ");

  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />${
      lang === LANGS[0] ? `\n    <script>\n      ${REDIRECT}\n    </script>` : ""
    }
    <title>${t.meta.title}</title>
    <meta name="description" content="${t.meta.description}" />
    <meta property="og:title" content="Grundriss" />
    <meta property="og:description" content="${t.meta.ogDescription}" />
    <meta property="og:locale" content="${lang === "de" ? "de_DE" : "en_US"}" />
    <link rel="canonical" href="${SITE}${langPath(lang)}" />
    ${alternates}
    <link rel="alternate" hreflang="x-default" href="${SITE}" />
    <link rel="icon" href="${root}icon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="${root}src/style.css" />
  </head>
  <body data-chapter="hero">
    <div id="stage" aria-hidden="true">
      <div id="sky"></div>
      <div id="three"></div>
      <div id="paper"></div>
      <div id="device"><div class="screen"></div></div>
      <div id="compare"></div>
      <div id="blueprint"></div>
    </div>

    <nav id="rail" aria-label="${t.nav.chapters}"></nav>

    <header class="topbar">
      <a class="brand" href="${root}${langPath(lang)}" aria-label="${t.nav.home}">
        <img src="${root}icon.svg" alt="" width="28" height="28" />
        <span>Grundriss</span>
      </a>
      <div class="topbar-links">
        <nav class="langs" aria-label="${t.nav.language}">${switcher}</nav>
        <a class="github" href="${GITHUB}">GitHub</a>
        <a class="button small primary" href="${root}app/">${t.nav.open}</a>
      </div>
    </header>

    <main>
      <section class="hero" data-chapter="hero">
        <div class="hero-inner">
          <div class="logo-glow">
            <img src="${root}icon.svg" alt="${t.hero.logo}" width="96" height="96" />
          </div>
          <h1>Grundriss</h1>
          <p class="tagline">${t.hero.tagline}</p>
          <p class="lead">${t.hero.lead}</p>
          <div class="cta">
            <a class="button primary" href="${root}app/"
              >${t.hero.open} <span aria-hidden="true">→</span></a
            >
            <a class="button" href="${GITHUB}">${t.hero.source}</a>
          </div>
          <p class="pills">${t.hero.pills.map((p) => `<span>${p}</span>`).join("")}</p>
        </div>
        <p class="scroll-hint">${t.hero.scroll} <span aria-hidden="true">↓</span></p>
      </section>

      <section class="uses" id="uses" data-chapter="uses">
        <div class="uses-inner">
          <p class="kicker">${t.uses.kicker}</p>
          <h2>${t.uses.title}</h2>
          <p class="lead">${t.uses.lead}</p>
          <div class="use-grid">${uses}
          </div>
        </div>
      </section>
${chapters}

      <section class="finale" data-chapter="finale">
        <div class="finale-inner">
          <h2>${t.finale.title}</h2>
          <p class="lead">${t.finale.lead}</p>
          <div class="cta">
            <a class="button primary large" href="${root}app/"
              >${t.finale.open} <span aria-hidden="true">→</span></a
            >
          </div>
          <div class="facts">
            ${facts}
          </div>
          <p class="credits">${t.finale.credits}</p>
        </div>
        <footer>
          <span>Grundriss · MPL-2.0</span>
          <nav class="langs" aria-label="${t.nav.language}">${switcher}</nav>
          <a href="${GITHUB}">github.com/andiwand/grundriss</a>
        </footer>
      </section>
    </main>

    <script type="module" src="${root}src/main.ts"></script>
  </body>
</html>
`;
}
