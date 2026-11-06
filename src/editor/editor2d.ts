// The 2D editor: an SVG view of the plan with tools to draw and change it. The editor keeps no
// copy of the plan. It reads the plan from the document for each frame, and it changes the plan
// only through transactions of the document.

import {
  add,
  centroid,
  clamp,
  closestOnSegment,
  distance,
  perpendicular,
  scale,
  snapToGrid,
  sub,
} from "../model/geometry";
import type { PlanDocument } from "../model/history";
import {
  addOpening,
  addVertex,
  addWall,
  findOpening,
  findVertex,
  findWall,
  getVertex,
  mergeVertex,
  nearestWall,
  removeOpening,
  removeVertex,
  removeWall,
  splitWall,
  wallEnds,
  wallExtents,
} from "../model/plan";
import { findRooms } from "../model/rooms";
import type { Id, OpeningKind, Plan, Point } from "../model/types";

const SVG_NS = "http://www.w3.org/2000/svg";
const GRID_STEP = 0.05;
const SNAP_PIXELS = 10;
const MIN_ZOOM = 5;
const MAX_ZOOM = 2000;

export type Tool = "select" | "wall" | "door" | "window" | "calibrate";
export type Selection = { kind: "vertex" | "wall" | "opening"; id: Id } | null;

/** A point that the pointer snaps to. It can be an existing vertex or a point on a wall. */
interface Snap {
  point: Point;
  vertexId?: Id;
  wallId?: Id;
}

type Drag =
  | { kind: "pan"; startScreen: Point; startOffset: Point }
  | { kind: "vertex"; id: Id; target: Snap | null }
  | { kind: "wall"; id: Id; startWorld: Point; origin: [Point, Point] }
  | { kind: "opening"; id: Id };

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

/** The height in pixels of the strip under the tool palette, which `fit` keeps free. */
const FIT_TOP_INSET = 56;

export class Editor2D {
  readonly element: SVGSVGElement;
  private backgroundImage: SVGImageElement;
  private content: SVGGElement;
  private zoom = 50;
  /** The screen position of the world origin, in pixels. */
  private offset: Point = { x: 0, y: 0 };
  private currentTool: Tool = "select";
  private currentSelection: Selection = null;
  private drag: Drag | null = null;
  private chain: Snap | null = null;
  private cursor: Snap | null = null;
  private calibration: Point[] = [];
  private spaceDown = false;

