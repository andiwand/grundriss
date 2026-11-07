import { Editor2D, type Tool } from "./editor/editor2d";
import { fillIcons, icon, type IconName } from "./icons";
import { exportGlb } from "./export/gltf";
import { buildingExports } from "./export/building";
import { slug, storyExtras } from "./export/context";
import { buildingToDxf } from "./export/dxf";
import { buildingToPdf } from "./export/pdf";
import { planToSvg } from "./export/svg";
import {
  EXPORT_TYPES,
  openPlanFile,
  pickFile,
  readImage,
  saveBlob,
  savePlanFile,
} from "./io/files";
import { isPackageName, readBuildingFile, writePackage } from "./io/package";
import { distance } from "./model/geometry";
import {
  addCellar,
  addStoryOnTop,
  chimneyExtent,
  defaultWallHeight,
  emptyBuilding,
  findStory,
  sortStories,
  stairRise,
  stairShape,
} from "./model/building";
import { serializeBuilding } from "./model/file";
import { PlanDocument } from "./model/history";
import {
  findChimney,
  findDimension,
  findOpening,
  findStair,
  findVertex,
  findWall,
  getVertex,
  removeOpening,
  removeVertex,
  removeWall,
  setWallLength,
  wallEnds,
  wallLength,
} from "./model/plan";
import { editRoomInfo, findRoom, findRooms, planOutline } from "./model/rooms";
import type {
  Building,
  Dormer,
  Roof,
  RoofWindow,
  Envelope,
  ItemKind,
  Layer,
  Location as PlanLocation,
  PvArray,
  Opening,
  OpeningKind,
  Point,
  RoomInfo,
  StairKind,
} from "./model/types";
import { addRecognized, recognizedToWorld, type RecognizedOpening } from "./recognition/openings";
import { addWallSegments, toWorld, type WallSegment } from "./tracing/segments";
import { Catalog } from "./ui/catalog";
import { topView } from "./view3d/models";
import { buildModelAsync, View3D } from "./view3d/view3d";
import { findFurniture, genericType } from "./model/furniture";
import { buildingHeatLoss, isOuterWall, roomHeatLoss, uValue, wallLayers } from "./model/energy";
import { makeHouse } from "./model/example";
import { MATERIALS, layersThickness } from "./model/insulation";
import { faceInfo, pvLayout, pvSummary, specificYield } from "./model/pv";
import { climateSummary, DEGREE_DAY_BASE, DEGREE_DAY_LIMIT } from "./model/climate";
import {
  ATTRIBUTION,
  ATTRIBUTION_URL,
  CLIMATE_YEARS,
  downloadClimate,
  searchPlaces,
  type Place,
} from "./io/climate";
import { MAP_SOURCES, type MapSourceId } from "./io/tiles";
import { buildingQuantities } from "./model/quantities";
import { newRoof, roofBase, roofGeometryOf, storyBox } from "./model/roof";
import { livingArea, roofIsCeiling } from "./model/attic";
import type { Room } from "./model/rooms";
import type { Story } from "./model/types";
import { presetSides } from "./model/roofshape";
import { newId } from "./model/plan";
import {
  FIXTURE_TYPES,
  RUN_KINDS,
  findFixture,
  findRun,
  fixtureSymbol,
  fixtureType,
  newFixture,
  runKind,
  runLength,
} from "./model/services";

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;

fillIcons();

const doc = new PlanDocument();
const editor = new Editor2D($("#plan-2d"), doc);
const view3d = new View3D($("#plan-3d"));
const panel = $("#panel");
const status = $("#status");

let fileName = "plan.grundriss";
let fileHandle: FileSystemFileHandle | null = null;
let calibration: { a: Point; b: Point } | null = null;

const HINTS: Record<Tool, string> = {
  select:
    "Click to select, Shift+click to add. Click in a room to name it or to set its height. Drag on the empty plan to select in a box. Drag a wall to move it: the next walls keep their angles (Shift: free). Pan: two-finger scroll, Space+drag, or right drag.",
  pan: "Drag to move the view. The wheel or a pinch zooms. V goes back to Select. In other tools, hold Space and drag, or drag with the right button.",
  wall: "Click to add corners. A click on a corner or a wall ends the chain. The direction snaps to 15°. Shift: 45° steps. Alt: free. Esc: stop.",
  door: "Click on a wall to put a door in it.",
  window: "Click on a wall to put a window in it.",
  dimension:
    "Click the two ends of the distance, then click where the dimension line goes. Shift: 45° steps. Alt: no grid.",
  stair:
    "Click the bottom of the stair, then the top of its run. The stair goes up to the next story.",
  fixture:
    "Click to place the device. A device for a wall goes against the nearest wall. Alt: no snap. Esc: stop.",
  run: "Click the points of the line. A click on a device ends the line there. Double click or Enter: end. Esc: stop.",
  furniture:
    "Click to place the piece. Near a wall, its back goes against the wall. R: turn by 90°, Shift+R: by 15°. Shift+click: place more. Alt: no snap. Esc: stop.",
  chimney: "Click where the chimney goes. It goes up through the stories above and the roof.",
  calibrate: "Click two points on the background with a known distance between them.",
  rectify: "Click the four corners of the plan on the background, in any order. Esc: stop.",
};

function showStatus(text: string, error = false): void {
  status.textContent = text;
  status.classList.toggle("error", error);
}

function setTool(tool: Tool): void {
  editor.tool = tool;
  calibration = null;
  markTool(tool);
  showStatus(HINTS[tool]);
  renderPanel();
}

/** Marks the button of the tool in the palette. The furniture button shows the open catalog. */
function markTool(tool: Tool): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
    button.classList.toggle("active", button.dataset.tool === tool);
  }
  $("#furniture").classList.toggle("active", tool === "furniture" || catalog.isOpen);
}

function setView(view: "2d" | "split" | "3d"): void {
  $("#area").className = `view-${view}`;
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-view]")) {
    button.classList.toggle("active", button.dataset.view === view);
  }
}

// ----- Assisted tracing -----

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
let suggestions: Suggestion[] | null = null;
/** The suggested doors and windows. Only the recognition gives them. */
let openingSuggestions: OpeningSuggestion[] = [];
/** The text of the work that runs now, for example "Finding walls…", or null. */
let busy: string | null = null;
let cleanStrength = 0.5;

/** The tracing functions need OpenCV, so they load only when the user needs them. */
const tracing = () => import("./tracing/trace");

async function backgroundElement(): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = doc.plan.background!.image;
  await image.decode();
  return image;
}

/** Runs a slow tracing step, and shows the work in the panel while it runs. */
async function work(text: string, step: () => Promise<void>): Promise<void> {
  if (busy) return;
  busy = text;
  renderPanel();
  // OpenCV blocks the page while it works. A short wait lets the browser show the panel first.
  await new Promise((resolve) => setTimeout(resolve, 30));
  try {
    await step();
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    busy = null;
    renderPanel();
  }
}

/** Puts a new image in the background. The image keeps its width in meters. */
function replaceBackground(image: { dataUrl: string; width: number; height: number }): void {
  doc.edit((plan) => {
    const background = plan.background!;
    background.scale *= background.width / image.width;
    background.image = image.dataUrl;
    background.width = image.width;
    background.height = image.height;
  });
}

editor.onCorners = (corners) => {
  const background = doc.plan.background;
  if (!background) return;
  const pixels = corners.map((p) => ({
    x: (p.x - background.x) / background.scale,
    y: (p.y - background.y) / background.scale,
  })) as typeof corners;
  void work("Straightening the image…", async () => {
    const { rectify } = await tracing();
    replaceBackground(await rectify(await backgroundElement(), pixels));
    editor.clearCalibration();
    editor.fit();
    setTool("calibrate");
    showStatus("The image is straight. Its size changed, so set the scale again.");
  });
};

function cleanBackground(): void {
  void work("Cleaning the image…", async () => {
    const { cleanUp } = await tracing();
    replaceBackground(await cleanUp(await backgroundElement(), { strength: cleanStrength }));
    showStatus("The image is clean. Undo brings back the old image.");
  });
}

function suggestWalls(): void {
  void work("Finding walls…", async () => {
    const { suggestWalls } = await tracing();
    const pixels = await suggestWalls(await backgroundElement());
    const world = toWorld(pixels, doc.plan.background!);
    if (world.length === 0) {
      showStatus("The app found no walls. Clean the image first, or draw the walls by hand.");
      return;
    }
    setSuggestions(world.map((segment) => ({ segment, accepted: true })));
    showStatus("Click a suggested wall to reject it or to accept it again. Then add the walls.");
  });
}

function setSuggestions(list: Suggestion[] | null, openings: OpeningSuggestion[] = []): void {
  suggestions = list;
  openingSuggestions = list ? openings : [];
  editor.setOverlay("suggestions", list ? drawSuggestions : null);
  renderPanel();
}

function drawSuggestions(group: SVGGElement): void {
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
  const added = openingIds.length > 0 ? ` and ${openingIds.length} doors and windows` : "";
  showStatus(
    `Added ${wallIds.length} walls${added}. Check them, and correct them where necessary.`,
  );
}

/** Recognizes the walls, the doors, and the windows of the background with the model. */
function recognizePlan(): void {
  void work("Loading the recognition (about 15 MB the first time)…", async () => {
    const recognition = await import("./recognition");
    const result = await recognition.recognize(await backgroundElement(), (done, total) => {
      busy = `Recognizing the plan: part ${done} of ${total}…`;
      renderPanel();
    });
    busy = "Finding the walls…";
    renderPanel();
    const world = recognizedToWorld(result, doc.plan.background!);
    if (world.walls.length === 0) {
      showStatus("The model found no walls. Straighten and clean the image, then try again.");
      return;
    }
    setSuggestions(
      world.walls.map((segment) => ({ segment, accepted: true })),
      world.openings.map((opening) => ({ opening, accepted: true })),
    );
    showStatus(
      "Click a suggested wall, door, or window to reject it or to accept it again. Then add them.",
    );
  });
}

function renderTracing(): boolean {
  if (busy) {
    heading("Assisted tracing", "wand");
    paragraph(busy, "busy");
    return true;
  }
  if (suggestions) {
    const accepted = suggestions.filter((s) => s.accepted).length;
    const count = (kind: string) =>
      openingSuggestions.filter((o) => o.accepted && o.opening.kind === kind).length;
    heading(openingSuggestions.length > 0 ? "Recognized plan" : "Suggested walls", "sparkle");
    stats([
      [String(accepted), "walls"],
      [String(suggestions.length - accepted), "rejected"],
      ...(openingSuggestions.length > 0
        ? ([
            [String(count("door")), "doors"],
            [String(count("window")), "windows"],
          ] as [string, string][])
        : []),
    ]);
    paragraph(
      "Click a suggestion on the plan to reject it, or to accept it again. Doors are orange, windows are blue.",
      "note",
    );
    button(`Add ${accepted} walls`, acceptSuggestions, { kind: "primary", icon: "check" });
    button("Discard", () => setSuggestions(null), { icon: "close" });
    return true;
  }
  if (editor.tool === "rectify") {
    heading("Straighten the image", "crop");
    paragraph(
      "Click the four corners of the plan on the background. The app corrects the perspective " +
        "of the photo, so that the plan becomes a rectangle.",
    );
    button("Cancel", () => setTool("select"), { icon: "close" });
    return true;
  }
  return false;
}

