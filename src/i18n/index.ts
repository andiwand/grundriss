// The languages of the app: English and German. The English text of the code is the key, and a
// dictionary gives the German text. A text with values has placeholders in braces, for example
// t("Opened {name}.", { name }). A text without a translation stays English.
//
// The language comes from the choice of the user (localStorage), else from the browser. The
// static texts of index.html get their translation at the start (`translatePage`): the text of
// each element and the attributes title, aria-label, and placeholder.

import { setNumberLocale } from "../model/format";
import { DE } from "./de";

export type Language = "en" | "de";

const STORAGE_KEY = "grundriss-language";

function startLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "de") return stored;
  } catch {
    // Without the storage, the browser decides.
  }
  return navigator.language?.toLowerCase().startsWith("de") ? "de" : "en";
}

let language: Language = startLanguage();
setNumberLocale(language === "de" ? "de-AT" : "en");

export const currentLanguage = (): Language => language;

/** Sets the language, keeps the choice, and loads the page again, so that all texts change. */
export function setLanguage(next: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // The choice holds until the reload only.
  }
  location.reload();
}

/**
 * The German names that the model gives with a number, for example "Roof 2" or "Cellar 3". The
 * plan stores them in English, so the dictionary cannot have each one.
 */
const PATTERNS: [RegExp, string][] = [
  [/^Roof (\d+)$/, "Dach $1"],
  [/^Cellar (\d+)$/, "Keller $1"],
  [/^(\d+)th floor$/, "$1. Obergeschoss"],
  [/^Field (\d+)$/, "Feld $1"],
];

/** The German text of a key: from the dictionary, or from a pattern of a name. */
function german(text: string): string {
  const exact = DE[text];
  if (exact !== undefined) return exact;
  for (const [pattern, replacement] of PATTERNS) {
    if (pattern.test(text)) return text.replace(pattern, replacement);
  }
  return text;
}

/** The text in the language of the app, with the values in its placeholders. */
export function t(text: string, values?: Record<string, string | number>): string {
  const translated = language === "de" ? german(text) : text;
  if (!values) return translated;
  return translated.replace(/\{(\w+)\}/g, (all, key: string) =>
    key in values ? String(values[key]) : all,
  );
}

/** The locale of the dates and the numbers. */
export const locale = (): string => (language === "de" ? "de-AT" : "en");

const ATTRIBUTES = ["title", "aria-label", "placeholder"];

/**
 * Translates the static texts of the page: the text nodes and the attributes. A text node keeps
 * its spaces around the text. Elements with `data-no-translate` keep their texts.
 */
export function translatePage(root: ParentNode = document.body): void {
  document.documentElement.lang = language;
  if (language === "en") return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? "";
    const trimmed = text.trim();
    if (!trimmed || node.parentElement?.closest("[data-no-translate], script, style")) continue;
    // A text of the HTML can have line breaks and indents; the key has single spaces.
    const translated = DE[trimmed.replace(/\s+/g, " ")];
    if (translated) node.nodeValue = text.replace(trimmed, translated);
  }
  for (const element of root.querySelectorAll<HTMLElement>("*")) {
    for (const name of ATTRIBUTES) {
      const value = element.getAttribute(name);
      const translated = value ? DE[value] : undefined;
      if (translated) element.setAttribute(name, translated);
    }
  }
  const title = DE[document.title];
  if (title) document.title = title;
}
