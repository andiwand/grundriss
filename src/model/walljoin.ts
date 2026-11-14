// The ends of the two faces of a wall where it meets other walls, for a clean 3D body:
//
// - A free end (no other wall) stops at its vertex.
// - A wall that goes on in a straight line through its vertex stops at the vertex, so that the
//   two walls meet flush, without a joint.
// - Two walls at a corner meet in a miter: each face goes on to the point where it meets the
//   face of the other wall on the same side of the corner.
// - A wall that ends against a straight wall (a T) stops at the face of the straight wall.
//
// The positions are distances along the wall from its vertex `a`.

import { perpendicular } from "./geometry";
import { wallEnds } from "./plan";
import type { Plan, Point, Wall } from "./types";

export type JoinKind = "free" | "straight" | "corner" | "tee" | "other";

export interface WallFaces {
  /** The extent of the face on the side of `perpendicular(b - a)` ("right"), and of the other. */
  right: [number, number];
  left: [number, number];
  /** The kind of the join at the vertices a and b. */
  joins: [JoinKind, JoinKind];
  /**
   * The extents of the faces for the filled body of the 2D drawing. They go on into the other
   * walls where the bodies can overlap and stay inside them, so that the drawing has no seam at
   * the joint. They never go out of the other walls.
   */
  body: { right: [number, number]; left: [number, number] };
}

/** Two directions are opposite (a straight line through the vertex) within this tolerance. */
const STRAIGHT = 0.9995;
/** A miter of a very sharp corner goes no further than this many times the wall thickness. */
const MAX_MITER = 3;

const unit = (p: Point, q: Point): Point => {
  const length = Math.hypot(q.x - p.x, q.y - p.y);
  return length > 1e-12 ? { x: (q.x - p.x) / length, y: (q.y - p.y) / length } : { x: 0, y: 0 };
};
const dot = (p: Point, q: Point) => p.x * q.x + p.y * q.y;
const cross = (p: Point, q: Point) => p.x * q.y - p.y * q.x;

/**
 * The distance t along `u` from the vertex where the line V + o·n + t·u meets the line
 * V + o2·n2 + t2·u2, or null if the lines are parallel.
 */
function meet(n: Point, o: number, u: Point, n2: Point, o2: number, u2: Point): number | null {
  const det = cross(u, u2);
  if (Math.abs(det) < 1e-9) return null;
  // (o·n + t·u) − (o2·n2 + t2·u2) = 0  →  t = cross(o2·n2 − o·n, u2) / cross(u, u2)
  const w = { x: o2 * n2.x - o * n.x, y: o2 * n2.y - o * n.y };
  return cross(w, u2) / det;
}

/** The faces of the wall and the kinds of its joins. */
export function wallFaces(plan: Plan, wall: Wall): WallFaces {
  const [a, b] = wallEnds(plan, wall);
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const d = unit(a, b);
  const n = perpendicular(d);
  const half = wall.thickness / 2;
  const right: [number, number] = [0, length];
  const left: [number, number] = [0, length];
  const joins: [JoinKind, JoinKind] = ["free", "free"];
  const body = { right: [0, length] as [number, number], left: [0, length] as [number, number] };

  const position = new Map(plan.vertices.map((v) => [v.id, v]));
  /** The direction from the vertex along the other wall, and its half thickness. */
  const away = (other: Wall, vertexId: string) => {
    const from = position.get(vertexId)!;
    const to = position.get(other.a === vertexId ? other.b : other.a)!;
    return { u: unit(from, to), half: other.thickness / 2 };
  };

  for (const end of [0, 1] as const) {
    const vertexId = end === 0 ? wall.a : wall.b;
    // The direction from the vertex into this wall.
    const u = end === 0 ? d : { x: -d.x, y: -d.y };
    const others = plan.walls
      .filter((w) => w.id !== wall.id && (w.a === vertexId || w.b === vertexId))
      .map((w) => away(w, vertexId));
    // The faces move by t along u from the vertex: + into the wall, − beyond the vertex.
    const setEnd = (side: 1 | -1, t: number, fill = t) => {
      (side === 1 ? right : left)[end] = end === 0 ? t : length - t;
      (side === 1 ? body.right : body.left)[end] = end === 0 ? fill : length - fill;
    };
    if (others.length === 0) continue;
    const straight = others.find((o) => dot(o.u, u) < -STRAIGHT);
    if (straight) {
      joins[end] = "straight";
      // A wall that is not thicker than the next one goes on into it and stays inside it.
      const fill = half <= straight.half + 1e-9 ? -half : 0;
      for (const side of [1, -1] as const) setEnd(side, 0, fill);
      continue;
    }
    // The face of another wall that a face of this wall meets: the face toward this wall.
    const facing = (o: { u: Point; half: number }, toward: Point) => {
      const n2 = perpendicular(o.u);
      return { n2, o2: dot(n2, toward) > 0 ? o.half : -o.half };
    };
    if (others.length === 1) {
      joins[end] = "corner";
      const other = others[0];
      const ends: Record<1 | -1, number> = { 1: 0, [-1]: 0 };
      for (const side of [1, -1] as const) {
        // A face toward the other wall is on the inside of the corner. It meets the face of the
        // other wall toward this wall. A face on the outside meets the outer face of the other.
        const inner = dot({ x: side * n.x, y: side * n.y }, other.u) > 0;
        const { n2, o2 } = facing(other, inner ? u : { x: -u.x, y: -u.y });
        const t = meet(n, side * half, u, n2, o2, other.u);
        const limit = MAX_MITER * Math.max(half, other.half) * 2;
        ends[side] = t === null ? 0 : Math.max(-limit, Math.min(limit, t));
      }
      // At a corner of 90 degrees or more, the end of the body is square at the outer point of
      // the miter. The part beyond the miter is then inside the other wall.
      const square = dot(u, other.u) <= 1e-9 ? Math.min(ends[1], ends[-1]) : null;
      for (const side of [1, -1] as const) setEnd(side, ends[side], square ?? ends[side]);
      continue;
    }
    // A T: this wall ends against the face of a straight wall through the vertex.
    const through = others.find((o) => others.some((p) => dot(o.u, p.u) < -STRAIGHT));
    if (through) {
      joins[end] = "tee";
      const { n2, o2 } = facing(through, u);
      // The body goes on to the center line of the straight wall if it stays inside it there.
      const inside = half * Math.abs(dot(u, through.u)) <= through.half + 1e-9;
      for (const side of [1, -1] as const) {
        const t = meet(n, side * half, u, n2, o2, through.u) ?? through.half;
        setEnd(side, t, inside ? Math.min(t, 0) : t);
      }
      continue;
    }
    // Other joins of three or more walls: the faces go on into the joint, so that it has no gap.
    joins[end] = "other";
    for (const side of [1, -1] as const) setEnd(side, -half);
  }
  return { right, left, joins, body };
}