// ----- The panel -----

/** The section of the panel that the helpers below append to. */
let section: HTMLElement = panel;

function heading(text: string, iconName?: IconName): void {
  section = document.createElement("section");
  const element = document.createElement("h2");
  if (iconName) element.innerHTML = icon(iconName);
  element.append(text);
  section.append(element);
  panel.append(section);
}

function paragraph(text: string, className?: string): void {
  const element = document.createElement("p");
  element.textContent = text;
  if (className) element.className = className;
  section.append(element);
}

function button(
  text: string,
  action: () => void,
  options: { kind?: "primary" | "danger"; icon?: IconName; detail?: string } = {},
): void {
  let row = section.lastElementChild;
  if (!row?.classList.contains("actions")) {
    row = document.createElement("div");
    row.className = "actions";
    section.append(row);
  }
  const element = document.createElement("button");
  if (options.kind) element.className = options.kind;
  if (options.icon) element.innerHTML = icon(options.icon);
  if (options.detail) {
    // A list item: the text on the first line, and the detail small below it.
    element.classList.add("item");
    const label = document.createElement("span");
    const detail = document.createElement("small");
    label.textContent = text;
    detail.textContent = options.detail;
    const lines = document.createElement("span");
    lines.className = "lines";
    lines.append(label, detail);
    element.append(lines);
  } else {
    element.append(text);
  }
  element.addEventListener("click", action);
  row.append(element);
}

/** A row of the panel: a label on the left and a control in a box on the right. */
function field(text: string, control: HTMLElement, unit?: string): void {
  const label = document.createElement("label");
  label.className = "field";
  label.append(text);
  const box = document.createElement("span");
  box.className = "input";
  box.append(control);
  if (unit) {
    const element = document.createElement("span");
    element.className = "unit";
    element.textContent = unit;
    box.append(element);
  }
  label.append(box);
  section.append(label);
}

function numberField(
  text: string,
  value: number,
  change: (value: number) => void,
  options: { step?: number; min?: number; max?: number; unit?: string } = {},
): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.step = String(options.step ?? 0.01);
  input.min = String(options.min ?? 0);
  if (options.max !== undefined) input.max = String(options.max);
  input.value = String(Math.round(value * 1000) / 1000);
  input.addEventListener("change", () => {
    const parsed = Number(input.value);
    if (Number.isFinite(parsed) && parsed >= (options.min ?? 0)) change(parsed);
  });
  field(text, input, options.unit ?? "m");
  return input;
}

/** A slider from 0 to 1. It changes the plan only when the user releases it. */
function rangeField(text: string, value: number, change: (value: number) => void): void {
  const label = document.createElement("label");
  label.className = "field";
  label.append(text);
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "1";
  input.step = "0.05";
  input.value = String(value);
  input.addEventListener("change", () => change(Number(input.value)));
  label.append(input);
  section.append(label);
}

function stats(items: [value: string, text: string, wide?: boolean][]): void {
  const grid = document.createElement("div");
  grid.className = "stats";
  for (const [value, text, wide] of items) {
    const tile = document.createElement("div");
    tile.className = wide ? "stat wide" : "stat";
    const strong = document.createElement("strong");
    strong.textContent = value;
    const span = document.createElement("span");
    span.textContent = text;
    tile.append(strong, span);
    grid.append(tile);
  }
  section.append(grid);
}

