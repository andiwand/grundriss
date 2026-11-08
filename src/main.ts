import { type Tool } from "./editor/editor2d";
import { CSV_DE, CSV_EN, takeoffZip } from "./export/csv";
import { buildingReport } from "./export/report";
import { currentLanguage, locale, setLanguage, t, translatePage } from "./i18n";
import { fmt } from "./model/format";
import { buildingTakeoff } from "./model/takeoff";
import { isCompact, selectionChanged, setupCompact, toolChanged, topicChanged } from "./ui/compact";
import { renderContents } from "./ui/contents";
import {
  $,
  app,
  doc,
  editor,
  HINTS,
  type LayerName,
  shell,
  showStatus,
  status,
  type Topic,
  type View,
  view3d,
} from "./ui/context";
import { placeMenu } from "./ui/panel";
import {
  confirmDiscard,
  load,
  newPlan,
  openExample,
  openFile,
  projectId,
  projectName,
  renderHome,
  scheduleAutosave,
  startProjects,
  storageOk,
  storeProject,
  updateTitle,
} from "./ui/projects";
import { renderPanel } from "./ui/selection";
import { showShortcuts } from "./ui/shortcuts";
import { backgroundElement, replaceBackground, tracing, work } from "./ui/tracing";
import { drawInsulation, openServicesMenu } from "./ui/utilities";

import { fillIcons, icon } from "./icons";

import { exportGlb } from "./export/gltf";

import { buildingExports } from "./export/building";

import { slug, storyExtras } from "./export/context";

import { buildingToDxf } from "./export/dxf";

import { buildingToPdf } from "./export/pdf";

import { planToSvg } from "./export/svg";

import { EXPORT_TYPES, pickFile, readImage, saveBlob, savePlanFile } from "./io/files";

import { isPackageName, readBuildingFile, writePackage } from "./io/package";

import { renameProject } from "./io/projects";

import { addCellar, addStoryOnTop, findStory } from "./model/building";

import { serializeBuilding } from "./model/file";

import type { Building, Point, ServiceSystem } from "./model/types";

import { Catalog } from "./ui/catalog";

import { topView } from "./view3d/models";

import { buildModelAsync } from "./view3d/view3d";

import { MAP_SOURCES, type MapSourceId } from "./io/tiles";

translatePage();
fillIcons();

const languageButton = $("#language");
// The button shows the code of the other language, and its title names it in full.
languageButton.append(currentLanguage() === "de" ? "EN" : "DE");
languageButton.title = currentLanguage() === "de" ? "Switch to English" : "Auf Deutsch umschalten";
languageButton.addEventListener("click", () =>
  setLanguage(currentLanguage() === "de" ? "en" : "de"),
);

// ----- Topics -----

/** The split view is not available on a phone, and in the topics with a wide panel. */
function updateSplitButton(): void {
  $<HTMLButtonElement>('[data-view="split"]').disabled =
    isCompact() || document.body.classList.contains("wide");
}

const SERVICE_LAYERS = { water: false, heating: false, electric: false, comms: false };

/**
 * The layers that each topic shows when the user opens it. The background is not in the list,
 * because the user sets it for all topics. A change in the Layers menu stays with the topic.
 */
const topicLayers: Record<Topic, Partial<Record<LayerName, boolean>>> = {
  overview: { ...SERVICE_LAYERS, pv: false, insulation: false },
  structure: { ...SERVICE_LAYERS, pv: false, insulation: false },
  utilities: {
    water: true,
    heating: true,
    electric: true,
    comms: true,
    pv: true,
    insulation: false,
  },
  interior: { ...SERVICE_LAYERS, pv: false, insulation: false },
  energy: { ...SERVICE_LAYERS, pv: true, insulation: true },
  renovation: { ...SERVICE_LAYERS, pv: true, insulation: true },
};

/** The topic of the tools that do not belong to all topics. */
const TOOL_TOPIC: Partial<Record<Tool, Topic>> = {
  calibrate: "structure",
  rectify: "structure",
  map: "energy",
  wall: "structure",
  door: "structure",
  window: "structure",
  stair: "structure",
  chimney: "structure",
  fixture: "utilities",
  run: "utilities",
  furniture: "interior",
};

const HOME_HINT = t("Click a plan to open it, or start a new plan.");

const OVERVIEW_HINT = t("Click a part of the plan to open it in its topic.");

