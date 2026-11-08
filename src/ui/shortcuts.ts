// The help of the keyboard shortcuts: a dialog that opens with "?" or with the help button.

import { t } from "../i18n";

/** The version of the app from package.json (vite.config.ts). */
declare const __APP_VERSION__: string;

/** The shortcuts by group. "Mod" is Ctrl, or ⌘ on a Mac. */
const SHORTCUTS: [string, [string, string][]][] = [
  [
    "Tools",
    [
      ["V", "Select"],
      ["P", "Pan"],
      ["W", "Wall"],
      ["D", "Door"],
      ["N", "Window"],
      ["M", "Dimension"],
      ["S", "Stair"],
      ["H", "Chimney"],
      ["C", "Set the scale"],
      ["E", "Electricity"],
      ["I", "Furniture"],
    ],
  ],
  [
    "Edit",
    [
      ["Mod+Z", "Undo"],
      ["Mod+Shift+Z or Mod+Y", "Redo"],
      ["Mod+C / X / V", "Copy, cut, paste"],
      ["Mod+D", "Duplicate"],
      ["Mod+A", "Select all"],
      ["Delete", "Delete the selection"],
      ["Arrows", "Move 5 cm (Shift: 50 cm)"],
      ["R", "Turn by 90° (Shift: 15°)"],
      ["Esc", "Stop the tool"],
      ["Enter", "End a line"],
    ],
  ],
  [
    "View and file",
    [
      ["F", "Fit the plan"],
      ["Space+drag", "Pan"],
      ["Mod+S", "Save (Shift: save as)"],
      ["Mod+O", "Open a file"],
      ["?", "This help"],
    ],
  ],
];

/**
 * The name of a key in the language of the app, for example "Strg" for "Ctrl". The dictionary key
 * has the suffix " key", so that "Delete" does not take the translation of the word. A key
 * without a translation, for example a letter, stays as it is.
 */
function keyName(part: string): string {
  const key = `${part} key`;
  const name = t(key);
  return name === key ? part : name;
}

/** Opens the help of the shortcuts. Esc or a click outside closes it. */
export function showShortcuts(): void {
  if (document.querySelector(".shortcuts-dialog")) return;
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const dialog = document.createElement("dialog");
  dialog.className = "shortcuts-dialog";
  const title = document.createElement("h2");
  title.textContent = t("Keyboard shortcuts");
  dialog.append(title);
  const columns = document.createElement("div");
  columns.className = "shortcuts-columns";
  for (const [name, keys] of SHORTCUTS) {
    const block = document.createElement("section");
    const heading = document.createElement("h3");
    heading.textContent = t(name);
    const list = document.createElement("dl");
    for (const [key, text] of keys) {
      const dt = document.createElement("dt");
      for (const part of key.replace(/Mod/g, mac ? "⌘" : "Ctrl").split(/(\+| or | \/ )/)) {
        if (part === " or ") dt.append(` ${t("or")} `);
        else if (/^(\+| \/ )$/.test(part)) dt.append(part);
        else if (part) {
          const kbd = document.createElement("kbd");
          kbd.textContent = keyName(part);
          dt.append(kbd);
        }
      }
      const dd = document.createElement("dd");
      dd.textContent = t(text);
      list.append(dt, dd);
    }
    block.append(heading, list);
    columns.append(block);
  }
  dialog.append(columns);
  const version = document.createElement("p");
  version.className = "app-version";
  version.textContent = t("Grundriss {version}", { version: __APP_VERSION__ });
  dialog.append(version);
  const close = document.createElement("button");
  close.textContent = t("Close");
  close.addEventListener("click", () => dialog.close());
  dialog.append(close);
  dialog.addEventListener("click", (e) => e.target === dialog && dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}