function renderPanel(): void {
  updateMapCredit();
  panel.replaceChildren();
  section = panel;
  const plan = doc.plan;
  if (renderTracing()) return;
  // The card is only for a new plan. A tool other than "select" hides it, so that it does not
  // block the clicks of that tool.
  $("#empty-state").hidden =
    plan.walls.length > 0 || plan.background !== null || editor.tool !== "select";

  if (editor.tool === "calibrate") {
    heading("Set the scale", "ruler");
    if (!plan.background) {
      paragraph("Load a background first.");
      button("Load background", () => void loadBackground(), { icon: "image" });
      return;
    }
    if (!calibration) {
      paragraph("Click two points on the background, for example the ends of a known wall.");
      return;
    }
    const measured = distance(calibration.a, calibration.b);
    paragraph(`The line is ${measured.toFixed(3)} m long at the current scale.`);
    const { a } = calibration;
    const input = numberField("Real length", measured, () => {}, { min: 0.001 });
    input.focus();
    input.select();
    button(
      "Apply",
      () => {
        const real = Number(input.value);
        if (!(real > 0) || measured === 0) return;
        const factor = real / measured;
        // The background grows about the first point, so that point stays in its place.
        doc.edit((plan) => {
          const background = plan.background!;
          background.scale *= factor;
          background.x = a.x + (background.x - a.x) * factor;
          background.y = a.y + (background.y - a.y) * factor;
        });
        editor.clearCalibration();
        setTool("select");
        showStatus("The scale of the background is set. Now draw the walls on it.");
      },
      { kind: "primary", icon: "check" },
    );
    return;
  }

  const items = editor.selection;
  if (items.length > 1) {
    heading("Selection", "select");
    // The panel shows a count for each kind in the selection, and no count of 0.
    const kinds: [ItemKind, string, string][] = [
      ["wall", "wall", "walls"],
      ["opening", "opening", "openings"],
      ["dimension", "dimension", "dimensions"],
      ["vertex", "corner", "corners"],
      ["stair", "stair", "stairs"],
      ["chimney", "chimney", "chimneys"],
      ["room", "room", "rooms"],
      ["furniture", "furniture", "furniture"],
      ["fixture", "device", "devices"],
      ["run", "line", "lines"],
      ["roof", "roof", "roofs"],
      ["roof-corner", "roof corner", "roof corners"],
    ];
    stats(
      kinds
        .map(([kind, one, many]) => {
          const count = items.filter((i) => i.kind === kind).length;
          return [String(count), count === 1 ? one : many] as [string, string];
        })
        .filter(([count]) => count !== "0"),
    );
    paragraph("Drag the selection or use the arrow keys to move it.", "note");
    button("Duplicate", () => editor.duplicate(), { icon: "copy" });
    button("Delete", () => editor.deleteSelection(), { kind: "danger", icon: "trash" });
    return;
  }
  const selection = items[0];
  if (selection?.kind === "dimension") {
    const dimension = findDimension(plan, selection.id);
    if (!dimension) return;
    heading("Dimension", "dimension");
    stats([[`${distance(dimension.a, dimension.b).toFixed(3)} m`, "length", true]]);
    numberField(
      "Offset",
      dimension.offset,
      (value) => doc.edit((plan) => (findDimension(plan, dimension.id)!.offset = value)),
      { min: -1e6 },
    );
    paragraph("Drag the dimension line to change its offset.", "note");
    button("Delete", () => editor.deleteSelection(), { kind: "danger", icon: "trash" });
    return;
  }
  if (selection?.kind === "room") {
    const room = findRoom(plan, selection.id);
    if (!room) return;
    const key = room.key;
    const story = plan;
    const change = (edit: (info: RoomInfo) => void) =>
      doc.edit((plan) => {
        const current = findRoom(plan, key);
        if (current) editRoomInfo(plan, current, edit);
      });
    heading("Room", "view2d");
    const height = room.info?.height ?? defaultWallHeight(story);
    stats([
      [`${room.area.toFixed(2)} m²`, "area"],
      [`${height.toFixed(2)} m`, "clear height"],
    ]);
    renderLivingArea(story, room);
    textField("Name", room.info?.name ?? "", (value) => change((info) => (info.name = value)), {
      placeholder: "For example Kitchen",
      allowEmpty: true,
    });
    numberField("Height", height, (value) => change((info) => (info.height = value)), {
      min: 0.5,
    });
    paragraph(
      room.info?.height == null
        ? `The room has the clear height of the story: ${defaultWallHeight(story).toFixed(2)} m. Type a height for a lowered ceiling or a high room.`
        : "The room has its own height. The 3D view shows its ceiling.",
      "note",
    );
    if (room.info?.height != null) {
      button("Height of the story", () => change((info) => (info.height = null)), {
        icon: "layers",
      });
    }

    const loss = roomHeatLoss(doc.building, story, room);
    heading("Heating", "flame");
    checkField("Floor heating", room.info?.floorHeating ?? false, (value) =>
      change((info) => (info.floorHeating = value)),
    );
    numberField(
      "Temperature",
      loss.temperature,
      (value) => change((info) => (info.temperature = value)),
      { min: -30, step: 0.5, unit: "°C" },
    );
    const supply = loss.heating + (loss.floorHeating?.power ?? 0);
    stats([
      [`${Math.round(loss.total)} W`, "heat loss"],
      [`${Math.round(loss.total / Math.max(loss.area, 0.01))} W/m²`, "per area"],
      [`${Math.round(supply)} W`, "heating power", true],
    ]);
    const parts: [string, number][] = [
      ["walls", loss.walls],
      ["windows", loss.windows],
      ["doors", loss.doors],
      ["roof", loss.roof],
      ["floor", loss.floor],
      ["ventilation", loss.ventilation],
    ];
    paragraph(
      parts
        .filter(([, value]) => value > 0.5)
        .map(([name, value]) => `${name} ${Math.round(value)} W`)
        .join(" · "),
      "note",
    );
    if (loss.floorHeating) {
      paragraph(
        `Floor heating: about ${Math.round(loss.floorHeating.power)} W and ${Math.round(loss.floorHeating.pipe)} m of pipe.`,
        "note",
      );
    }
    if (supply < loss.total * 0.95) {
      paragraph(
        `The heating power is ${Math.round(loss.total - supply)} W too low. Add a radiator, or use floor heating.`,
        "warning",
      );
    }
    return;
  }

  if (selection?.kind === "fixture") {
    const fixture = findFixture(plan, selection.id);
    if (!fixture) return;
    const id = fixture.id;
    const type = fixtureType(fixture.type);
    const set = (key: "elevation" | "width" | "rotation" | "power") => (value: number) =>
      doc.edit((plan) => (findFixture(plan, id)![key] = value));
    heading(type.name, fixture.system === "electric" ? "plug" : "flame");
    textField(
      "Label",
      fixture.label,
      (value) => doc.edit((plan) => (findFixture(plan, id)!.label = value)),
      { placeholder: "For example K1", allowEmpty: true },
    );
    numberField("Height", fixture.elevation, set("elevation"), { min: -1 });
    if (fixture.system === "heating") {
      numberField("Width", fixture.width, set("width"), { min: 0.1 });
      numberField("Power", fixture.power ?? 0, set("power"), { min: 0, step: 50, unit: "W" });
    }
    numberField("Rotation", fixture.rotation, set("rotation"), { min: -360, step: 1, unit: "°" });
    paragraph("The height is the height of the center above the floor.", "note");
    button("Duplicate", () => editor.duplicate(), { icon: "copy" });
    button("Delete", () => editor.deleteSelection(), { kind: "danger", icon: "trash" });
    return;
  }

  if (selection?.kind === "run") {
    const run = findRun(plan, selection.id);
    if (!run) return;
    const id = run.id;
    heading(runKind(run.kind).name, run.system === "electric" ? "plug" : "flame");
    stats([
      [`${runLength(run).toFixed(2)} m`, "length on the plan"],
      [String(run.points.length), "points"],
    ]);
    selectField(
      "Kind",
      run.kind,
      RUN_KINDS.filter((k) => k.system === run.system).map((k) => [k.kind, k.name]),
      (kind) => doc.edit((plan) => (findRun(plan, id)!.kind = kind)),
    );
    numberField(
      "Height",
      run.elevation,
      (value) => doc.edit((plan) => (findRun(plan, id)!.elevation = value)),
      { min: -1 },
    );
    button("Delete", () => editor.deleteSelection(), { kind: "danger", icon: "trash" });
    return;
  }

  if (selection?.kind === "roof") {
    renderRoofPanel(selection.id, null);
    return;
  }
  if (selection?.kind === "roof-corner") {
    const [roofId, index] = selection.id.split(":");
    renderRoofPanel(roofId, Number(index));
    return;
  }

  if (selection?.kind === "furniture") {
    const piece = findFurniture(plan, selection.id);
    if (!piece) return;
    const id = piece.id;
    const source = piece.source;
    const model =
      source.kind === "model"
        ? doc.building.models.find((m) => m.id === source.modelId)
        : undefined;
    const set = (key: "width" | "depth" | "height" | "elevation" | "rotation") => (value: number) =>
      doc.edit((plan) => (findFurniture(plan, id)![key] = value));
    heading("Furniture", "sofa");
    textField("Name", piece.name, (value) =>
      doc.edit((plan) => (findFurniture(plan, id)!.name = value)),
    );
    numberField("Width", piece.width, set("width"), { min: 0.05 });
    numberField("Depth", piece.depth, set("depth"), { min: 0.05 });
    numberField("Height", piece.height, set("height"), { min: 0.05 });
    numberField("Above floor", piece.elevation, set("elevation"), { min: -10 });
    numberField("Rotation", piece.rotation, set("rotation"), { min: -360, step: 1, unit: "°" });
    if (model) {
      const origin = { import: "Imported model", kenney: "Kenney", polyhaven: "Poly Haven" }[
        model.origin
      ];
      paragraph([origin, model.license, model.credit].filter(Boolean).join(" · "), "note");
    }
    button("Turn 90°", () => editor.rotate(90), { icon: "rotate" });
    button(
      "Usual size",
      () =>
        doc.edit((plan) => {
          const p = findFurniture(plan, id)!;
          if (p.source.kind === "generic") {
            const t = genericType(p.source.type);
            Object.assign(p, { width: t.width, depth: t.depth, height: t.height });
          } else if (model) {
            Object.assign(p, { width: model.size.x, depth: model.size.y, height: model.size.z });
          }
        }),
      { icon: "fit" },
    );
    button("Duplicate", () => editor.duplicate(), { icon: "copy" });
    button("Delete", () => editor.deleteSelection(), { kind: "danger", icon: "trash" });
    return;
  }

  if (selection?.kind === "stair") {
    const stair = findStair(plan, selection.id);
    if (!stair) return;
    const shape = stairShape(stair, stairRise(doc.building, plan));
    heading("Stair", "stair");
    stats([
      [String(shape.count), "steps"],
      [`${(shape.stepHeight * 100).toFixed(1)} cm`, "step height"],
      [`${(shape.stepDepth * 100).toFixed(1)} cm`, "step depth", true],
    ]);
    numberField(
      "Width",
      stair.width,
      (value) => doc.edit((plan) => (findStair(plan, stair.id)!.width = value)),
      { min: 0.4 },
    );
    numberField(
      "Run",
      distance(stair.a, stair.b),
      (value) =>
        doc.edit((plan) => {
          const s = findStair(plan, stair.id)!;
          const length = distance(s.a, s.b);
          if (length === 0) return;
          s.b = {
            x: s.a.x + ((s.b.x - s.a.x) * value) / length,
            y: s.a.y + ((s.b.y - s.a.y) * value) / length,
          };
        }),
      { min: 0.5 },
    );
    selectField<StairKind>(
      "Shape",
      stair.kind,
      [
        ["straight", "Straight"],
        ["l", "L (quarter turn)"],
        ["u", "U (half turn)"],
      ],
      (kind) =>
        doc.edit((plan) => {
          const s = findStair(plan, stair.id)!;
          // A U stair comes back along the first flight, so its second flight has the same run.
          if (kind === "u" && s.kind !== "u") s.run2 = distance(s.a, s.b);
          if (kind === "l" && s.kind !== "l") s.run2 = Math.max(1, distance(s.a, s.b) / 2);
          s.kind = kind;
        }),
    );
    if (stair.kind !== "straight") {
      selectField<"1" | "-1">(
        "Turn",
        stair.turn === 1 ? "1" : "-1",
        [
          ["1", "To the right"],
          ["-1", "To the left"],
        ],
        (turn) => doc.edit((plan) => (findStair(plan, stair.id)!.turn = turn === "1" ? 1 : -1)),
      );
      numberField(
        "Second run",
        stair.run2,
        (value) => doc.edit((plan) => (findStair(plan, stair.id)!.run2 = value)),
        { min: 0.3 },
      );
    }
    paragraph(
      "The stair goes up to the floor of the next story. The run is the first flight. The landing counts as one step.",
      "note",
    );
    button(
      "Turn around",
      () =>
        doc.edit((plan) => {
          const s = findStair(plan, stair.id)!;
          [s.a, s.b] = [s.b, s.a];
        }),
      { icon: "flipHinge" },
    );
    button("Delete", () => editor.deleteSelection(), { kind: "danger", icon: "trash" });
    return;
  }

  if (selection?.kind === "chimney") {
    const chimney = findChimney(plan, selection.id);
    if (!chimney) return;
    const extent = chimneyExtent(doc.building, plan, chimney);
    heading("Chimney", "chimney");
    const set = (key: "width" | "depth") => (value: number) =>
      doc.edit((plan) => (findChimney(plan, chimney.id)![key] = value));
    numberField("Width", chimney.width, set("width"), { min: 0.1 });
    numberField("Depth", chimney.depth, set("depth"), { min: 0.1 });
    numberField(
      "Top",
      extent.top,
      (value) => doc.edit((plan) => (findChimney(plan, chimney.id)!.top = value)),
      { min: -1e6 },
    );
    paragraph(
      chimney.top === null
        ? "The top is automatic: 0.8 m above the roof. Type a height to fix it."
        : "The top is fixed. The height is above the ground.",
      "note",
    );
    if (chimney.top !== null) {
      button(
        "Automatic top",
        () => doc.edit((plan) => (findChimney(plan, chimney.id)!.top = null)),
        { icon: "check" },
      );
    }
    button("Delete", () => editor.deleteSelection(), { kind: "danger", icon: "trash" });
    return;
  }

  if (selection?.kind === "wall") {
    const wall = findWall(plan, selection.id);
    if (!wall) return;
    heading("Wall", "wall");
    numberField("Length", wallLength(plan, wall), (value) =>
      doc.edit((plan) => setWallLength(plan, wall.id, value)),
    );
    numberField("Thickness", wall.thickness, (value) =>
      doc.edit((plan) => (findWall(plan, wall.id)!.thickness = value)),
    );
    numberField("Height", wall.height, (value) =>
      doc.edit((plan) => (findWall(plan, wall.id)!.height = value)),
    );
    const outer = isOuterWall(plan, wall);
    const layers = wallLayers(doc.building, wall);
    heading("Insulation", "layers");
    stats([
      [outer ? "Outer" : "Inner", "wall"],
      [outer ? `${uValue(layers, "wall").toFixed(2)}` : "–", "U-value W/(m²K)"],
    ]);
    if (!outer) {
      paragraph("An inner wall between two rooms does not lose heat.", "note");
    } else if (wall.layers === null) {
      paragraph("The wall has the layers of the outer walls of the building.", "note");
      button(
        "Own layers",
        () =>
          doc.edit(
            (plan) =>
              (findWall(plan, wall.id)!.layers = structuredClone(doc.building.envelope.wall)),
          ),
        { icon: "layers" },
      );
    } else {
      layerEditor(wall.layers, "wall", (change) =>
        doc.edit((plan) => change(findWall(plan, wall.id)!.layers!)),
      );
      button(
        "Layers of the building",
        () => doc.edit((plan) => (findWall(plan, wall.id)!.layers = null)),
        { icon: "layers" },
      );
    }
    button("Delete wall", () => doc.edit((plan) => removeWall(plan, wall.id)), {
      kind: "danger",
      icon: "trash",
    });
    return;
  }

  if (selection?.kind === "opening") {
    const opening = findOpening(plan, selection.id);
    if (!opening) return;
    heading(opening.kind === "door" ? "Door" : "Window", opening.kind);
    const select = document.createElement("select");
    for (const kind of ["door", "window"] as OpeningKind[]) {
      select.append(
        new Option(kind === "door" ? "Door" : "Window", kind, false, kind === opening.kind),
      );
    }
    select.addEventListener("change", () =>
      doc.edit((plan) => (findOpening(plan, opening.id)!.kind = select.value as OpeningKind)),
    );
    field("Kind", select);
    const set = (key: "width" | "height" | "sill" | "offset") => (value: number) =>
      doc.edit((plan) => (findOpening(plan, opening.id)![key] = value));
    numberField("Width", opening.width, set("width"), { min: 0.1 });
    numberField("Height", opening.height, set("height"), { min: 0.1 });
    numberField("Sill", opening.sill, set("sill"));
    numberField("Position", opening.offset, set("offset"));
    if (opening.kind === "door") {
      const flip = (change: (o: Opening) => void) => () =>
        doc.edit((plan) => change(findOpening(plan, opening.id)!));
      button(
        "Flip hinge",
        flip((o) => (o.hinge = o.hinge === "a" ? "b" : "a")),
        {
          icon: "flipHinge",
        },
      );
      button(
        "Flip swing",
        flip((o) => (o.swing = o.swing === 1 ? -1 : 1)),
        {
          icon: "flipSwing",
        },
      );
    }
    button("Delete", () => doc.edit((plan) => removeOpening(plan, opening.id)), {
      kind: "danger",
      icon: "trash",
    });
    return;
  }

  if (selection?.kind === "vertex") {
    const vertex = findVertex(plan, selection.id);
    if (!vertex) return;
    heading("Corner", "select");
    numberField(
      "x",
      vertex.x,
      (value) => doc.edit((plan) => (getVertex(plan, vertex.id).x = value)),
      {
        min: -1e6,
      },
    );
    numberField(
      "y",
      vertex.y,
      (value) => doc.edit((plan) => (getVertex(plan, vertex.id).y = value)),
      {
        min: -1e6,
      },
    );
    button("Delete corner", () => doc.edit((plan) => removeVertex(plan, vertex.id)), {
      kind: "danger",
      icon: "trash",
    });
    return;
  }

  renderStoryPanel();
  heading("Plan", "view2d");
  const rooms = findRooms(plan);
  const area = rooms.reduce((sum, room) => sum + room.area, 0);
  stats([
    [String(plan.walls.length), "walls"],
    [String(plan.openings.length), "openings"],
    [String(rooms.length), "rooms"],
    [`${area.toFixed(1)} m²`, "area"],
  ]);
  paragraph("The area is inside the center lines of the walls.", "note");
  renderBuildingPanel();
  renderLocationPanel();
  renderEnergyPanel();
  renderPvPanel();
  renderQuantities();
  heading("Background", "image");
  if (plan.background) {
    rangeField("Opacity", plan.background.opacity, (value) =>
      doc.edit((plan) => (plan.background!.opacity = value)),
    );
    button("Set scale", () => setTool("calibrate"), { icon: "ruler" });
    button("Remove", () => doc.edit((plan) => (plan.background = null)), {
      kind: "danger",
      icon: "trash",
    });
    heading("Assisted tracing", "wand");
    paragraph("These steps load OpenCV (about 10 MB) the first time.", "note");
    button("Straighten", () => setTool("rectify"), { icon: "crop" });
    rangeField("Clean-up strength", cleanStrength, (value) => (cleanStrength = value));
    button("Clean up", cleanBackground, { icon: "wand" });
    button("Suggest walls", suggestWalls, { icon: "wand" });
    button("Recognize plan", recognizePlan, { kind: "primary", icon: "sparkle" });
    paragraph(
      "Recognize plan finds walls, doors, and windows with a neural network that runs in the browser. It needs about 15 MB the first time.",
      "note",
    );
  } else {
    paragraph("Load a scan or a photo of a plan as the background, and draw the walls on it.");
    button("Load background", () => void loadBackground(), { icon: "image" });
  }
}

