import { t } from "../i18n";
import { defaultWallHeight } from "../model/building";
import type { Background } from "../model/types";
import { addRecognized, recognizedToWorld, type RecognizedOpening } from "../recognition/openings";
import { addWallSegments, toWorld, type WallSegment } from "../tracing/segments";
import { doc, editor, shell, showStatus } from "./context";
import { button, heading, paragraph, stats } from "./panel";
import { renderPanel } from "./selection";

interface Suggestion {
  /** The suggested wall in meters. */
  segment: WallSegment;
  accepted: boolean;
}

/** A door or a window that the recognition suggests, in meters, on the wall `segment`. */
interface OpeningSuggestion {
  opening: RecognizedOpening;
  accepted: boolean;
}

/** The suggested walls that wait for the user, or null if there are none. */
export let suggestions: Suggestion[] | null = null;
let suggestionsCurrent = () => true;

/** The suggested doors and windows. Only the recognition gives them. */
let openingSuggestions: OpeningSuggestion[] = [];

/** The text of the work that runs now, for example "Finding walls…", or null. */
export let busy: string | null = null;

export let cleanStrength = 0.5;

/** Sets the strength of the clean-up of the background. */
export function setCleanStrength(value: number): void {
  cleanStrength = value;
}

/** The tracing functions need OpenCV, so they load only when the user needs them. */
export const tracing = () => import("../tracing/trace");

export async function backgroundElement(background: Background): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = background.image;
  await image.decode();
  return image;
}

/** Runs a slow tracing step, and shows the work in the panel while it runs. */
export async function work(
  text: string,
  step: (current: () => boolean, background: Background) => Promise<void>,
): Promise<void> {
  if (busy || !doc.plan.background) return;
  const target = doc.captureTarget();
  const background = { ...doc.plan.background };
  const current = () =>
    target() &&
    Object.entries(background).every(
      ([key, value]) => doc.plan.background?.[key as keyof Background] === value,
    );
  busy = text;
  renderPanel();
  // OpenCV blocks the page while it works. A short wait lets the browser show the panel first.
  await new Promise((resolve) => setTimeout(resolve, 30));
  try {
    if (current()) await step(current, background);
  } catch (error) {
    showStatus(t(error instanceof Error ? error.message : String(error)), true);
  } finally {
    busy = null;
    renderPanel();
  }
}

/** Puts a new image in the background. The image keeps its width in meters. */
export function replaceBackground(image: { dataUrl: string; width: number; height: number }): void {
  doc.edit((plan) => {
    const background = plan.background!;
    background.scale *= background.width / image.width;
    background.image = image.dataUrl;
    background.width = image.width;
    background.height = image.height;
  });
}

export function cleanBackground(): void {
  void work(t("Cleaning the image…"), async (current, background) => {
    const { cleanUp } = await tracing();
    const image = await cleanUp(await backgroundElement(background), { strength: cleanStrength });
    if (!current()) return;
    replaceBackground(image);
    showStatus(t("The image is clean. Undo brings back the old image."));
  });
}

export function suggestWalls(): void {
  void work(t("Finding walls…"), async (current, background) => {
    const { suggestWalls } = await tracing();
    const pixels = await suggestWalls(await backgroundElement(background));
    if (!current()) return;
    const world = toWorld(pixels, background);
    if (world.length === 0) {
      showStatus(t("The app found no walls. Clean the image first, or draw the walls by hand."));
      return;
    }
    setSuggestions(world.map((segment) => ({ segment, accepted: true })));
    showStatus(t("Click a suggested wall to reject it or to accept it again. Then add the walls."));
  });
}

export function setSuggestions(
  list: Suggestion[] | null,
  openings: OpeningSuggestion[] = [],
): void {
  suggestions = list;
  suggestionsCurrent = doc.captureTarget();
  openingSuggestions = list ? openings : [];
  editor.setOverlay("suggestions", list ? drawSuggestions : null);
  renderPanel();
}

function drawSuggestions(group: SVGGElement): void {
  if (!suggestionsCurrent()) return;
  const ns = "http://www.w3.org/2000/svg";
  for (const suggestion of suggestions ?? []) {
    const { a, b, thickness } = suggestion.segment;
    const element = document.createElementNS(ns, "g");
    element.setAttribute("class", suggestion.accepted ? "suggestion" : "suggestion rejected");
    for (const [className, width] of [
      ["body", thickness],
      ["axis", null],
    ] as const) {
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", String(a.x));
      line.setAttribute("y1", String(a.y));
      line.setAttribute("x2", String(b.x));
      line.setAttribute("y2", String(b.y));
      line.setAttribute("class", className);
      if (width !== null) line.setAttribute("stroke-width", String(width));
      element.append(line);
    }
    // The editor must not see this press, else it starts a selection box.
    element.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      suggestion.accepted = !suggestion.accepted;
      setSuggestions(suggestions, openingSuggestions);
    });
    group.append(element);
  }
  // A door or a window shows as a short colored bar on its wall.
  for (const suggestion of openingSuggestions) {
    const { kind, segment, center, width } = suggestion.opening;
    const wall = suggestions?.[segment]?.segment;
    if (!wall) continue;
    const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) || 1;
    const dx = ((wall.b.x - wall.a.x) / length) * (width / 2);
    const dy = ((wall.b.y - wall.a.y) / length) * (width / 2);
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", String(center.x - dx));
    line.setAttribute("y1", String(center.y - dy));
    line.setAttribute("x2", String(center.x + dx));
    line.setAttribute("y2", String(center.y + dy));
    line.setAttribute("stroke-width", String(wall.thickness + 0.06));
    const state = suggestion.accepted ? "" : " rejected";
    line.setAttribute("class", `opening-suggestion ${kind}${state}`);
    line.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      suggestion.accepted = !suggestion.accepted;
      setSuggestions(suggestions, openingSuggestions);
    });
    group.append(line);
  }
}

