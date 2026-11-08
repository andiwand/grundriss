// The layout for a phone or a small tablet, and the help for fingers.
//
// In a narrow window (COMPACT_QUERY), the app shows one view at a time. The topics move to a bar
// at the bottom, the files, the layers, and the export go into the "More" menu, and the panel
// becomes a sheet at the bottom. The sheet has three heights: a strip ("peek"), half of the
// view, and almost all of it. A tap on its handle goes to the next height, and a drag of the
// handle moves it. A selection opens the sheet to half.
//
// A finger has no Esc and no Enter. With a drawing tool, a "Done" button ends the tool. It
// shows in a narrow window and on a device with a touch screen.

import type { Tool } from "../editor/editor2d";
import { $, app, editor } from "./context";

/** The width up to which the app uses the layout for a phone. */
const COMPACT_QUERY = "(max-width: 820px)";
const compact = window.matchMedia(COMPACT_QUERY);
const coarse = window.matchMedia("(pointer: coarse)");

export const isCompact = () => compact.matches;

type SheetState = "peek" | "half" | "full";
let sheet: SheetState = "peek";
/** The height of the sheet while the user drags its handle, or null. */
let dragHeight: number | null = null;
/** The strip of the sheet in the state "peek", in pixels. */
const PEEK = 72;

/** The space for the sheet: from the top bar to the status line, in pixels. */
function space(): number {
  const top = $(".topbar").getBoundingClientRect().bottom;
  const bottom = $("#status").getBoundingClientRect().top || window.innerHeight;
  return Math.max(PEEK, bottom - top);
}

const heightOf = (state: SheetState) =>
  state === "peek" ? PEEK : state === "half" ? Math.round(space() * 0.5) : space() - 8;

/** Sets the height of the sheet as a CSS variable. */
function applySheet(): void {
  const height = dragHeight ?? heightOf(sheet);
  document.body.style.setProperty("--sheet-height", `${height}px`);
  document.body.dataset.sheet = sheet;
  // While the finger drags the handle, the sheet follows it without an animation.
  document.body.classList.toggle("sheet-drag", dragHeight !== null);
}

/** Opens the sheet to a height. */
function setSheet(state: SheetState): void {
  sheet = state;
  dragHeight = null;
  applySheet();
}

/** The drawing tools: a finger ends them with the "Done" button. */
const DRAWING: Tool[] = ["wall", "dimension", "run", "rectify", "calibrate", "stair", "fixture"];

/** Shows the "Done" button for a drawing tool on a phone or a touch screen. */
export function toolChanged(tool: Tool): void {
  $("#tool-done").hidden = !(DRAWING.includes(tool) && (compact.matches || coarse.matches));
}

/** A selection on a phone opens the sheet, so that the user sees the panel of the selection. */
export function selectionChanged(): void {
  if (compact.matches && sheet === "peek" && editor.selection.length > 0) setSheet("half");
}

/** A new topic on a phone: the topics with a wide panel open the sheet to half. */
export function topicChanged(): void {
  if (!compact.matches) return;
  if ((app.topic === "energy" || app.topic === "renovation") && sheet === "peek") setSheet("half");
}

/**
 * Starts the layout for a phone. `onCompact` runs at the start and when the layout changes, for
 * example so that the app leaves the split view.
 */
export function setupCompact(hooks: { onCompact: () => void; done: () => void }): void {
  const topics = $("#topics");
  const home = topics.parentElement!;
  const marker = document.createComment("topics");
  home.insertBefore(marker, topics);
  const apply = () => {
    document.body.classList.toggle("compact", compact.matches);
    // The topics move to the bar at the bottom, and back to the top bar.
    if (compact.matches) $("#bottom-bar").append(topics);
    else marker.after(topics);
    applySheet();
    toolChanged(editor.tool);
    hooks.onCompact();
  };
  compact.addEventListener("change", apply);
  coarse.addEventListener("change", () => toolChanged(editor.tool));
  window.addEventListener("resize", () => compact.matches && applySheet());
  apply();

  // The handle: a tap goes to the next height, and a drag moves the sheet.
  const handle = $("#sheet-handle");
  let start: { y: number; height: number; moved: boolean } | null = null;
  handle.addEventListener("pointerdown", (e) => {
    handle.setPointerCapture(e.pointerId);
    start = { y: e.clientY, height: dragHeight ?? heightOf(sheet), moved: false };
  });
  handle.addEventListener("pointermove", (e) => {
    if (!start) return;
    const delta = start.y - e.clientY;
    if (Math.abs(delta) > 4) start.moved = true;
    if (!start.moved) return;
    dragHeight = Math.min(space() - 8, Math.max(PEEK, start.height + delta));
    applySheet();
  });
  const end = () => {
    if (!start) return;
    if (!start.moved) {
      setSheet(sheet === "peek" ? "half" : sheet === "half" ? "full" : "peek");
    } else {
      // The sheet goes to the nearest height.
      const height = dragHeight ?? heightOf(sheet);
      const states: SheetState[] = ["peek", "half", "full"];
      const nearest = states.reduce((best, s) =>
        Math.abs(heightOf(s) - height) < Math.abs(heightOf(best) - height) ? s : best,
      );
      setSheet(nearest);
    }
    start = null;
  };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);

  // The stories: on a phone, only the active story shows. A tap on it opens the list.
  $("#stories").addEventListener("click", (e) => {
    if (!compact.matches) return;
    const story = (e.target as HTMLElement).closest(".story");
    const list = $("#stories");
    if (story?.classList.contains("active")) list.classList.toggle("open");
    else list.classList.remove("open");
  });

  $("#tool-done").addEventListener("click", hooks.done);
}
