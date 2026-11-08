// The rules for the place of a door or a window on its wall: the part of the wall that is free
// for an opening, a place without overlap with the other openings, and the side of the room.

import { add, distance, perpendicular, scale, sub } from "./geometry";
import { findWall, wallEnds, wallLength } from "./plan";
import { findRooms, pointInPolygon, type Room } from "./rooms";
import type { Opening, Plan, Swing, Wall } from "./types";
import { wallFaces } from "./walljoin";

/** A window wider than this, in m, gets two leaves by default. */
export const WIDE_WINDOW = 1;

/**
 * The part of the wall where an opening can be, as distances from the vertex `a`: the part where
 * both faces of the wall exist. At a corner, the inner face is shorter, so an opening does not go
 * into the other wall.
 */
export function freeRange(plan: Plan, wall: Wall): [number, number] {
  const faces = wallFaces(plan, wall);
  return [
    Math.max(0, faces.right[0], faces.left[0]),
    Math.min(faces.right[1], faces.left[1], wallLength(plan, wall)),
  ];
}

/** The other openings on the wall of the opening, as intervals along the wall. */
function neighbors(plan: Plan, opening: Opening): [number, number][] {
  return plan.openings
    .filter((o) => o.wallId === opening.wallId && o.id !== opening.id)
    .map((o) => [o.offset - o.width / 2, o.offset + o.width / 2] as [number, number])
    .sort((p, q) => p[0] - q[0]);
}

/**
 * The offset nearest to `wanted` where the opening fits in the free range of its wall without an
 * overlap with the other openings of the wall. If no such place exists, the offset only stays
 * inside the wall, and `openingConflicts` reports the overlap.
 */
export function freeOffset(plan: Plan, opening: Opening, wanted: number): number {
  const wall = findWall(plan, opening.wallId);
  if (!wall) return wanted;
  const length = wallLength(plan, wall);
  const half = opening.width / 2;
  const [lo, hi] = freeRange(plan, wall);
  // The gaps between the other openings, inside the free range.
  const gaps: [number, number][] = [];
  let start = lo;
  for (const [s0, s1] of neighbors(plan, opening)) {
    if (s0 > start) gaps.push([start, Math.min(s0, hi)]);
    start = Math.max(start, s1);
  }
  if (start < hi) gaps.push([start, hi]);
  let best: number | null = null;
  for (const [g0, g1] of gaps) {
    if (g1 - g0 < opening.width - 1e-6) continue;
    const place = Math.min(Math.max(wanted, g0 + half), g1 - half);
    if (best === null || Math.abs(place - wanted) < Math.abs(best - wanted)) best = place;
  }
  if (best !== null) return best;
  return length < opening.width ? length / 2 : Math.min(Math.max(wanted, half), length - half);
}

/**
 * The side of the wall at the opening where a room is: 1 for the side of
 * `perpendicular(b - a)`, -1 for the other side. Null if both sides or no side have a room, for
 * example at an inner wall.
 */
export function roomSide(
  plan: Plan,
  opening: Opening,
  rooms: Room[] = findRooms(plan),
): Swing | null {
  const wall = findWall(plan, opening.wallId);
  if (!wall) return null;
  const [a, b] = wallEnds(plan, wall);
  const length = distance(a, b);
  if (length === 0) return null;
  const dir = scale(sub(b, a), 1 / length);
  const at = add(a, scale(dir, opening.offset));
  const side = perpendicular(dir);
  const inRoom = (sign: number) => {
    const p = add(at, scale(side, sign * (wall.thickness / 2 + 0.05)));
    return rooms.some((room) => pointInPolygon(p, room.polygon));
  };
  const right = inRoom(1);
  const left = inRoom(-1);
  return right === left ? null : right ? 1 : -1;
}
