// Operations on a plan. They change the plan in place. Call them inside a transaction of
// PlanDocument, so that undo works.

import {
  add,
  clamp,
  closestOnSegment,
  distance,
  length as vectorLength,
  perpendicular,
  scale,
  sub,
} from "./geometry";
import { anchorRoomInfo, findRoom } from "./rooms";
import type {
  Chimney,
  Clip,
  Dimension,
  Id,
  Item,
  Opening,
  OpeningKind,
  Plan,
  Point,
  Stair,
  Vertex,
  Wall,
} from "./types";

export const WALL_DEFAULTS = { thickness: 0.2, height: 2.5 };

export const OPENING_DEFAULTS: Record<
  OpeningKind,
  { width: number; height: number; sill: number }
> = {
  door: { width: 0.9, height: 2.1, sill: 0 },
  window: { width: 1.2, height: 1.2, sill: 0.9 },
};

export function newId(prefix: string): Id {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyPlan(): Plan {
  return {
    vertices: [],
    walls: [],
    openings: [],
    dimensions: [],
    stairs: [],
    chimneys: [],
    rooms: [],
    furniture: [],
    fixtures: [],
    runs: [],
    background: null,
  };
}

export const findVertex = (plan: Plan, id: Id): Vertex | undefined =>
  plan.vertices.find((v) => v.id === id);
export const findWall = (plan: Plan, id: Id): Wall | undefined =>
  plan.walls.find((w) => w.id === id);
export const findOpening = (plan: Plan, id: Id): Opening | undefined =>
  plan.openings.find((o) => o.id === id);
export const findDimension = (plan: Plan, id: Id): Dimension | undefined =>
  plan.dimensions.find((d) => d.id === id);
export const findStair = (plan: Plan, id: Id): Stair | undefined =>
  plan.stairs.find((s) => s.id === id);
export const findChimney = (plan: Plan, id: Id): Chimney | undefined =>
  plan.chimneys.find((c) => c.id === id);

export function getVertex(plan: Plan, id: Id): Vertex {
  const vertex = findVertex(plan, id);
  if (!vertex) throw new Error(`Unknown vertex ${id}`);
  return vertex;
}

export function getWall(plan: Plan, id: Id): Wall {
  const wall = findWall(plan, id);
  if (!wall) throw new Error(`Unknown wall ${id}`);
  return wall;
}

export function wallEnds(plan: Plan, wall: Wall): [Vertex, Vertex] {
  return [getVertex(plan, wall.a), getVertex(plan, wall.b)];
}

export function wallLength(plan: Plan, wall: Wall): number {
  const [a, b] = wallEnds(plan, wall);
  return distance(a, b);
}

/** The number of walls that touch the vertex. */
export function degree(plan: Plan, vertexId: Id): number {
  return plan.walls.filter((w) => w.a === vertexId || w.b === vertexId).length;
}

/**
 * The extent of the wall body along the wall, from vertex `a` (0) to vertex `b` (the length).
 * At a vertex where the wall meets another wall, the body goes on for half the thickness. So
 * the bodies of the walls fill the corner.
 */
export function wallExtents(plan: Plan, wall: Wall): { start: number; end: number } {
  const half = wall.thickness / 2;
  return {
    start: degree(plan, wall.a) > 1 ? -half : 0,
    end: wallLength(plan, wall) + (degree(plan, wall.b) > 1 ? half : 0),
  };
}

/** The nearest wall to the point, if it is nearer than `tolerance`. */
export function nearestWall(
  plan: Plan,
  p: Point,
  tolerance: number,
): { wall: Wall; t: number; point: Point } | null {
  let best: { wall: Wall; t: number; point: Point } | null = null;
  let bestDistance = tolerance;
  for (const wall of plan.walls) {
    const [a, b] = wallEnds(plan, wall);
    const hit = closestOnSegment(p, a, b);
    if (hit.distance < bestDistance) {
      bestDistance = hit.distance;
      best = { wall, t: hit.t, point: hit.point };
    }
  }
  return best;
}

export function addVertex(plan: Plan, p: Point): Vertex {
  const vertex = { id: newId("v"), x: p.x, y: p.y };
  plan.vertices.push(vertex);
  return vertex;
}

/** Adds a wall. It gives null if the ends are equal, or if the same wall is already there. */
export function addWall(
  plan: Plan,
  a: Id,
  b: Id,
  properties: { thickness: number; height: number } = WALL_DEFAULTS,
): Wall | null {
  if (a === b) return null;
  if (plan.walls.some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a))) return null;
  const wall: Wall = {
    id: newId("w"),
    a,
    b,
    thickness: properties.thickness,
    height: properties.height,
    layers: null,
    colors: { right: null, left: null },
  };
  plan.walls.push(wall);
  return wall;
}