function textField(
  text: string,
  value: string,
  change: (value: string) => void,
  options: { placeholder?: string; allowEmpty?: boolean } = {},
): void {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  if (options.placeholder) input.placeholder = options.placeholder;
  input.addEventListener("change", () => {
    const trimmed = input.value.trim();
    if (trimmed || options.allowEmpty) change(trimmed);
  });
  field(text, input);
}

function selectField<T extends string>(
  text: string,
  value: T,
  options: [T, string][],
  change: (value: T) => void,
): void {
  const select = document.createElement("select");
  for (const [key, label] of options) select.append(new Option(label, key, false, key === value));
  select.addEventListener("change", () => change(select.value as T));
  field(text, select);
}

/**
 * The living area by the WoFlV of a room under a roof: the floor area with a clear height of
 * 2 m or more counts fully, 1 m to 2 m counts half. A room that the roof does not cut shows
 * nothing.
 */
function renderLivingArea(story: Story, room: Room): void {
  const area = livingArea(doc.building, story, room);
  if (area.living >= area.floor - 0.005 && !roofIsCeiling(doc.building, story)) return;
  stats([
    [`${area.living.toFixed(1)} m² of ${area.floor.toFixed(1)} m²`, "living area (WoFlV)", true],
  ]);
  paragraph(
    `The roof is over the room. ${area.full.toFixed(1)} m² have a clear height of 2 m or more and count fully. ${area.half.toFixed(1)} m² have 1 m to 2 m and count half. The area under 1 m does not count. The 2D editor shows the lines of 1 m and 2 m.`,
    "note",
  );
}

/** The living area by the WoFlV of all rooms of a story, if a roof cuts a room of it. */
function renderStoryLivingArea(story: Story): void {
  const areas = findRooms(story).map((room) => livingArea(doc.building, story, room));
  const floor = areas.reduce((sum, a) => sum + a.floor, 0);
  const living = areas.reduce((sum, a) => sum + a.living, 0);
  if (areas.length === 0 || (living >= floor - 0.005 && !roofIsCeiling(doc.building, story))) {
    return;
  }
  stats([[`${living.toFixed(1)} m² of ${floor.toFixed(1)} m²`, "living area (WoFlV)", true]]);
}

/** The values of the active story. A change of its height moves the stories above with it. */
function renderStoryPanel(): void {
  const story = doc.plan;
  const id = story.id;
  heading("Story", "layers");
  textField("Name", story.name, (value) =>
    doc.editBuilding((b) => (findStory(b, id)!.name = value)),
  );
  numberField(
    "Floor level",
    story.elevation,
    (value) =>
      doc.editBuilding((b) => {
        findStory(b, id)!.elevation = value;
        sortStories(b);
      }),
    { min: -1e6 },
  );
  numberField(
    "Story height",
    story.height,
    (value) =>
      doc.editBuilding((b) => {
        const s = findStory(b, id)!;
        const delta = value - s.height;
        for (const other of b.stories) if (other.elevation > s.elevation) other.elevation += delta;
        s.height = value;
      }),
    { min: 0.5 },
  );
  renderStoryLivingArea(story);
  if (doc.building.stories.length > 1) {
    button(
      "Delete story",
      () => {
        doc.editBuilding((b) => {
          b.stories = b.stories.filter((s) => s.id !== id);
          // A roof on the deleted story goes away with its PV fields.
          const gone = new Set(b.roofs.filter((r) => r.storyId === id).map((r) => r.id));
          b.roofs = b.roofs.filter((r) => !gone.has(r.id));
          b.pv = b.pv.filter((a) => !gone.has(a.roofId));
        });
      },
      { kind: "danger", icon: "trash" },
    );
  }
}

/** The orientation and the roofs of the building. */
function renderBuildingPanel(): void {
  const building = doc.building;
  heading("Building", "roof");
  numberField(
    "North",
    building.north,
    (value) => doc.editBuilding((b) => (b.north = ((value % 360) + 360) % 360)),
    { min: -360, step: 1, unit: "°" },
  );
  heading("Roofs", "roof");
  for (const roof of building.roofs) {
    const story = findStory(building, roof.storyId);
    button(
      roof.name,
      () => {
        if (story && story.id !== doc.activeStoryId) doc.setActiveStory(story.id);
        editor.select({ kind: "roof", id: roof.id });
      },
      { icon: "roof", detail: story?.name ?? "No story" },
    );
  }
  paragraph(
    `Add a roof on the walls of ${doc.plan.name}. Then click it to change its sides, its outline, and its dormers.`,
    "note",
  );
  for (const [preset, name] of [
    ["gable", "Gable"],
    ["hip", "Hip"],
    ["shed", "Shed"],
    ["flat", "Flat"],
  ] as const) {
    button(name, () => addRoof(preset), { icon: "plus" });
  }
}

/** Adds a roof on the outline of the walls of the active story. */
function addRoof(preset: "gable" | "hip" | "shed" | "flat"): void {
  const roof = newRoof(doc.building, doc.plan, preset);
  if (!roof) {
    showStatus("The walls of this story close no outline, so the roof has no outline yet.", true);
    return;
  }
  doc.editBuilding((b) => b.roofs.push(roof));
  editor.select({ kind: "roof", id: roof.id });
  showStatus("Added the roof. Drag its corners, or drag a + to add a corner.");
}

