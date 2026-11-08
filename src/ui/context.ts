import { Editor2D, type Tool } from "../editor/editor2d";
import { t } from "../i18n";
import { type MapSourceId } from "../io/tiles";
import { PlanDocument } from "../model/history";
import type { Point } from "../model/types";
import { View3D } from "../view3d/view3d";
import { Catalog } from "./catalog";

export const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;

export const doc = new PlanDocument();

export const editor = new Editor2D($("#plan-2d"), doc);

export const view3d = new View3D($("#plan-3d"));

export const panel = $("#panel");

export const status = $("#status");

export const HINTS: Record<Tool, string> = {
  select: t(
    "Click to select, Shift+click to add. Click in a room to name it or to set its height. Drag on the empty plan to select in a box. Drag a wall to move it: the next walls keep their angles (Shift: free). Pan: two-finger scroll, Space+drag, or right drag.",
  ),
  pan: t(
    "Drag to move the view. The wheel or a pinch zooms. V goes back to Select. In other tools, hold Space and drag, or drag with the right button.",
  ),
  wall: t(
    "Click to add corners. A click on a corner or a wall ends the chain. The direction snaps to 15°. Shift: 45° steps. Alt: free. Esc: stop.",
  ),
  door: t("Click on a wall to put a door in it."),
  window: t("Click on a wall to put a window in it."),
  dimension: t(
    "Click the two ends of the distance, then click where the dimension line goes. Shift: 45° steps. Alt: no grid.",
  ),
  stair: t(
    "Click the bottom of the stair, then the top of its run. The stair goes up to the next story.",
  ),
  fixture: t(
    "Click to place the device. A device for a wall goes against the nearest wall. Alt: no snap. Esc: stop.",
  ),
  run: t(
    "Click the points of the line. A click on a device ends the line there. Double click or Enter: end. Esc: stop.",
  ),
  furniture: t(
    "Click to place the piece. Near a wall, its back goes against the wall. R: turn by 90°, Shift+R: by 15°. Shift+click: place more. Alt: no snap. Esc: stop.",
  ),
  chimney: t("Click where the chimney goes. It goes up through the stories above and the roof."),
  calibrate: t("Click two points on the background with a known distance between them."),
  rectify: t("Click the four corners of the plan on the background, in any order. Esc: stop."),
  map: t(
    "Drag to move the map under the plan. Shift+drag turns the map around the place. Esc: done.",
  ),
};

/**
 * The topics of the user interface. A topic shows its own tools in the palette, its own content
 * in the panel when nothing is selected, and its own layers.
 */
export type Topic = "overview" | "structure" | "utilities" | "interior" | "energy" | "renovation";

export type LayerName = keyof typeof editor.layers;

export function showStatus(text: string, error = false): void {
  status.textContent = text;
  status.classList.toggle("error", error);
}

export type View = "2d" | "split" | "3d";

/** The state of the app that more than one module reads or changes. */
export const app = {
  /** The name of the file of the open plan, and its handle of the File System Access API. */
  fileName: "plan.grundriss",
  fileHandle: null as FileSystemFileHandle | null,
  /** The two points of a calibration of the background, while the user types their distance. */
  calibration: null as { a: Point; b: Point } | null,
  topic: "structure" as Topic,
  /**
   * True while a plan is open. Without an open plan, the app shows the home page with the
   * projects, and the top bar hides the topics and the tools of the plan.
   */
  planOpen: false,
  /** True if a plan opened while the views were hidden, so that they fit it when they show. */
  fitPending: false,
  /** The story that the views show. A change of the active story selects nothing. */
  shownStoryId: "",
};

/**
 * The functions of the shell in main.ts that the modules of the panel use. main.ts sets them
 * at the start, so that the modules do not import main.ts.
 */
export const shell = {
  setTool: (_tool: Tool): void => {},
  setTopic: (_topic: Topic): void => {},
  markTool: (_tool: Tool): void => {},
  closeMenus: (): void => {},
  loadBackground: async (): Promise<void> => {},
  setMapSource: (_source: MapSourceId | null): void => {},
  updateMapCredit: (): void => {},
  fit3d: (): void => {},
  enterPlan: (_topic: Topic): void => {},
  renderPanel: (): void => {},
  catalog: null as unknown as Catalog,
};

/** The number of changes of the document. The cache of the calculations uses it. */
let changes = 0;
doc.subscribe(() => changes++);
const memo = new Map<string, { at: number; value: unknown }>();

/**
 * The result of `compute` for the current state of the document. The panel calls the same
 * calculations in more than one section, for example the heat loss. A change of the document
 * calculates them again. The key names the calculation and its options.
 */
export function cached<T>(key: string, compute: () => T): T {
  const hit = memo.get(key);
  if (hit && hit.at === changes) return hit.value as T;
  const value = compute();
  memo.set(key, { at: changes, value });
  return value;
}
