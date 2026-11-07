// The 2D editor: an SVG view of the plan with tools to draw and change it. The editor keeps no
// copy of the plan. It reads the plan from the document for each frame, and it changes the plan
// only through transactions of the document.

import {
  chimneysThrough,
  defaultWallHeight,
  stairRise,
  stairShape,
  storyBelow,
} from "../model/building";
import {
  chimneySymbol,
  dimensionShape,
  openingShape,
  planBounds,
  stairDrawing,
  wallOutline,
  type StairDrawing,
} from "../model/drawing";
import { withFurniture } from "../export/context";
import {
  findFurniture,
  furnitureOutline,
  furnitureSymbol,
  snapToWall,
  wallFaces,
} from "../model/furniture";
import { roofLines } from "../model/roof";
import { clearHeightLines, WOFLV } from "../model/attic";
import {
  findFixture,
  fixtureAnchor,
  fixtureSymbol,
  fixtureType,
  newRun,
  runKind,
} from "../model/services";
import {
  add,
  clamp,
  closestOnSegment,
  distance,
  dot,
  perpendicular,
  scale,
  snapToGrid,
  sub,
} from "../model/geometry";
import type { PlanDocument } from "../model/history";
import {
  addChimney,
  addDimension,
  addOpening,
  addStair,
  addVertex,
  addWall,
  copyItems,
  findDimension,
  findOpening,
  findVertex,
  findWall,
  getVertex,
  itemExists,
  mergeVertex,
  moveFromOrigin,
  moveOrigin,
  nearestWall,
  pasteClip,
  removeItems,
  splitWall,
  wallEnds,
  newId,
  wallMoveTargets,
  WALL_DEFAULTS,
  type MoveOrigin,
} from "../model/plan";
import { findRooms, pointInPolygon, roomLabel } from "../model/rooms";
import type {
  Chimney,
  Fixture,
  Roof,
  Furniture,
  Clip,
  Id,
  Item,
  ItemKind,
  OpeningKind,
  Plan,
  Point,
} from "../model/types";

const SVG_NS = "http://www.w3.org/2000/svg";
const GRID_STEP = 0.05;
const SNAP_PIXELS = 10;
const MIN_ZOOM = 5;
const MAX_ZOOM = 2000;
/** The wall tool snaps the direction to a multiple of this angle, in degrees. */
const ANGLE_STEP = 15;
/** The wall tool snaps the direction if it is nearer than this angle, in degrees. */
const ANGLE_TOLERANCE = 3;
/** With Shift, the wall tool keeps the direction at a multiple of this angle, in degrees. */
const SHIFT_ANGLE_STEP = 45;
/** The height in pixels of the strip under the tool palette, which `fit` keeps free. */
const FIT_TOP_INSET = 56;

export type Tool =
  | "select"
  | "pan"
  | "wall"
  | "door"
  | "window"
  | "dimension"
  | "stair"
  | "chimney"
  | "furniture"
  | "fixture"
  | "run"
  | "calibrate"
  | "rectify";
export type Selection = Item[];

/** A point that the pointer snaps to. It can be an existing vertex or a point on a wall. */
interface Snap {
  point: Point;
  vertexId?: Id;
  wallId?: Id;
}

type Drag =
  | { kind: "pan"; startScreen: Point; startOffset: Point }
  | { kind: "marquee"; start: Point; end: Point; base: Item[]; room: string | null }
  | { kind: "vertex"; id: Id; target: Snap | null }
  | { kind: "wall"; id: Id; startWorld: Point; origin: [Point, Point] }
  | { kind: "opening"; id: Id }
  | { kind: "dimension"; id: Id }
  | { kind: "move"; startWorld: Point; origin: MoveOrigin }
  | { kind: "furniture"; id: Id; grab: Point }
  | { kind: "fixture"; id: Id; grab: Point }
  | { kind: "roof-corner"; roofId: Id; index: number };

type Attributes = Record<string, string | number>;

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Attributes,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  parent?.append(element);
  return element;
}

const points = (polygon: Point[]) => polygon.map((p) => `${p.x},${p.y}`).join(" ");

const sameItem = (a: Item, b: Item) => a.kind === b.kind && a.id === b.id;

export class Editor2D {
  readonly element: SVGSVGElement;
  private backgroundImage: SVGImageElement;
  private content: SVGGElement;
  private zoom = 50;
  /** The screen position of the world origin, in pixels. */
  private offset: Point = { x: 0, y: 0 };
  private currentTool: Tool = "select";
  private items: Item[] = [];
  private drag: Drag | null = null;
  private chain: Snap | null = null;
  private cursor: Snap | null = null;
  /** The points of the dimension tool: the two ends, then the click that sets the offset. */
  private measure: Point[] = [];
  private calibration: Point[] = [];
  private spaceDown = false;
  private clipboard: Clip | null = null;
  /** Extra layers that other modules draw over the plan, for example suggested walls. */
  private overlays = new Map<string, (group: SVGGElement, zoom: number) => void>();

  /** The piece that the furniture tool places, with its size and rotation. */
  private placing: Furniture | null = null;
  /** The device that the fixture tool places. */
  private placingFixture: Fixture | null = null;
  /** The kind of line that the run tool draws, its points so far, and its first device. */
  private runKindName = "cable";
  private runPoints: Point[] = [];
  private runFrom: Id | null = null;
  /** The layers of the building services that the editor shows. */
  layers = { electric: true, heating: true, pv: true, insulation: false };
  /** The images of the 3D models seen from above, by model id. */
  private topViews = new Map<Id, string>();

  onSelect: (selection: Selection) => void = () => {};
  /** The furniture tool calls this after it places a piece. */
  onPlace: (piece: Furniture) => void = () => {};
  /** The run tool calls this after it adds a line. */
  onRun: (id: Id) => void = () => {};
  onCalibrate: (a: Point, b: Point) => void = () => {};
  /** The "rectify" tool calls this after the fourth click, with the corners in meters. */
  onCorners: (corners: [Point, Point, Point, Point]) => void = () => {};
  /** The functions that `dispose` calls to remove the listeners outside the element. */
  private readonly disposers: (() => void)[] = [];