/** The panel of a roof: its settings, its sides, its dormers, and its windows. */
function renderRoofPanel(roofId: string, corner: number | null): void {
  const building = doc.building;
  const roof = building.roofs.find((r) => r.id === roofId);
  if (!roof) return;
  const change = (edit: (roof: Roof) => void) =>
    doc.editBuilding((b) => edit(b.roofs.find((r) => r.id === roofId)!));
  const geometry = roofGeometryOf(building, roof);
  const story = findStory(building, roof.storyId);

  if (corner !== null) {
    const point = roof.outline[corner];
    heading(`${roof.name} · corner ${corner + 1}`, "roof");
    numberField("x", point.x, (v) => change((r) => (r.outline[corner].x = v)), { min: -1e6 });
    numberField("y", point.y, (v) => change((r) => (r.outline[corner].y = v)), { min: -1e6 });
    paragraph("Drag the corner on the plan. Delete removes it.", "note");
    button("Whole roof", () => editor.select({ kind: "roof", id: roofId }), { icon: "roof" });
    return;
  }

  heading(roof.name, "roof");
  stats([
    [`${geometry.top.toFixed(2)} m`, "top above ground"],
    [String(roof.outline.length), "sides"],
  ]);
  textField("Name", roof.name, (v) => change((r) => (r.name = v)));
  selectField(
    "On story",
    roof.storyId,
    building.stories.map((s) => [s.id, s.name]),
    (storyId) => change((r) => (r.storyId = storyId)),
  );
  numberField(
    "Eave height",
    roof.base ?? (story ? roofBase(building, story) : 0),
    (v) => change((r) => (r.base = v)),
    { min: -100 },
  );
  if (roof.base !== null) {
    button("Usual eave height", () => change((r) => (r.base = null)), {
      icon: "layers",
    });
  }
  checkField("Flat roof", roof.flat, (v) => change((r) => (r.flat = v)));
  paragraph("Presets for all sides:", "note");
  for (const [preset, name] of [
    ["gable", "Gable"],
    ["hip", "Hip"],
    ["shed", "Shed"],
  ] as const) {
    button(
      name,
      () =>
        change((r) => {
          const pitch = r.sides.find((side) => side.kind === "eave")?.pitch ?? 35;
          const overhang = r.sides[0]?.overhang ?? 0.4;
          r.sides = presetSides(r.outline, preset, pitch, overhang);
          r.flat = false;
        }),
      { icon: "roof" },
    );
  }
  button(
    "Outline from the walls",
    () => {
      const outline = story ? planOutline(story) : null;
      if (!outline) {
        showStatus("The walls of the story close no outline.", true);
        return;
      }
      change((r) => {
        const pitch = r.sides.find((side) => side.kind === "eave")?.pitch ?? 35;
        r.outline = outline;
        r.sides = presetSides(outline, "gable", pitch, r.sides[0]?.overhang ?? 0.4);
        r.dormers = [];
        r.windows = [];
      });
    },
    { icon: "fit" },
  );

  group("Sides", true, () => {
    roof.sides.forEach((side, i) => {
      const row = document.createElement("div");
      row.className = "side-row";
      const label = document.createElement("span");
      label.textContent = String(i + 1);
      const kind = document.createElement("select");
      kind.append(
        new Option("Eave", "eave", false, side.kind === "eave"),
        new Option("Gable", "gable", false, side.kind === "gable"),
      );
      kind.addEventListener("change", () =>
        change((r) => (r.sides[i].kind = kind.value as "eave" | "gable")),
      );
      const pitch = document.createElement("input");
      pitch.type = "number";
      pitch.min = "1";
      pitch.max = "85";
      pitch.value = String(side.pitch);
      pitch.title = "Pitch in degrees";
      pitch.disabled = side.kind === "gable";
      pitch.addEventListener("change", () => {
        const v = Number(pitch.value);
        if (v > 0 && v < 90) change((r) => (r.sides[i].pitch = v));
      });
      const overhang = document.createElement("input");
      overhang.type = "number";
      overhang.step = "0.05";
      overhang.min = "0";
      overhang.value = String(side.overhang);
      overhang.title = "Overhang in meters";
      overhang.addEventListener("change", () => {
        const v = Number(overhang.value);
        if (v >= 0) change((r) => (r.sides[i].overhang = v));
      });
      row.append(label, kind, pitch, overhang);
      section.append(row);
    });
    paragraph("Each row: the kind, the pitch in °, and the overhang in m.", "note");
  });

  const eaves = roof.sides
    .map((side, i) => ({ side, i }))
    .filter(({ side }) => side.kind === "eave")
    .map(({ i }) => i);
  const sideLength = (i: number) => {
    const p = roof.outline[i];
    const q = roof.outline[(i + 1) % roof.outline.length];
    return Math.hypot(q.x - p.x, q.y - p.y);
  };
  // A new dormer or window goes on the longest eave side. The copy keeps `eaves` in side order.
  const longest = [...eaves].sort((a, b) => sideLength(b) - sideLength(a))[0];

  const misfit = (id: string) => {
    if (geometry.misfits.includes(id)) {
      paragraph(
        "It does not fit on the roof face of its side, so the 3D view does not show it. Move it nearer to the eave, or make it smaller.",
        "warning",
      );
    }
  };
  const hasMisfit = (items: { id: string }[]) => items.some((i) => geometry.misfits.includes(i.id));

  group(`Dormers · ${roof.dormers.length}`, hasMisfit(roof.dormers), () => {
    roof.dormers.forEach((dormer) => {
      const set = (edit: (d: Dormer) => void) =>
        change((r) => edit(r.dormers.find((d) => d.id === dormer.id)!));
      paragraph(`Dormer on side ${dormer.side + 1}`);
      misfit(dormer.id);
      selectField(
        "Side",
        String(dormer.side),
        eaves.map((i) => [String(i), `Side ${i + 1}`]),
        (v) => set((d) => (d.side = Number(v))),
      );
      selectField(
        "Kind",
        dormer.kind,
        [
          ["gable", "Gable"],
          ["shed", "Shed"],
          ["flat", "Flat"],
        ],
        (v) => set((d) => (d.kind = v)),
      );
      numberField("Position", dormer.offset, (v) => set((d) => (d.offset = v)));
      numberField("From eave", dormer.distance, (v) => set((d) => (d.distance = v)));
      numberField("Width", dormer.width, (v) => set((d) => (d.width = v)), { min: 0.4 });
      numberField("Wall height", dormer.height, (v) => set((d) => (d.height = v)), { min: 0.3 });
      if (dormer.kind !== "flat") {
        numberField("Pitch", dormer.pitch, (v) => set((d) => (d.pitch = v)), {
          min: 1,
          step: 1,
          unit: "°",
        });
      }
      button(
        "Remove",
        () => change((r) => (r.dormers = r.dormers.filter((d) => d.id !== dormer.id))),
        {
          kind: "danger",
          icon: "trash",
        },
      );
    });
    if (longest !== undefined && !roof.flat) {
      button(
        "Add a dormer",
        () =>
          change((r) =>
            r.dormers.push({
              id: newId("dm"),
              side: longest,
              offset: sideLength(longest) / 2,
              distance: 1,
              width: 1.8,
              height: 1.2,
              kind: "gable",
              pitch: 25,
            }),
          ),
        { icon: "plus" },
      );
    }
  });

  group(`Roof windows · ${roof.windows.length}`, hasMisfit(roof.windows), () => {
    roof.windows.forEach((window) => {
      const set = (edit: (w: RoofWindow) => void) =>
        change((r) => edit(r.windows.find((w) => w.id === window.id)!));
      paragraph(`Window on side ${window.side + 1}`);
      misfit(window.id);
      selectField(
        "Side",
        String(window.side),
        eaves.map((i) => [String(i), `Side ${i + 1}`]),
        (v) => set((w) => (w.side = Number(v))),
      );
      numberField("Position", window.offset, (v) => set((w) => (w.offset = v)));
      numberField("From eave", window.distance, (v) => set((w) => (w.distance = v)));
      numberField("Width", window.width, (v) => set((w) => (w.width = v)), { min: 0.3 });
      numberField("Length", window.length, (v) => set((w) => (w.length = v)), { min: 0.3 });
      button(
        "Remove",
        () => change((r) => (r.windows = r.windows.filter((w) => w.id !== window.id))),
        {
          kind: "danger",
          icon: "trash",
        },
      );
    });
    if (longest !== undefined && !roof.flat) {
      button(
        "Add a roof window",
        () =>
          change((r) =>
            r.windows.push({
              id: newId("rw"),
              side: longest,
              offset: sideLength(longest) / 3,
              distance: 1.5,
              width: 0.78,
              length: 1.4,
            }),
          ),
        { icon: "plus" },
      );
    }
  });

  paragraph("Drag the corners of the outline on the plan. Drag a + to add a corner.", "note");
  button("Delete roof", () => editor.deleteSelection(), { kind: "danger", icon: "trash" });
}

// ----- Location and climate -----

/** The state of the location group. It is not in the plan, so it stays across renders. */
/** True or false after the user opens or closes the place group, null before. */
let locationOpen: boolean | null = null;
let placeQuery = "";
let placeResults: Place[] = [];
/** The text of the request that runs, or null. */
let locationBusy: string | null = null;
let locationMessage: { text: string; error: boolean } | null = null;
let climateRequest: AbortController | null = null;

const compassName = (azimuth: number) =>
  ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(azimuth / 45) % 8];

/** A field for a latitude or a longitude in degrees. An empty field shows no value. */
function coordinateField(
  text: string,
  value: number | null,
  limit: number,
  change: (value: number) => void,
): void {
  const input = document.createElement("input");
  input.type = "number";
  input.step = "0.0001";
  input.min = String(-limit);
  input.max = String(limit);
  input.value = value === null ? "" : String(Math.round(value * 10000) / 10000);
  input.addEventListener("change", () => {
    const parsed = Number(input.value);
    if (input.value !== "" && Number.isFinite(parsed) && Math.abs(parsed) <= limit) change(parsed);
  });
  field(text, input, "°");
}

/** The center of the walls of the active story, or the origin. A new location is there. */
function planCenter(): Point {
  const box = storyBox(doc.plan);
  return box ? { x: (box[0].x + box[2].x) / 2, y: (box[0].y + box[2].y) / 2 } : { x: 0, y: 0 };
}

/** Changes the location of the building. A building without a location gets one. */
function editLocation(edit: (location: PlanLocation) => void) {
  doc.editBuilding((b) => {
    b.location ??= { name: "", latitude: 0, longitude: 0, ...planCenter() };
    edit(b.location);
  });
}

/** Searches places by name. This sends the name to open-meteo.com. */
async function findPlaces(query: string): Promise<void> {
  placeQuery = query;
  if (locationBusy) return;
  if (query.trim().length < 2) {
    locationMessage = { text: "Type at least two letters of the place.", error: true };
    renderPanel();
    return;
  }
  locationBusy = "Searching the place…";
  locationMessage = null;
  renderPanel();
  try {
    placeResults = await searchPlaces(query);
    if (placeResults.length === 0) {
      locationMessage = { text: `Found no place for "${query.trim()}".`, error: false };
    }
  } catch (error) {
    placeResults = [];
    locationMessage = { text: (error as Error).message, error: true };
  } finally {
    locationBusy = null;
    renderPanel();
  }
}

/**
 * Downloads the climate of the location and stores it in the building. This sends the
 * coordinates to open-meteo.com. If the location changes during the download, the result goes
 * away.
 */
async function loadClimate(): Promise<void> {
  const location = doc.building.location;
  if (!location || locationBusy) return;
  const { latitude, longitude } = location;
  climateRequest = new AbortController();
  locationBusy = `Loading ${CLIMATE_YEARS} years of weather data from open-meteo.com…`;
  locationMessage = null;
  renderPanel();
  try {
    const climate = await downloadClimate(latitude, longitude, {
      signal: climateRequest.signal,
    });
    const now = doc.building.location;
    if (now?.latitude !== latitude || now.longitude !== longitude) {
      locationMessage = {
        text: "The location changed during the download. Load the climate again.",
        error: true,
      };
    } else {
      doc.editBuilding((b) => (b.climate = climate));
      locationMessage = {
        text: "Loaded the climate. The plan stores it, so the app needs no network for it now.",
        error: false,
      };
    }
  } catch (error) {
    locationMessage = climateRequest.signal.aborted
      ? { text: "Stopped the download.", error: false }
      : { text: (error as Error).message, error: true };
  } finally {
    locationBusy = null;
    climateRequest = null;
    renderPanel();
  }
}

/** The location: the place search, the coordinates, and the climate. */
function renderLocationPanel(): void {
  const building = doc.building;
  const location = building.location;
  heading("Location", "pin");
  const title = location?.name
    ? `Place · ${location.name}`
    : location
      ? `Place · ${location.latitude.toFixed(2)}, ${location.longitude.toFixed(2)}`
      : "Place";
  group(title, locationOpen ?? !location, () => {
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Town or city";
    search.value = placeQuery;
    search.addEventListener("input", () => (placeQuery = search.value));
    search.addEventListener("keydown", (event) => {
      if (event.key === "Enter") void findPlaces(search.value);
    });
    field("Search", search);
    button("Search", () => void findPlaces(search.value), { icon: "search" });
    for (const place of placeResults) {
      button(
        place.label,
        () => {
          placeResults = [];
          locationMessage = null;
          editLocation((l) => {
            l.name = place.label;
            l.latitude = place.latitude;
            l.longitude = place.longitude;
          });
        },
        { icon: "pin" },
      );
    }
    if (location) {
      textField("Name", location.name, (value) => editLocation((l) => (l.name = value)), {
        allowEmpty: true,
      });
    }
    coordinateField("Latitude", location?.latitude ?? null, 90, (value) =>
      editLocation((l) => (l.latitude = value)),
    );
    coordinateField("Longitude", location?.longitude ?? null, 180, (value) =>
      editLocation((l) => (l.longitude = value)),
    );
    if (location) {
      // The point of the plan at the place: the map in the Layers menu lies under it.
      const limit = { min: -10000, step: 0.1 };
      numberField("Plan point x", location.x, (v) => editLocation((l) => (l.x = v)), limit);
      numberField("Plan point y", location.y, (v) => editLocation((l) => (l.y = v)), limit);
      paragraph(
        "The plan point is at the latitude and the longitude. Change it, and North, until the map in the Layers menu fits the plan.",
        "note",
      );
    }
  });
  const details = section.lastElementChild as HTMLDetailsElement;
  details.addEventListener("toggle", () => (locationOpen = details.open));
  if (locationBusy) {
    paragraph(locationBusy, "busy");
    if (climateRequest) button("Stop", () => climateRequest?.abort(), { icon: "close" });
  } else if (location) {
    button(building.climate ? "Load the climate again" : "Load climate", () => void loadClimate(), {
      kind: "primary",
    });
  }
  paragraph(
    "Search and Load climate send the place to open-meteo.com. The app sends nothing before you click. The plan stores the climate, so it works offline after that.",
    "note",
  );
  if (locationMessage) {
    paragraph(locationMessage.text, locationMessage.error ? "warning" : "note");
  }
  if (building.climate) renderClimateSummary();
}

