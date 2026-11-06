// The 2D editor: an SVG view of the plan with tools to draw and change it. The editor keeps no
// copy of the plan. It reads the plan from the document for each frame, and it changes the plan
// only through transactions of the document.

import {
  chimneyOutline,
  chimneysThrough,
  defaultWallHeight,
  stairRise,
  stairShape,
  storyBelow,
} from "../model/building";
import { dimensionShape, openingShape, wallOutline } from "../model/drawing";
import { roofLines } from "../model/roof";
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
  wallMoveTargets,
  WALL_DEFAULTS,
  type MoveOrigin,
} from "../model/plan";
import { findRooms, pointInPolygon, roomLabel } from "../model/rooms";
import type { Chimney, Clip, Id, Item, ItemKind, OpeningKind, Plan, Point } from "../model/types";

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
  | "wall"
  | "door"
  | "window"
  | "dimension"
  | "stair"
  | "chimney"
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
  | { kind: "move"; startWorld: Point; origin: MoveOrigin };

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

  onSelect: (selection: Selection) => void = () => {};
  onCalibrate: (a: Point, b: Point) => void = () => {};
  /** The "rectify" tool calls this after the fourth click, with the corners in meters. */
  onCorners: (corners: [Point, Point, Point, Point]) => void = () => {};

  constructor(
    container: HTMLElement,
    private readonly doc: PlanDocument,
  ) {
    this.element = svg("svg", { class: "editor2d" });
    container.append(this.element);
    const world = svg("g", {}, this.element);
    this.backgroundImage = svg("image", { preserveAspectRatio: "none" }, world);
    this.content = svg("g", {}, world);

    doc.subscribe(() => {
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
    this.element.addEventListener("dblclick", () => this.cancel());
    this.element.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement)) this.spaceDown = true;
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") this.spaceDown = false;
    });
    new ResizeObserver(() => this.render()).observe(this.element);
  }

  get tool(): Tool {
    return this.currentTool;
  }

  set tool(tool: Tool) {
    this.currentTool = tool;
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
      ...plan.vertices.map((v) => ({ kind: "vertex" as const, id: v.id })),
    ]);
  }

  /** Stops the current action: the wall chain, the measure, the calibration, or the selection. */
  cancel(): void {
    if (this.drag && this.drag.kind !== "pan" && this.drag.kind !== "marquee") this.doc.cancel();
    this.drag = null;
    if (this.chain) this.chain = null;
    else if (this.measure.length > 0) this.measure = [];
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
    this.doc.edit((plan) => removeItems(plan, items));
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
      moveFromOrigin(plan, moveOrigin(plan, items), delta);
      for (const item of items) {
        const opening = item.kind === "opening" ? findOpening(plan, item.id) : undefined;
        if (!opening) continue;
        // An opening moves along its wall. The component of `delta` along the wall moves it.
        const [a, b] = wallEnds(plan, findWall(plan, opening.wallId)!);
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

  /** Shows the whole plan, or the background if the plan has no walls. */
  fit(): void {
    const { width, height: fullHeight } = this.element.getBoundingClientRect();
    // The tool palette floats over the top of the editor, so the plan fits below it.
    const top = Math.min(FIT_TOP_INSET, fullHeight / 4);
    const height = fullHeight - top;
    const plan = this.doc.plan;
    const box: Point[] = [
      ...plan.vertices.map((v) => ({ x: v.x, y: v.y })),
      ...plan.dimensions.flatMap((d) => dimensionShape(d).line),
    ];
    if (box.length === 0 && plan.background) {
      const b = plan.background;
      box.push({ x: b.x, y: b.y }, { x: b.x + b.width * b.scale, y: b.y + b.height * b.scale });
    }
    if (box.length === 0 || width === 0) {
      this.zoom = 50;
      this.offset = { x: width / 2, y: top + height / 2 };
    } else {
      const minX = Math.min(...box.map((p) => p.x));
      const maxX = Math.max(...box.map((p) => p.x));
      const minY = Math.min(...box.map((p) => p.y));
      const maxY = Math.max(...box.map((p) => p.y));
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
    this.drag = {
      kind: "pan",
      startScreen: { x: e.clientX, y: e.clientY },
      startOffset: { ...this.offset },
    };
  }

  private pointerDown(e: PointerEvent): void {
    this.element.setPointerCapture(e.pointerId);
    const world = this.toWorld(e);
    if (e.button === 1 || e.button === 2 || this.spaceDown) {
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
    if (this.items.length > 1 || hit.kind === "stair" || hit.kind === "chimney") {
      this.drag = {
        kind: "move",
        startWorld: world,
        origin: moveOrigin(this.doc.plan, this.items),
      };
      return;
    }
    if (hit.kind === "vertex") this.drag = { kind: "vertex", id: hit.id, target: null };
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
      const snapping = ["wall", "dimension", "stair", "chimney"].includes(this.currentTool);
      this.cursor = snapping ? this.snap(world, e) : { point: world };
      this.render();
      return;
    }
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
    if (!drag || drag.kind === "pan") return;
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
    if (drag.kind === "vertex" && drag.target?.vertexId) {
      const into = drag.target.vertexId;
      this.doc.update((plan) => mergeVertex(plan, drag.id, into));
      this.items = [{ kind: "vertex", id: into }];
      this.onSelect(this.items);
    }
    this.doc.commit();
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    const world = this.toWorld(e);
    const rect = this.element.getBoundingClientRect();
    this.zoom = clamp(this.zoom * Math.exp(-e.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
    this.offset = {
      x: e.clientX - rect.left - world.x * this.zoom,
      y: e.clientY - rect.top - world.y * this.zoom,
    };
    this.render();
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
    this.doc.edit((plan) => {
      const a = this.resolve(plan, start);
      end = this.resolve(plan, target);
      addWall(plan, a, end, {
        thickness: WALL_DEFAULTS.thickness,
        height: defaultWallHeight(plan),
      });
    });
    this.chain = target.vertexId || target.wallId ? null : { point: target.point, vertexId: end };
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
    const items = this.items.filter((item) => itemExists(plan, item));
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
    this.renderStoryBelow();
    this.renderWalls(plan);
    this.renderOpenings(plan);
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

  /** The lines of the roof, as dashed lines on the story under the roof. */
  private renderRoof(): void {
    const building = this.doc.building;
    if (building.roof?.storyId !== this.doc.plan.id) return;
    const group = svg("g", { class: "roof-lines" }, this.content);
    for (const [p, q] of roofLines(building)) {
      svg("line", { x1: p.x, y1: p.y, x2: q.x, y2: q.y }, group);
    }
  }

  private renderStairs(plan: Plan): void {
    const group = svg("g", { class: "stairs" }, this.content);
    const rise = stairRise(this.doc.building, this.doc.plan);
    for (const stair of plan.stairs) {
      const shape = stairShape(stair, rise);
      const element = svg(
        "g",
        {
          class: this.isSelected("stair", stair.id) ? "stair selected" : "stair",
          "data-kind": "stair",
          "data-id": stair.id,
        },
        group,
      );
      this.drawStair(element, shape, stair.width);
    }
  }

  private drawStair(element: Element, shape: ReturnType<typeof stairShape>, width: number): void {
    svg("polygon", { points: points(shape.outline), class: "outline" }, element);
    shape.steps.forEach((step, i) => {
      const className = i === shape.landing ? "step landing" : "step";
      svg("polygon", { points: points(step), class: className }, element);
    });
    svg("polyline", { points: points(shape.arrow), class: "walk" }, element);
    const start = shape.arrow[0];
    svg("circle", { cx: start.x, cy: start.y, r: 3 / this.zoom, class: "walk-start" }, element);
    const [from, to] = shape.arrow.slice(-2);
    // The head of the arrow: two short lines at the top end.
    const length = distance(from, to);
    if (length === 0) return;
    const dir = scale(sub(to, from), 1 / length);
    const size = Math.min(width / 3, 0.25);
    const back = sub(to, scale(dir, size));
    const side = scale(perpendicular(dir), size / 1.6);
    for (const tip of [add(back, side), sub(back, side)]) {
      svg("line", { x1: tip.x, y1: tip.y, x2: to.x, y2: to.y, class: "walk" }, element);
    }
  }

  private renderChimneys(plan: Plan): void {
    const group = svg("g", { class: "chimneys" }, this.content);
    const draw = (chimney: Chimney, attributes: Attributes) => {
      const element = svg("g", attributes, group);
      const [a, b, c, d] = chimneyOutline(chimney);
      svg("polygon", { points: points([a, b, c, d]), class: "outline" }, element);
      svg("line", { x1: a.x, y1: a.y, x2: c.x, y2: c.y, class: "cross" }, element);
      svg("line", { x1: b.x, y1: b.y, x2: d.x, y2: d.y, class: "cross" }, element);
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
    if (this.currentTool === "stair" || this.currentTool === "chimney") {
      const cursor = this.cursor;
      if (cursor) marker(cursor.point, cursor.vertexId ? "on-vertex" : "");
      const [a] = this.measure;
      if (a && cursor && this.currentTool === "stair") {
        const shape = stairShape(
          { id: "", a, b: cursor.point, width: 1, kind: "straight", turn: 1, run2: 1 },
          stairRise(this.doc.building, this.doc.plan),
        );
        this.drawStair(svg("g", { class: "stair preview-stair" }, group), shape, 1);
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
