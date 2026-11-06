import { Editor2D, type Tool } from "./editor/editor2d";
import { fillIcons, icon, type IconName } from "./icons";
import { openPlanFile, pickFile, readImage, savePlanFile } from "./io/files";
import { distance } from "./model/geometry";
import { parsePlan, serializePlan } from "./model/file";
import { PlanDocument } from "./model/history";
import {
  emptyPlan,
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
import type { OpeningKind, Point } from "./model/types";
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

let fileName = "plan.json";
let fileHandle: FileSystemFileHandle | null = null;
let calibration: { a: Point; b: Point } | null = null;

const HINTS: Record<Tool, string> = {
  select:
    "Click to select. Drag a corner, a wall, or an opening to move it. Drag the empty plan to pan. Delete removes the selection.",
  wall: "Click to add corners. A click on a corner or a wall ends the chain. Shift: straight. Alt: no grid. Esc: stop.",
  door: "Click on a wall to put a door in it.",
  window: "Click on a wall to put a window in it.",
  calibrate: "Click two points on the background with a known distance between them.",
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

  const selection = editor.selection;
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

function load(plan = emptyPlan(), name = "plan.json", handle: FileSystemFileHandle | null = null) {
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
    load(parsePlan(file.text), file.name, file.handle);
    showStatus(`Opened ${file.name}.`);
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function saveFile(saveAs: boolean): Promise<void> {
  try {
    const result = await savePlanFile(
      serializePlan(doc.plan),
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
  c: "calibrate",
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
    else return;
    e.preventDefault();
    return;
  }
  if (key in TOOL_KEYS) setTool(TOOL_KEYS[key]);
  else if (key === "escape") editor.cancel();
  else if (key === "delete" || key === "backspace") editor.deleteSelection();
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