/** The values of the stored climate, and the credit of the data. */
function renderClimateSummary(): void {
  const building = doc.building;
  const climate = building.climate!;
  const summary = climateSummary(climate);
  const location = building.location;
  if (
    location &&
    (Math.abs(location.latitude - climate.latitude) > 0.01 ||
      Math.abs(location.longitude - climate.longitude) > 0.01)
  ) {
    paragraph(
      `The climate is for ${climate.latitude.toFixed(2)}, ${climate.longitude.toFixed(2)}. Load it again for the new location.`,
      "warning",
    );
  }
  // The best roof face of the building, else the best tilt toward the equator.
  const faces = faceInfo(building).map((f) => ({
    ...f,
    perKwp: specificYield(building, f.tilt, f.azimuth),
  }));
  const best = faces.sort((p, q) => q.perKwp - p.perKwp)[0];
  stats([
    [`${summary.meanTemperature.toFixed(1)} °C`, "mean temperature"],
    [`${summary.designTemperature.toFixed(1)} °C`, "design temperature"],
    [`${Math.round(summary.degreeDays)} K·d`, `degree days ${DEGREE_DAY_BASE}/${DEGREE_DAY_LIMIT}`],
    [`${Math.round(summary.globalIrradiation)} kWh/m²`, "sun on the ground per year"],
    best
      ? [
          `${Math.round(best.perKwp)} kWh/kWp`,
          `PV on the best roof face (${compassName(best.azimuth)} ${Math.round(best.tilt)}°)`,
          true,
        ]
      : [
          `${Math.round(summary.optimum.yield)} kWh/kWp`,
          `PV at the best tilt (${compassName(summary.optimum.azimuth)} ${summary.optimum.tilt}°)`,
          true,
        ],
  ]);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  group(`Climate ${climate.firstYear} to ${climate.lastYear}`, false, () => {
    for (let i = 0; i < 12; i += 3) {
      paragraph(
        summary.monthly
          .slice(i, i + 3)
          .map((t, j) => `${months[i + j]} ${t.toFixed(1)} °C`)
          .join(" · "),
      );
    }
    paragraph(
      `A typical year: the mean of each hour of ${climate.firstYear} to ${climate.lastYear}, loaded on ${climate.downloaded}. The design temperature is the coldest mean of 48 hours in these years. The degree days count the days below ${DEGREE_DAY_LIMIT} °C against ${DEGREE_DAY_BASE} °C inside.`,
      "note",
    );
    button("Remove the climate", () => doc.editBuilding((b) => (b.climate = null)), {
      kind: "danger",
      icon: "trash",
    });
  });
  const credit = document.createElement("p");
  credit.className = "note";
  const link = document.createElement("a");
  link.href = ATTRIBUTION_URL;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = ATTRIBUTION;
  credit.append(link, " (CC BY 4.0).");
  section.append(credit);
}

/** A button that puts the design temperature of the location into the envelope. */
function designTemperatureButton(): void {
  const climate = doc.building.climate;
  if (!climate) return;
  const value = climate.designTemperature;
  if (doc.building.envelope.outside === value) {
    paragraph("Outside is the design temperature of the location.", "note");
    return;
  }
  button(`Use ${value.toFixed(1)} °C of the location`, () =>
    doc.editBuilding((b) => (b.envelope.outside = value)),
  );
}

/** Says where the PV yield comes from. */
function pvSourceNote(): void {
  paragraph(
    doc.building.climate
      ? "The yield comes from the climate of the location, without shade."
      : "The yield is a general estimate for Central Europe. Load the climate of the location for a better value.",
    "note",
  );
}

function checkField(text: string, value: boolean, change: (value: boolean) => void): void {
  const label = document.createElement("label");
  label.className = "field check-field";
  label.append(text);
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = value;
  input.addEventListener("change", () => change(input.checked));
  label.append(input);
  section.append(label);
}

/** A group that the user can open and close. The helpers append to it while it is open. */
function group(title: string, open: boolean, fill: () => void): void {
  const details = document.createElement("details");
  details.className = "group";
  details.open = open;
  const summary = document.createElement("summary");
  summary.textContent = title;
  details.append(summary);
  section.append(details);
  const outer = section;
  section = details;
  fill();
  section = outer;
}

/**
 * Edits a list of layers from the inside to the outside: the material and the thickness of each
 * layer. `change` gets a function that changes the layers in the new building.
 */
function layerEditor(
  layers: Layer[],
  kind: "wall" | "roof" | "floor",
  change: (edit: (layers: Layer[]) => void) => void,
): void {
  layers.forEach((layer, i) => {
    const row = document.createElement("div");
    row.className = "layer-row";
    const select = document.createElement("select");
    for (const m of MATERIALS) {
      select.append(new Option(`${m.name} (λ ${m.lambda})`, m.id, false, m.id === layer.material));
    }
    select.addEventListener("change", () => change((list) => (list[i].material = select.value)));
    const input = document.createElement("input");
    input.type = "number";
    input.step = "1";
    input.min = "1";
    input.value = String(Math.round(layer.thickness * 1000) / 10);
    input.title = "Thickness in cm";
    input.addEventListener("change", () => {
      const cm = Number(input.value);
      if (cm > 0) change((list) => (list[i].thickness = cm / 100));
    });
    const unit = document.createElement("span");
    unit.textContent = "cm";
    const remove = document.createElement("button");
    remove.className = "icon-button";
    remove.title = "Remove the layer";
    remove.innerHTML = icon("close");
    remove.addEventListener("click", () => change((list) => list.splice(i, 1)));
    row.append(select, input, unit, remove);
    section.append(row);
  });
  paragraph(
    `From the inside to the outside. U = ${uValue(layers, kind).toFixed(2)} W/(m²K), ${(layersThickness(layers) * 100).toFixed(1)} cm.`,
    "note",
  );
  button(
    "Add a layer",
    () => change((list) => list.push({ material: "mineral-wool", thickness: 0.1 })),
    {
      icon: "plus",
    },
  );
}

/** The heat loss of the building and its envelope: the layers, the openings, the climate. */
function renderEnergyPanel(): void {
  const building = doc.building;
  const envelope = building.envelope;
  const summary = buildingHeatLoss(building);
  heading("Energy", "flame");
  stats([
    [`${(summary.total / 1000).toFixed(1)} kW`, "heat loss"],
    [`${Math.round(summary.perArea)} W/m²`, "per heated area"],
  ]);
  paragraph(
    `At ${envelope.outside} °C outside and ${envelope.inside} °C inside. An estimate, not a calculation by a standard.`,
    "note",
  );
  const editEnvelope = (edit: (envelope: Envelope) => void) =>
    doc.editBuilding((b) => edit(b.envelope));
  group(`Outer walls · U ${uValue(envelope.wall, "wall").toFixed(2)}`, false, () =>
    layerEditor(envelope.wall, "wall", (change) => editEnvelope((e) => change(e.wall))),
  );
  group(`Roof · U ${uValue(envelope.roof, "roof").toFixed(2)}`, false, () =>
    layerEditor(envelope.roof, "roof", (change) => editEnvelope((e) => change(e.roof))),
  );
  group(`Floor on the ground · U ${uValue(envelope.floor, "floor").toFixed(2)}`, false, () =>
    layerEditor(envelope.floor, "floor", (change) => editEnvelope((e) => change(e.floor))),
  );
  group("Windows, doors, and climate", false, () => {
    const set = (key: "windowU" | "doorU" | "outside" | "inside") => (value: number) =>
      editEnvelope((e) => (e[key] = value));
    numberField("Window U", envelope.windowU, set("windowU"), { min: 0.1, step: 0.1, unit: "" });
    numberField("Door U", envelope.doorU, set("doorU"), { min: 0.1, step: 0.1, unit: "" });
    numberField("Outside", envelope.outside, set("outside"), { min: -60, step: 1, unit: "°C" });
    numberField("Inside", envelope.inside, set("inside"), { min: -60, step: 0.5, unit: "°C" });
    designTemperatureButton();
  });
}

/** The PV fields on the faces of the roof. */
function renderPvPanel(): void {
  const building = doc.building;
  const faces = faceInfo(building);
  if (faces.length === 0) return;
  heading("Photovoltaic", "sparkle");
  const total = pvSummary(building);
  stats([
    [`${total.peak.toFixed(1)} kWp`, `${total.count} panels`],
    [`${Math.round(total.yield)} kWh`, "per year"],
  ]);
  pvSourceNote();
  const compass = (azimuth: number) =>
    ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(azimuth / 45) % 8];
  building.pv.forEach((array, i) => {
    const layout = pvLayout(building, array);
    const face = faces.find((f) => f.roofId === array.roofId && f.index === array.face);
    group(
      `Field ${i + 1} · ${face ? `${compass(face.azimuth)} ${Math.round(face.tilt)}°` : "no face"} · ${layout?.count ?? 0} panels`,
      false,
      () => {
        const set = (edit: (a: PvArray) => void) =>
          doc.editBuilding((b) => edit(b.pv.find((a) => a.id === array.id)!));
        if (layout) {
          paragraph(
            `${layout.peak.toFixed(2)} kWp, about ${Math.round(layout.yield)} kWh per year.`,
            "note",
          );
        }
        selectField(
          "Face",
          `${array.roofId}:${array.face}`,
          faces.map((f) => [
            `${f.roofId}:${f.index}`,
            `${f.roofName} · ${compass(f.azimuth)} · ${Math.round(f.tilt)}° · ${Math.round(f.area)} m²`,
          ]),
          (value) =>
            set((a) => {
              const [roofId, index] = value.split(":");
              a.roofId = roofId;
              a.face = Number(index);
            }),
        );
        numberField("Panel power", array.panelPower, (v) => set((a) => (a.panelPower = v)), {
          min: 50,
          step: 5,
          unit: "W",
        });
        selectField(
          "Orientation",
          array.portrait ? "portrait" : "landscape",
          [
            ["portrait", "Portrait"],
            ["landscape", "Landscape"],
          ],
          (value) => set((a) => (a.portrait = value === "portrait")),
        );
        numberField("Margin", array.margin, (v) => set((a) => (a.margin = v)));
        numberField(
          "Most panels",
          array.limit ?? 0,
          (v) => set((a) => (a.limit = v > 0 ? v : null)),
          {
            step: 1,
            unit: "",
          },
        );
        button(
          "Remove",
          () => doc.editBuilding((b) => (b.pv = b.pv.filter((a) => a.id !== array.id))),
          { kind: "danger", icon: "trash" },
        );
      },
    );
  });
  // The best free face is the face with the highest yield per kWp.
  const used = new Set(building.pv.map((a) => `${a.roofId}:${a.face}`));
  const perKwp = (f: { tilt: number; azimuth: number }) =>
    specificYield(building, f.tilt, f.azimuth);
  const free = faces
    .filter((f) => !used.has(`${f.roofId}:${f.index}`))
    .sort((p, q) => perKwp(q) - perKwp(p));
  if (free.length > 0) {
    button(
      "Add a PV field",
      () =>
        doc.editBuilding((b) =>
          b.pv.push({
            id: newId("pv"),
            roofId: free[0].roofId,
            face: free[0].index,
            panelWidth: 1.13,
            panelHeight: 1.72,
            panelPower: 430,
            portrait: true,
            margin: 0.3,
            gap: 0.02,
            limit: null,
          }),
        ),
      { icon: "plus" },
    );
  }
}