/**
 * Splits a wall in two at the point on the wall that is nearest to `p`. The openings go to the
 * part that contains their center. It gives the new vertex.
 */
export function splitWall(plan: Plan, wallId: Id, p: Point): Vertex {
  const wall = getWall(plan, wallId);
  const [a, b] = wallEnds(plan, wall);
  const hit = closestOnSegment(p, a, b);
  const at = hit.t * distance(a, b);
  const vertex = addVertex(plan, hit.point);
  const first: Wall = { ...wall, id: newId("w"), b: vertex.id };
  const second: Wall = { ...wall, id: newId("w"), a: vertex.id };
  plan.walls.splice(plan.walls.indexOf(wall), 1, first, second);
  for (const opening of plan.openings) {
    if (opening.wallId !== wallId) continue;
    if (opening.offset <= at) {
      opening.wallId = first.id;
    } else {
      opening.wallId = second.id;
      opening.offset -= at;
    }
  }
  return vertex;
}

export function addDimension(plan: Plan, a: Point, b: Point, offset: number): Dimension {
  const dimension = { id: newId("d"), a: { ...a }, b: { ...b }, offset };
  plan.dimensions.push(dimension);
  return dimension;
}

export const STAIR_DEFAULTS = { width: 1.0 };
export const CHIMNEY_DEFAULTS = { width: 0.4, depth: 0.4 };

export function addStair(plan: Plan, a: Point, b: Point, width = STAIR_DEFAULTS.width): Stair {
  const stair: Stair = {
    id: newId("s"),
    a: { ...a },
    b: { ...b },
    width,
    kind: "straight",
    turn: 1,
    run2: distance(a, b) / 2,
  };
  plan.stairs.push(stair);
  return stair;
}

export function addChimney(plan: Plan, p: Point): Chimney {
  const chimney = { id: newId("c"), x: p.x, y: p.y, ...CHIMNEY_DEFAULTS, top: null };
  plan.chimneys.push(chimney);
  return chimney;
}

export function removeDimension(plan: Plan, id: Id): void {
  plan.dimensions = plan.dimensions.filter((d) => d.id !== id);
}

export function removeOpening(plan: Plan, id: Id): void {
  plan.openings = plan.openings.filter((o) => o.id !== id);
}

/** Removes a wall, its openings, and the vertices that have no wall after that. */
export function removeWall(plan: Plan, id: Id): void {
  const wall = findWall(plan, id);
  if (!wall) return;
  plan.walls = plan.walls.filter((w) => w.id !== id);
  plan.openings = plan.openings.filter((o) => o.wallId !== id);
  for (const end of [wall.a, wall.b]) {
    if (degree(plan, end) === 0) plan.vertices = plan.vertices.filter((v) => v.id !== end);
  }
}

/** Removes a vertex and all the walls that touch it. */
export function removeVertex(plan: Plan, id: Id): void {
  for (const wall of plan.walls.filter((w) => w.a === id || w.b === id)) removeWall(plan, wall.id);
  plan.vertices = plan.vertices.filter((v) => v.id !== id);
}