  onSelect: (selection: Selection) => void = () => {};
  onCalibrate: (a: Point, b: Point) => void = () => {};

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
    this.calibration = [];
    this.element.dataset.tool = tool;
    this.render();
  }

  get selection(): Selection {
    return this.currentSelection;
  }

  select(selection: Selection): void {
    this.currentSelection = selection;
    this.onSelect(selection);
    this.render();
  }

  /** Stops the current action: the wall chain, the calibration, or else the selection. */
  cancel(): void {
    if (this.drag && this.drag.kind !== "pan") this.doc.cancel();
    this.drag = null;
    if (this.chain) this.chain = null;
    else if (this.calibration.length > 0) this.calibration = [];
    else if (this.currentSelection) this.select(null);
    this.render();
  }

  clearCalibration(): void {
    this.calibration = [];
    this.render();
  }

  deleteSelection(): void {
    const selection = this.currentSelection;
    if (!selection) return;
    this.doc.edit((plan) => {
      if (selection.kind === "vertex") removeVertex(plan, selection.id);
      if (selection.kind === "wall") removeWall(plan, selection.id);
      if (selection.kind === "opening") removeOpening(plan, selection.id);
    });
    this.select(null);
  }

  /** Shows the whole plan, or the background if the plan has no walls. */
  fit(): void {
    const { width, height: fullHeight } = this.element.getBoundingClientRect();
    // The tool palette floats over the top of the editor, so the plan fits below it.
    const top = Math.min(FIT_TOP_INSET, fullHeight / 4);
    const height = fullHeight - top;
    const plan = this.doc.plan;
    const box: Point[] = plan.vertices.map((v) => ({ x: v.x, y: v.y }));
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

  private toWorld(e: { clientX: number; clientY: number }): Point {
    const rect = this.element.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - this.offset.x) / this.zoom,
      y: (e.clientY - rect.top - this.offset.y) / this.zoom,
    };
  }

  private hit(target: EventTarget | null): Selection {
    const element = target instanceof Element ? target.closest<SVGElement>("[data-kind]") : null;
    if (!element) return null;
    return { kind: element.dataset.kind as "vertex" | "wall" | "opening", id: element.dataset.id! };
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
      case "select": {
        const hit = this.hit(e.target);
        this.select(hit);
        if (!hit) {
          this.startPan(e);
          return;
        }
        this.doc.begin();
        if (hit.kind === "vertex") this.drag = { kind: "vertex", id: hit.id, target: null };
        if (hit.kind === "opening") this.drag = { kind: "opening", id: hit.id };
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
        break;
      }
      case "wall":
        this.addChainPoint(this.snap(world, e));
        break;
      case "door":
      case "window":
        this.placeOpening(this.currentTool, world);
        break;
      case "calibrate":
        this.calibration.push(world);
        if (this.calibration.length === 2) {
          const [a, b] = this.calibration;
          this.onCalibrate(a, b);
        }
        if (this.calibration.length > 2) this.calibration = [world];
        this.render();
        break;
    }
  }

  private pointerMove(e: PointerEvent): void {
    const world = this.toWorld(e);
    const drag = this.drag;
    if (!drag) {
      this.cursor = this.currentTool === "wall" ? this.snap(world, e) : { point: world };
      this.render();
      return;
    }
    switch (drag.kind) {
      case "pan":
        this.offset = {
          x: drag.startOffset.x + e.clientX - drag.startScreen.x,
          y: drag.startOffset.y + e.clientY - drag.startScreen.y,
        };
        this.render();
        break;
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
        const delta = e.altKey ? raw : snapToGrid(raw, GRID_STEP);
        this.doc.update((plan) => {
          const wall = findWall(plan, drag.id)!;
          const [a, b] = wallEnds(plan, wall);
          Object.assign(a, add(drag.origin[0], delta));
          Object.assign(b, add(drag.origin[1], delta));
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
    }
  }

  private pointerUp(): void {
    const drag = this.drag;
    this.drag = null;
    if (!drag || drag.kind === "pan") return;
    if (drag.kind === "vertex" && drag.target?.vertexId) {
      const into = drag.target.vertexId;
      this.doc.update((plan) => mergeVertex(plan, drag.id, into));
      this.currentSelection = { kind: "vertex", id: into };
      this.onSelect(this.currentSelection);
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

  /**
   * Snaps the pointer: first to a vertex, then to a wall, then to the grid. With Shift, the wall
   * tool keeps the new wall horizontal or vertical. With Alt, the grid is off.
   */
  private snap(world: Point, keys: { altKey: boolean; shiftKey: boolean }, exclude?: Id): Snap {
    const plan = this.doc.plan;
    const grid = (value: number) =>
      keys.altKey ? value : Math.round(value / GRID_STEP) * GRID_STEP;

    if (this.currentTool === "wall" && this.chain && keys.shiftKey) {
      const start = this.chain.point;
      return Math.abs(world.x - start.x) > Math.abs(world.y - start.y)
        ? { point: { x: grid(world.x), y: start.y } }
        : { point: { x: start.x, y: grid(world.y) } };
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
    return { point: { x: grid(world.x), y: grid(world.y) } };
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
      addWall(plan, a, end);
    });
    this.chain = target.vertexId || target.wallId ? null : { point: target.point, vertexId: end };
    this.render();
  }

  private placeOpening(kind: OpeningKind, world: Point): void {
    const plan = this.doc.plan;
    const hit = nearestWall(plan, world, SNAP_PIXELS / this.zoom + 0.3);
    if (!hit) return;
    let id: Id = "";
    this.doc.edit((plan) => {
      const wall = findWall(plan, hit.wall.id)!;
      const [a, b] = wallEnds(plan, wall);
      id = addOpening(plan, wall.id, kind, hit.t * distance(a, b)).id;
    });
    this.select({ kind: "opening", id });
  }

  private checkSelection(): void {
    const selection = this.currentSelection;
    if (!selection) return;
    const plan = this.doc.plan;
    const exists =
      (selection.kind === "vertex" && findVertex(plan, selection.id)) ||
      (selection.kind === "wall" && findWall(plan, selection.id)) ||
      (selection.kind === "opening" && findOpening(plan, selection.id));
    if (!exists) {
      this.currentSelection = null;
      this.onSelect(null);
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
    this.renderWalls(plan);
    this.renderOpenings(plan);
    if (this.currentTool === "select" || this.currentTool === "wall") this.renderVertices(plan);
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
      svg("polygon", { points: points(room.polygon) }, group);
      const center = centroid(room.polygon);
      this.label(group, center, `${room.area.toFixed(2)} m²`, "room-label");
    }
  }

  private renderWalls(plan: Plan): void {
    const group = svg("g", { class: "walls" }, this.content);
    for (const wall of plan.walls) {
      const [a, b] = wallEnds(plan, wall);
      const length = distance(a, b);
      if (length === 0) continue;
      const dir = scale(sub(b, a), 1 / length);
      const normal = scale(perpendicular(dir), wall.thickness / 2);
      const { start, end } = wallExtents(plan, wall);
      const p = add(a, scale(dir, start));
      const q = add(a, scale(dir, end));
      const selected = this.isSelected("wall", wall.id);
      svg(
        "polygon",
        {
          points: points([add(p, normal), add(q, normal), sub(q, normal), sub(p, normal)]),
          class: selected ? "wall selected" : "wall",
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
      const wall = findWall(plan, opening.wallId);
      if (!wall) continue;
      const [a, b] = wallEnds(plan, wall);
      const length = distance(a, b);
      if (length === 0) continue;
      const dir = scale(sub(b, a), 1 / length);
      const side = perpendicular(dir);
      const half = wall.thickness / 2;
      const start = add(a, scale(dir, opening.offset - opening.width / 2));
      const end = add(a, scale(dir, opening.offset + opening.width / 2));
      const element = svg(
        "g",
        {
          class: `opening ${opening.kind}${this.isSelected("opening", opening.id) ? " selected" : ""}`,
          "data-kind": "opening",
          "data-id": opening.id,
        },
        group,
      );
      const across = scale(side, half + 0.01);
      svg(
        "polygon",
        {
          points: points([
            add(start, across),
            add(end, across),
            sub(end, across),
            sub(start, across),
          ]),
          class: "gap",
        },
        element,
      );
      if (opening.kind === "door") {
        // The leaf is open by 90 degrees, and the arc shows how it swings.
        const hinge = add(start, scale(side, half));
        const leaf = add(hinge, scale(side, opening.width));
        const closed = add(end, scale(side, half));
        svg("line", { x1: hinge.x, y1: hinge.y, x2: leaf.x, y2: leaf.y, class: "leaf" }, element);
        svg(
          "path",
          {
            d: `M ${leaf.x} ${leaf.y} A ${opening.width} ${opening.width} 0 0 0 ${closed.x} ${closed.y}`,
            class: "swing",
          },
          element,
        );
      } else {
        svg("line", { x1: start.x, y1: start.y, x2: end.x, y2: end.y, class: "glass" }, element);
      }
    }
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
    const selection = this.currentSelection;
    if (selection?.kind === "wall") {
      const wall = findWall(plan, selection.id);
      if (wall) {
        const [a, b] = wallEnds(plan, wall);
        this.label(group, scale(add(a, b), 0.5), `${distance(a, b).toFixed(2)} m`, "dimension");
      }
    }
    if (this.currentTool === "wall" && this.cursor) {
      const p = this.cursor.point;
      const kind = this.cursor.vertexId ? "on-vertex" : this.cursor.wallId ? "on-wall" : "";
      svg("circle", { cx: p.x, cy: p.y, r: 4 / this.zoom, class: `cursor ${kind}` }, group);
      if (this.chain) {
        const s = this.chain.point;
        svg("line", { x1: s.x, y1: s.y, x2: p.x, y2: p.y, class: "preview" }, group);
        this.label(group, scale(add(s, p), 0.5), `${distance(s, p).toFixed(2)} m`, "dimension");
      }
    }
    if (this.currentTool === "calibrate") {
      const line = [...this.calibration];
      if (line.length === 1 && this.cursor) line.push(this.cursor.point);
      for (const p of line)
        svg("circle", { cx: p.x, cy: p.y, r: 4 / this.zoom, class: "cursor" }, group);
      if (line.length === 2) {
        const [s, p] = line;
        svg("line", { x1: s.x, y1: s.y, x2: p.x, y2: p.y, class: "preview" }, group);
      }
    }
  }

  private label(parent: Element, at: Point, text: string, className: string): void {
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
  }

  private isSelected(kind: "vertex" | "wall" | "opening", id: Id): boolean {
    return this.currentSelection?.kind === kind && this.currentSelection.id === id;
  }
}
