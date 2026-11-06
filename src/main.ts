import { Editor2D, type Tool } from "./editor/editor2d";
import { fillIcons, icon, type IconName } from "./icons";
import { exportGlb } from "./export/gltf";
import { planToDxf } from "./export/dxf";
import { planToPdf } from "./export/pdf";
import { planToSvg } from "./export/svg";
import {
  EXPORT_TYPES,
  openPlanFile,
  pickFile,
  readImage,
  saveBlob,
  savePlanFile,
} from "./io/files";
import { isPackageName, readPlanFile, writePackage } from "./io/package";
import { distance } from "./model/geometry";
import { serializePlan } from "./model/file";
import { PlanDocument } from "./model/history";
import {
  WALL_DEFAULTS,
  emptyPlan,
  findDimension,
  findOpening,
  findVertex,
  findWall,
  getVertex,
  removeOpening,
  removeVertex,
  removeWall,
  setWallLength,
  wallLength,
} from "./model/plan";
import { findRooms } from "./model/rooms";
import type { Opening, OpeningKind, Plan, Point } from "./model/types";
import { addWallSegments, toWorld, type WallSegment } from "./tracing/segments";
import { View3D } from "./view3d/view3d";
import "./style.css";

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
    "Click to select, Shift+click to add. Drag on the empty plan to select in a box. Drag a wall to move it: the next walls keep their angles (Shift: free). Pan: Space+drag or right drag.",
  wall: "Click to add corners. A click on a corner or a wall ends the chain. The direction snaps to 15°. Shift: 45° steps. Alt: free. Esc: stop.",
  door: "Click on a wall to put a door in it.",
  window: "Click on a wall to put a window in it.",
  dimension:
    "Click the two ends of the distance, then click where the dimension line goes. Shift: 45° steps. Alt: no grid.",
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
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
    button.classList.toggle("active", button.dataset.tool === tool);
  }
  showStatus(HINTS[tool]);
  renderPanel();
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

/** The suggested walls that wait for the user, or null if there are none. */
let suggestions: Suggestion[] | null = null;
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

function setSuggestions(list: Suggestion[] | null): void {
  suggestions = list;
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
      setSuggestions(suggestions);
    });
    group.append(element);
  }
}

function acceptSuggestions(): void {
  const accepted = (suggestions ?? []).filter((s) => s.accepted).map((s) => s.segment);
  let ids: string[] = [];
  doc.edit((plan) => {
    ids = addWallSegments(plan, accepted, { tolerance: 0.1, height: WALL_DEFAULTS.height });
  });
  setSuggestions(null);
  editor.select(ids.map((id) => ({ kind: "wall" as const, id })));
  showStatus(`Added ${ids.length} walls. Check them, and correct them where necessary.`);
}

function renderTracing(): boolean {
  if (busy) {
    heading("Assisted tracing", "wand");
    paragraph(busy, "busy");
    return true;
  }
  if (suggestions) {
    const accepted = suggestions.filter((s) => s.accepted).length;
    heading("Suggested walls", "sparkle");
    stats([
      [String(accepted), "accepted"],
      [String(suggestions.length - accepted), "rejected"],
    ]);
    paragraph("Click a suggested wall on the plan to reject it, or to accept it again.", "note");
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
  options: { kind?: "primary" | "danger"; icon?: IconName } = {},
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
  element.append(text);
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
    const count = (kind: string) => items.filter((i) => i.kind === kind).length;
    stats([
      [String(count("wall")), "walls"],
      [String(count("opening")), "openings"],
      [String(count("dimension")), "dimensions"],
      [String(count("vertex")), "corners"],
    ]);
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
    button("Suggest walls", suggestWalls, { kind: "primary", icon: "sparkle" });
  } else {
    paragraph("Load a scan or a photo of a plan as the background, and draw the walls on it.");
    button("Load background", () => void loadBackground(), { icon: "image" });
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
  plan = emptyPlan(),
  name = "plan.grundriss",
  handle: FileSystemFileHandle | null = null,
) {
  setSuggestions(null);
  doc.replace(plan);
  fileName = name;
  fileHandle = handle;
  editor.select(null);
  editor.fit();
  view3d.fit(plan);
  updateTitle();
}

async function openFile(): Promise<void> {
  if (!confirmDiscard()) return;
  try {
    const file = await openPlanFile();
    if (!file) return;
    load(readPlanFile(file.bytes), file.name, file.handle);
    showStatus(`Opened ${file.name}.`);
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function saveFile(saveAs: boolean): Promise<void> {
  try {
    const plan = doc.plan;
    const result = await savePlanFile(
      async (name) =>
        isPackageName(name)
          ? new Blob([writePackage(plan, await exportsOf(plan)) as BlobPart], {
              type: "application/zip",
            })
          : new Blob([serializePlan(plan)], { type: "application/json" }),
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

/** The file of one export format. */
async function exportFile(plan: Plan, format: ExportFormat): Promise<Uint8Array | string> {
  if (format === "svg") return planToSvg(plan, { background: false });
  if (format === "pdf") return planToPdf(plan);
  if (format === "dxf") return planToDxf(plan);
  // The 3D view shows the plan of the document, so its model is the model of `plan`.
  return new Uint8Array(await exportGlb(view3d.model));
}

/** The exports that a package contains, so that other programs can use them at once. */
async function exportsOf(plan: Plan): Promise<Record<string, Uint8Array | string>> {
  return {
    "plan.svg": await exportFile(plan, "svg"),
    "plan.pdf": await exportFile(plan, "pdf"),
    "plan.dxf": await exportFile(plan, "dxf"),
    "model.glb": await exportFile(plan, "glb"),
  };
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
    const data = await exportFile(doc.plan, format);
    const base = fileName.replace(/\.[^.]+$/, "");
    const blob = new Blob([data as BlobPart], { type: MIME[format] });
    const result = await saveBlob(blob, `${base}.${format}`, [EXPORT_TYPES[format]]);
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
function toggleMenu(button: HTMLElement, menu: HTMLElement): void {
  const open = menu.hidden;
  closeMenus();
  menu.hidden = !open;
  if (!open) return;
  const rect = button.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 6}px`;
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

doc.subscribe(() => {
  updateTitle();
  view3d.update(doc.plan);
  renderPanel();
});
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
$("#export").addEventListener("click", () => toggleMenu($("#export"), $("#export-menu")));
for (const element of document.querySelectorAll<HTMLButtonElement>("[data-export]")) {
  element.addEventListener("click", () => void exportPlan(element.dataset.export as ExportFormat));
}
$("#empty-background").addEventListener("click", () => void loadBackground());
$("#empty-wall").addEventListener("click", () => setTool("wall"));
for (const element of document.querySelectorAll<HTMLButtonElement>("[data-fit]")) {
  element.addEventListener("click", () => {
    editor.fit();
    view3d.fit(doc.plan);
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
  w: "wall",
  d: "door",
  n: "window",
  m: "dimension",
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
  if (key in ARROWS && editor.selection.length > 0) {
    // An arrow key moves the selection by 5 cm, or by 50 cm with Shift.
    const step = e.shiftKey ? 0.5 : 0.05;
    editor.nudge({ x: ARROWS[key].x * step, y: ARROWS[key].y * step });
  } else if (key in TOOL_KEYS) setTool(TOOL_KEYS[key]);
  else if (key === "escape") {
    closeMenus();
    editor.cancel();
  } else if (key === "delete" || key === "backspace") editor.deleteSelection();
  else if (key === "f") {
    editor.fit();
    view3d.fit(doc.plan);
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
