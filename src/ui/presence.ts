// The other people who have the open plan of a server open. Each tab sends its state to the
// server: the story, the topic, the view, the cursor, the selection, the part of the plan that it
// shows, and the camera of the 3D view. The top bar shows a mark for each person, and the 2D
// view shows their cursors and selections on the same story. A click on a mark follows that
// person: the views show what the person sees, for example while the person explains the plan on
// the phone. A pan, a zoom, or a click in a view stops it. A person who can edit can also
// only view the plan, so that a click does not change it.

import { t } from "../i18n";
import { icon } from "../icons";
import type { Person, ServerClient } from "../io/server";
import { findStory } from "../model/building";
import { dimensionShape } from "../model/drawing";
import { itemExists, parseCorner } from "../model/plan";
import { curveOf } from "../model/wallcurve";
import { findRooms } from "../model/rooms";
import type { Id, Item, Plan, Point } from "../model/types";
import { $, app, doc, editor, shell, showStatus, type Topic, type View, view3d } from "./context";
import { dialog, footer } from "./dialog";
import { button, textInput, fieldRow } from "./controls";

/** The state of a tab that the others see. */
export interface PresenceState {
  story: Id;
  topic: Topic;
  view: View;
  /** The pointer on the 2D view, in meters, or null. */
  cursor: Point | null;
  selection: Item[];
  /** The part of the plan in the 2D view, in meters. */
  box: { x: number; y: number; width: number; height: number } | null;
  camera: { position: number[]; target: number[] } | null;
  /** True if the person only views the plan. */
  viewing: boolean;
  /** The tab that the person follows, or null. */
  following: string | null;
  /** True on the roof level: the roofs of all stories from above. Missing in an older app. */
  roof?: boolean;
}

interface Other {
  client: string;
  name: string;
  write: boolean;
  state: PresenceState | null;
  color: string;
}

interface Context {
  client: ServerClient;
  planId: string;
  /** The name of the account, or "" for a share link: the server then takes its label. */
  name: string;
  write: boolean;
  viewOnly: () => boolean;
  setViewOnly: (value: boolean) => Promise<void>;
}

const NAME_KEY = "grundriss-name";
/** The shortest time between two sends of the state, in ms. */
const SEND_GAP = 100;
/** The state goes to the server at least this often, so that the server knows the tab is open. */
const HEARTBEAT = 20_000;
/** The colors of the people: clear on the light and on the dark theme. */
const COLORS = ["#e8590c", "#2f9e44", "#1c7ed6", "#c2255c", "#7048e8", "#0c8599", "#e67700"];

let context: Context | null = null;
const others = new Map<string, Other>();
let following: string | null = null;
let cursor: Point | null = null;
let sentText = "";
let sentAt = 0;
let sendTimer = 0;
let heartbeat = 0;
let sending = false;
let frame = 0;
/** True while the app applies the state of the person that it follows. */
let applying = false;

