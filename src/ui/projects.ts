import { storyExtras } from "../export/context";
import { planToSvg } from "../export/svg";
import { locale, t } from "../i18n";
import { icon, type IconName } from "../icons";
import { makeBackup, readBackup } from "../io/backup";
import { openPlanFile, pickFile, saveBlob } from "../io/files";
import { readBuildingFile } from "../io/package";
import {
  allProjects,
  deleteProject,
  emptyOldTrash,
  keepProjects,
  listDeleted,
  listProjects,
  loadProject,
  newProjectId,
  projectsAvailable,
  projectsKept,
  purgeProject,
  renameProject,
  restoreProject,
  saveProject,
  storageBlocked,
  storageUse,
  TRASH_DAYS,
  type ProjectInfo,
} from "../io/projects";
import { emptyBuilding } from "../model/building";
import { makeHouse } from "../model/example";
import { parseBuilding, serializeBuilding } from "../model/file";
import type { Building } from "../model/types";
import { $, app, doc, editor, shell, showStatus } from "./context";
import { resetLocation } from "./energy";
import { iconButton } from "./panel";
import { setSuggestions } from "./tracing";

/** The message of an error in the language of the app. A static message of the model or of the
 * I/O modules has a translation, because the English message is the key. */
const errorText = (error: unknown): string =>
  error instanceof Error ? t(error.message) : String(error);

export function updateTitle(): void {
  if (!app.planOpen) return;
  document.title = `${doc.dirty ? "• " : ""}${app.fileName} – Grundriss`;
  $("#file-title").textContent = app.fileName;
  $("#file-name").classList.toggle("dirty", doc.dirty);
  $<HTMLButtonElement>("#undo").disabled = !doc.canUndo;
  $<HTMLButtonElement>("#redo").disabled = !doc.canRedo;
}

/** True if the browser can store projects. Until the check ends, the app assumes it cannot. */
export let storageOk = false;

/** The project of the open plan in the browser, or null before its first save. */
export let projectId: string | null = null;

let projectCreated = 0;

/** The building of the last save to the browser. A save happens only for a new building. */
let storedBuilding: Building | null = null;

let autosaveTimer = 0;

/** True if the last save to the browser failed. The app then shows the error only one time. */
let saveFailed = false;
/** True after the warning about the full storage, so that it shows only one time. */
let storageWarned = false;
/** The part of the storage that gives a warning. */
const STORAGE_WARNING = 0.8;

/** The function that gives back the lock of the open project, or null. */
let releaseLock: (() => void) | null = null;
/**
 * True if another tab has the open project. This tab then does not save it to the browser, so
 * that the two tabs do not write over each other.
 */
let readOnly = false;
/** The number of the last lock request. An older request gives its lock back at once. */
let lockToken = 0;

/**
 * Takes the lock of the project in the browser (Web Locks). If another tab has the lock, this
 * tab does not save the project. The lock stays until the tab opens another project or closes.
 */
async function lockProject(id: string | null): Promise<void> {
  releaseLock?.();
  releaseLock = null;
  readOnly = false;
  const token = ++lockToken;
  if (!id || typeof navigator === "undefined" || !navigator.locks) return;
  await new Promise<void>((resolve) => {
    void navigator.locks.request(`grundriss-project-${id}`, { ifAvailable: true }, (lock) => {
      resolve();
      // The answer of an older request changes nothing, and it gives its lock back at once.
      if (token !== lockToken) return;
      if (!lock) {
        readOnly = true;
        return;
      }
      return new Promise<void>((release) => (releaseLock = release));
    });
  });
  if (readOnly && id === projectId) {
    showStatus(
      t(
        "This plan is open in another tab, so this tab does not save it in the browser. Close the other tab, or save a copy to a file.",
      ),
      true,
    );
  }
}

/** Shows a warning one time if the storage of the site is almost full. */
async function checkStorage(): Promise<void> {
  if (storageWarned) return;
  const use = await storageShare();
  if (use === null || use < STORAGE_WARNING) return;
  storageWarned = true;
  showStatus(
    t(
      "The storage of the browser is {percent} % full. Back up the projects on the Projects page, and delete old ones.",
      { percent: Math.round(use * 100) },
    ),
    true,
  );
}

/** The time from a change to the save, in milliseconds. */
const AUTOSAVE_DELAY = 800;