/**
 * Joins the vertex `fromId` into the vertex `toId`. The walls of `fromId` then end at `toId`. A
 * wall that has the same vertex at both ends, or that is a copy of a different wall, goes away.
 * The openings of a copy go to the wall that stays. The openings of a wall with the same vertex
 * at both ends go away.
 */
export function mergeVertex(plan: Plan, fromId: Id, toId: Id): void {
  if (fromId === toId) return;
  for (const wall of plan.walls) {
    if (wall.a === fromId) wall.a = toId;
    if (wall.b === fromId) wall.b = toId;
  }
  plan.vertices = plan.vertices.filter((v) => v.id !== fromId);
  const kept = new Map<string, Wall>();
  for (const wall of [...plan.walls]) {
    const key = wall.a < wall.b ? `${wall.a}|${wall.b}` : `${wall.b}|${wall.a}`;
    const other = kept.get(key);
    if (other) moveOpenings(plan, wall, other);
    if (wall.a === wall.b || other) removeWall(plan, wall.id);
    else kept.set(key, wall);
  }
}

/**
 * Moves the openings of the wall `from` to the wall `to`, which has the same two vertices. If
 * the walls go in opposite directions, the offset, the hinge, and the swing change to keep each
 * opening in its place.
 */
function moveOpenings(plan: Plan, from: Wall, to: Wall): void {
  const opposite = from.a !== to.a;
  const length = wallLength(plan, to);
  for (const opening of plan.openings) {
    if (opening.wallId !== from.id) continue;
    opening.wallId = to.id;
    if (opposite) {
      opening.offset = length - opening.offset;
      opening.hinge = opening.hinge === "a" ? "b" : "a";
      opening.swing = opening.swing === 1 ? -1 : 1;
    }
    clampOpening(plan, opening);
  }
}

export function addOpening(plan: Plan, wallId: Id, kind: OpeningKind, offset: number): Opening {
  const opening: Opening = {
    id: newId("o"),
    wallId,
    kind,
    offset,
    ...OPENING_DEFAULTS[kind],
    hinge: "a",
    swing: 1,
  };
  plan.openings.push(opening);
  clampOpening(plan, opening);
  return opening;
}

/** Keeps the opening inside its wall. */
export function clampOpening(plan: Plan, opening: Opening): void {
  const wall = findWall(plan, opening.wallId);
  if (!wall) return;
  const length = wallLength(plan, wall);
  const half = opening.width / 2;
  opening.offset = length < opening.width ? length / 2 : clamp(opening.offset, half, length - half);
}

/**
 * Removes the openings without a wall and keeps the others inside their walls. It also moves the
 * data of each room to the middle of its room, so that the data follows the walls.
 */
export function normalize(plan: Plan): void {
  plan.openings = plan.openings.filter((o) => findWall(plan, o.wallId));
  for (const opening of plan.openings) clampOpening(plan, opening);
  anchorRoomInfo(plan);
}

/**
 * Changes the length of a wall. The vertex `b` moves along the wall. A length of zero or less
 * changes nothing, because a wall must have a length.
 */
export function setWallLength(plan: Plan, wallId: Id, length: number): void {
  const wall = getWall(plan, wallId);
  const [a, b] = wallEnds(plan, wall);
  const current = distance(a, b);
  if (current === 0 || !(length > 0)) return;
  const end = add(a, scale(sub(b, a), length / current));
  b.x = end.x;
  b.y = end.y;
}

// ----- More than one object -----

/** True if the item is in the plan. */
export function itemExists(plan: Plan, item: Item): boolean {
  if (item.kind === "vertex") return !!findVertex(plan, item.id);
  if (item.kind === "wall") return !!findWall(plan, item.id);
  if (item.kind === "opening") return !!findOpening(plan, item.id);
  if (item.kind === "stair") return !!findStair(plan, item.id);
  if (item.kind === "chimney") return !!findChimney(plan, item.id);
  if (item.kind === "room") return !!findRoom(plan, item.id);
  if (item.kind === "furniture") return plan.furniture.some((f) => f.id === item.id);
  if (item.kind === "fixture") return plan.fixtures.some((f) => f.id === item.id);
  if (item.kind === "run") return plan.runs.some((r) => r.id === item.id);
  return !!findDimension(plan, item.id);
}