  constructor(
    container: HTMLElement,
    private readonly doc: PlanDocument,
  ) {
    this.element = svg("svg", { class: "editor2d" });
    container.append(this.element);
    const world = svg("g", {}, this.element);
    this.backgroundImage = svg("image", { preserveAspectRatio: "none" }, world);
    this.content = svg("g", {}, world);

    const unsubscribe = doc.subscribe(() => {
      this.checkSelection();
      this.render();
    });
    this.element.addEventListener("pointerdown", (e) => this.pointerDown(e));
    this.element.addEventListener("pointermove", (e) => this.pointerMove(e));
    this.element.addEventListener("pointerup", () => this.pointerUp());
    this.element.addEventListener("pointercancel", () => this.pointerUp());
    this.element.addEventListener("pointerleave", () => {
      this.cursor = null;
      this.render();
    });
    this.element.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
    // A double click ends a line of the run tool, or the chain of a drawing tool. With the select
    // tool, it does nothing, so the selection stays.
    this.element.addEventListener("dblclick", () => {
      if (this.currentTool === "run") this.finishRun();
      else if (this.currentTool !== "select") this.cancel();
    });
    this.element.addEventListener("contextmenu", (e) => e.preventDefault());
    const keyDown = (e: KeyboardEvent) => {
      // Space in a form field types a space. It does not start a pan.
      const field = e.target instanceof Element && e.target.matches("input, select, textarea");
      if (e.code === "Space" && !field) {
        this.spaceDown = true;
        // An open hand shows that a drag pans now.
        this.element.classList.add("space");
      }
    };
    const keyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        this.spaceDown = false;
        this.element.classList.remove("space");
      }
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    const resize = new ResizeObserver(() => this.render());
    resize.observe(this.element);
    this.disposers.push(
      unsubscribe,
      () => window.removeEventListener("keydown", keyDown),
      () => window.removeEventListener("keyup", keyUp),
      () => resize.disconnect(),
    );
  }

  /**
   * Stops the editor. It removes the listeners on the window and on the document, stops the
   * ResizeObserver, and removes the SVG element. The listeners on the element go with it.
   */
  dispose(): void {
    for (const dispose of this.disposers.splice(0)) dispose();
    this.element.remove();
  }

  get tool(): Tool {
    return this.currentTool;
  }

  set tool(tool: Tool) {
    this.currentTool = tool;
    if (tool !== "furniture") this.placing = null;
    if (tool !== "fixture") this.placingFixture = null;
    this.runPoints = [];
    this.runFrom = null;
    this.chain = null;
    this.measure = [];
    this.calibration = [];
    this.element.dataset.tool = tool;
    this.render();
  }

  get selection(): Selection {
    return this.items;
  }

  select(items: Item[] | Item | null): void {
    this.items = items === null ? [] : Array.isArray(items) ? items : [items];
    this.onSelect(this.items);
    this.render();
  }

  selectAll(): void {
    const plan = this.doc.plan;
    this.select([
      ...plan.walls.map((w) => ({ kind: "wall" as const, id: w.id })),
      ...plan.openings.map((o) => ({ kind: "opening" as const, id: o.id })),
      ...plan.dimensions.map((d) => ({ kind: "dimension" as const, id: d.id })),
      ...plan.stairs.map((s) => ({ kind: "stair" as const, id: s.id })),
      ...plan.chimneys.map((c) => ({ kind: "chimney" as const, id: c.id })),
      ...plan.furniture.map((f) => ({ kind: "furniture" as const, id: f.id })),
      ...plan.fixtures.map((f) => ({ kind: "fixture" as const, id: f.id })),
      ...plan.runs.map((r) => ({ kind: "run" as const, id: r.id })),
      ...plan.vertices.map((v) => ({ kind: "vertex" as const, id: v.id })),
    ]);
  }

  /** Starts the fixture tool with a template device. Each click places a copy of it. */
  startFixture(template: Fixture): void {
    this.tool = "fixture";
    this.placingFixture = { ...template };
    this.render();
  }

  /** Starts the run tool with a kind of line, for example "cable" or "flow". */
  startRun(kind: string): void {
    this.tool = "run";
    this.runKindName = kind;
    this.render();
  }

  get runKindOfTool(): string {
    return this.runKindName;
  }

  /** Ends the line of the run tool, if it has at least two points. */
  finishRun(to: Id | null = null): void {
    const points = this.runPoints;
    if (points.length >= 2) {
      const run = newRun(this.runKindName, points);
      run.from = this.runFrom;
      run.to = to;
      this.doc.edit((plan) => plan.runs.push(run));
      this.onRun(run.id);
    }
    this.runPoints = [];
    this.runFrom = null;
    this.render();
  }

  /** Starts the furniture tool with a template piece. A click places a copy of it. */
  startPlacing(template: Furniture): void {
    this.tool = "furniture";
    this.placing = { ...template };
    this.render();
  }

  /** Gives the image of a model seen from above. The editor draws it in the pieces. */
  setTopView(modelId: Id, url: string): void {
    this.topViews.set(modelId, url);
    this.render();
  }

  /**
   * Turns the piece that the furniture tool places, or the selected pieces, by `degrees`
   * clockwise. Each piece turns about its own center.
   */
  rotate(degrees: number): void {
    const turn = (value: number) => (((value + degrees) % 360) + 360) % 360;
    if (this.currentTool === "furniture" && this.placing) {
      this.placing.rotation = turn(this.placing.rotation);
      this.render();
      return;
    }
    const ids = this.items.filter((i) => i.kind === "furniture").map((i) => i.id);
    if (ids.length === 0) return;
    this.doc.edit((plan) => {
      for (const id of ids) {
        const piece = findFurniture(plan, id);
        if (piece) piece.rotation = turn(piece.rotation);
      }
    });
  }

  /**
   * Stops the current action: the drag, the wall chain, the measure, the calibration, or the
   * selection. Each call stops only one of them. So, during a drag, the first Esc stops only the
   * drag, and a second Esc stops the chain or clears the selection.
   */
  cancel(): void {
    const drag = this.drag;
    if (drag) {
      this.drag = null;
      this.element.classList.remove("panning");
      // A drag goes back to the state before the drag.
      if (drag.kind === "pan") this.offset = drag.startOffset;
      else if (drag.kind === "marquee") this.select(drag.base);
      else this.doc.cancel();
      this.render();
      return;
    }
    if (this.chain) this.chain = null;
    else if (this.runPoints.length > 0) {
      this.runPoints = [];
      this.runFrom = null;
    } else if (this.measure.length > 0) this.measure = [];
    else if (this.calibration.length > 0) this.calibration = [];
    else if (this.items.length > 0) this.select(null);
    this.render();
  }

  clearCalibration(): void {
    this.calibration = [];
    this.render();
  }

  deleteSelection(): void {
    const items = this.items;
    if (items.length === 0) return;
    // A roof and the corners of a roof belong to the building, not to the story. The corners go
    // from the highest index down, because a removed corner changes the indices after it.
    const corners = items
      .filter((i) => i.kind === "roof-corner")
      .map((i) => i.id.split(":"))
      .map(([roofId, index]) => ({ roofId, index: Number(index) }))
      .sort((p, q) => q.index - p.index);
    // A selection that removes nothing, for example a room or the corner of a roof with three
    // corners, makes no entry in the history.
    this.doc.editBuildingIf((building) => {
      let changed = false;
      for (const { roofId, index } of corners) {
        const roof = building.roofs.find((r) => r.id === roofId);
        // A roof needs at least three corners.
        if (!roof || roof.outline.length <= 3) continue;
        roof.outline.splice(index, 1);
        roof.sides.splice(index, 1);
        shiftRoofItems(roof, index, -1);
        changed = true;
      }
      for (const item of items) {
        if (item.kind !== "roof" || !building.roofs.some((r) => r.id === item.id)) continue;
        building.roofs = building.roofs.filter((r) => r.id !== item.id);
        building.pv = building.pv.filter((a) => a.roofId !== item.id);
        changed = true;
      }
      // The other items belong to the active story. removeItems does not remove a room.
      const plan = this.doc.plan;
      if (items.some((i) => i.kind !== "room" && itemExists(plan, i))) changed = true;
      removeItems(plan, items);
      return changed;
    });
    this.select(null);
  }

  copy(): boolean {
    if (this.items.length === 0) return false;
    this.clipboard = copyItems(this.doc.plan, this.items);
    return true;
  }

  cut(): void {
    if (this.copy()) this.deleteSelection();
  }

  /**
   * Pastes the clipboard. The copy goes to the pointer if the pointer is over the editor, else
   * it goes 0.5 m to the right and down. The pasted objects become the selection.
   */
  paste(): void {
    const clip = this.clipboard;
    if (!clip) return;
    const ends = [
      ...clip.vertices,
      ...clip.dimensions.flatMap((d) => [d.a, d.b]),
      ...clip.stairs.flatMap((s) => [s.a, s.b]),
      ...clip.chimneys,
      ...clip.furniture,
      ...clip.fixtures,
      ...clip.runs.flatMap((r) => r.points),
    ];
    if (ends.length === 0) return;
    const center = scale(ends.reduce(add, { x: 0, y: 0 }), 1 / ends.length);
    const delta = this.cursor
      ? snapToGrid(sub(this.cursor.point, center), GRID_STEP)
      : { x: 0.5, y: 0.5 };
    let items: Item[] = [];
    this.doc.edit((plan) => (items = pasteClip(plan, clip, delta)));
    // A pasted vertex of a wall moves with the wall, so the selection needs only the walls.
    const walls = new Set(items.filter((i) => i.kind === "wall").map((i) => i.id));
    this.select(
      items.filter(
        (i) =>
          i.kind !== "vertex" ||
          !this.doc.plan.walls.some((w) => walls.has(w.id) && (w.a === i.id || w.b === i.id)),
      ),
    );
  }

  duplicate(): void {
    const saved = this.clipboard;
    const cursor = this.cursor;
    if (!this.copy()) return;
    this.cursor = null;
    this.paste();
    this.cursor = cursor;
    this.clipboard = saved;
  }

  /** Moves the selection by `delta` meters, for example with the arrow keys. */
  nudge(delta: Point): void {
    if (this.items.length === 0) return;
    const items = this.items;
    this.doc.edit((plan) => {
      const origin = moveOrigin(plan, items);
      moveFromOrigin(plan, origin, delta);
      for (const item of items) {
        const opening = item.kind === "opening" ? findOpening(plan, item.id) : undefined;
        const wall = opening && findWall(plan, opening.wallId);
        // An opening of a wall that moves too stays in its place on the wall.
        if (!opening || !wall || origin.vertices.has(wall.a) || origin.vertices.has(wall.b)) {
          continue;
        }
        // An opening moves along its wall. The component of `delta` along the wall moves it.
        const [a, b] = wallEnds(plan, wall);
        const length = distance(a, b);
        if (length > 0) opening.offset += dot(delta, scale(sub(b, a), 1 / length));
      }
    });
  }

  /** Draws an extra layer over the plan. A draw function of null removes the layer. */
  setOverlay(name: string, draw: ((group: SVGGElement, zoom: number) => void) | null): void {
    if (draw) this.overlays.set(name, draw);
    else this.overlays.delete(name);
    this.render();
  }

  /** The point of the plan under the pointer event, in meters. */
  toWorld(e: { clientX: number; clientY: number }): Point {
    const rect = this.element.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - this.offset.x) / this.zoom,
      y: (e.clientY - rect.top - this.offset.y) / this.zoom,
    };
  }

  /** Shows the whole plan, or the background if the plan is empty. */
  fit(): void {
    const { width, height: fullHeight } = this.element.getBoundingClientRect();
    // The tool palette floats over the top of the editor, so the plan fits below it.
    const top = Math.min(FIT_TOP_INSET, fullHeight / 4);
    const height = fullHeight - top;
    const plan = this.doc.plan;
    const b = plan.background;
    const box =
      withFurniture(planBounds(plan), plan) ??
      (b && {
        minX: b.x,
        minY: b.y,
        maxX: b.x + b.width * b.scale,
        maxY: b.y + b.height * b.scale,
      });
    if (!box || width === 0) {
      this.zoom = 50;
      this.offset = { x: width / 2, y: top + height / 2 };
    } else {
      const { minX, minY, maxX, maxY } = box;
      const size = Math.max(maxX - minX, maxY - minY, 1);
      this.zoom = clamp((0.85 * Math.min(width, height)) / size, MIN_ZOOM, MAX_ZOOM);
      this.offset = {
        x: width / 2 - ((minX + maxX) / 2) * this.zoom,
        y: top + height / 2 - ((minY + maxY) / 2) * this.zoom,
      };
    }
    this.render();
  }

  // ----- Input -----

  private hit(target: EventTarget | null): Item | null {
    const element = target instanceof Element ? target.closest<SVGElement>("[data-kind]") : null;
    if (!element) return null;
    return { kind: element.dataset.kind as ItemKind, id: element.dataset.id! };
  }

  private startPan(e: PointerEvent): void {
    // The cursor shows a closed hand while the plan moves.
    this.element.classList.add("panning");
    this.drag = {
      kind: "pan",
      startScreen: { x: e.clientX, y: e.clientY },
      startOffset: { ...this.offset },
    };
  }

  private pointerDown(e: PointerEvent): void {
    this.element.setPointerCapture(e.pointerId);
    const world = this.toWorld(e);
    if (e.button === 1 || e.button === 2 || this.spaceDown || this.currentTool === "pan") {
      this.startPan(e);
      return;
    }
    if (e.button !== 0) return;

    switch (this.currentTool) {
      case "select":
        this.selectDown(e, world);
        break;
      case "wall":
        this.addChainPoint(this.snap(world, e));
        break;
      case "door":
      case "window":
        this.placeOpening(this.currentTool, world);
        break;
      case "dimension":
      case "stair":
        this.addMeasurePoint(world, e);
        break;
      case "fixture": {
        const template = this.placingFixture;
        if (!template) break;
        const fixture: Fixture = {
          ...structuredClone(template),
          ...this.placeFixtureAt(template, world, e.altKey),
          id: newId("x"),
        };
        this.doc.edit((plan) => plan.fixtures.push(fixture));
        this.render();
        break;
      }
      case "run": {
        const target = this.runSnap(world, e);
        // A double click adds the same point twice. The second one does not count.
        const last = this.runPoints[this.runPoints.length - 1];
        if (last && distance(last, target.point) < 1e-6) break;
        if (this.runPoints.length === 0) this.runFrom = target.fixtureId ?? null;
        this.runPoints.push(target.point);
        // A click on a device ends the line there.
        if (this.runPoints.length >= 2 && target.fixtureId) this.finishRun(target.fixtureId);
        else this.render();
        break;
      }
      case "furniture": {
        const template = this.placing;
        if (!template) break;
        const piece = { ...template, ...this.placeAt(template, world, e.altKey) };
        const placed: Furniture = { ...structuredClone(piece), id: newId("f") };
        this.doc.edit((plan) => plan.furniture.push(structuredClone(placed)));
        // Shift keeps the tool, so that the user can place more pieces of the same kind.
        if (!e.shiftKey) {
          this.tool = "select";
          this.select({ kind: "furniture", id: placed.id });
        }
        this.onPlace(placed);
        break;
      }
      case "chimney": {
        const point = this.snap(world, e).point;
        let id: Id = "";
        this.doc.edit((plan) => (id = addChimney(plan, point).id));
        this.select({ kind: "chimney", id });
        break;
      }
      case "calibrate":
        this.calibration.push(world);
        if (this.calibration.length === 2) {
          const [a, b] = this.calibration;
          this.onCalibrate(a, b);
        }
        if (this.calibration.length > 2) this.calibration = [world];
        this.render();
        break;
      case "rectify":
        // The tool uses the list of the calibration for the four corners of the plan.
        if (this.calibration.length >= 4) this.calibration = [];
        this.calibration.push(world);
        if (this.calibration.length === 4) {
          this.onCorners(this.calibration.slice() as [Point, Point, Point, Point]);
        }
        this.render();
        break;
    }
  }

  /**
   * A press with the select tool. On an object, it selects the object and starts to move it.
   * Shift adds the object to the selection or removes it. On the empty plan, a drag draws a
   * box that selects the objects in it. A finger on a touch screen pans the plan.
   */
  private selectDown(e: PointerEvent, world: Point): void {
    // A "+" handle of a roof outline adds a corner in the middle of its side, and drags it.
    const insert =
      e.target instanceof Element
        ? e.target.closest<SVGElement>('[data-kind="roof-insert"]')
        : null;
    if (insert) {
      const [roofId, index] = insert.dataset.id!.split(":");
      const i = Number(index);
      this.doc.begin();
      this.doc.updateBuilding((building) => {
        const roof = building.roofs.find((r) => r.id === roofId)!;
        const p = roof.outline[i];
        const q = roof.outline[(i + 1) % roof.outline.length];
        roof.outline.splice(i + 1, 0, scale(add(p, q), 0.5));
        // The new side gets the settings of the side that it splits.
        roof.sides.splice(i + 1, 0, structuredClone(roof.sides[i]));
        shiftRoofItems(roof, i + 1);
      });
      this.items = [{ kind: "roof-corner", id: `${roofId}:${i + 1}` }];
      this.onSelect(this.items);
      this.drag = { kind: "roof-corner", roofId, index: i + 1 };
      return;
    }
    const hit = this.hit(e.target);
    if (!hit) {
      if (e.pointerType === "touch") {
        this.select(null);
        this.startPan(e);
        return;
      }
      const base = e.shiftKey ? this.items : [];
      if (!e.shiftKey) this.select(null);
      // A click without a drag on a room selects the room. A drag selects with a box.
      const room = findRooms(this.doc.plan).find((r) => pointInPolygon(world, r.polygon));
      this.drag = { kind: "marquee", start: world, end: world, base, room: room?.key ?? null };
      return;
    }
    if (e.shiftKey) {
      const selected = this.items.some((i) => sameItem(i, hit));
      this.select(selected ? this.items.filter((i) => !sameItem(i, hit)) : [...this.items, hit]);
      return;
    }
    if (!this.items.some((i) => sameItem(i, hit))) this.select(hit);

    this.doc.begin();
    if (this.items.length === 1 && hit.kind === "fixture") {
      const fixture = findFixture(this.doc.plan, hit.id)!;
      this.drag = { kind: "fixture", id: hit.id, grab: sub(world, fixture) };
      return;
    }
    if (this.items.length === 1 && hit.kind === "furniture") {
      const piece = findFurniture(this.doc.plan, hit.id)!;
      this.drag = { kind: "furniture", id: hit.id, grab: sub(world, piece) };
      return;
    }
    if (
      this.items.length > 1 ||
      hit.kind === "stair" ||
      hit.kind === "chimney" ||
      hit.kind === "run"
    ) {
      this.drag = {
        kind: "move",
        startWorld: world,
        origin: moveOrigin(this.doc.plan, this.items),
      };
      return;
    }
    if (hit.kind === "vertex") this.drag = { kind: "vertex", id: hit.id, target: null };
    if (hit.kind === "roof-corner") {
      const [roofId, index] = hit.id.split(":");
      this.drag = { kind: "roof-corner", roofId, index: Number(index) };
    }
    if (hit.kind === "opening") this.drag = { kind: "opening", id: hit.id };
    if (hit.kind === "dimension") this.drag = { kind: "dimension", id: hit.id };
    if (hit.kind === "wall") {
      const wall = findWall(this.doc.plan, hit.id)!;
      const [a, b] = wallEnds(this.doc.plan, wall);
      this.drag = {
        kind: "wall",
        id: hit.id,
        startWorld: world,
        origin: [
          { x: a.x, y: a.y },
          { x: b.x, y: b.y },
        ],
      };
    }
  }

  private pointerMove(e: PointerEvent): void {
    const world = this.toWorld(e);
    const drag = this.drag;
    if (!drag) {
      const snapping = ["wall", "dimension", "stair", "chimney", "run"].includes(this.currentTool);
      this.cursor = snapping ? this.snap(world, e) : { point: world };
      this.render();
      return;
    }
    if (this.lostTransaction(drag)) return;
    const grid = (p: Point) => (e.altKey ? p : snapToGrid(p, GRID_STEP));
    switch (drag.kind) {
      case "pan":
        this.offset = {
          x: drag.startOffset.x + e.clientX - drag.startScreen.x,
          y: drag.startOffset.y + e.clientY - drag.startScreen.y,
        };
        this.render();
        break;
      case "marquee":
        drag.end = world;
        this.items = [...drag.base, ...this.itemsIn(drag.start, world)].filter(
          (item, i, all) => all.findIndex((other) => sameItem(other, item)) === i,
        );
        this.onSelect(this.items);
        this.render();
        break;
      case "move": {
        const delta = grid(sub(world, drag.startWorld));
        this.doc.update((plan) => moveFromOrigin(plan, drag.origin, delta));
        break;
      }
      case "vertex": {
        const target = this.snap(world, e, drag.id);
        drag.target = target;
        this.doc.update((plan) => {
          const vertex = getVertex(plan, drag.id);
          vertex.x = target.point.x;
          vertex.y = target.point.y;
        });
        break;
      }
      case "wall": {
        const raw = sub(world, drag.startWorld);
        this.doc.update((plan) => {
          const wall = findWall(plan, drag.id)!;
          const [a, b] = wallEnds(plan, wall);
          let targets: [Point, Point];
          if (e.shiftKey) {
            // Shift moves the wall freely. The next walls turn to follow it.
            const delta = grid(raw);
            targets = [add(drag.origin[0], delta), add(drag.origin[1], delta)];
          } else {
            // The wall moves only across its direction, and the next walls keep their angles.
            const [a0, b0] = drag.origin;
            const length = distance(a0, b0);
            const normal = length > 0 ? perpendicular(scale(sub(b0, a0), 1 / length)) : null;
            const across = normal ? dot(raw, normal) : 0;
            const shift = e.altKey ? across : Math.round(across / GRID_STEP) * GRID_STEP;
            targets = wallMoveTargets(plan, wall.id, drag.origin, shift);
          }
          Object.assign(a, targets[0]);
          Object.assign(b, targets[1]);
        });
        break;
      }
      case "opening":
        this.doc.update((plan) => {
          const opening = findOpening(plan, drag.id)!;
          const [a, b] = wallEnds(plan, findWall(plan, opening.wallId)!);
          const length = distance(a, b);
          const along = closestOnSegment(world, a, b).t * length;
          const offset = e.altKey ? along : Math.round(along / GRID_STEP) * GRID_STEP;
          const half = Math.min(opening.width, length) / 2;
          opening.offset = clamp(offset, half, length - half);
        });
        break;
      case "roof-corner": {
        // A corner snaps to the corners and the walls of the story, and else to the grid.
        const target = this.snap(world, e).point;
        this.doc.updateBuilding((building) => {
          const roof = building.roofs.find((r) => r.id === drag.roofId);
          if (roof) roof.outline[drag.index] = { x: target.x, y: target.y };
        });
        break;
      }
      case "fixture":
        this.doc.update((plan) => {
          const fixture = findFixture(plan, drag.id)!;
          Object.assign(fixture, this.placeFixtureAt(fixture, sub(world, drag.grab), e.altKey));
        });
        break;
      case "furniture":
        this.doc.update((plan) => {
          const piece = findFurniture(plan, drag.id)!;
          Object.assign(piece, this.placeAt(piece, sub(world, drag.grab), e.altKey));
        });
        break;
      case "dimension":
        this.doc.update((plan) => {
          const dimension = findDimension(plan, drag.id)!;
          dimension.offset = this.measureOffset(dimension.a, dimension.b, world, e.altKey);
        });
        break;
    }
  }

  private pointerUp(): void {
    const drag = this.drag;
    this.drag = null;
    this.element.classList.remove("panning");
    if (!drag || drag.kind === "pan" || this.lostTransaction(drag)) return;
    if (drag.kind === "marquee") {
      const pixels = distance(drag.start, drag.end) * this.zoom;
      if (pixels < 4 && drag.room) {
        const room: Item = { kind: "room", id: drag.room };
        this.select(drag.base.length > 0 ? [...drag.base, room] : room);
        return;
      }
      this.render();
      return;
    }
    // A vertex on another vertex joins it. A vertex on a wall splits the wall and joins the new
    // vertex, so that the walls meet only at vertices.
    const target = drag.kind === "vertex" ? drag.target : null;
    if (drag.kind === "vertex" && target && (target.vertexId || target.wallId)) {
      let into: Id = "";
      this.doc.update((plan) => {
        into = this.resolve(plan, target);
        mergeVertex(plan, drag.id, into);
      });
      this.items = [{ kind: "vertex", id: into }];
      this.onSelect(this.items);
    }
    this.doc.commit();
  }

  /**
   * True if a drag that changes the plan has no transaction. An undo or a new file during the
   * drag ends the transaction. Then the drag stops, because `update` needs a transaction.
   */
  private lostTransaction(drag: Drag): boolean {
    if (drag.kind === "pan" || drag.kind === "marquee" || this.doc.inTransaction) return false;
    this.drag = null;
    return true;
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    // A trackpad scrolls with two fingers to pan, and it pinches to zoom. A pinch comes as a
    // wheel event with the Ctrl key. A mouse wheel zooms. Chrome and Safari give `wheelDeltaY`:
    // for a trackpad it is -3 times `deltaY`, and for a wheel it is a multiple of 120. Firefox
    // gives lines (`deltaMode` 1) for a wheel.
    const legacy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
    const trackpad = legacy ? legacy === -3 * e.deltaY : e.deltaMode === 0;
    if (trackpad && !e.ctrlKey) {
      this.offset = { x: this.offset.x - e.deltaX, y: this.offset.y - e.deltaY };
      this.render();
      return;
    }
    const world = this.toWorld(e);
    const rect = this.element.getBoundingClientRect();
    // A pinch gives small steps, so it needs a higher speed than a wheel.
    const speed = e.ctrlKey ? 0.01 : 0.0015;
    this.zoom = clamp(this.zoom * Math.exp(-e.deltaY * speed), MIN_ZOOM, MAX_ZOOM);
    this.offset = {
      x: e.clientX - rect.left - world.x * this.zoom,
      y: e.clientY - rect.top - world.y * this.zoom,
    };
    this.render();
  }

  /**
   * The position of a piece at the point. Near a wall, the back of the piece goes against the
   * wall and the piece turns with it. Else the center snaps to the grid. Alt turns the snap off.
   */
  private placeAt(
    piece: Furniture,
    at: Point,
    free: boolean,
  ): { x: number; y: number; rotation: number } {
    if (free) return { x: at.x, y: at.y, rotation: piece.rotation };
    const tolerance = Math.max(0.25, SNAP_PIXELS / this.zoom);
    const wall = snapToWall(piece, at, wallFaces(this.doc.plan), tolerance);
    if (wall) return wall;
    const p = snapToGrid(at, GRID_STEP);
    return { x: p.x, y: p.y, rotation: piece.rotation };
  }

  /**
   * The position of a device at the point. A device of a wall type goes against the nearest
   * wall, with its back to the wall. A device at the ceiling snaps to the grid.
   */
  private placeFixtureAt(
    fixture: Fixture,
    at: Point,
    free: boolean,
  ): { x: number; y: number; rotation: number } {
    if (free) return { x: at.x, y: at.y, rotation: fixture.rotation };
    if (fixtureType(fixture.type).onWall) {
      // The wall snap of furniture works with a box. A device is a flat box at the wall.
      const box = {
        ...fixture,
        depth: 0.02,
        height: 0.1,
        name: "",
        source: { kind: "generic", type: "box" },
      } as Furniture;
      const tolerance = Math.max(0.3, SNAP_PIXELS / this.zoom);
      const wall = snapToWall(box, at, wallFaces(this.doc.plan), tolerance);
      if (wall) return wall;
    }
    const p = snapToGrid(at, GRID_STEP);
    return { x: p.x, y: p.y, rotation: fixture.rotation };
  }

  /** The point of the run tool: a device of the same system, or else the usual snap. */
  private runSnap(
    world: Point,
    keys: { altKey: boolean; shiftKey: boolean },
  ): { point: Point; fixtureId?: Id } {
    const system = runKind(this.runKindName).system;
    const tolerance = (SNAP_PIXELS * 1.5) / this.zoom;
    let best: { point: Point; fixtureId?: Id } | null = null;
    let bestDistance = tolerance;
    for (const fixture of this.doc.plan.fixtures) {
      if (fixture.system !== system) continue;
      const anchor = fixtureAnchor(fixture);
      const d = distance(world, anchor);
      if (d < bestDistance) {
        bestDistance = d;
        best = { point: anchor, fixtureId: fixture.id };
      }
    }
    return best ?? { point: this.snap(world, keys).point };
  }

  /** The objects inside the box from `a` to `b`. A wall is inside if both of its ends are. */
  private itemsIn(a: Point, b: Point): Item[] {
    const plan = this.doc.plan;
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    if (x1 - x0 < 1e-9 && y1 - y0 < 1e-9) return [];
    const inside = (p: Point) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
    const items: Item[] = [];
    const walls = new Set<Id>();
    for (const wall of plan.walls) {
      if (wallEnds(plan, wall).every(inside)) {
        walls.add(wall.id);
        items.push({ kind: "wall", id: wall.id });
      }
    }
    for (const opening of plan.openings) {
      if (walls.has(opening.wallId)) items.push({ kind: "opening", id: opening.id });
    }
    for (const dimension of plan.dimensions) {
      if (inside(dimension.a) && inside(dimension.b)) {
        items.push({ kind: "dimension", id: dimension.id });
      }
    }
    for (const stair of plan.stairs) {
      if (inside(stair.a) && inside(stair.b)) items.push({ kind: "stair", id: stair.id });
    }
    for (const chimney of plan.chimneys) {
      if (inside(chimney)) items.push({ kind: "chimney", id: chimney.id });
    }
    for (const piece of plan.furniture) {
      if (inside(piece)) items.push({ kind: "furniture", id: piece.id });
    }
    for (const fixture of plan.fixtures) {
      if (this.layers[fixture.system] && inside(fixture)) {
        items.push({ kind: "fixture", id: fixture.id });
      }
    }
    for (const run of plan.runs) {
      if (this.layers[run.system] && run.points.every(inside)) {
        items.push({ kind: "run", id: run.id });
      }
    }
    // A vertex of a selected wall moves with the wall, so only lone vertices go in.
    for (const vertex of plan.vertices) {
      if (!inside(vertex)) continue;
      const ofWall = plan.walls.some(
        (w) => walls.has(w.id) && (w.a === vertex.id || w.b === vertex.id),
      );
      if (!ofWall) items.push({ kind: "vertex", id: vertex.id });
    }
    return items;
  }

  /**
   * Snaps the pointer: first to a vertex, then to a wall, then to the grid. When the wall tool
   * or the dimension tool has a start point, the direction from it snaps to multiples of 15°
   * if it is near one. With Shift, the direction stays at a multiple of 45°. Alt turns off the
   * grid and the snap of the direction.
   */
  private snap(world: Point, keys: { altKey: boolean; shiftKey: boolean }, exclude?: Id): Snap {
    const plan = this.doc.plan;
    const step = (value: number) =>
      keys.altKey ? value : Math.round(value / GRID_STEP) * GRID_STEP;
    const start =
      this.currentTool === "wall"
        ? this.chain?.point
        : this.currentTool === "run" && this.runPoints.length > 0
          ? this.runPoints[this.runPoints.length - 1]
          : (this.currentTool === "dimension" || this.currentTool === "stair") &&
              this.measure.length === 1
            ? this.measure[0]
            : undefined;

    if (start && keys.shiftKey) {
      return { point: this.alongAngle(start, world, SHIFT_ANGLE_STEP, step) };
    }

    const tolerance = SNAP_PIXELS / this.zoom;
    let best: Snap | null = null;
    let bestDistance = tolerance;
    for (const vertex of plan.vertices) {
      if (vertex.id === exclude) continue;
      const d = distance(world, vertex);
      if (d < bestDistance) {
        bestDistance = d;
        best = { point: { x: vertex.x, y: vertex.y }, vertexId: vertex.id };
      }
    }
    if (best) return best;
    for (const wall of plan.walls) {
      if (exclude && (wall.a === exclude || wall.b === exclude)) continue;
      const [a, b] = wallEnds(plan, wall);
      const hit = closestOnSegment(world, a, b);
      if (hit.distance < bestDistance) {
        bestDistance = hit.distance;
        best = { point: hit.point, wallId: wall.id };
      }
    }
    if (best) return best;

    if (start && !keys.altKey) {
      const along = this.alongAngle(start, world, ANGLE_STEP, step);
      const angle = (p: Point) => Math.atan2(p.y - start.y, p.x - start.x);
      const difference = Math.abs(angle(world) - angle(along)) % (2 * Math.PI);
      const degrees = (Math.min(difference, 2 * Math.PI - difference) * 180) / Math.PI;
      if (degrees < ANGLE_TOLERANCE) return { point: along };
    }
    return { point: { x: step(world.x), y: step(world.y) } };
  }

  /** The point at the distance of `world` from `start`, in the direction rounded to `degrees`. */
  private alongAngle(
    start: Point,
    world: Point,
    degrees: number,
    step: (value: number) => number,
  ): Point {
    const d = sub(world, start);
    const unit = (degrees * Math.PI) / 180;
    const angle = Math.round(Math.atan2(d.y, d.x) / unit) * unit;
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    const length = step(dot(d, dir));
    // A direction along an axis gives exact coordinates, without rounding errors of cos and sin.
    const exact = (value: number) => (Math.abs(value) < 1e-12 ? 0 : value);
    return add(start, scale({ x: exact(dir.x), y: exact(dir.y) }, length));
  }

  /** Gives the vertex for a snap point. It makes the vertex, and splits a wall if necessary. */
  private resolve(plan: Plan, snap: Snap): Id {
    if (snap.vertexId && findVertex(plan, snap.vertexId)) return snap.vertexId;
    if (snap.wallId) {
      // The wall can be split already, if the other end of the new wall is on it too.
      const wall = findWall(plan, snap.wallId) ?? nearestWall(plan, snap.point, 1e-6)?.wall;
      if (wall) return splitWall(plan, wall.id, snap.point).id;
    }
    return addVertex(plan, snap.point).id;
  }

  /**
   * Adds a point to the chain of the wall tool. A click on a vertex or on a wall ends the chain,
   * because that closes a room or connects to the existing walls.
   */
  private addChainPoint(target: Snap): void {
    const start = this.chain;
    if (!start) {
      this.chain = target;
      this.render();
      return;
    }
    if (distance(start.point, target.point) < 1e-6) return;
    let end: Id = "";
    // addWall gives null for a copy of a wall. Then the document drops the new vertices and the
    // split walls too, and the history gets no entry.
    const added = this.doc.editIf((plan) => {
      const a = this.resolve(plan, start);
      end = this.resolve(plan, target);
      const wall = addWall(plan, a, end, {
        thickness: WALL_DEFAULTS.thickness,
        height: defaultWallHeight(plan),
      });
      return wall !== null;
    });
    // Without a new wall, the vertex `end` can be gone. So the chain keeps only the point.
    const next: Snap = added ? { point: target.point, vertexId: end } : { point: target.point };
    this.chain = target.vertexId || target.wallId ? null : next;
    this.render();
  }

  /** The offset of a dimension line from `a` to `b` that goes through the point `p`. */
  private measureOffset(a: Point, b: Point, p: Point, free: boolean): number {
    const length = distance(a, b);
    if (length === 0) return 0;
    const side = perpendicular(scale(sub(b, a), 1 / length));
    const offset = dot(sub(p, a), side);
    return free ? offset : Math.round(offset / GRID_STEP) * GRID_STEP;
  }

  /** The dimension tool: a click on each end, and a third click that sets the offset. */
  private addMeasurePoint(world: Point, e: PointerEvent): void {
    if (this.measure.length < 2) {
      const point = this.snap(world, e).point;
      if (this.measure.length === 1 && distance(this.measure[0], point) < 1e-6) return;
      this.measure.push(point);
      if (this.currentTool === "stair" && this.measure.length === 2) {
        // The stair tool needs only the start and the end of the run.
        const [a, b] = this.measure;
        let id: Id = "";
        this.doc.edit((plan) => (id = addStair(plan, a, b).id));
        this.measure = [];
        this.select({ kind: "stair", id });
        return;
      }
      this.render();
      return;
    }
    const [a, b] = this.measure;
    const offset = this.measureOffset(a, b, world, e.altKey);
    let id: Id = "";
    this.doc.edit((plan) => (id = addDimension(plan, a, b, offset).id));
    this.measure = [];
    this.select({ kind: "dimension", id });
  }

  private placeOpening(kind: OpeningKind, world: Point): void {
    const plan = this.doc.plan;
    const hit = nearestWall(plan, world, SNAP_PIXELS / this.zoom + 0.3);
    if (!hit) return;
    let id: Id = "";
    this.doc.edit((plan) => {
      const wall = findWall(plan, hit.wall.id)!;
      const [a, b] = wallEnds(plan, wall);
      const opening = addOpening(plan, wall.id, kind, hit.t * distance(a, b));
      // A door opens to the side of the wall where the user clicked.
      const side = perpendicular(sub(b, a));
      opening.swing = dot(sub(world, hit.point), side) < 0 ? -1 : 1;
      id = opening.id;
    });
    this.select({ kind: "opening", id });
  }

  private checkSelection(): void {
    const plan = this.doc.plan;
    const roofs = this.doc.building.roofs;
    const items = this.items.filter((item) => {
      if (item.kind === "roof") return roofs.some((r) => r.id === item.id);
      if (item.kind === "roof-corner") {
        const [roofId, index] = item.id.split(":");
        const roof = roofs.find((r) => r.id === roofId);
        return !!roof && Number(index) < roof.outline.length;
      }
      return itemExists(plan, item);
    });
    if (items.length !== this.items.length) {
      this.items = items;
      this.onSelect(items);
    }
  }

  // ----- Drawing -----

  render(): void {
    const plan = this.doc.plan;
    const world = this.content.parentElement!;
    world.setAttribute(
      "transform",
      `translate(${this.offset.x} ${this.offset.y}) scale(${this.zoom})`,
    );
    this.renderBackground(plan);
    this.content.replaceChildren();
    this.renderGrid();
    this.renderRooms(plan);
    this.renderClearHeight();
    this.renderStoryBelow();
    this.renderFurniture(plan);
    this.renderWalls(plan);
    this.renderOpenings(plan);
    this.renderRuns(plan);
    this.renderFixtures(plan);
    this.renderStairs(plan);
    this.renderChimneys(plan);
    this.renderDimensions(plan);
    this.renderRoof();
    if (this.currentTool === "select" || this.currentTool === "wall") this.renderVertices(plan);
    for (const draw of this.overlays.values()) {
      draw(svg("g", { class: "extra" }, this.content), this.zoom);
    }
    this.renderOverlay(plan);
  }

  private renderBackground(plan: Plan): void {
    const image = this.backgroundImage;
    const background = plan.background;
    if (!background) {
      image.setAttribute("visibility", "hidden");
      return;
    }
    // Set the image only after a change: a new image of some megabytes must decode again.
    if (image.getAttribute("href") !== background.image) {
      image.setAttribute("href", background.image);
    }
    image.setAttribute("visibility", "visible");
    image.setAttribute("x", String(background.x));
    image.setAttribute("y", String(background.y));
    image.setAttribute("width", String(background.width * background.scale));
    image.setAttribute("height", String(background.height * background.scale));
    image.setAttribute("opacity", String(background.opacity));
  }

  private renderGrid(): void {
    const { width, height } = this.element.getBoundingClientRect();
    const step = this.zoom < 15 ? 5 : 1;
    const x0 = Math.floor(-this.offset.x / this.zoom / step) * step;
    const x1 = (width - this.offset.x) / this.zoom;
    const y0 = Math.floor(-this.offset.y / this.zoom / step) * step;
    const y1 = (height - this.offset.y) / this.zoom;
    const group = svg("g", { class: "grid" }, this.content);
    for (let x = x0; x <= x1; x += step) {
      svg("line", { x1: x, y1: y0, x2: x, y2: y1, class: x === 0 ? "axis" : "" }, group);
    }
    for (let y = y0; y <= y1; y += step) {
      svg("line", { x1: x0, y1: y, x2: x1, y2: y, class: y === 0 ? "axis" : "" }, group);
    }
  }

  private renderRooms(plan: Plan): void {
    const group = svg("g", { class: "rooms" }, this.content);
    for (const room of findRooms(plan)) {
      const selected = this.isSelected("room", room.key);
      svg("polygon", { points: points(room.polygon), class: selected ? "selected" : "" }, group);
      const lines = roomLabel(room);
      lines.forEach((text, i) => {
        // The lines stack around the label point. The name is bold.
        const at = {
          x: room.labelAt.x,
          y: room.labelAt.y + ((i - (lines.length - 1) / 2) * 15) / this.zoom,
        };
        const element = this.label(group, at, text, "room-label");
        if (room.info?.name && i === 0) element.classList.add("name");
      });
    }
  }

  /**
   * The lines of 1 m and 2 m clear height in the rooms under a pitched roof, as thin dashed
   * lines. The WoFlV counts the floor area under 1 m not, and from 1 m to 2 m half.
   */
  private renderClearHeight(): void {
    const building = this.doc.building;
    const story = this.doc.plan;
    const group = svg("g", { class: "clear-height" }, this.content);
    for (const [level, name] of [
      [WOFLV.half, "low"],
      [WOFLV.full, "high"],
    ] as const) {
      for (const [p, q] of clearHeightLines(building, story, level)) {
        svg("line", { x1: p.x, y1: p.y, x2: q.x, y2: q.y, class: name }, group);
      }
    }
  }

  private renderWalls(plan: Plan): void {
    const group = svg("g", { class: "walls" }, this.content);
    for (const wall of plan.walls) {
      const outline = wallOutline(plan, wall);
      if (outline.length === 0) continue;
      svg(
        "polygon",
        {
          points: points(outline),
          class: this.isSelected("wall", wall.id) ? "wall selected" : "wall",
          "data-kind": "wall",
          "data-id": wall.id,
        },
        group,
      );
    }
  }

  private renderOpenings(plan: Plan): void {
    const group = svg("g", { class: "openings" }, this.content);
    for (const opening of plan.openings) {
      const shape = openingShape(plan, opening);
      if (!shape) continue;
      const element = svg(
        "g",
        {
          class: `opening ${opening.kind}${this.isSelected("opening", opening.id) ? " selected" : ""}`,
          "data-kind": "opening",
          "data-id": opening.id,
        },
        group,
      );
      svg("polygon", { points: points(shape.gap), class: "gap" }, element);
      if (shape.kind === "door") {
        const { hinge, leaf, arc } = shape;
        svg("line", { x1: hinge.x, y1: hinge.y, x2: leaf.x, y2: leaf.y, class: "leaf" }, element);
        svg(
          "path",
          {
            d: `M ${arc.from.x} ${arc.from.y} A ${arc.radius} ${arc.radius} 0 0 ${arc.sweep} ${arc.to.x} ${arc.to.y}`,
            class: "swing",
          },
          element,
        );
      } else {
        const [start, end] = shape.glass;
        svg("line", { x1: start.x, y1: start.y, x2: end.x, y2: end.y, class: "glass" }, element);
      }
    }
  }

  /**
   * The walls of the story below, and its stairs that come up into this story, in a light color.
   * They help to put the walls of this story on top of the walls below.
   */
  private renderStoryBelow(): void {
    const building = this.doc.building;
    const story = this.doc.plan;
    const below = storyBelow(building, story);
    if (!below) return;
    const group = svg("g", { class: "below" }, this.content);
    for (const wall of below.walls) {
      const outline = wallOutline(below, wall);
      if (outline.length > 0) svg("polygon", { points: points(outline) }, group);
    }
    for (const stair of below.stairs) {
      const shape = stairShape(stair, stairRise(building, below));
      svg("polygon", { points: points(shape.outline), class: "stair-hole" }, group);
    }
  }

  /**
   * The lines of the roofs of the active story, as dashed lines. A selected roof also shows its
   * outline with a handle at each corner, and a "+" handle in the middle of each side that adds a
   * corner when the user drags it.
   */
  private renderRoof(): void {
    const building = this.doc.building;
    const storyId = this.doc.plan.id;
    const group = svg("g", { class: "roof-lines" }, this.content);
    for (const [p, q] of roofLines(building, storyId)) {
      svg("line", { x1: p.x, y1: p.y, x2: q.x, y2: q.y }, group);
    }
    for (const roof of building.roofs) {
      if (roof.storyId !== storyId) continue;
      const selected = this.items.some(
        (i) =>
          (i.kind === "roof" && i.id === roof.id) ||
          (i.kind === "roof-corner" && i.id.startsWith(`${roof.id}:`)),
      );
      if (!selected) continue;
      const handles = svg("g", { class: "roof-outline" }, this.content);
      svg("polygon", { points: points(roof.outline), class: "outline" }, handles);
      const n = roof.outline.length;
      roof.outline.forEach((p, i) => {
        const q = roof.outline[(i + 1) % n];
        const mid = scale(add(p, q), 0.5);
        // The number of the side, outside the outline, so that the user finds the side of a row
        // of the panel. The outline can go either way round, so the label goes to the side of
        // the normal that points away from the center of the outline.
        const center = scale(roof.outline.reduce(add, { x: 0, y: 0 }), 1 / n);
        const length = distance(p, q) || 1;
        let normal = perpendicular(scale(sub(q, p), 1 / length));
        if (dot(normal, sub(mid, center)) < 0) normal = scale(normal, -1);
        const at = add(mid, scale(normal, 16 / this.zoom));
        this.label(handles, at, String(i + 1), "side-number");
        svg(
          "circle",
          {
            cx: mid.x,
            cy: mid.y,
            r: 4 / this.zoom,
            class: "insert",
            "data-kind": "roof-insert",
            "data-id": `${roof.id}:${i}`,
          },
          handles,
        );
      });
      roof.outline.forEach((p, i) => {
        const id = `${roof.id}:${i}`;
        const active = this.isSelected("roof-corner", id);
        svg(
          "rect",
          {
            x: p.x - 5 / this.zoom,
            y: p.y - 5 / this.zoom,
            width: 10 / this.zoom,
            height: 10 / this.zoom,
            class: active ? "corner selected" : "corner",
            "data-kind": "roof-corner",
            "data-id": id,
          },
          handles,
        );
      });
    }
  }

  private renderStairs(plan: Plan): void {
    const group = svg("g", { class: "stairs" }, this.content);
    const rise = stairRise(this.doc.building, this.doc.plan);
    for (const stair of plan.stairs) {
      const element = svg(
        "g",
        {
          class: this.isSelected("stair", stair.id) ? "stair selected" : "stair",
          "data-kind": "stair",
          "data-id": stair.id,
        },
        group,
      );
      this.drawStair(element, stairDrawing(stair, rise));
    }
  }

  private drawStair(element: Element, shape: StairDrawing): void {
    svg("polygon", { points: points(shape.outline), class: "outline" }, element);
    shape.steps.forEach((step, i) => {
      const className = i === shape.landing ? "step landing" : "step";
      svg("polygon", { points: points(step), class: className }, element);
    });
    svg("polyline", { points: points(shape.arrow), class: "walk" }, element);
    const start = shape.arrow[0];
    svg("circle", { cx: start.x, cy: start.y, r: 3 / this.zoom, class: "walk-start" }, element);
    for (const [p, q] of shape.head) {
      svg("line", { x1: p.x, y1: p.y, x2: q.x, y2: q.y, class: "walk" }, element);
    }
  }

  private renderFurniture(plan: Plan): void {
    const group = svg("g", { class: "furniture" }, this.content);
    for (const piece of plan.furniture) {
      const selected = this.isSelected("furniture", piece.id);
      const element = svg(
        "g",
        {
          class: selected ? "piece selected" : "piece",
          "data-kind": "furniture",
          "data-id": piece.id,
        },
        group,
      );
      this.drawPiece(element, piece);
    }
  }

  /**
   * Draws a piece: its symbol, or for a model the image from above if the editor has it. A model
   * piece without the image shows its name.
   */
  private drawPiece(element: Element, piece: Furniture): void {
    const topView = piece.source.kind === "model" ? this.topViews.get(piece.source.modelId) : null;
    const symbol = furnitureSymbol(piece);
    if (topView) {
      svg("polygon", { points: points(symbol.shapes[0]), class: "box" }, element);
      const image = svg(
        "image",
        {
          x: -piece.width / 2,
          y: -piece.depth / 2,
          width: piece.width,
          height: piece.depth,
          preserveAspectRatio: "none",
          transform: `translate(${piece.x} ${piece.y}) rotate(${piece.rotation})`,
          class: "top-view",
        },
        element,
      );
      image.setAttribute("href", topView);
      return;
    }
    symbol.shapes.forEach((shape, i) => {
      svg("polygon", { points: points(shape), class: i === 0 ? "box" : "part" }, element);
    });
    for (const [a, b] of symbol.lines) {
      svg("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "part" }, element);
    }
    if (piece.source.kind === "model") {
      this.label(element, { x: piece.x, y: piece.y }, piece.name, "piece-name");
    }
  }

  private renderRuns(plan: Plan): void {
    const group = svg("g", { class: "runs" }, this.content);
    for (const run of plan.runs) {
      if (!this.layers[run.system]) continue;
      const kind = runKind(run.kind);
      const element = svg(
        "g",
        {
          class: this.isSelected("run", run.id) ? "run selected" : "run",
          "data-kind": "run",
          "data-id": run.id,
        },
        group,
      );
      const list = points(run.points);
      svg("polyline", { points: list, class: "hit" }, element);
      const line = svg("polyline", { points: list, class: "line", stroke: kind.color }, element);
      if (kind.dashed) line.setAttribute("stroke-dasharray", "6 4");
    }
  }

  private renderFixtures(plan: Plan): void {
    const group = svg("g", { class: "fixtures" }, this.content);
    for (const fixture of plan.fixtures) {
      if (!this.layers[fixture.system]) continue;
      const selected = this.isSelected("fixture", fixture.id);
      const element = svg(
        "g",
        {
          class: `fixture ${fixture.system}${selected ? " selected" : ""}`,
          "data-kind": "fixture",
          "data-id": fixture.id,
        },
        group,
      );
      this.drawFixture(element, fixture);
    }
  }

  private drawFixture(element: Element, fixture: Fixture): void {
    const symbol = fixtureSymbol(fixture);
    // A circle without a fill makes a small device easy to hit with the pointer.
    svg("circle", { cx: fixture.x, cy: fixture.y, r: 0.18, class: "hit" }, element);
    for (const shape of symbol.shapes)
      svg("polygon", { points: points(shape), class: "shape" }, element);
    for (const line of symbol.lines)
      svg("polyline", { points: points(line), class: "stroke" }, element);
    for (const shape of symbol.filled)
      svg("polygon", { points: points(shape), class: "fill" }, element);
  }

  private renderChimneys(plan: Plan): void {
    const group = svg("g", { class: "chimneys" }, this.content);
    const draw = (chimney: Chimney, attributes: Attributes) => {
      const element = svg("g", attributes, group);
      const symbol = chimneySymbol(chimney);
      svg("polygon", { points: points(symbol.outline), class: "outline" }, element);
      for (const [p, q] of symbol.diagonals) {
        svg("line", { x1: p.x, y1: p.y, x2: q.x, y2: q.y, class: "cross" }, element);
      }
    };
    for (const { chimney } of chimneysThrough(this.doc.building, this.doc.plan)) {
      draw(chimney, { class: "chimney through" });
    }
    for (const chimney of plan.chimneys) {
      draw(chimney, {
        class: this.isSelected("chimney", chimney.id) ? "chimney selected" : "chimney",
        "data-kind": "chimney",
        "data-id": chimney.id,
      });
    }
  }

  private renderDimensions(plan: Plan): void {
    const group = svg("g", { class: "dimensions" }, this.content);
    for (const dimension of plan.dimensions) {
      const selected = this.isSelected("dimension", dimension.id);
      const element = svg(
        "g",
        {
          class: selected ? "dimension-line selected" : "dimension-line",
          "data-kind": "dimension",
          "data-id": dimension.id,
        },
        group,
      );
      this.drawDimension(element, dimensionShape(dimension));
    }
  }

  private drawDimension(parent: Element, shape: ReturnType<typeof dimensionShape>): void {
    const line = (p: Point, q: Point, className: string) =>
      svg("line", { x1: p.x, y1: p.y, x2: q.x, y2: q.y, class: className }, parent);
    const [p, q] = shape.line;
    // A wide line without color makes the dimension line easy to hit with the pointer.
    line(p, q, "hit");
    line(p, q, "main");
    for (const [s, e] of shape.extensions) line(s, e, "extension");
    for (const [s, e] of shape.ticks) line(s, e, "tick");
    const at = add(shape.textAt, scale(shape.normal, 9 / this.zoom));
    const text = this.label(parent, at, shape.text, "measure");
    text.setAttribute("transform", `rotate(${shape.angle} ${at.x} ${at.y})`);
  }

  private renderVertices(plan: Plan): void {
    const group = svg("g", { class: "vertices" }, this.content);
    for (const vertex of plan.vertices) {
      svg(
        "circle",
        {
          cx: vertex.x,
          cy: vertex.y,
          r: 5 / this.zoom,
          class: this.isSelected("vertex", vertex.id) ? "vertex selected" : "vertex",
          "data-kind": "vertex",
          "data-id": vertex.id,
        },
        group,
      );
    }
  }

  private renderOverlay(plan: Plan): void {
    const group = svg("g", { class: "overlay" }, this.content);
    if (this.items.length === 1 && this.items[0].kind === "wall") {
      const wall = findWall(plan, this.items[0].id);
      if (wall) {
        const [a, b] = wallEnds(plan, wall);
        this.label(group, scale(add(a, b), 0.5), `${distance(a, b).toFixed(2)} m`, "dimension");
      }
    }
    if (this.drag?.kind === "marquee") {
      const { start, end } = this.drag;
      svg(
        "rect",
        {
          x: Math.min(start.x, end.x),
          y: Math.min(start.y, end.y),
          width: Math.abs(end.x - start.x),
          height: Math.abs(end.y - start.y),
          class: "marquee",
        },
        group,
      );
    }
    const marker = (p: Point, className = "") =>
      svg("circle", { cx: p.x, cy: p.y, r: 4 / this.zoom, class: `cursor ${className}` }, group);
    if (this.currentTool === "wall" && this.cursor) {
      const p = this.cursor.point;
      marker(p, this.cursor.vertexId ? "on-vertex" : this.cursor.wallId ? "on-wall" : "");
      if (this.chain) {
        const s = this.chain.point;
        svg("line", { x1: s.x, y1: s.y, x2: p.x, y2: p.y, class: "preview" }, group);
        this.label(group, scale(add(s, p), 0.5), `${distance(s, p).toFixed(2)} m`, "dimension");
      }
    }
    if (this.currentTool === "dimension") {
      const cursor = this.cursor;
      if (this.measure.length < 2 && cursor) {
        marker(cursor.point, cursor.vertexId ? "on-vertex" : cursor.wallId ? "on-wall" : "");
      }
      for (const p of this.measure) marker(p);
      const [a, b] = this.measure;
      if (a && !b && cursor) {
        svg(
          "line",
          { x1: a.x, y1: a.y, x2: cursor.point.x, y2: cursor.point.y, class: "preview" },
          group,
        );
      }
      if (a && b) {
        const offset = cursor ? this.measureOffset(a, b, cursor.point, false) : 0;
        const preview = svg("g", { class: "dimension-line preview-dimension" }, group);
        this.drawDimension(preview, dimensionShape({ id: "", a, b, offset }));
      }
    }
    if (this.currentTool === "fixture" && this.placingFixture && this.cursor) {
      const ghost = {
        ...this.placingFixture,
        ...this.placeFixtureAt(this.placingFixture, this.cursor.point, false),
      };
      this.drawFixture(svg("g", { class: `fixture ghost ${ghost.system}` }, group), ghost);
    }
    if (this.currentTool === "run" && this.cursor) {
      const kind = runKind(this.runKindName);
      const target = this.runSnap(this.cursor.point, { altKey: false, shiftKey: false });
      marker(target.point, target.fixtureId ? "on-vertex" : "");
      if (this.runPoints.length > 0) {
        const line = svg(
          "polyline",
          {
            points: points([...this.runPoints, target.point]),
            class: "run-preview",
            stroke: kind.color,
          },
          group,
        );
        if (kind.dashed) line.setAttribute("stroke-dasharray", "6 4");
      }
    }
    if (this.currentTool === "furniture" && this.placing && this.cursor) {
      const ghost = { ...this.placing, ...this.placeAt(this.placing, this.cursor.point, false) };
      this.drawPiece(svg("g", { class: "piece ghost" }, group), ghost);
      svg("polygon", { points: points(furnitureOutline(ghost)), class: "ghost-box" }, group);
    }
    if (this.currentTool === "stair" || this.currentTool === "chimney") {
      const cursor = this.cursor;
      if (cursor) marker(cursor.point, cursor.vertexId ? "on-vertex" : "");
      const [a] = this.measure;
      if (a && cursor && this.currentTool === "stair") {
        const shape = stairDrawing(
          { id: "", a, b: cursor.point, width: 1, kind: "straight", turn: 1, run2: 1 },
          stairRise(this.doc.building, this.doc.plan),
        );
        this.drawStair(svg("g", { class: "stair preview-stair" }, group), shape);
        this.label(
          group,
          scale(add(a, cursor.point), 0.5),
          `${shape.count} steps · ${(shape.stepHeight * 100).toFixed(1)} cm`,
          "dimension",
        );
      }
    }
    if (this.currentTool === "rectify") {
      const corners = [...this.calibration];
      if (corners.length < 4 && this.cursor) corners.push(this.cursor.point);
      for (const p of corners) marker(p);
      if (corners.length > 1) {
        svg("polygon", { points: points(corners), class: "corners" }, group);
      }
    }
    if (this.currentTool === "calibrate") {
      const line = [...this.calibration];
      if (line.length === 1 && this.cursor) line.push(this.cursor.point);
      for (const p of line) marker(p);
      if (line.length === 2) {
        const [s, p] = line;
        svg("line", { x1: s.x, y1: s.y, x2: p.x, y2: p.y, class: "preview" }, group);
      }
    }
  }

  private label(parent: Element, at: Point, text: string, className: string): SVGTextElement {
    const element = svg(
      "text",
      // The text uses world units, so the font size and the width of the halo divide by the
      // zoom. A non-scaling stroke does not apply to text in all browsers.
      {
        x: at.x,
        y: at.y,
        "font-size": 12 / this.zoom,
        "stroke-width": 3 / this.zoom,
        class: className,
      },
      parent,
    );
    element.textContent = text;
    return element;
  }

  private isSelected(kind: ItemKind, id: Id): boolean {
    return this.items.some((i) => i.kind === kind && i.id === id);
  }
}

/**
 * Moves the dormers and the windows of a roof when a side is added at `index` (`delta` 1) or
 * removed (`delta` -1), so that each keeps its side.
 */
function shiftRoofItems(roof: Roof, index: number, delta: 1 | -1 = 1): void {
  // A removed side takes its dormers and windows with it. This must come before the shift, else
  // the items of the next side would get the index of the removed side.
  if (delta === -1) {
    roof.dormers = roof.dormers.filter((d) => d.side !== index);
    roof.windows = roof.windows.filter((w) => w.side !== index);
  }
  for (const item of [...roof.dormers, ...roof.windows]) {
    if (delta === 1 && item.side >= index) item.side += 1;
    if (delta === -1 && item.side > index) item.side -= 1;
  }
}