/** Shows the home page. The open plan closes; it is already in the browser. */
function showHome(): void {
  if (app.planOpen && !confirmDiscard()) return;
  app.planOpen = false;
  closeMenus();
  if (catalog.isOpen) catalog.close();
  editor.cancel();
  document.body.classList.add("no-plan");
  $("#brand").title = "";
  $("#home").hidden = false;
  $("#area").hidden = true;
  $("#overview").hidden = true;
  document.title = "Grundriss";
  renderHome();
  showStatus(HOME_HINT);
}

/** Leaves the home page for the open plan, in the topic. */
function enterPlan(next: Topic): void {
  app.planOpen = true;
  document.body.classList.remove("no-plan");
  $("#brand").title = t(
    "Close the plan and show the projects. The plan is already saved in the browser.",
  );
  $("#home").hidden = true;
  if (status.textContent === HOME_HINT) showStatus(HINTS[editor.tool]);
  updateTitle();
  setTopic(next);
}

/**
 * Opens the topic: its tools, its layers, and its panel. The overview shows the contents of the
 * plan in place of the views.
 */
function setTopic(next: Topic): void {
  app.topic = next;
  const overview = next === "overview";
  // The overview hides the plan, so a key must not change a selection that nobody sees.
  if (overview) editor.select(null);
  $("#overview").hidden = !overview;
  $("#area").hidden = overview;
  document.body.classList.toggle("overview", overview);
  // The energy and the renovation have no split view: their wide panel takes the place of one
  // view.
  const wide = next === "energy" || next === "renovation";
  document.body.classList.toggle("wide", wide);
  updateSplitButton();
  if (wide && currentView === "split") {
    viewBeforeWide = "split";
    setView("2d");
  } else if (!wide && viewBeforeWide) {
    setView(viewBeforeWide);
    viewBeforeWide = null;
  }
  if (overview) {
    renderContents();
    showStatus(OVERVIEW_HINT);
  } else if (status.textContent === OVERVIEW_HINT) showStatus(HINTS[editor.tool]);
  if (!overview && app.fitPending) {
    app.fitPending = false;
    // The views get their size in the next frame.
    requestAnimationFrame(() => {
      editor.fit();
      fit3d();
    });
  }
  for (const element of document.querySelectorAll<HTMLButtonElement>("[data-topic-tab]")) {
    element.classList.toggle("active", element.dataset.topicTab === next);
  }
  for (const element of document.querySelectorAll<HTMLElement>("#tools [data-topic]")) {
    element.hidden = element.dataset.topic !== next;
  }
  // The divider after the tools of all topics shows only if the topic has its own tools.
  $("#tools .divider:not([data-topic])").hidden = !document.querySelector(
    `#tools [data-topic="${next}"]`,
  );
  for (const input of document.querySelectorAll<HTMLInputElement>("[data-layer]")) {
    const value = topicLayers[next][input.dataset.layer as LayerName];
    if (value !== undefined) input.checked = value;
  }
  closeMenus();
  if (next !== "interior" && catalog.isOpen) catalog.close();
  const owner = TOOL_TOPIC[editor.tool];
  if (owner && owner !== next) setTool("select");
  applyLayers();
  topicChanged();
}

function setTool(tool: Tool): void {
  // A tool of another topic, for example from a shortcut, opens its topic first.
  const owner = TOOL_TOPIC[tool];
  if (owner && owner !== app.topic) setTopic(owner);
  editor.tool = tool;
  app.calibration = null;
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
  toolChanged(tool);
}

let currentView: View = "split";

/** The view before a topic with a wide panel, if it changed the view, so that it comes back. */
let viewBeforeWide: View | null = null;

function setView(view: View): void {
  // A phone shows one view at a time.
  if (view === "split" && isCompact()) view = "2d";
  currentView = view;
  $("#area").className = `view-${view}`;
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-view]")) {
    button.classList.toggle("active", button.dataset.view === view);
  }
}

// ----- Assisted tracing -----