/** Removes the items. A wall takes its openings with it, and a vertex takes its walls. */
export function removeItems(plan: Plan, items: Item[]): void {
  for (const item of items) {
    if (item.kind === "vertex") removeVertex(plan, item.id);
    if (item.kind === "wall") removeWall(plan, item.id);
    if (item.kind === "opening") removeOpening(plan, item.id);
    if (item.kind === "dimension") removeDimension(plan, item.id);
    if (item.kind === "stair") plan.stairs = plan.stairs.filter((s) => s.id !== item.id);
    if (item.kind === "chimney") plan.chimneys = plan.chimneys.filter((c) => c.id !== item.id);
    if (item.kind === "furniture") plan.furniture = plan.furniture.filter((f) => f.id !== item.id);
    if (item.kind === "run") plan.runs = plan.runs.filter((r) => r.id !== item.id);
    if (item.kind === "fixture") {
      plan.fixtures = plan.fixtures.filter((f) => f.id !== item.id);
      // A line that connects to the device stays, but it no longer connects.
      for (const run of plan.runs) {
        if (run.from === item.id) run.from = null;
        if (run.to === item.id) run.to = null;
      }
    }
  }
}

/** The ids of the vertices that the items move: the selected vertices and the ends of walls. */
export function itemVertices(plan: Plan, items: Item[]): Set<Id> {
  const ids = new Set<Id>();
  for (const item of items) {
    if (item.kind === "vertex") ids.add(item.id);
    if (item.kind === "wall") {
      const wall = findWall(plan, item.id);
      if (wall) ids.add(wall.a).add(wall.b);
    }
  }
  return ids;
}

/**
 * The positions of the points that a move of the items changes: the vertices and the ends of
 * the dimension lines. A drag keeps them at its start and adds the distance of the pointer.
 */
export interface MoveOrigin {
  vertices: Map<Id, Point>;
  /** The two points of the dimension lines and the stairs. */
  dimensions: Map<Id, { a: Point; b: Point }>;
  stairs: Map<Id, { a: Point; b: Point }>;
  /** The centers of the chimneys and the furniture. */
  chimneys: Map<Id, Point>;
  furniture: Map<Id, Point>;
  fixtures: Map<Id, Point>;
  runs: Map<Id, Point[]>;
}

export function moveOrigin(plan: Plan, items: Item[]): MoveOrigin {
  const origin: MoveOrigin = {
    vertices: new Map(),
    dimensions: new Map(),
    stairs: new Map(),
    chimneys: new Map(),
    furniture: new Map(),
    fixtures: new Map(),
    runs: new Map(),
  };
  for (const id of itemVertices(plan, items)) {
    const vertex = getVertex(plan, id);
    origin.vertices.set(id, { x: vertex.x, y: vertex.y });
  }
  const find = <T extends { id: Id }>(list: T[], id: Id) => list.find((x) => x.id === id);
  for (const { kind, id } of items) {
    const dimension = kind === "dimension" ? find(plan.dimensions, id) : undefined;
    if (dimension) origin.dimensions.set(id, { a: { ...dimension.a }, b: { ...dimension.b } });
    const stair = kind === "stair" ? find(plan.stairs, id) : undefined;
    if (stair) origin.stairs.set(id, { a: { ...stair.a }, b: { ...stair.b } });
    const chimney = kind === "chimney" ? find(plan.chimneys, id) : undefined;
    if (chimney) origin.chimneys.set(id, { x: chimney.x, y: chimney.y });
    const piece = kind === "furniture" ? find(plan.furniture, id) : undefined;
    if (piece) origin.furniture.set(id, { x: piece.x, y: piece.y });
    const fixture = kind === "fixture" ? find(plan.fixtures, id) : undefined;
    if (fixture) origin.fixtures.set(id, { x: fixture.x, y: fixture.y });
    const run = kind === "run" ? find(plan.runs, id) : undefined;
    if (run)
      origin.runs.set(
        id,
        run.points.map((p) => ({ ...p })),
      );
  }
  return origin;
}