/** The color of a tab, the same in all tabs. */
function colorOf(client: string): string {
  let hash = 0;
  for (const char of client) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

/** The name that this browser shows to the others: an own name, else the name of the account. */
function myName(fallback: string): string {
  try {
    const stored = localStorage.getItem(NAME_KEY)?.trim();
    if (stored) return stored;
  } catch {
    // Without the storage, the name of the account.
  }
  return fallback;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("") || "?";

function currentState(): PresenceState {
  const view = shell.view();
  return {
    story: doc.activeStoryId,
    topic: app.topic,
    view,
    cursor,
    selection: editor.selection,
    box: view === "3d" ? null : roundBox(editor.viewBox()),
    camera: view === "2d" ? null : view3d.cameraState(),
    viewing: doc.readOnly,
    following,
    roof: editor.roofLevel,
  };
}

function roundBox(box: { x: number; y: number; width: number; height: number }) {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { x: r(box.x), y: r(box.y), width: r(box.width), height: r(box.height) };
}

/** Sends the state soon, at most once in SEND_GAP. */
function schedule(): void {
  if (!context || sendTimer) return;
  const wait = Math.max(0, sentAt + SEND_GAP - Date.now());
  sendTimer = window.setTimeout(() => {
    sendTimer = 0;
    void send();
  }, wait);
}

async function send(force = false): Promise<void> {
  const current = context;
  if (!current) return;
  if (sending) return schedule();
  const state = currentState();
  const text = JSON.stringify(state);
  if (text === sentText && !force) return;
  sending = true;
  sentText = text;
  sentAt = Date.now();
  try {
    await current.client.sendPresence(current.planId, myName(current.name), state);
  } catch {
    // The next change or the heartbeat sends it again.
    sentText = "";
  } finally {
    sending = false;
  }
}

/** Starts the presence for the open plan of a server. */
export function startPresence(next: Context): void {
  endPresence();
  context = next;
  heartbeat = window.setInterval(() => void send(true), HEARTBEAT);
  void send(true);
  renderPeople();
}

/** Ends the presence, for example when another plan opens. */
export function endPresence(): void {
  if (!context) return;
  context = null;
  others.clear();
  following = null;
  window.clearInterval(heartbeat);
  window.clearTimeout(sendTimer);
  sendTimer = 0;
  sentText = "";
  renderPeople();
  editor.setOverlay("people", null);
  updateFollowing();
}

/** A person opened the plan or changed the state. */
export function personSeen(person: Person): void {
  if (!context || person.client === context.client.client) return;
  const known = others.get(person.client);
  const next: Other = {
    client: person.client,
    name: person.name,
    write: person.write,
    state: validState(person.state),
    color: known?.color ?? colorOf(person.client),
  };
  others.set(person.client, next);
  if (following === person.client) follow(next);
  // The marks show the name, the story or the roof level, and if the person only views.
  const mark = (p: Other | undefined) =>
    p && JSON.stringify([p.name, p.state?.story, p.state?.roof, p.state?.viewing]);
  if (mark(known) !== mark(next)) renderPeople();
  redraw();
}

/** The own state changed outside the top bar, for example the view-only mode in a dialog. */
export function personSeenSelf(): void {
  renderPeople();
  schedule();
}

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isPoint = (value: unknown): value is Point =>
  !!value && isNumber((value as Point).x) && isNumber((value as Point).y);
const isTriple = (value: unknown) =>
  Array.isArray(value) && value.length === 3 && value.every(isNumber);
const VIEWS = new Set<unknown>(["2d", "split", "3d"]);
const TOPICS = new Set<unknown>([
  "overview",
  "structure",
  "outdoor",
  "utilities",
  "interior",
  "energy",
  "renovation",
]);

/** The state of another tab, or null if it is not one: another tab can send anything. */
function validState(value: unknown): PresenceState | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Record<string, unknown>;
  const box = s.box as PresenceState["box"];
  const camera = s.camera as PresenceState["camera"];
  const ok =
    typeof s.story === "string" &&
    TOPICS.has(s.topic) &&
    VIEWS.has(s.view) &&
    (s.cursor === null || isPoint(s.cursor)) &&
    Array.isArray(s.selection) &&
    s.selection.every(
      (item) => item && typeof item.kind === "string" && typeof item.id === "string",
    ) &&
    (box === null ||
      (!!box &&
        isNumber(box.x) &&
        isNumber(box.y) &&
        isNumber(box.width) &&
        isNumber(box.height))) &&
    (camera === null || (!!camera && isTriple(camera.position) && isTriple(camera.target))) &&
    typeof s.viewing === "boolean" &&
    (s.following === null || typeof s.following === "string");
  return ok ? (value as PresenceState) : null;
}

/** The people of a new stream, for example after a lost connection. This tab tells its state. */
export function peopleAgain(people: Person[]): void {
  if (!context) return;
  const ids = new Set(people.map((p) => p.client));
  for (const client of [...others.keys()]) if (!ids.has(client)) personGone(client);
  for (const person of people) personSeen(person);
  void send(true);
}

/** A person closed the plan. */
export function personGone(client: string): void {
  const person = others.get(client);
  if (!person) return;
  others.delete(client);
  if (following === client) {
    stopFollowing();
    showStatus(t("{name} closed the plan.", { name: person.name }));
  }
  renderPeople();
  redraw();
}

// ----- Following -----

function startFollowing(client: string): void {
  const person = others.get(client);
  if (!person) return;
  following = client;
  follow(person);
  updateFollowing();
  renderPeople();
  schedule();
}

export function stopFollowing(): void {
  if (!following) return;
  following = null;
  updateFollowing();
  renderPeople();
  schedule();
}

/** Shows what the person sees: the story, the topic, the view, the part of the plan, the camera. */
function follow(person: Other): void {
  const state = person.state;
  if (!state) return;
  applying = true;
  try {
    if (state.story !== doc.activeStoryId && findStory(doc.building, state.story)) {
      editor.select(null);
      doc.setActiveStory(state.story);
    }
    // The roof level, without a fit: the part of the plan comes from the person.
    if (!!state.roof !== editor.roofLevel) shell.setRoofLevel(!!state.roof, false);
    if (state.topic !== app.topic) shell.setTopic(state.topic);
    if (state.view !== shell.view()) shell.setView(state.view);
    if (state.box && state.view !== "3d") editor.showBox(state.box);
    if (state.camera && state.view !== "2d") view3d.setCamera(state.camera);
    const selection = state.selection.filter((item) => itemExists(doc.plan, item));
    const mine = editor.selection;
    if (JSON.stringify(selection) !== JSON.stringify(mine)) editor.select(selection);
  } finally {
    applying = false;
  }
}

/** The band over the views while the app follows a person. */
function updateFollowing(): void {
  const area = $("#area");
  const person = following ? others.get(following) : undefined;
  // The view buttons set the class of the area, so the mark is on the body.
  document.body.classList.toggle("following", !!person);
  let band = document.querySelector<HTMLElement>("#follow-band");
  if (!person) {
    band?.remove();
    return;
  }
  if (!band) {
    band = document.createElement("div");
    band.id = "follow-band";
    band.className = "follow-band";
    area.append(band);
  }
  document.body.style.setProperty("--follow-color", person.color);
  band.replaceChildren();
  const text = document.createElement("span");
  text.textContent = t("You follow {name}", { name: person.name });
  band.append(
    text,
    button(t("Stop following"), () => stopFollowing(), { kind: "quiet" }),
  );
}

// ----- The top bar -----

function renderPeople(): void {
  const bar = $("#people");
  bar.replaceChildren();
  bar.hidden = !context;
  const current = context;
  if (!current) return;
  for (const person of others.values()) {
    const mark = document.createElement("button");
    mark.className = "person";
    mark.classList.toggle("followed", person.client === following);
    mark.classList.toggle("viewing", !!person.state?.viewing);
    mark.style.setProperty("--person", person.color);
    mark.textContent = initials(person.name);
    const story = person.state ? findStory(doc.building, person.state.story) : undefined;
    const where = person.state?.roof ? t("Roof") : story ? t(story.name) : "";
    const what = person.state?.viewing || !person.write ? t("views") : t("edits");
    mark.title =
      person.client === following
        ? t("{name} ({what}, {story}). Click to stop following.", {
            name: person.name,
            what,
            story: where,
          })
        : t("{name} ({what}, {story}). Click to follow.", {
            name: person.name,
            what,
            story: where,
          });
    mark.setAttribute("aria-pressed", String(person.client === following));
    mark.addEventListener("click", () => {
      if (following === person.client) stopFollowing();
      else startFollowing(person.client);
    });
    bar.append(mark);
  }
  if (current.write) {
    const viewing = current.viewOnly();
    // The button names the other mode; the mark of the server shows the mode now. Both modes
    // have the same quiet button, like the other buttons of the top bar.
    const mode = document.createElement("button");
    mode.className = "quiet mode";
    mode.innerHTML = icon(viewing ? "rename" : "eye");
    mode.append(viewing ? t("Edit") : t("View only"));
    mode.title = viewing
      ? t("You only view the plan. Click to edit it.")
      : t("You edit the plan. Click to only view it, for example to follow another person.");
    mode.addEventListener("click", () => {
      void current.setViewOnly(!viewing).then(() => {
        renderPeople();
        schedule();
      });
    });
    bar.append(mode);
  }
}

/** A dialog for the name that the others see. */
export function nameDialog(): void {
  const current = context;
  if (!current) return;
  const { element, body } = dialog(t("Your name"));
  const input = textInput(myName(current.name));
  body.append(fieldRow(t("Name"), input));
  const save = button(
    t("Save"),
    () => {
      try {
        localStorage.setItem(NAME_KEY, input.value.trim());
      } catch {
        // Without the storage, the name stays for this page.
      }
      element.close();
      void send(true);
    },
    { kind: "primary" },
  );
  input.addEventListener("keydown", (e) => e.key === "Enter" && save.click());
  footer(element, save);
  input.focus();
}

// ----- The 2D view -----

function redraw(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    editor.setOverlay("people", others.size ? drawPeople : null);
  });
}