/** The lengths of the lines and the counts of the devices of the building. */
function renderQuantities(): void {
  const { runs, fixtures } = buildingQuantities(doc.building);
  if (runs.length === 0 && fixtures.length === 0) return;
  heading("Services", "plug");
  group("Quantities of the building", false, () => {
    for (const run of runs) paragraph(`${run.name}: ${run.length.toFixed(1)} m`);
    for (const fixture of fixtures) paragraph(`${fixture.name}: ${fixture.count}`);
    paragraph("The lengths include the drops to the devices.", "note");
  });
}

// ----- Stories -----

let showAbove = false;

function renderStories(): void {
  const list = $("#stories");
  list.replaceChildren();
  const active = doc.activeStoryId;
  const stories = [...doc.building.stories].reverse();
  for (const story of stories) {
    const element = document.createElement("button");
    element.className = story.id === active ? "story active" : "story";
    const name = document.createElement("span");
    name.textContent = story.name;
    const level = document.createElement("small");
    const sign = story.elevation > 0 ? "+" : story.elevation < 0 ? "−" : "±";
    level.textContent = `${sign}${Math.abs(story.elevation).toFixed(2)}`;
    element.append(name, level);
    element.title = `${story.name}: floor at ${story.elevation.toFixed(2)} m`;
    element.addEventListener("click", () => {
      editor.select(null);
      doc.setActiveStory(story.id);
    });
    list.append(element);
    // A line marks the ground between the lowest story above ground and the cellars.
    const next = stories[stories.indexOf(story) + 1];
    if (story.elevation >= 0 && next && next.elevation < 0) {
      const ground = document.createElement("div");
      ground.className = "ground";
      list.append(ground);
    }
  }
  const add = document.createElement("button");
  add.className = "add";
  add.dataset.menu = "";
  add.innerHTML = icon("plus");
  add.append("Add story");
  add.addEventListener("click", () => toggleMenu(add, $("#story-menu"), "above"));
  list.append(add);
}

function addStory(kind: "top" | "attic" | "cellar"): void {
  closeMenus();
  let id = "";
  doc.editBuilding((b) => {
    const story = kind === "cellar" ? addCellar(b) : addStoryOnTop(b, kind === "attic");
    id = story.id;
  });
  editor.select(null);
  doc.setActiveStory(id);
  showStatus(
    kind === "cellar"
      ? "Added a cellar. The walls of the story above show as dashed lines."
      : "Added a story. The walls of the story below show as dashed lines.",
  );
}

// ----- The compass -----

function renderCompass(): void {
  const needle = document.querySelector<SVGGElement>("#compass .needle")!;
  needle.setAttribute("transform", `rotate(${doc.building.north})`);
}

/** A drag on the compass turns north. It snaps to 5°, or to 1° with Alt. */
function setupCompass(): void {
  const compass = $("#compass");
  const angle = (e: PointerEvent) => {
    const rect = compass.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const step = e.altKey ? 1 : 5;
    return (((Math.round(degrees / step) * step) % 360) + 360) % 360;
  };
  compass.addEventListener("pointerdown", (e) => {
    compass.setPointerCapture(e.pointerId);
    doc.begin();
    doc.updateBuilding((b) => (b.north = angle(e)));
  });
  compass.addEventListener("pointermove", (e) => {
    if (!compass.hasPointerCapture(e.pointerId)) return;
    doc.updateBuilding((b) => (b.north = angle(e)));
  });
  // Only a drag that started on the compass ends here, so that it does not commit the drag of
  // the editor.
  const end = (e: PointerEvent) => {
    if (compass.hasPointerCapture(e.pointerId)) doc.commit();
  };
  compass.addEventListener("pointerup", end);
  compass.addEventListener("pointercancel", end);
}

// ----- The 3D view -----

function update3d(): void {
  const { electric, heating, pv } = editor.layers;
  view3d.update(doc.building, {
    activeStoryId: doc.activeStoryId,
    showAbove,
    layers: { electric, heating, pv },
  });
}

function fit3d(): void {
  // The views update in the next frame after a change, so the 3D view first takes the new
  // building. Else the fit uses the old content, for example after a new file opens.
  update3d();
  view3d.fit(doc.building);
}

// ----- Building services -----

/** The menu of the device types and the kinds of lines, grouped by system. */
function buildServicesMenu(): void {
  const menu = $("#services-menu");
  menu.replaceChildren();
  for (const [system, title] of [
    ["electric", "Electric"],
    ["heating", "Heating"],
  ] as const) {
    const heading = document.createElement("h4");
    heading.textContent = title;
    menu.append(heading);
    for (const type of FIXTURE_TYPES.filter((t) => t.system === system)) {
      const item = document.createElement("button");
      item.append(fixturePicture(type.type), type.name);
      item.addEventListener("click", () => {
        closeMenus();
        const ceiling = defaultWallHeight(doc.plan) - 0.05;
        editor.startFixture(newFixture(type.type, { x: 0, y: 0 }, ceiling));
        markTool("fixture");
        showStatus(HINTS.fixture);
        renderPanel();
      });
      menu.append(item);
    }
    for (const kind of RUN_KINDS.filter((k) => k.system === system)) {
      const item = document.createElement("button");
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = kind.dashed
        ? `repeating-linear-gradient(90deg, ${kind.color} 0 6px, transparent 6px 10px)`
        : kind.color;
      item.append(swatch, kind.name);
      item.addEventListener("click", () => {
        closeMenus();
        editor.startRun(kind.kind);
        markTool("run");
        showStatus(HINTS.run);
        renderPanel();
      });
      menu.append(item);
    }
  }
}

/** A small SVG of the plan symbol of a device type. */
function fixturePicture(type: string): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const fixture = newFixture(type, { x: 0, y: 0 }, 2.4);
  const symbol = fixtureSymbol(fixture);
  const all = [...symbol.shapes, ...symbol.lines, ...symbol.filled].flat();
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 0.2);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "symbol");
  svg.setAttribute("viewBox", `${cx - size * 0.6} ${cy - size * 0.6} ${size * 1.2} ${size * 1.2}`);
  const color = fixture.system === "electric" ? "#d9480f" : "#c92a2a";
  const add = (list: { x: number; y: number }[][], tag: string, fill: string) => {
    for (const points of list) {
      const element = document.createElementNS(ns, tag);
      element.setAttribute("points", points.map((p) => `${p.x},${p.y}`).join(" "));
      element.setAttribute("fill", fill);
      element.setAttribute("stroke", fill === color ? "none" : color);
      element.setAttribute("stroke-width", String(size * 0.06));
      svg.append(element);
    }
  };
  add(symbol.shapes, "polygon", "none");
  add(symbol.lines, "polyline", "none");
  add(symbol.filled, "polygon", color);
  return svg;
}

/** The color of a U-value: green for good insulation, yellow, and red for poor insulation. */
function uColor(u: number): string {
  if (u <= 0.25) return "#2f9e44";
  if (u <= 0.45) return "#f08c00";
  return "#e03131";
}

/**
 * The insulation layer of the 2D editor: each outer wall in the color of its U-value, and the
 * heat loss of each room under its label.
 */
function drawInsulation(group: SVGGElement, zoom: number): void {
  const ns = "http://www.w3.org/2000/svg";
  const story = doc.plan;
  for (const wall of story.walls) {
    if (!isOuterWall(story, wall)) continue;
    const [a, b] = wallEnds(story, wall);
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", String(a.x));
    line.setAttribute("y1", String(a.y));
    line.setAttribute("x2", String(b.x));
    line.setAttribute("y2", String(b.y));
    line.setAttribute("stroke", uColor(uValue(wallLayers(doc.building, wall), "wall")));
    line.setAttribute("stroke-width", String(wall.thickness * 0.6));
    line.setAttribute("class", "insulation-wall");
    group.append(line);
  }
  for (const room of findRooms(story)) {
    const loss = roomHeatLoss(doc.building, story, room);
    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", String(room.labelAt.x));
    text.setAttribute("y", String(room.labelAt.y + 30 / zoom));
    text.setAttribute("font-size", String(12 / zoom));
    text.setAttribute("stroke-width", String(3 / zoom));
    text.setAttribute("class", "heat-label");
    text.textContent = `${Math.round(loss.total)} W`;
    group.append(text);
  }
}

/** The credit of the map under the plan, and a hint if the map needs a location first. */
function updateMapCredit(): void {
  const credit = $<HTMLAnchorElement>("#map-credit");
  const source = editor.mapSource ? MAP_SOURCES[editor.mapSource] : null;
  const located = doc.building.location !== null;
  credit.hidden = !source || !located;
  if (source) {
    credit.textContent = source.credit;
    credit.href = source.creditUrl;
  }
  $("#map-note").classList.toggle("warning", !!source && !located);
}

/** The layers that the 2D editor and the 3D view show. */
function applyLayers(): void {
  for (const input of document.querySelectorAll<HTMLInputElement>("[data-layer]")) {
    const layer = input.dataset.layer as keyof typeof editor.layers;
    editor.layers[layer] = input.checked;
  }
  editor.setOverlay("insulation", editor.layers.insulation ? drawInsulation : null);
  editor.render();
  update3d();
  renderPanel();
}

// ----- Furniture -----

const catalog = new Catalog($("#catalog"), {
  building: () => doc.building,
  addModel: (model) => {
    if (doc.building.models.some((m) => m.id === model.id)) return;
    doc.editBuilding((b) => b.models.push(structuredClone(model)));
  },
  place: (template) => {
    // The drawer covers a part of the plan, so it closes while the user places the piece.
    catalog.close();
    editor.startPlacing(template);
    markTool("furniture");
    showStatus(HINTS.furniture);
    renderPanel();
  },
  status: (text, error) => showStatus(text, error),
  toggled: () => markTool(editor.tool),
});

editor.onPlace = (piece) => {
  // After one piece, the editor is back in the select tool, unless Shift kept the furniture tool.
  markTool(editor.tool);
  if (editor.tool === "select")
    showStatus(`Placed ${piece.name}. R turns it, and a drag moves it.`);
};

/** The images of the models from above, for the 2D editor. Each model renders once. */
const topViewsAsked = new Set<string>();
function loadTopViews(): void {
  for (const model of doc.building.models) {
    if (topViewsAsked.has(model.id)) continue;
    topViewsAsked.add(model.id);
    topView(model)
      .then((url) => editor.setTopView(model.id, url))
      .catch((error: unknown) => console.warn(`No top view of ${model.name}`, error));
  }
}

// ----- Files -----

function updateTitle(): void {
  document.title = `${doc.dirty ? "• " : ""}${fileName} – Grundriss`;
  $("#file-title").textContent = fileName;
  $("#file-name").classList.toggle("dirty", doc.dirty);
  $<HTMLButtonElement>("#undo").disabled = !doc.canUndo;
  $<HTMLButtonElement>("#redo").disabled = !doc.canRedo;
}

function confirmDiscard(): boolean {
  return !doc.dirty || confirm("The plan has unsaved changes. Discard them?");
}