/** Puts the points of `origin` at their start position plus `delta`. */
export function moveFromOrigin(plan: Plan, origin: MoveOrigin, delta: Point): void {
  for (const [id, start] of origin.vertices) {
    const vertex = findVertex(plan, id);
    if (vertex) Object.assign(vertex, add(start, delta));
  }
  for (const [id, start] of origin.dimensions) {
    const dimension = findDimension(plan, id);
    if (!dimension) continue;
    dimension.a = add(start.a, delta);
    dimension.b = add(start.b, delta);
  }
  for (const [id, start] of origin.stairs) {
    const stair = findStair(plan, id);
    if (!stair) continue;
    stair.a = add(start.a, delta);
    stair.b = add(start.b, delta);
  }
  for (const [id, start] of origin.chimneys) {
    const chimney = findChimney(plan, id);
    if (chimney) Object.assign(chimney, add(start, delta));
  }
  for (const [id, start] of origin.furniture) {
    const piece = plan.furniture.find((f) => f.id === id);
    if (piece) Object.assign(piece, add(start, delta));
  }
  for (const [id, start] of origin.fixtures) {
    const fixture = plan.fixtures.find((f) => f.id === id);
    if (fixture) Object.assign(fixture, add(start, delta));
  }
  for (const [id, start] of origin.runs) {
    const run = plan.runs.find((r) => r.id === id);
    if (run) run.points = start.map((p) => add(p, delta));
  }
}

/**
 * Copies the items. The copy contains the selected walls, the walls between two selected
 * vertices, the vertices and the openings of these walls, and the other selected objects.
 */
export function copyItems(plan: Plan, items: Item[]): Clip {
  const vertexIds = new Set(items.filter((i) => i.kind === "vertex").map((i) => i.id));
  const wallIds = new Set(items.filter((i) => i.kind === "wall").map((i) => i.id));
  for (const wall of plan.walls) {
    if (vertexIds.has(wall.a) && vertexIds.has(wall.b)) wallIds.add(wall.id);
  }
  const walls = plan.walls.filter((w) => wallIds.has(w.id));
  for (const wall of walls) vertexIds.add(wall.a).add(wall.b);
  return structuredClone({
    vertices: plan.vertices.filter((v) => vertexIds.has(v.id)),
    walls,
    openings: plan.openings.filter((o) => wallIds.has(o.wallId)),
    dimensions: plan.dimensions.filter((d) =>
      items.some((i) => i.kind === "dimension" && i.id === d.id),
    ),
    stairs: plan.stairs.filter((x) => items.some((i) => i.kind === "stair" && i.id === x.id)),
    chimneys: plan.chimneys.filter((x) => items.some((i) => i.kind === "chimney" && i.id === x.id)),
    furniture: plan.furniture.filter((x) =>
      items.some((i) => i.kind === "furniture" && i.id === x.id),
    ),
    fixtures: plan.fixtures.filter((x) => items.some((i) => i.kind === "fixture" && i.id === x.id)),
    runs: plan.runs.filter((x) => items.some((i) => i.kind === "run" && i.id === x.id)),
  });
}