export const projectName = () => app.fileName.replace(/\.(grundriss|json)$/i, "") || "Plan";

/** Saves the open plan to the browser soon, if it changed since the last save. */
export function scheduleAutosave(): void {
  if (!storageOk || doc.inTransaction || doc.building === storedBuilding) return;
  window.clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => void storeProject(), AUTOSAVE_DELAY);
}

/**
 * Saves the open plan to the browser now. The function reads the plan before its first await, so
 * a load of another plan right after it does not change what it saves.
 */
export async function storeProject(): Promise<void> {
  window.clearTimeout(autosaveTimer);
  const building = doc.building;
  if (!storageOk || readOnly || building === storedBuilding) return;
  if (!projectId) {
    projectId = newProjectId();
    projectCreated = Date.now();
    void keepProjects();
    void lockProject(projectId);
  }
  const id = projectId;
  storedBuilding = building;
  try {
    await saveProject({
      id,
      name: projectName(),
      created: projectCreated,
      updated: Date.now(),
      preview: projectPreview(building),
      data: serializeBuilding(building),
    });
    saveFailed = false;
    void checkStorage();
  } catch (error) {
    // The next change tries again. The error shows only one time, not after each change.
    if (storedBuilding === building) storedBuilding = null;
    if (!saveFailed) {
      showStatus(
        t(
          "The browser did not save the project: {error}. Save it to a file, and back up the projects on the Projects page.",
          { error: errorText(error) },
        ),
        true,
      );
    }
    saveFailed = true;
  }
  if (!app.planOpen) renderHome();
}

/** A small SVG of the ground floor, without the background image, for the list of projects. */
function projectPreview(building: Building): string {
  const story = building.stories.find((s) => s.elevation >= -1e-6) ?? building.stories[0];
  if (story.walls.length === 0) return "";
  try {
    return planToSvg(story, { ...storyExtras(building, story), background: false });
  } catch {
    return "";
  }
}

/**
 * True if the open plan can go away. With the storage, the plan is in the browser, so the app
 * saves it and asks nothing. Without the storage, the user confirms the loss of the changes.
 */
export function confirmDiscard(): boolean {
  // The browser has the plan, unless this tab does not save it or the last save failed.
  if (storageOk && !readOnly && !saveFailed) {
    void storeProject();
    return true;
  }
  return !doc.dirty || confirm(t("The plan has unsaved changes. Discard them?"));
}

/**
 * Opens a plan. `project` is the project of the plan in the browser. Without it, the plan is new:
 * a plan from a file goes to the browser at once, and a new or an example plan after its first
 * change.
 */
export function load(
  building: Building = emptyBuilding(),
  name = "plan.grundriss",
  handle: FileSystemFileHandle | null = null,
  project: { id: string; created: number } | "from-file" | null = null,
) {
  setSuggestions(null);
  // The search of a place and a download of the climate belong to the old plan.
  resetLocation();
  // The points of a calibration belong to the old background.
  app.calibration = null;
  editor.clearCalibration();
  doc.replace(building);
  app.fileName = name;
  app.fileHandle = handle;
  projectId = project && project !== "from-file" ? project.id : null;
  projectCreated = project && project !== "from-file" ? project.created : 0;
  storedBuilding = project === "from-file" ? null : doc.building;
  void lockProject(projectId);
  editor.select(null);
  if (!app.planOpen || app.topic === "overview") app.fitPending = true;
  else {
    editor.fit();
    shell.fit3d();
  }
  updateTitle();
  if (project === "from-file") void storeProject();
}

export async function openFile(): Promise<void> {
  if (!confirmDiscard()) return;
  try {
    const file = await openPlanFile();
    if (!file) return;
    load(readBuildingFile(file.bytes), file.name, file.handle, "from-file");
    showStatus(t("Opened {name}.", { name: file.name }));
    shell.enterPlan("structure");
  } catch (error) {
    showStatus(errorText(error), true);
  }
}

async function openProject(id: string): Promise<void> {
  if (id === projectId) return shell.enterPlan("structure");
  if (!confirmDiscard()) return;
  try {
    const project = await loadProject(id);
    if (!project) throw new Error("The project is not in the browser any more.");
    load(parseBuilding(project.data), `${project.name}.grundriss`, null, project);
    showStatus(t("Opened {name}.", { name: project.name }));
    shell.enterPlan("structure");
  } catch (error) {
    showStatus(errorText(error), true);
    renderHome();
  }
}