const SVG = "http://www.w3.org/2000/svg";

function shape(
  parent: SVGElement,
  tag: string,
  attributes: Record<string, string | number>,
): SVGElement {
  const element = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  parent.append(element);
  return element;
}

/** The cursors and the selections of the people on the story of the view. */
function drawPeople(group: SVGGElement, zoom: number): void {
  const plan = doc.plan;
  group.classList.add("people-layer");
  for (const person of others.values()) {
    const state = person.state;
    if (!state || state.story !== plan.id) continue;
    const layer = shape(group, "g", { class: "person-layer" }) as SVGGElement;
    layer.style.setProperty("--person", person.color);
    for (const item of state.selection) drawItem(layer, plan, item, zoom);
    if (state.cursor) drawCursor(layer, state.cursor, person.name, zoom);
  }
}

/** The points of an SVG polygon or polyline. */
const pointList = (points: Point[]) => points.map((p) => `${p.x},${p.y}`).join(" ");

function drawItem(layer: SVGGElement, plan: Plan, item: Item, zoom: number): void {
  const stroke = { class: "person-selection", "stroke-width": 4 / zoom };
  const vertex = (id: Id) => plan.vertices.find((v) => v.id === id);
  if (item.kind === "wall") {
    const wall = plan.walls.find((w) => w.id === item.id);
    const a = wall && vertex(wall.a);
    const b = wall && vertex(wall.b);
    if (wall && a && b) {
      // The center line of the wall, along the arc of a curved wall.
      const curve = curveOf(a, b, wall.bulge ?? 0, wall.thickness / 2);
      shape(layer, "polyline", {
        ...stroke,
        points: pointList(curve.points(0, curve.length)),
        "stroke-width": wall.thickness + 10 / zoom,
      });
    }
  } else if (item.kind === "vertex") {
    const v = vertex(item.id);
    if (v) shape(layer, "circle", { ...stroke, cx: v.x, cy: v.y, r: 8 / zoom });
  } else if (item.kind === "opening") {
    const opening = plan.openings.find((o) => o.id === item.id);
    const wall = opening && plan.walls.find((w) => w.id === opening.wallId);
    const a = wall && vertex(wall.a);
    const b = wall && vertex(wall.b);
    if (opening && wall && a && b) {
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / length;
      const uy = (b.y - a.y) / length;
      const start = opening.offset - opening.width / 2;
      const end = opening.offset + opening.width / 2;
      shape(layer, "line", {
        ...stroke,
        x1: a.x + ux * start,
        y1: a.y + uy * start,
        x2: a.x + ux * end,
        y2: a.y + uy * end,
        "stroke-width": wall.thickness + 6 / zoom,
      });
    }
  } else if (item.kind === "furniture") {
    const piece = plan.furniture.find((f) => f.id === item.id);
    if (piece) {
      shape(layer, "rect", {
        ...stroke,
        x: piece.x - piece.width / 2,
        y: piece.y - piece.depth / 2,
        width: piece.width,
        height: piece.depth,
        transform: `rotate(${piece.rotation} ${piece.x} ${piece.y})`,
        "stroke-width": 3 / zoom,
      });
    }
  } else if (item.kind === "fixture") {
    const fixture = plan.fixtures.find((f) => f.id === item.id);
    if (fixture) shape(layer, "circle", { ...stroke, cx: fixture.x, cy: fixture.y, r: 12 / zoom });
  } else if (item.kind === "run") {
    const run = plan.runs.find((r) => r.id === item.id);
    if (run) {
      shape(layer, "polyline", {
        ...stroke,
        points: pointList(run.points),
      });
    }
  } else if (item.kind === "dimension") {
    const d = plan.dimensions.find((x) => x.id === item.id);
    // An angle dimension shows its arc.
    if (d) {
      const line = dimensionShape(d).segments.flatMap(([p, q], i) => (i === 0 ? [p, q] : [q]));
      shape(layer, "polyline", { ...stroke, points: pointList(line) });
    }
  } else if (item.kind === "area") {
    const area = plan.areas.find((x) => x.id === item.id);
    if (area) shape(layer, "polygon", { ...stroke, points: pointList(area.points) });
  } else if (item.kind === "area-corner") {
    const corner = parseCorner(item.id);
    const p = plan.areas.find((x) => x.id === corner.id)?.points[corner.index];
    if (p) shape(layer, "circle", { ...stroke, cx: p.x, cy: p.y, r: 8 / zoom });
  } else if (item.kind === "fence") {
    const fence = plan.fences.find((x) => x.id === item.id);
    if (fence) shape(layer, "polyline", { ...stroke, points: pointList(fence.points) });
  } else if (item.kind === "tree") {
    const tree = plan.trees.find((x) => x.id === item.id);
    if (tree) shape(layer, "circle", { ...stroke, cx: tree.x, cy: tree.y, r: tree.crown / 2 });
  } else if (item.kind === "room") {
    const room = findRooms(plan).find((r) => r.key === item.id);
    if (room) {
      shape(layer, "polygon", {
        class: "person-room",
        points: pointList(room.polygon),
      });
    }
  }
}

