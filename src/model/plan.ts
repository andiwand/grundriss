// Operations on a plan. They change the plan in place. Call them inside a transaction of
// PlanDocument, so that undo works.

import { add, clamp, closestOnSegment, distance, scale, sub } from "./geometry";
import type { Id, Opening, OpeningKind, Plan, Point, Vertex, Wall } from "./types";

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
  return { vertices: [], walls: [], openings: [], background: null };
}

export const findVertex = (plan: Plan, id: Id): Vertex | undefined =>
  plan.vertices.find((v) => v.id === id);
export const findWall = (plan: Plan, id: Id): Wall | undefined =>
  plan.walls.find((w) => w.id === id);
export const findOpening = (plan: Plan, id: Id): Opening | undefined =>
  plan.openings.find((o) => o.id === id);

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
  const wall = { id: newId("w"), a, b, thickness: properties.thickness, height: properties.height };
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
 */
export function mergeVertex(plan: Plan, fromId: Id, toId: Id): void {
  if (fromId === toId) return;
  for (const wall of plan.walls) {
    if (wall.a === fromId) wall.a = toId;
    if (wall.b === fromId) wall.b = toId;
  }
  plan.vertices = plan.vertices.filter((v) => v.id !== fromId);
  const seen = new Set<string>();
  for (const wall of [...plan.walls]) {
    const key = wall.a < wall.b ? `${wall.a}|${wall.b}` : `${wall.b}|${wall.a}`;
    if (wall.a === wall.b || seen.has(key)) removeWall(plan, wall.id);
    else seen.add(key);
  }
}

export function addOpening(plan: Plan, wallId: Id, kind: OpeningKind, offset: number): Opening {
  const opening: Opening = { id: newId("o"), wallId, kind, offset, ...OPENING_DEFAULTS[kind] };
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

/** Removes the openings without a wall and keeps the others inside their walls. */
export function normalize(plan: Plan): void {
  plan.openings = plan.openings.filter((o) => findWall(plan, o.wallId));
  for (const opening of plan.openings) clampOpening(plan, opening);
}

/** Changes the length of a wall. The vertex `b` moves along the wall. */
export function setWallLength(plan: Plan, wallId: Id, length: number): void {
  const wall = getWall(plan, wallId);
  const [a, b] = wallEnds(plan, wall);
  const current = distance(a, b);
  if (current === 0) return;
  const end = add(a, scale(sub(b, a), length / current));
  b.x = end.x;
  b.y = end.y;
}