/**
 * The names that the model gives a new plan, in the language of the app: the stories, the rooms,
 * and the roofs. The plan keeps the names as text, so they stay in this language.
 */
function localize(building: Building): Building {
  for (const story of building.stories) {
    story.name = t(story.name);
    for (const room of story.rooms) {
      // A room name has its own key, because a word like "Living" has other meanings too.
      const key = `room ${room.name}`;
      if (room.name && t(key) !== key) room.name = t(key);
    }
  }
  for (const roof of building.roofs) roof.name = t(roof.name);
  return building;
}

export function newPlan(): void {
  if (!confirmDiscard()) return;
  load(localize(emptyBuilding()));
  shell.enterPlan("structure");
}

export function openExample(): void {
  if (!confirmDiscard()) return;
  load(localize(makeHouse()), `${t("Example house")}.grundriss`);
  showStatus(t("Opened the example house. A change saves it as a project in the browser."));
  shell.enterPlan("structure");
}

const relativeTime = new Intl.RelativeTimeFormat(locale(), { numeric: "auto" });

/** "5 minutes ago", "yesterday", or "3 weeks ago". */
function ago(time: number): string {
  const seconds = (time - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relativeTime.format(Math.round(seconds / size), unit);
  }
  return t("just now");
}

let homeRequest = 0;

/** The home page: the tiles to start a plan, the plans in the browser, and the examples. */
export function renderHome(): void {
  const note = $("#projects-note");
  if (!storageOk && storageBlocked()) {
    note.textContent = t(
      "Another tab with an older version of Grundriss blocks the storage. Close it, and load this page again.",
    );
    note.classList.add("warning");
    fillProjects(null);
    return;
  }
  if (!storageOk) {
    note.textContent = t(
      "This browser does not store projects, for example in a private window. Save the plan to a file to keep it.",
    );
    note.classList.add("warning");
    fillProjects(null);
    return;
  }
  note.classList.remove("warning");
  note.textContent = t(
    "Draw a house or trace a scan, see it in 3D, and check its energy and a renovation. Your plans stay in this browser and save themselves after each change.",
  );
  // A newer call wins, so that a slow list does not replace a newer one.
  const request = ++homeRequest;
  void listProjects().then(
    (projects) => request === homeRequest && fillProjects(projects),
    (error) => {
      if (request !== homeRequest) return;
      note.textContent = t("The browser cannot read the projects: {error}", {
        error: errorText(error),
      });
      note.classList.add("warning");
    },
  );
}

/**
 * A warning about the storage, or "": the browser can delete the projects (Safari after 7 days
 * without a visit, unless the app is installed), or the storage is almost full.
 */
async function storageNote(): Promise<string[]> {
  const lines: string[] = [];
  const installed = window.matchMedia?.("(display-mode: standalone)").matches;
  if (!installed && !(await projectsKept())) {
    lines.push(t("The browser can delete these plans after a long time without a visit."));
    lines.push(t("Install the app, or back up the plans."));
  }
  const use = await storageShare();
  if (use !== null && use >= STORAGE_WARNING) {
    lines.push(t("The storage is {percent} % full.", { percent: Math.round(use * 100) }));
  }
  return lines;
}

/** Saves all projects of the browser as one ZIP file. */
async function backUpProjects(): Promise<void> {
  try {
    const projects = await allProjects();
    if (projects.length === 0) return showStatus(t("There are no projects to back up."));
    const date = new Date().toISOString().slice(0, 10);
    const bytes = makeBackup(projects);
    await saveBlob(
      new Blob([bytes as BlobPart], { type: "application/zip" }),
      t("Grundriss backup {date}.zip", { date }),
      [{ description: t("ZIP archive"), accept: { "application/zip": [".zip"] } }],
    );
    showStatus(t("Backed up {count} projects.", { count: projects.length }));
  } catch (error) {
    showStatus(errorText(error), true);
  }
}

/**
 * Reads a backup into the browser. A project that is already in the browser stays, unless the
 * backup has a newer version of it.
 */
