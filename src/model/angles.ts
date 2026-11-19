// The angle between two walls, for the editor and the panel when the user selects two walls.

import { angleSweep } from "./drawing";
import { add, cross, distance, scale, sub } from "./geometry";
import { findWall, wallEnds } from "./plan";
import { wallTangent } from "./wallcurve";
import type { Id, Plan, Point } from "./types";

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

/** The angle at `center` from `a` to `b`, in the order that makes it not more than 180°. */
function ordered(center: Point, a: Point, b: Point): WallsAngle {
  const sweep = angleSweep(center, a, b);
  const [from, to] = sweep > Math.PI ? [b, a] : [a, b];
  const degrees = ((sweep > Math.PI ? 2 * Math.PI - sweep : sweep) * 180) / Math.PI;
  return { degrees, center, a: from, b: to };
}
