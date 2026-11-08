// The checks for objects that collide on one story:
//
// - "overlap": two doors or windows on one wall overlap, or a piece of furniture overlaps a wall,
//   a stair, a chimney, or another piece.
// - "swing": an object is in the way of the leaf of a door or a window. The leaf of a door hits
//   all objects on the floor. The leaf of a window hits only objects that reach up to its sill.
// - "corner": a door or a window goes into the corner, past the face of the other wall.
// - "too-high": a door or a window is higher than its wall.
//
// The checks find the problems; the editor prevents only the overlap of openings on one wall
// (`freeOffset` in openings.ts). A chair can stand under a table, so that pair is no overlap.

import { chimneyOutline, stairShape } from "./building";
import { openingShape, wallOutline, type Arc } from "./drawing";
import { furnitureOutline, genericType } from "./furniture";
import { intersectionArea } from "./geometry";
import { freeRange } from "./openings";
import { findWall } from "./plan";
import type { Furniture, Item, Opening, Plan, Point } from "./types";

export type ConflictKind = "overlap" | "swing" | "corner" | "too-high";

export interface Conflict {
  kind: ConflictKind;
  /** The object with the problem: for "swing", the door or the window. */
  a: Item;
  /** The other object, or null for "corner" and "too-high". */
  b: Item | null;
}

/** An overlap smaller than this area in m² is a touch, not a collision. */
const MIN_AREA = 0.002;
/** A piece lower than this height in m lies on the floor, for example a rug. */
const FLAT = 0.03;
/** An opening can go this far past the free part of its wall before it is a problem, in m. */
const TOLERANCE = 0.01;

/** The area that the free end of a hinged leaf sweeps: the hinge and points on the arc. */
function sweptArea(arc: Arc): Point[] {
  const start = Math.atan2(arc.from.y - arc.center.y, arc.from.x - arc.center.x);
  let end = Math.atan2(arc.to.y - arc.center.y, arc.to.x - arc.center.x);
  // The sweep flag 1 turns to larger angles.
  if (arc.sweep === 1) while (end < start) end += 2 * Math.PI;
  else while (end > start) end -= 2 * Math.PI;
  const points = [arc.center];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const angle = start + ((end - start) * i) / steps;
    points.push({
      x: arc.center.x + arc.radius * Math.cos(angle),
      y: arc.center.y + arc.radius * Math.sin(angle),
    });
  }
  return points;
}

/** The pieces that can stand under a table, and the tables. */
const TUCKS = /chair|stool|stuhl|hocker/i;
const TABLES = /table|desk|tisch/i;
const kindOf = (piece: Furniture) =>
  piece.source.kind === "generic" ? genericType(piece.source.type).type : piece.name;

function tucked(a: Furniture, b: Furniture): boolean {
  const [p, q] = [kindOf(a), kindOf(b)];
  return (TUCKS.test(p) && TABLES.test(q)) || (TUCKS.test(q) && TABLES.test(p));
}

/** True if the heights from a0 to a1 and from b0 to b1 overlap. */
const heightsMeet = (a0: number, a1: number, b0: number, b1: number) =>
  Math.min(a1, b1) - Math.max(a0, b0) > 0.01;