async function restoreProjects(): Promise<void> {
  const file = await pickFile(".zip,application/zip");
  if (!file) return;
  try {
    const projects = readBackup(new Uint8Array(await file.arrayBuffer()));
    // The projects in the trash count too, so that a backup does not replace a newer one there.
    const known = new Map(
      [...(await listProjects()), ...(await listDeleted())].map((p) => [p.id, p]),
    );
    let count = 0;
    for (const project of projects) {
      const old = known.get(project.id);
      // The open project stays, so that its next save does not replace the restored plan.
      if ((old && old.updated >= project.updated) || project.id === projectId) continue;
      // A damaged plan does not go into the browser.
      try {
        parseBuilding(project.data);
      } catch {
        continue;
      }
      await saveProject(project);
      count++;
    }
    showStatus(
      count === projects.length
        ? t("Restored {count} projects.", { count })
        : t(
            "Restored {count} of {total} projects. The others are newer in the browser, open now, or damaged.",
            {
              count,
              total: projects.length,
            },
          ),
    );
    renderHome();
  } catch (error) {
    showStatus(errorText(error), true);
  }
}

/** A tile of the home page that starts an action: an icon, a title, and a line of detail. */
function actionTile(iconName: IconName, title: string, detail: string, run: () => void) {
  const tile = document.createElement("button");
  tile.className = "project project-start";
  const picture = document.createElement("span");
  picture.className = "project-picture";
  picture.innerHTML = icon(iconName);
  const text = document.createElement("span");
  text.className = "project-text";
  const name = document.createElement("strong");
  name.textContent = title;
  const small = document.createElement("small");
  small.textContent = detail;
  text.append(name, small);
  tile.append(picture, text);
  tile.addEventListener("click", run);
  return tile;
}

/** The part of the storage of the site that is in use, from 0 to 1, or null. */
async function storageShare(): Promise<number | null> {
  const use = await storageUse();
  return use ? use.usage / use.quota : null;
}

/**
 * Fills the home page in one column: the tiles to start (a new plan, a file, the example house),
 * the plans in the browser, and the links to the backup and the trash. Without the storage
 * (`projects` is null), only the tiles to start show.
 */
function fillProjects(projects: ProjectInfo[] | null): void {
  const list = $("#project-list");
  list.replaceChildren();
  const start = document.createElement("div");
  start.className = "project-grid start-row";
  start.append(
    actionTile("plus", t("New plan"), t("Draw the walls, or trace a scan or a photo."), newPlan),
    actionTile("open", t("Open a file"), t("A .grundriss or a .json file."), () => void openFile()),
    actionTile(
      "roof",
      t("Example house"),
      t("A house with two stories, a roof, PV, and utilities. A change saves a copy."),
      openExample,
    ),
  );
  list.append(start);
  if (!projects) return;

  const mine = document.createElement("section");
  mine.className = "project-section";
  const heading = document.createElement("h3");
  heading.textContent = t("Your plans");
  mine.append(heading);
  // The warning about the storage goes under the title of the plans, one line for each point.
  void storageNote().then((lines) => {
    if (lines.length === 0 || !mine.isConnected) return;
    const warning = document.createElement("p");
    warning.className = "project-warning";
    lines.forEach((line, i) => {
      if (i > 0) warning.append(document.createElement("br"));
      warning.append(line);
    });
    heading.after(warning);
  });
  if (projects.length === 0) {
    const empty = document.createElement("p");
    empty.className = "project-empty";
    empty.textContent = t(
      "No plans yet. A plan that you start or open shows here, and each change saves it.",
    );
    mine.append(empty);
  } else {
    const grid = document.createElement("div");
    grid.className = "project-grid";
    grid.append(...projects.map(projectCard));
    mine.append(grid);
  }
  list.append(mine);

  // The backup and the trash are less frequent, so they are links at the end.
  const links = document.createElement("nav");
  links.className = "home-links";
  const link = (iconName: IconName, text: string, run: () => void) => {
    const element = document.createElement("button");
    element.className = "link";
    element.innerHTML = icon(iconName);
    element.append(text);
    element.addEventListener("click", run);
    links.append(element);
    return element;
  };
  link("save", t("Back up all projects"), () => void backUpProjects());
  link("upload", t("Restore a backup"), () => void restoreProjects());
  list.append(links);
  void listDeleted().then((deleted) => {
    if (deleted.length === 0 || !links.isConnected) return;
    const trash = document.createElement("section");
    trash.className = "trash-row";
    trash.hidden = true;
    for (const project of deleted) trash.append(trashItem(project));
    link("trash", t("Trash · {count}", { count: deleted.length }), () => {
      trash.hidden = !trash.hidden;
    });
    links.after(trash);
  });
}