function drawCursor(layer: SVGGElement, at: Point, name: string, zoom: number): void {
  const s = 1 / zoom;
  const group = shape(layer, "g", {
    class: "person-cursor",
    transform: `translate(${at.x} ${at.y}) scale(${s})`,
  });
  shape(group, "path", { d: "M0 0 L0 16 L4.5 12 L7.5 19 L10 18 L7 11 L13 11 Z" });
  const label = shape(group, "g", { transform: "translate(12 20)" });
  const box = shape(label, "rect", { width: name.length * 7 + 12, height: 18, rx: 4 });
  const text = shape(label, "text", { x: 6, y: 13 }) as SVGTextElement;
  text.textContent = name;
  // The label fits the text once it is in the page.
  requestAnimationFrame(() => {
    if (!text.isConnected) return;
    const width = text.getComputedTextLength();
    if (width > 0) box.setAttribute("width", String(width + 12));
  });
}

// ----- The start -----

/** Watches the views for the state that the others see, and for the input that stops a follow. */
export function setupPresence(): void {
  const plan2d = $("#plan-2d");
  plan2d.addEventListener("pointermove", (e) => {
    if (!context || e.pointerType === "touch") return;
    cursor = editor.toWorld(e);
    const r = (n: number) => Math.round(n * 100) / 100;
    cursor = { x: r(cursor.x), y: r(cursor.y) };
    schedule();
  });
  plan2d.addEventListener("pointerleave", () => {
    if (!context || !cursor) return;
    cursor = null;
    schedule();
  });
  // A pan, a zoom, or a click in a view of the user stops the follow.
  for (const view of [plan2d, $("#plan-3d")]) {
    view.addEventListener("pointerdown", (e) => e.isTrusted && stopFollowing(), true);
    view.addEventListener("wheel", (e) => e.isTrusted && stopFollowing(), {
      capture: true,
      passive: true,
    });
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && following) stopFollowing();
  });
  const changed = () => {
    if (!context || applying) return;
    schedule();
  };
  editor.onRender = changed;
  view3d.onCamera = changed;
  let stories = "";
  doc.subscribe(() => {
    if (!context || doc.inTransaction) return;
    changed();
    // The marks name the story of each person.
    const names = JSON.stringify(doc.building.stories.map((s) => [s.id, s.name]));
    if (names !== stories) {
      stories = names;
      renderPeople();
    }
    redraw();
  });
}