function acceptSuggestions(): void {
  if (!suggestionsCurrent()) return setSuggestions(null);
  const walls = suggestions ?? [];
  const accepted: WallSegment[] = [];
  // The index of each accepted wall in `accepted`. An opening refers to its wall by this index.
  const newIndex = new Map<number, number>();
  walls.forEach((s, i) => {
    if (!s.accepted) return;
    newIndex.set(i, accepted.length);
    accepted.push(s.segment);
  });
  // An opening on a rejected wall goes away with the wall, so that it does not land on a wrong
  // wall of the plan.
  const openings = openingSuggestions
    .filter((o) => o.accepted && newIndex.has(o.opening.segment))
    .map((o) => ({ ...o.opening, segment: newIndex.get(o.opening.segment)! }));
  let wallIds: string[] = [];
  let openingIds: string[] = [];
  doc.edit((plan) => {
    const options = { tolerance: 0.1, height: defaultWallHeight(plan) };
    if (openingSuggestions.length > 0) {
      ({ walls: wallIds, openings: openingIds } = addRecognized(plan, accepted, openings, options));
    } else {
      wallIds = addWallSegments(plan, accepted, options);
    }
  });
  setSuggestions(null);
  editor.select(wallIds.map((id) => ({ kind: "wall" as const, id })));
  showStatus(
    openingIds.length > 0
      ? t(
          "Added {walls} walls and {openings} doors and windows. Check them, and correct them where necessary.",
          { walls: wallIds.length, openings: openingIds.length },
        )
      : t("Added {walls} walls. Check them, and correct them where necessary.", {
          walls: wallIds.length,
        }),
  );
}

/** Recognizes the walls, the doors, and the windows of the background with the model. */
export function recognizePlan(): void {
  void work(
    t("Loading the recognition (about 15 MB the first time)…"),
    async (current, background) => {
      const recognition = await import("../recognition");
      const result = await recognition.recognize(
        await backgroundElement(background),
        (done, total) => {
          if (!current()) return;
          busy = t("Recognizing the plan: part {done} of {total}…", { done, total });
          renderPanel();
        },
      );
      if (!current()) return;
      busy = t("Finding the walls…");
      renderPanel();
      const world = recognizedToWorld(result, background);
      if (world.walls.length === 0) {
        showStatus(t("The model found no walls. Straighten and clean the image, then try again."));
        return;
      }
      setSuggestions(
        world.walls.map((segment) => ({ segment, accepted: true })),
        world.openings.map((opening) => ({ opening, accepted: true })),
      );
      showStatus(
        t(
          "Click a suggested wall, door, or window to reject it or to accept it again. Then add them.",
        ),
      );
    },
  );
}

export function renderTracing(): boolean {
  if (suggestions && !suggestionsCurrent()) {
    suggestions = null;
    openingSuggestions = [];
    editor.setOverlay("suggestions", null);
  }
  if (busy) {
    heading(t("Assisted tracing"), "wand");
    paragraph(busy, "busy");
    return true;
  }
  if (suggestions) {
    const accepted = suggestions.filter((s) => s.accepted).length;
    const count = (kind: string) =>
      openingSuggestions.filter((o) => o.accepted && o.opening.kind === kind).length;
    heading(openingSuggestions.length > 0 ? t("Recognized plan") : t("Suggested walls"), "sparkle");
    stats([
      [String(accepted), t("walls")],
      [String(suggestions.length - accepted), t("rejected")],
      ...(openingSuggestions.length > 0
        ? ([
            [String(count("door")), t("doors")],
            [String(count("window")), t("windows")],
          ] as [string, string][])
        : []),
    ]);
    paragraph(
      t(
        "Click a suggestion on the plan to reject it, or to accept it again. Doors are orange, windows are blue.",
      ),
      "note",
    );
    button(t("Add {count} walls", { count: accepted }), acceptSuggestions, {
      kind: "primary",
      icon: "check",
    });
    button(t("Discard"), () => setSuggestions(null), { icon: "close" });
    return true;
  }
  if (editor.tool === "rectify") {
    heading(t("Straighten the image"), "crop");
    paragraph(
      t(
        "Click the four corners of the plan on the background. The app corrects the perspective of the photo, so that the plan becomes a rectangle.",
      ),
    );
    button(t("Cancel"), () => shell.setTool("select"), { icon: "close" });
    return true;
  }
  return false;
}