function load(
  building: Building = emptyBuilding(),
  name = "plan.grundriss",
  handle: FileSystemFileHandle | null = null,
) {
  setSuggestions(null);
  // The points of a calibration belong to the old background.
  calibration = null;
  editor.clearCalibration();
  doc.replace(building);
  fileName = name;
  fileHandle = handle;
  editor.select(null);
  editor.fit();
  fit3d();
  updateTitle();
}

async function openFile(): Promise<void> {
  if (!confirmDiscard()) return;
  try {
    const file = await openPlanFile();
    if (!file) return;
    load(readBuildingFile(file.bytes), file.name, file.handle);
    showStatus(`Opened ${file.name}.`);
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function saveFile(saveAs: boolean): Promise<void> {
  try {
    const building = doc.building;
    const result = await savePlanFile(
      async (name) =>
        isPackageName(name)
          ? new Blob([writePackage(building, await exportsOf(building)) as BlobPart], {
              type: "application/zip",
            })
          : new Blob([serializeBuilding(building)], { type: "application/json" }),
      saveAs ? null : fileHandle,
      fileName,
    );
    if (!result) return;
    fileName = result.name;
    fileHandle = result.handle;
    doc.markSaved();
    showStatus(`Saved ${fileName}.`);
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), true);
  }
}

// ----- Export -----

type ExportFormat = keyof typeof EXPORT_TYPES;

/** The file of one export format. SVG is for the active story, the others for all stories. */
async function exportFile(building: Building, format: ExportFormat): Promise<Uint8Array | string> {
  const story = findStory(building, doc.activeStoryId) ?? building.stories[0];
  if (format === "svg") {
    return planToSvg(story, { ...storyExtras(building, story), background: false });
  }
  if (format === "pdf") return buildingToPdf(building);
  if (format === "dxf") return buildingToDxf(building);
  // The model has the whole building, also the stories that the 3D view hides now.
  return new Uint8Array(await exportGlb(await buildModelAsync(building)));
}

/** The exports that a package contains, so that other programs can use them at once. */
async function exportsOf(building: Building): Promise<Record<string, Uint8Array | string>> {
  return buildingExports(building, (await exportFile(building, "glb")) as Uint8Array);
}

const MIME: Record<ExportFormat, string> = {
  svg: "image/svg+xml",
  pdf: "application/pdf",
  dxf: "application/dxf",
  glb: "model/gltf-binary",
};

async function exportPlan(format: ExportFormat): Promise<void> {
  closeMenus();
  try {
    const data = await exportFile(doc.building, format);
    const base = fileName.replace(/\.[^.]+$/, "");
    const name = format === "svg" ? `${base}-${slug(doc.plan.name)}` : base;
    const blob = new Blob([data as BlobPart], { type: MIME[format] });
    const result = await saveBlob(blob, `${name}.${format}`, [EXPORT_TYPES[format]]);
    if (result) showStatus(`Exported ${result.name}.`);
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), true);
  }
}

// ----- Menus -----

function closeMenus(): void {
  for (const menu of document.querySelectorAll<HTMLElement>(".menu")) menu.hidden = true;
}

/** Opens the menu under the button, or closes it if it is open. */
function toggleMenu(
  button: HTMLElement,
  menu: HTMLElement,
  place: "below" | "above" = "below",
): void {
  const open = menu.hidden;
  closeMenus();
  menu.hidden = !open;
  if (!open) return;
  const rect = button.getBoundingClientRect();
  menu.style.top =
    place === "below" ? `${rect.bottom + 6}px` : `${rect.top - menu.offsetHeight - 6}px`;
  menu.style.left = `${Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8)}px`;
}

document.addEventListener("pointerdown", (e) => {
  const target = e.target as HTMLElement;
  if (!target.closest(".menu, [data-menu]")) closeMenus();
});

async function loadBackground(): Promise<void> {
  const file = await pickFile("image/*");
  if (!file) return;
  try {
    const image = await readImage(file);
    // Start with a width of 10 m. "Set scale" corrects it.
    const scale = 10 / image.width;
    doc.edit((plan) => {
      plan.background = {
        image: image.dataUrl,
        width: image.width,
        height: image.height,
        x: 0,
        y: 0,
        scale,
        opacity: 0.5,
      };
    });
    editor.fit();
    setTool("calibrate");
  } catch {
    showStatus("The browser cannot read this image.", true);
  }
}

// ----- Wiring -----

let shownStoryId = "";

/**
 * During a drag, the 3D view and the panel update at most once in this time, in milliseconds.
 * They are the slow parts of an update, and a slow computer cannot do them in each frame.
 */
const DRAG_INTERVAL = 120;
let frameRequested = false;
let slowPending = false;
let lastSlow = 0;
let slowTimer = 0;

/** The slow parts of an update: the 3D view and the panel. */
function updateSlow(): void {
  slowPending = false;
  lastSlow = performance.now();
  update3d();
  renderPanel();
}

/**
 * Runs the work after a change once in the next frame, also when the document changes more than
 * once in a frame. During a drag, the slow parts wait until DRAG_INTERVAL has passed since their
 * last run. After the drag, they run at once.
 */
function afterChange(): void {
  frameRequested = false;
  loadTopViews();
  updateTitle();
  renderStories();
  renderCompass();
  window.clearTimeout(slowTimer);
  const wait = DRAG_INTERVAL - (performance.now() - lastSlow);
  if (!doc.inTransaction || wait <= 0) updateSlow();
  else {
    slowPending = true;
    slowTimer = window.setTimeout(() => slowPending && updateSlow(), wait);
  }
  // A change of the active story shows the whole new story.
  if (doc.activeStoryId !== shownStoryId) {
    shownStoryId = doc.activeStoryId;
    editor.select(null);
  }
}

doc.subscribe(() => {
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(afterChange);
});
setupCompass();
$("#show-above").addEventListener("click", () => {
  showAbove = !showAbove;
  $("#show-above").classList.toggle("active", showAbove);
  update3d();
});
for (const element of document.querySelectorAll<HTMLButtonElement>("[data-add-story]")) {
  element.addEventListener("click", () =>
    addStory(element.dataset.addStory as "top" | "attic" | "cellar"),
  );
}
editor.onSelect = () => renderPanel();
editor.onCalibrate = (a, b) => {
  calibration = { a, b };
  renderPanel();
};

$("#new").addEventListener("click", () => confirmDiscard() && load());
$("#open").addEventListener("click", () => void openFile());
$("#save").addEventListener("click", () => void saveFile(false));
$("#save-as").addEventListener("click", () => void saveFile(true));
$("#undo").addEventListener("click", () => doc.undo());
$("#redo").addEventListener("click", () => doc.redo());
$("#background").addEventListener("click", () => void loadBackground());
buildServicesMenu();
$("#services").addEventListener("click", () => toggleMenu($("#services"), $("#services-menu")));
$("#layers-button").addEventListener("click", () =>
  toggleMenu($("#layers-button"), $("#layers-menu")),
);
for (const input of document.querySelectorAll<HTMLInputElement>("[data-layer]")) {
  input.addEventListener("change", applyLayers);
}
for (const input of document.querySelectorAll<HTMLInputElement>("input[name=map]")) {
  input.addEventListener("change", () => {
    editor.mapSource = (input.value || null) as MapSourceId | null;
    updateMapCredit();
    editor.render();
  });
}
editor.onRun = () => showStatus("Added the line. Draw the next line, or press Esc to stop.");
$("#furniture").addEventListener("click", () => catalog.toggle());
$("#export").addEventListener("click", () => toggleMenu($("#export"), $("#export-menu")));
for (const element of document.querySelectorAll<HTMLButtonElement>("[data-export]")) {
  element.addEventListener("click", () => void exportPlan(element.dataset.export as ExportFormat));
}
$("#empty-background").addEventListener("click", () => void loadBackground());
$("#empty-wall").addEventListener("click", () => setTool("wall"));
$("#empty-open").addEventListener("click", () => void openFile());
$("#empty-example").addEventListener("click", () => {
  if (!confirmDiscard()) return;
  load(makeHouse(), "example.grundriss");
  showStatus("Opened the example house. Save it to keep your changes.");
});
for (const element of document.querySelectorAll<HTMLButtonElement>("[data-fit]")) {
  element.addEventListener("click", () => {
    editor.fit();
    fit3d();
  });
}
for (const element of document.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
  element.addEventListener("click", () => setTool(element.dataset.tool as Tool));
}
for (const element of document.querySelectorAll<HTMLButtonElement>("[data-view]")) {
  element.addEventListener("click", () => setView(element.dataset.view as "2d" | "split" | "3d"));
}

const TOOL_KEYS: Record<string, Tool> = {
  v: "select",
  p: "pan",
  w: "wall",
  d: "door",
  n: "window",
  m: "dimension",
  s: "stair",
  h: "chimney",
  c: "calibrate",
};

const ARROWS: Record<string, Point> = {
  arrowleft: { x: -1, y: 0 },
  arrowright: { x: 1, y: 0 },
  arrowup: { x: 0, y: -1 },
  arrowdown: { x: 0, y: 1 },
};

window.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  if (target.matches("input, select, textarea")) return;
  const key = e.key.toLowerCase();
  if (e.ctrlKey || e.metaKey) {
    if (key === "z") e.shiftKey ? doc.redo() : doc.undo();
    else if (key === "y") doc.redo();
    else if (key === "s") void saveFile(e.shiftKey);
    else if (key === "o") void openFile();
    else if (key === "c") editor.copy();
    else if (key === "x") editor.cut();
    else if (key === "v") editor.paste();
    else if (key === "d") editor.duplicate();
    else if (key === "a") editor.selectAll();
    else return;
    e.preventDefault();
    return;
  }
  if (key === "enter" && editor.tool === "run") {
    editor.finishRun();
  } else if (key === "e") {
    toggleMenu($("#services"), $("#services-menu"));
  } else if (key === "i") {
    catalog.toggle();
  } else if (key === "r") {
    editor.rotate(e.shiftKey ? 15 : 90);
  } else if (key in ARROWS && editor.selection.length > 0) {
    // An arrow key moves the selection by 5 cm, or by 50 cm with Shift.
    const step = e.shiftKey ? 0.5 : 0.05;
    editor.nudge({ x: ARROWS[key].x * step, y: ARROWS[key].y * step });
  } else if (key in TOOL_KEYS) setTool(TOOL_KEYS[key]);
  else if (key === "escape") {
    closeMenus();
    if (editor.tool === "furniture") setTool("select");
    else if (catalog.isOpen) catalog.close();
    else if (editor.tool === "calibrate" && calibration) {
      // The editor drops the two points, so the panel drops the real length.
      calibration = null;
      renderPanel();
    }
    editor.cancel();
  } else if (key === "delete" || key === "backspace") editor.deleteSelection();
  else if (key === "f") {
    editor.fit();
    fit3d();
  } else return;
  e.preventDefault();
});

window.addEventListener("beforeunload", (e) => {
  if (doc.dirty) e.preventDefault();
});

setTool("select");
setView("split");
load();

// The dev server gives the document and the editor to the console, for tests by hand. The
// production build does not contain this code.
if (import.meta.env.DEV) {
  Object.assign(window, { grundriss: { doc, editor, view3d } });
}