editor.onCorners = (corners) => {
  const background = doc.plan.background;
  if (!background) return;
  const pixels = corners.map((p) => ({
    x: (p.x - background.x) / background.scale,
    y: (p.y - background.y) / background.scale,
  })) as typeof corners;
  void work(t("Straightening the image…"), async () => {
    const { rectify } = await tracing();
    replaceBackground(await rectify(await backgroundElement(), pixels));
    editor.clearCalibration();
    editor.fit();
    setTool("calibrate");
    showStatus(t("The image is straight. Its size changed, so set the scale again."));
  });
};

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
    name.textContent = t(story.name);
    const level = document.createElement("small");
    const sign = story.elevation > 0 ? "+" : story.elevation < 0 ? "−" : "±";
    level.textContent = `${sign}${fmt(Math.abs(story.elevation), 2)}`;
    element.append(name, level);
    element.title = t("{name}: floor at {elevation} m", {
      name: t(story.name),
      elevation: fmt(story.elevation, 2),
    });
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
  add.append(t("Add story"));
  add.addEventListener("click", () => toggleMenu(add, $("#story-menu")));
  list.append(add);
}

function addStory(kind: "top" | "attic" | "cellar"): void {
  closeMenus();
  let id = "";
  doc.editBuilding((b) => {
    const story = kind === "cellar" ? addCellar(b) : addStoryOnTop(b, kind === "attic");
    // The model names the story in English; the plan keeps the name in the language of the app.
    story.name = t(story.name);
    id = story.id;
  });
  editor.select(null);
  doc.setActiveStory(id);
  showStatus(
    kind === "cellar"
      ? t("Added a cellar. The walls of the story above show as dashed lines.")
      : t("Added a story. The walls of the story below show as dashed lines."),
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
  const { water, heating, electric, comms, pv } = editor.layers;
  view3d.update(doc.building, {
    activeStoryId: doc.activeStoryId,
    showAbove,
    layers: { water, heating, electric, comms, pv },
  });
}

function fit3d(): void {
  // The views update in the next frame after a change, so the 3D view first takes the new
  // building. Else the fit uses the old content, for example after a new file opens.
  update3d();
  view3d.fit(doc.building);
}

// ----- The map -----

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
    const layer = input.dataset.layer as LayerName;
    editor.layers[layer] = input.checked;
    // The open topic keeps the choice of the user for the next time.
    if (layer in topicLayers[app.topic]) topicLayers[app.topic][layer] = input.checked;
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
    showStatus(t("Placed {name}. R turns it, and a drag moves it.", { name: t(piece.name) }));
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
      saveAs ? null : app.fileHandle,
      app.fileName,
    );
    if (!result) return;
    app.fileName = result.name;
    app.fileHandle = result.handle;
    doc.markSaved();
    // The project in the browser takes the name of the file.
    if (projectId) void renameProject(projectId, projectName());
    showStatus(t("Saved {name}.", { name: app.fileName }));
  } catch (error) {
    showStatus(t(error instanceof Error ? error.message : String(error)), true);
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
    const base = exportBase();
    const name = format === "svg" ? `${base}-${slug(doc.plan.name)}` : base;
    const blob = new Blob([data as BlobPart], { type: MIME[format] });
    const result = await saveBlob(blob, `${name}.${format}`, [EXPORT_TYPES[format]]);
    if (result) showStatus(t("Exported {name}.", { name: result.name }));
  } catch (error) {
    showStatus(t(error instanceof Error ? error.message : String(error)), true);
  }
}

/** The name of the open plan without its extension, for the names of the exports. */
const exportBase = () => app.fileName.replace(/\.[^.]+$/, "");

/** Saves the report as a PDF, or the quantities as CSV files in a ZIP file. */
async function exportReport(kind: "pdf" | "csv"): Promise<void> {
  closeMenus();
  try {
    if (kind === "pdf") {
      const bytes = buildingReport(doc.building, {
        title: t("Grundriss report"),
        name: exportBase(),
        date: new Date().toLocaleDateString(locale()),
        number: (value, digits = 1) => fmt(value, digits),
        t,
      });
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const file = t("{name} report.pdf", { name: exportBase() });
      const result = await saveBlob(blob, file, [EXPORT_TYPES.pdf]);
      if (result) showStatus(t("Exported {name}.", { name: result.name }));
    } else {
      // A German spreadsheet expects ";" between the cells and a decimal comma.
      const format = currentLanguage() === "de" ? CSV_DE : CSV_EN;
      const bytes = takeoffZip(buildingTakeoff(doc.building), format, (text) => t(text));
      const blob = new Blob([bytes as BlobPart], { type: "application/zip" });
      const file = t("{name} quantities.zip", { name: exportBase() });
      const result = await saveBlob(blob, file, [
        { description: t("ZIP archive"), accept: { "application/zip": [".zip"] } },
      ]);
      if (result) showStatus(t("Exported {name}.", { name: result.name }));
    }
  } catch (error) {
    showStatus(t(error instanceof Error ? error.message : String(error)), true);
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
  if (open) placeMenu(menu, button);
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
    if (image.reduced) {
      showStatus(
        t(
          "The image is now {width} × {height} pixels, so that the plan stays fast. Click two points with a known distance.",
          { width: image.width, height: image.height },
        ),
      );
    }
  } catch {
    showStatus(t("The browser cannot read this image."), true);
  }
}

