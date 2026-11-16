// The length of a wall on each of its sides: along its face, from the wall at one end to the
// wall at the other end. This is the length that a user measures in a room.
//
// The face goes on through a straight join to the next wall in the same line, if that wall has
// the same thickness and no other wall meets the vertex on this side. So a wall that is split
// where a wall of the room on its other side meets it still has the full length of its room.

import { perpendicular } from "./geometry";
import { getVertex, wallEnds, wallMoveTargets } from "./plan";
import type { Id, Plan, Point, Wall } from "./types";
import { MAX_MITER, meet, STRAIGHT } from "./walljoin";

/** A side of a wall: +1 is the side of `perpendicular(b - a)`, −1 the other side. */
export type Side = 1 | -1;

export interface SideRun {
  /** The length of the face, in meters. */
  length: number;
  /** The ends of the face: the end before the vertex `a` of the wall, and the end after `b`. */
  from: Point;
  to: Point;
  /** The vertices where the walls of the face stop, before `a` and after `b`. */
  start: Id;
  end: Id;
}

const unit = (p: Point, q: Point): Point => {
  const length = Math.hypot(q.x - p.x, q.y - p.y);
  return length > 1e-12 ? { x: (q.x - p.x) / length, y: (q.y - p.y) / length } : { x: 0, y: 0 };
};
const dot = (p: Point, q: Point) => p.x * q.x + p.y * q.y;
const cross = (p: Point, q: Point) => p.x * q.y - p.y * q.x;

/** The face of the wall on the side, from the wall at one end to the wall at the other end. */
export function sideRun(plan: Plan, wall: Wall, side: Side): SideRun | null {
  const [a, b] = wallEnds(plan, wall);
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 1e-9) return null;
  const d = unit(a, b);
  const n = perpendicular(d);
  const face = { x: n.x * side, y: n.y * side };
  const half = wall.thickness / 2;

  /**
   * Follows the line of walls from the vertex in the direction `out`, away from the wall. It
   * gives the vertex where the line stops, the length of the walls after the wall, and the
   * position t of the end of the face: + back into the line, − beyond the vertex.
   */
  const follow = (vertexId: Id, out: Point) => {
    const seen = new Set([wall.id]);
    let extra = 0;
    for (;;) {
      const vertex = getVertex(plan, vertexId);
      const u = { x: -out.x, y: -out.y };
      const others = plan.walls
        .filter((w) => !seen.has(w.id) && (w.a === vertexId || w.b === vertexId))
        .map((w) => {
          const to = getVertex(plan, w.a === vertexId ? w.b : w.a);
          const span = Math.hypot(to.x - vertex.x, to.y - vertex.y);
          return { wall: w, to: to.id, u: unit(vertex, to), half: w.thickness / 2, span };
        });
      if (others.length === 0) return { vertexId, extra, t: 0 };
      // The next wall around the vertex from the line toward the face (as in `wallFaces`).
      const turn = Math.sign(cross(u, face));
      const angle = (o: Point) => {
        const value = Math.atan2(turn * cross(u, o), dot(u, o));
        return value > 0 ? value : value + 2 * Math.PI;
      };
      const next = others.reduce((p, q) => (angle(q.u) < angle(p.u) ? q : p));
      if (dot(next.u, u) < -STRAIGHT) {
        // No wall on this side: the face goes on into the next wall of the line.
        if (Math.abs(next.half - half) > 1e-9) return { vertexId, extra, t: 0 };
        seen.add(next.wall.id);
        extra += next.span;
        vertexId = next.to;
        continue;
      }
      const n2 = turn > 0 ? { x: next.u.y, y: -next.u.x } : { x: -next.u.y, y: next.u.x };
      const t = meet(face, half, u, n2, next.half, next.u);
      const limit = MAX_MITER * Math.max(half, next.half) * 2;
      return { vertexId, extra, t: t === null ? 0 : Math.max(-limit, Math.min(limit, t)) };
    }
  };

  const back = follow(wall.a, { x: -d.x, y: -d.y });
  const ahead = follow(wall.b, d);
  const along = (p: Point, t: number): Point => ({
    x: p.x + d.x * t + face.x * half,
    y: p.y + d.y * t + face.y * half,
  });
  return {
    length: length + back.extra + ahead.extra - back.t - ahead.t,
    from: along(a, -back.extra + back.t),
    to: along(b, ahead.extra - ahead.t),
    start: back.vertexId,
    end: ahead.vertexId,
  };
}

/**
 * Moves the end of a line of walls by `change` meters in the direction `out`. A wall at a corner
 * there moves with it and keeps its angle, so a rectangular room stays rectangular. A free end
 * moves alone. It gives false for other ends, for example a T, because a move there bends a
 * wall.
 */
function moveEnd(plan: Plan, vertexId: Id, out: Point, change: number): boolean {
  const vertex = getVertex(plan, vertexId);
  const walls = plan.walls.filter((w) => w.a === vertexId || w.b === vertexId);
  const direction = (w: Wall) => unit(vertex, getVertex(plan, w.a === vertexId ? w.b : w.a));
  const across = walls.filter((w) => Math.abs(dot(direction(w), out)) < STRAIGHT);
  if (walls.length - across.length !== 1) return false;
  if (across.length === 0) {
    vertex.x += out.x * change;
    vertex.y += out.y * change;
    return true;
  }
  if (across.length !== 1) return false;
  const [p, q] = wallEnds(plan, across[0]);
  const s = dot(out, perpendicular(unit(p, q)));
  // A corner at a very sharp angle moves too far.
  if (Math.abs(s) < 0.2) return false;
  const targets = wallMoveTargets(plan, across[0].id, [{ ...p }, { ...q }], change * s);
  Object.assign(p, targets[0]);
  Object.assign(q, targets[1]);
  return true;
}

/**
 * Changes a length of the wall to `length`. `measure` gives the length now and the vertices at
 * its ends. The end after the vertex `b` moves along the wall, or else the end before `a`. A
 * join at an angle changes its miter when the end moves, so a few steps make the length exact.
 */
function setLength(
  plan: Plan,
  wall: Wall,
  length: number,
  measure: () => { length: number; start: Id; end: Id } | null,
): void {
  if (!(length > 0)) return;
  const [a, b] = wallEnds(plan, wall);
  const d = unit(a, b);
  const back = { x: -d.x, y: -d.y };
  for (let step = 0; step < 8; step++) {
    const now = measure();
    if (!now) return;
    const change = length - now.length;
    if (Math.abs(change) < 1e-7) return;
    if (moveEnd(plan, now.end, d, change) || moveEnd(plan, now.start, back, change)) continue;
    const end = getVertex(plan, now.end);
    end.x += d.x * change;
    end.y += d.y * change;
  }
}

/** Sets the length of the wall on the side, from wall to wall. */
export function setSideLength(plan: Plan, wallId: Id, side: Side, length: number): void {
  const wall = plan.walls.find((w) => w.id === wallId);
  if (wall) setLength(plan, wall, length, () => sideRun(plan, wall, side));
}

/** Sets the length of the wall on its center line, the same way as the length of a side. */
export function setCenterLength(plan: Plan, wallId: Id, length: number): void {
  const wall = plan.walls.find((w) => w.id === wallId);
  if (!wall) return;
  setLength(plan, wall, length, () => {
    const [a, b] = wallEnds(plan, wall);
    const now = Math.hypot(b.x - a.x, b.y - a.y);
    return now > 1e-9 ? { length: now, start: wall.a, end: wall.b } : null;
  });
}