/** Adds a copy of the clip, moved by `delta`, with new ids. It gives the new items. */
export function pasteClip(plan: Plan, clip: Clip, delta: Point): Item[] {
  const ids = new Map<Id, Id>();
  const items: Item[] = [];
  for (const vertex of clip.vertices) {
    const copy = addVertex(plan, add(vertex, delta));
    ids.set(vertex.id, copy.id);
    items.push({ kind: "vertex", id: copy.id });
  }
  for (const wall of clip.walls) {
    const copy: Wall = { ...wall, id: newId("w"), a: ids.get(wall.a)!, b: ids.get(wall.b)! };
    plan.walls.push(copy);
    ids.set(wall.id, copy.id);
    items.push({ kind: "wall", id: copy.id });
  }
  for (const opening of clip.openings) {
    const copy: Opening = { ...opening, id: newId("o"), wallId: ids.get(opening.wallId)! };
    plan.openings.push(copy);
    items.push({ kind: "opening", id: copy.id });
  }
  for (const dimension of clip.dimensions) {
    const copy = addDimension(
      plan,
      add(dimension.a, delta),
      add(dimension.b, delta),
      dimension.offset,
    );
    items.push({ kind: "dimension", id: copy.id });
  }
  for (const stair of clip.stairs) {
    // The copy keeps the kind, the turn, and the second flight of the stair.
    const copy = { ...stair, id: newId("s"), a: add(stair.a, delta), b: add(stair.b, delta) };
    plan.stairs.push(copy);
    items.push({ kind: "stair", id: copy.id });
  }
  for (const chimney of clip.chimneys) {
    const copy = { ...chimney, id: newId("c"), ...add(chimney, delta) };
    plan.chimneys.push(copy);
    items.push({ kind: "chimney", id: copy.id });
  }
  for (const piece of clip.furniture) {
    const copy = { ...structuredClone(piece), id: newId("f"), ...add(piece, delta) };
    plan.furniture.push(copy);
    items.push({ kind: "furniture", id: copy.id });
  }
  for (const fixture of clip.fixtures) {
    const copy = { ...structuredClone(fixture), id: newId("x"), ...add(fixture, delta) };
    plan.fixtures.push(copy);
    ids.set(fixture.id, copy.id);
    items.push({ kind: "fixture", id: copy.id });
  }
  for (const run of clip.runs) {
    // A line keeps its connection only to a device that the clip also contains.
    const copy = {
      ...structuredClone(run),
      id: newId("n"),
      points: run.points.map((p) => add(p, delta)),
      from: run.from ? (ids.get(run.from) ?? null) : null,
      to: run.to ? (ids.get(run.to) ?? null) : null,
    };
    plan.runs.push(copy);
    items.push({ kind: "run", id: copy.id });
  }
  return items;
}

/** The intersection of the line through `p` with direction `r` and the line through `q` with
 * direction `s`, or null if the lines are parallel. */
function intersectLines(p: Point, r: Point, q: Point, s: Point): Point | null {
  const cross = r.x * s.y - r.y * s.x;
  if (Math.abs(cross) < 1e-9) return null;
  const t = ((q.x - p.x) * s.y - (q.y - p.y) * s.x) / cross;
  return add(p, scale(r, t));
}

/**
 * The new positions of the ends of a wall that moves by `shift` meters across its direction.
 * At an end with exactly one other wall, the end slides along that other wall, so the other
 * wall keeps its angle. At other ends, the end moves straight. `origin` holds the positions of
 * the ends at the start of the drag; the other walls must not have moved since then.
 */
export function wallMoveTargets(
  plan: Plan,
  wallId: Id,
  origin: [Point, Point],
  shift: number,
): [Point, Point] {
  const wall = getWall(plan, wallId);
  const [a0, b0] = origin;
  const length = distance(a0, b0);
  if (length === 0) return [a0, b0];
  const dir = scale(sub(b0, a0), 1 / length);
  const move = scale(perpendicular(dir), shift);
  const target = (end: Id, start: Point): Point => {
    const straight = add(start, move);
    const others = plan.walls.filter((w) => w.id !== wall.id && (w.a === end || w.b === end));
    if (others.length !== 1) return straight;
    const other = others[0];
    const far = getVertex(plan, other.a === end ? other.b : other.a);
    const along = sub(start, far);
    if (vectorLength(along) === 0) return straight;
    // An almost parallel wall puts the intersection very far away. Then the end moves straight.
    const hit = intersectLines(straight, dir, far, along);
    return hit && distance(hit, straight) < 5 * Math.abs(shift) + 0.5 ? hit : straight;
  };
  return [target(wall.a, a0), target(wall.b, b0)];
}