// ----- Wiring -----

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
  // The tree of the overview shows the plan of now, for example after an undo.
  if (app.topic === "overview" && app.planOpen) renderContents();
  window.clearTimeout(slowTimer);
  const wait = DRAG_INTERVAL - (performance.now() - lastSlow);
  if (!doc.inTransaction || wait <= 0) updateSlow();
  else {
    slowPending = true;
    slowTimer = window.setTimeout(() => slowPending && updateSlow(), wait);
  }
  // A change of the active story shows the whole new story.
  if (doc.activeStoryId !== app.shownStoryId) {
    app.shownStoryId = doc.activeStoryId;
    editor.select(null);
  }
}

// The modules of the panel reach the shell through these hooks.
Object.assign(shell, {
  setTool,
  setTopic,
  markTool,
  closeMenus,
  loadBackground,
  setMapSource,
  updateMapCredit,
  fit3d,
  enterPlan,
  catalog,
  renderPanel,
});

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

editor.onSelect = () => {
  renderPanel();
  selectionChanged();
};

setupCompact({
  onCompact: () => {
    updateSplitButton();
    if (isCompact() && currentView === "split") setView("2d");
  },
  done: () => {
    if (editor.tool === "run") editor.finishRun();
    editor.cancel();
    setTool("select");
  },
});

// The "More" menu of a phone: the files, the layers, the export, and the help.
$("#more-button").addEventListener("click", () => toggleMenu($("#more-button"), $("#more-menu")));
const MORE: Record<string, () => void> = {
  new: newPlan,
  open: () => void openFile(),
  save: () => void saveFile(false),
  "save-as": () => void saveFile(true),
  layers: () => toggleMenu($("#more-button"), $("#layers-menu")),
  export: () => toggleMenu($("#more-button"), $("#export-menu")),
  help: showShortcuts,
};
for (const element of document.querySelectorAll<HTMLButtonElement>("[data-more]")) {
  element.addEventListener("click", () => {
    closeMenus();
    MORE[element.dataset.more!]();
  });
}

editor.onCalibrate = (a, b) => {
  app.calibration = { a, b };
  renderPanel();
};

$("#new").addEventListener("click", newPlan);

$("#open").addEventListener("click", () => void openFile());

$("#save").addEventListener("click", () => void saveFile(false));

$("#save-as").addEventListener("click", () => void saveFile(true));

$("#undo").addEventListener("click", () => doc.undo());

$("#redo").addEventListener("click", () => doc.redo());

$("#background").addEventListener("click", () => void loadBackground());

for (const element of document.querySelectorAll<HTMLButtonElement>("[data-system]")) {
  element.addEventListener("click", () =>
    openServicesMenu(element.dataset.system as ServiceSystem, element),
  );
}

for (const element of document.querySelectorAll<HTMLButtonElement>("[data-topic-tab]")) {
  element.addEventListener("click", () => setTopic(element.dataset.topicTab as Topic));
}

$("#brand").addEventListener("click", () => app.planOpen && showHome());

$("#layers-button").addEventListener("click", () =>
  toggleMenu($("#layers-button"), $("#layers-menu")),
);

for (const input of document.querySelectorAll<HTMLInputElement>("[data-layer]")) {
  input.addEventListener("change", applyLayers);
}

/** Shows the map of the source under the plan, or no map, and marks it in the Layers menu. */
function setMapSource(source: MapSourceId | null): void {
  editor.mapSource = source;
  for (const input of document.querySelectorAll<HTMLInputElement>("input[name=map]")) {
    input.checked = input.value === (source ?? "");
  }
  updateMapCredit();
  editor.render();
}

for (const input of document.querySelectorAll<HTMLInputElement>("input[name=map]")) {
  input.addEventListener("change", () => setMapSource((input.value || null) as MapSourceId | null));
}

