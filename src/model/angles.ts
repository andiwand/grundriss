// The angles between selected walls, for the editor and the panel: the angle between two walls,
// and the angles at the corners of more walls.

import { angleSweep, smallerAngle } from "./drawing";
import { add, cross, distance, scale, sub } from "./geometry";
import { findWall, wallEnds } from "./plan";
import { wallTangent } from "./wallcurve";
import type { Id, Plan, Point, Wall } from "./types";

/** The angle between two walls. */
export interface WallsAngle {
  /** The angle in degrees, from 0 to 180. */
  degrees: number;
  /**
   * The corner of the angle and a point on each side, as for an angle dimension. The corner is
   * the common vertex, or else the point where the lines of the two walls meet. Null if the
   * walls are parallel.
   */
  center: Point | null;
  a: Point;
  b: Point;
}

/**
 * The angle between two walls, not more than 180°. Walls with a common vertex have the angle
 * between them at that vertex. Other walls have the angle at the point where their lines meet,
 * between the rays to the walls. A curved wall counts with its direction at the end, or with
 * its chord. It gives null if a wall is missing or has no length.
 */
export function wallsAngle(plan: Plan, first: Id, second: Id): WallsAngle | null {
  const one = findWall(plan, first);
  const two = findWall(plan, second);
  if (!one || !two || one.id === two.id) return null;
  const [a1, b1] = wallEnds(plan, one);
  const [a2, b2] = wallEnds(plan, two);
  if (distance(a1, b1) < 1e-9 || distance(a2, b2) < 1e-9) return null;

  const shared = [one.a, one.b].find((id) => id === two.a || id === two.b);
  if (shared) {
    const center = shared === one.a ? a1 : b1;
    const reach = Math.min(distance(a1, b1), distance(a2, b2));
    const a = add(center, scale(wallTangent(plan, one, shared), reach));
    const b = add(center, scale(wallTangent(plan, two, shared), reach));
    return ordered(center, a, b);
  }

  const d1 = sub(b1, a1);
  const d2 = sub(b2, a2);
  const det = cross(d1, d2);
  const mid1 = scale(add(a1, b1), 0.5);
  const mid2 = scale(add(a2, b2), 0.5);
  if (Math.abs(det) < 1e-9 * Math.hypot(d1.x, d1.y) * Math.hypot(d2.x, d2.y)) {
    return { degrees: 0, center: null, a: mid1, b: mid2 };
  }
  // The point a1 + t·d1 on the line of the second wall.
  const t = cross(sub(a2, a1), d2) / det;
  const center = add(a1, scale(d1, t));
  // The side of each wall: from the center to the middle of the wall, or along the wall if the
  // center is at its middle.
  const side = (mid: Point, d: Point) => (distance(center, mid) > 1e-6 ? mid : add(center, d));
  return ordered(center, side(mid1, d1), side(mid2, d2));
}

/**
 * The angles at the vertices where selected walls meet. Around a vertex, each angle is between
 * two selected walls next to each other. An angle of 180° or more does not count: it is a straight
 * line, or the outer side of the corner. A wall without length does not count.
 */
export function cornerAngles(plan: Plan, ids: Id[]): WallsAngle[] {
  const walls = ids
    .map((id) => findWall(plan, id))
    .filter((wall): wall is Wall => {
      if (!wall) return false;
      const [a, b] = wallEnds(plan, wall);
      return distance(a, b) > 1e-9;
    });
  const unique = [...new Map(walls.map((wall) => [wall.id, wall])).values()];
  const angles: WallsAngle[] = [];
  const vertices = [...new Set(unique.flatMap((wall) => [wall.a, wall.b]))];
  for (const vertex of vertices) {
    const around = unique
      .filter((wall) => wall.a === vertex || wall.b === vertex)
      .map((wall) => {
        const [a, b] = wallEnds(plan, wall);
        const center = wall.a === vertex ? a : b;
        const dir = wallTangent(plan, wall, vertex);
        return { center, dir, length: distance(a, b), turn: Math.atan2(dir.y, dir.x) };
      })
      .sort((p, q) => p.turn - q.turn);
    if (around.length < 2) continue;
    around.forEach((one, i) => {
      const two = around[(i + 1) % around.length];
      let sweep = two.turn - one.turn;
      if (sweep <= 0) sweep += 2 * Math.PI;
      if ((sweep * 180) / Math.PI >= 180 - 1e-6) return;
      const reach = Math.min(one.length, two.length);
      const center = one.center;
      angles.push(
        ordered(center, add(center, scale(one.dir, reach)), add(center, scale(two.dir, reach))),
      );
    });
  }
  return angles;
}

/** The angle at `center` from `a` to `b`, in the order that makes it not more than 180°. */
function ordered(center: Point, a: Point, b: Point): WallsAngle {
  const [from, to] = smallerAngle(center, a, b);
  const degrees = (angleSweep(center, from, to) * 180) / Math.PI;
  return { degrees, center, a: from, b: to };
}