/** The collisions of the objects on the story. */
export function planConflicts(plan: Plan): Conflict[] {
  const conflicts: Conflict[] = [];
  const item = (kind: Item["kind"], id: string): Item => ({ kind, id });

  // The openings: their place on the wall, their height, and their overlap.
  const byWall = new Map<string, Opening[]>();
  for (const opening of plan.openings) {
    const wall = findWall(plan, opening.wallId);
    if (!wall) continue;
    const list = byWall.get(wall.id) ?? [];
    for (const other of list) {
      const overlap =
        Math.min(opening.offset + opening.width / 2, other.offset + other.width / 2) -
        Math.max(opening.offset - opening.width / 2, other.offset - other.width / 2);
      if (overlap > TOLERANCE) {
        conflicts.push({
          kind: "overlap",
          a: item("opening", opening.id),
          b: item("opening", other.id),
        });
      }
    }
    list.push(opening);
    byWall.set(wall.id, list);
    const [lo, hi] = freeRange(plan, wall);
    if (
      opening.offset - opening.width / 2 < lo - TOLERANCE ||
      opening.offset + opening.width / 2 > hi + TOLERANCE
    ) {
      conflicts.push({ kind: "corner", a: item("opening", opening.id), b: null });
    }
    if (opening.sill + opening.height > wall.height + TOLERANCE) {
      conflicts.push({ kind: "too-high", a: item("opening", opening.id), b: null });
    }
  }

  // The fixed objects on the floor: the walls, the steps of the stairs, and the chimneys.
  const pieces = plan.furniture.filter((f) => f.height >= FLAT);
  const outlines = new Map(pieces.map((f) => [f.id, furnitureOutline(f)]));
  const fixed: { item: Item; shapes: Point[][] }[] = [
    ...plan.walls.map((w) => ({ item: item("wall", w.id), shapes: [wallOutline(plan, w)] })),
    // The rise does not change the outline of the steps, so any rise works here.
    ...plan.stairs.map((s) => ({ item: item("stair", s.id), shapes: stairShape(s, 1).steps })),
    ...plan.chimneys.map((c) => ({ item: item("chimney", c.id), shapes: [chimneyOutline(c)] })),
  ];
  const hits = (shape: Point[], shapes: Point[][]) =>
    shapes.some((other) => other.length >= 3 && intersectionArea(shape, other) > MIN_AREA);

  // The furniture against the fixed objects and against the other pieces.
  pieces.forEach((piece, i) => {
    const outline = outlines.get(piece.id)!;
    for (const other of fixed) {
      if (hits(outline, other.shapes)) {
        conflicts.push({ kind: "overlap", a: item("furniture", piece.id), b: other.item });
      }
    }
    for (const other of pieces.slice(i + 1)) {
      if (
        !tucked(piece, other) &&
        heightsMeet(
          piece.elevation,
          piece.elevation + piece.height,
          other.elevation,
          other.elevation + other.height,
        ) &&
        hits(outline, [outlines.get(other.id)!])
      ) {
        conflicts.push({
          kind: "overlap",
          a: item("furniture", piece.id),
          b: item("furniture", other.id),
        });
      }
    }
  });

  // The areas of the hinged leaves against the furniture, the stairs, the chimneys, and the
  // leaves of the other openings.
  const swings = plan.openings.flatMap((opening) => {
    const shape = openingShape(plan, opening);
    return shape && shape.arcs.length > 0
      ? [{ opening, areas: shape.arcs.map((arc) => sweptArea(arc)) }]
      : [];
  });
  swings.forEach(({ opening, areas }, i) => {
    const a = item("opening", opening.id);
    const top = opening.sill + opening.height;
    // The leaf of a door goes over the floor; the leaf of a window starts at its sill.
    const bottom = opening.kind === "door" ? 0 : opening.sill;
    for (const piece of pieces) {
      if (!heightsMeet(bottom, top, piece.elevation, piece.elevation + piece.height)) continue;
      if (areas.some((area) => hits(area, [outlines.get(piece.id)!]))) {
        conflicts.push({ kind: "swing", a, b: item("furniture", piece.id) });
      }
    }
    for (const other of fixed) {
      if (other.item.kind === "wall") continue;
      if (areas.some((area) => hits(area, other.shapes))) {
        conflicts.push({ kind: "swing", a, b: other.item });
      }
    }
    for (const other of swings.slice(i + 1)) {
      const otherTop = other.opening.sill + other.opening.height;
      const otherBottom = other.opening.kind === "door" ? 0 : other.opening.sill;
      // Two windows are seldom open at the same time, so only a door counts.
      if (opening.kind === "window" && other.opening.kind === "window") continue;
      if (!heightsMeet(bottom, top, otherBottom, otherTop)) continue;
      if (areas.some((area) => hits(area, other.areas))) {
        conflicts.push({ kind: "swing", a, b: item("opening", other.opening.id) });
      }
    }
  });
  return conflicts;
}

/** The ids of the objects of the story that have a collision. */
export function conflictIds(conflicts: Conflict[]): Set<string> {
  const ids = new Set<string>();
  for (const c of conflicts) {
    ids.add(c.a.id);
    // A wall is never wrong because of a piece in it, so only the piece shows.
    if (c.b && c.b.kind !== "wall") ids.add(c.b.id);
  }
  return ids;
}