editor.onRun = () => showStatus(t("Added the line. Draw the next line, or press Esc to stop."));

$("#furniture").addEventListener("click", () => catalog.toggle());

$("#export").addEventListener("click", () => toggleMenu($("#export"), $("#export-menu")));

for (const element of document.querySelectorAll<HTMLButtonElement>("[data-report]")) {
  element.addEventListener(
    "click",
    () => void exportReport(element.dataset.report as "pdf" | "csv"),
  );
}
for (const element of document.querySelectorAll<HTMLButtonElement>("[data-export]")) {
  element.addEventListener("click", () => void exportPlan(element.dataset.export as ExportFormat));
}

$("#empty-background").addEventListener("click", () => void loadBackground());

$("#empty-wall").addEventListener("click", () => setTool("wall"));

$("#empty-open").addEventListener("click", () => void openFile());

$("#empty-example").addEventListener("click", openExample);

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

/** The fields where the keys type text, so the shortcuts do nothing there. */
const TYPING =
  "input:not([type=checkbox], [type=radio], [type=range], [type=color]), select, textarea";

window.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  const key = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  // Save and open work in a field too, so that the browser does not save the page.
  if (mod && (key === "s" || key === "o") && app.planOpen && target.matches(TYPING)) {
    e.preventDefault();
    if (key === "s") void saveFile(e.shiftKey);
    else void openFile();
    return;
  }
  // The keys do nothing in a field and behind a dialog, for example the help of the shortcuts.
  if (target.matches(TYPING) || document.querySelector("dialog[open]")) return;
  if (e.key === "?") {
    e.preventDefault();
    showShortcuts();
    return;
  }
  // Without an open plan, only Ctrl+O works: it opens a file.
  if (!app.planOpen) {
    if ((e.ctrlKey || e.metaKey) && key === "o") {
      e.preventDefault();
      void openFile();
    }
    return;
  }
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
    setTopic("utilities");
    openServicesMenu("electric", $<HTMLButtonElement>('[data-system="electric"]'));
  } else if (key === "i") {
    if (!catalog.isOpen) setTopic("interior");
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
    if (editor.tool === "furniture" || editor.tool === "map") setTool("select");
    else if (catalog.isOpen) catalog.close();
    else if (editor.tool === "calibrate" && app.calibration) {
      // The editor drops the two points, so the panel drops the real length.
      app.calibration = null;
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
  // With the storage, the plan is in the browser: the last change saves now.
  if (storageOk) void storeProject();
  else if (doc.dirty) e.preventDefault();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") void storeProject();
});

doc.subscribe(scheduleAutosave);

void startProjects();

// ----- Installed app -----

/** The prompt of the browser to install the app, while the browser offers it. */
let installPrompt: (Event & { prompt(): Promise<void> }) | null = null;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event as typeof installPrompt;
  $("#install").hidden = false;
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  $("#install").hidden = true;
  showStatus(t("Installed Grundriss. It opens from your apps, also without the internet."));
});

$("#install").addEventListener("click", () => {
  void installPrompt?.prompt();
});

// The installed app opens the .grundriss and .json files that the user opens with it.
interface LaunchParams {
  files: FileSystemFileHandle[];
}

const launchQueue = (
  window as { launchQueue?: { setConsumer(f: (p: LaunchParams) => void): void } }
).launchQueue;

launchQueue?.setConsumer(async ({ files }) => {
  const handle = files[0];
  if (!handle || !confirmDiscard()) return;
  try {
    const file = await handle.getFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    load(readBuildingFile(bytes), file.name, handle, "from-file");
    showStatus(t("Opened {name}.", { name: file.name }));
    enterPlan("structure");
  } catch (error) {
    showStatus(t(error instanceof Error ? error.message : String(error)), true);
  }
});

// The service worker keeps the app in the cache, so it starts without the internet. The dev
// server has no service worker, because it would keep old code.

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController)
      showStatus(t("A new version of Grundriss is ready. Reload the page to use it."));
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Without the service worker, the app works as a normal web page.
    });
  });
}

setTool("select");

setView("split");

load();

showHome();

// The dev server gives the document and the editor to the console, for tests by hand. The
// production build does not contain this code.

if (import.meta.env.DEV) {
  Object.assign(window, { grundriss: { doc, editor, view3d } });
}