/** The tile of a project in the browser: its picture, its name, its time, and its tools. */
function projectCard(project: ProjectInfo): HTMLElement {
  const card = document.createElement("article");
  card.className = "project";
  const open = document.createElement("button");
  open.className = "project-open";
  open.title = t("Open {name}", { name: project.name });
  const picture = document.createElement("div");
  picture.className = "project-picture";
  if (project.preview) {
    const image = document.createElement("img");
    image.alt = "";
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(project.preview)}`;
    picture.append(image);
  } else {
    picture.innerHTML = icon("view2d");
  }
  const text = document.createElement("span");
  text.className = "project-text";
  const name = document.createElement("strong");
  name.textContent = project.name;
  const time = document.createElement("small");
  time.textContent = t("Changed {time}", { time: ago(project.updated) });
  text.append(name, time);
  open.append(picture, text);
  open.addEventListener("click", () => void openProject(project.id));
  const tools = document.createElement("div");
  tools.className = "project-tools";
  const tool = (iconName: IconName, title: string, action: () => void, danger = false) =>
    tools.append(
      iconButton(iconName, title, action, { danger, label: `${title}: ${project.name}` }),
    );
  tool("rename", t("Rename"), () => renameInPlace(card, project));
  tool("copy", t("Duplicate"), () => void duplicateProject(project.id));
  tool("trash", t("Delete"), () => void trashProject(project), true);
  card.append(open, tools);
  return card;
}

/** Moves the project to the trash. The open plan stays, and its next change saves it again. */
async function trashProject(project: ProjectInfo): Promise<void> {
  await deleteProject(project.id);
  if (project.id === projectId) {
    projectId = null;
    storedBuilding = doc.building;
    void lockProject(null);
  }
  showStatus(
    t("Moved {name} to the trash. It stays there for {days} days.", {
      name: project.name,
      days: TRASH_DAYS,
    }),
  );
  renderHome();
}

/** A project in the trash, with the buttons to restore it and to delete it for good. */
function trashItem(project: ProjectInfo): HTMLElement {
  const item = document.createElement("div");
  item.className = "trash-item";
  const name = document.createElement("span");
  name.textContent = project.name;
  const restore = document.createElement("button");
  restore.textContent = t("Restore");
  restore.addEventListener("click", () => void restoreProject(project.id).then(renderHome));
  const remove = document.createElement("button");
  remove.className = "danger";
  remove.textContent = t("Delete for good");
  remove.addEventListener("click", () => {
    if (!confirm(t('Delete "{name}" for good? This cannot be undone.', { name: project.name }))) {
      return;
    }
    void purgeProject(project.id).then(renderHome);
  });
  item.append(name, restore, remove);
  return item;
}

/** Puts a text field in place of the name of the project. Enter or a blur keeps the new name. */
function renameInPlace(card: HTMLElement, project: ProjectInfo): void {
  const name = card.querySelector("strong")!;
  const input = document.createElement("input");
  input.className = "project-name";
  input.value = project.name;
  input.setAttribute("aria-label", t("Name of the project"));
  let done = false;
  const finish = (keep: boolean) => {
    if (done) return;
    done = true;
    const value = input.value.trim();
    if (!keep || !value || value === project.name) return renderHome();
    if (project.id === projectId) {
      const extension = /\.json$/i.test(app.fileName) ? ".json" : ".grundriss";
      app.fileName = `${value}${extension}`;
      updateTitle();
    }
    void renameProject(project.id, value).then(renderHome);
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") finish(true);
    if (event.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));
  // The click on the card opens the project, so the field stops it.
  input.addEventListener("click", (event) => event.stopPropagation());
  name.replaceWith(input);
  input.focus();
  input.select();
}

async function duplicateProject(id: string): Promise<void> {
  const project = await loadProject(id);
  if (!project) return;
  const now = Date.now();
  await saveProject({
    ...project,
    id: newProjectId(),
    name: t("{name} (copy)", { name: project.name }),
    created: now,
    updated: now,
  });
  renderHome();
}

/** Checks the store of the projects, and shows the projects if no plan is open. */
export async function startProjects(): Promise<void> {
  storageOk = await projectsAvailable();
  if (storageOk) await emptyOldTrash().catch(() => undefined);
  if (!app.planOpen) renderHome();
}
