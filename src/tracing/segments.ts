// The post-processing of wall suggestions. The functions here are pure: they use no DOM and no
// OpenCV, so the tests can run in Node. `trace.ts` finds raw segments in an image, and these
// functions make a clean wall graph from them.

import { add, clamp, distance, dot, length, scale, sub } from "../model/geometry";
import {
  addVertex,
  addWall,
  findWall,
  mergeVertex,
  nearestWall,
  splitWall,
  wallEnds,
} from "../model/plan";
import type { Background, Id, Plan, Point } from "../model/types";

/** A suggested wall: the center line from `a` to `b`, and the thickness of the wall. */
export interface WallSegment {
  a: Point;
  b: Point;
  thickness: number;
}

export interface MergeOptions {
  /** Segments within this angle (radians) are parallel. Within it, a segment snaps to an axis. */
  angleTolerance: number;
  /** The largest distance between two parallel lines that merge into one line. */
  distance: number;
  /** The largest gap along the line between two segments that merge. */
  gap: number;
  /** The result has no segment shorter than this. */
  minLength: number;
}

export const DEFAULT_MERGE: MergeOptions = {
  angleTolerance: (3 * Math.PI) / 180,
  distance: 6,
  gap: 10,
  minLength: 20,
};

const EPSILON = 1e-9;

/** The angle of the line between 0 and pi, because a line has no direction. */
function lineAngle(s: WallSegment): number {
  const angle = Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x);
  return ((angle % Math.PI) + Math.PI) % Math.PI;
}

/** The difference between two line angles, between 0 and pi / 2. */
function angleDifference(p: number, q: number): number {
  const d = Math.abs(p - q) % Math.PI;
  return Math.min(d, Math.PI - d);
}

/** Puts a segment that is almost horizontal or vertical exactly on that axis. */
export function snapToAxis(s: WallSegment, tolerance: number): WallSegment {
  const angle = lineAngle(s);
  if (angleDifference(angle, 0) <= tolerance) {
    const y = (s.a.y + s.b.y) / 2;
    return { a: { x: s.a.x, y }, b: { x: s.b.x, y }, thickness: s.thickness };
  }
  if (angleDifference(angle, Math.PI / 2) <= tolerance) {
    const x = (s.a.x + s.b.x) / 2;
    return { a: { x, y: s.a.y }, b: { x, y: s.b.y }, thickness: s.thickness };
  }
  return { a: { ...s.a }, b: { ...s.b }, thickness: s.thickness };
}

/**
 * A line group during the merge. The line goes through `origin` in the direction `dir`. The
 * group covers the line from `t0` to `t1`.
 */
interface Group {
  origin: Point;
  dir: Point;
  t0: number;
  t1: number;
  /** The sum of the lengths of the segments in the group. The merge uses it as a weight. */
  weight: number;
  thickness: number;
}

function toGroup(s: WallSegment): Group {
  const l = distance(s.a, s.b);
  const dir = scale(sub(s.b, s.a), 1 / l);
  return { origin: { ...s.a }, dir, t0: 0, t1: l, weight: l, thickness: s.thickness };
}

function groupEnds(g: Group): [Point, Point] {
  return [add(g.origin, scale(g.dir, g.t0)), add(g.origin, scale(g.dir, g.t1))];
}

/** The signed distance of `p` from the line of the group. */
function offsetFrom(g: Group, p: Point): number {
  const normal = { x: -g.dir.y, y: g.dir.x };
  return dot(sub(p, g.origin), normal);
}

/** Merges the group `q` into the group `p`, if they are on one line and touch or overlap. */
function tryMerge(p: Group, q: Group, options: MergeOptions): boolean {
  const angle = (g: Group) => ((Math.atan2(g.dir.y, g.dir.x) % Math.PI) + Math.PI) % Math.PI;
  if (angleDifference(angle(p), angle(q)) > options.angleTolerance) return false;
  const [qa, qb] = groupEnds(q);
  const limit = Math.max(options.distance, (p.thickness + q.thickness) / 4);
  const da = offsetFrom(p, qa);
  const db = offsetFrom(p, qb);
  if (Math.abs(da) > limit || Math.abs(db) > limit) return false;
  const ta = dot(sub(qa, p.origin), p.dir);
  const tb = dot(sub(qb, p.origin), p.dir);
  const s0 = Math.min(ta, tb);
  const s1 = Math.max(ta, tb);
  if (s0 > p.t1 + options.gap || s1 < p.t0 - options.gap) return false;

  // The new line is the mean of the two lines, with the lengths as weights.
  const total = p.weight + q.weight;
  const shift = ((da + db) / 2) * (q.weight / total);
  const normal = { x: -p.dir.y, y: p.dir.x };
  p.origin = add(p.origin, scale(normal, shift));
  p.t0 = Math.min(p.t0, s0);
  p.t1 = Math.max(p.t1, s1);
  p.thickness = (p.thickness * p.weight + q.thickness * q.weight) / total;
  p.weight = total;
  return true;
}

/**
 * Merges collinear segments that overlap or have a small gap between them. Near-horizontal and
 * near-vertical segments snap to the axis first. The result has no segment shorter than
 * `minLength`.
 */
export function mergeSegments(
  segments: WallSegment[],
  options: Partial<MergeOptions> = {},
): WallSegment[] {
  const o = { ...DEFAULT_MERGE, ...options };
  let groups = segments
    .filter((s) => distance(s.a, s.b) > EPSILON)
    .map((s) => toGroup(snapToAxis(s, o.angleTolerance)))
    .sort((p, q) => q.weight - p.weight);

  // Repeat until no merge happens, because a merge can bring two other groups together.
  let changed = true;
  while (changed) {
    changed = false;
    const result: Group[] = [];
    for (const group of groups) {
      if (result.some((target) => tryMerge(target, group, o))) changed = true;
      else result.push(group);
    }
    groups = result;
  }

  return groups
    .filter((g) => g.t1 - g.t0 >= o.minLength)
    .map((g) => {
      const [a, b] = groupEnds(g);
      return snapToAxis({ a, b, thickness: g.thickness }, o.angleTolerance);
    });
}

/** The intersection of the infinite lines through two segments, or null if they are parallel. */
function intersect(s: WallSegment, t: WallSegment): Point | null {
  const r = sub(s.b, s.a);
  const q = sub(t.b, t.a);
  const cross = r.x * q.y - r.y * q.x;
  if (Math.abs(cross) < EPSILON * length(r) * length(q)) return null;
  const u = ((t.a.x - s.a.x) * q.y - (t.a.y - s.a.y) * q.x) / cross;
  return add(s.a, scale(r, u));
}

/** The position of `p` along the segment, in the units of the plan, from 0 at `a`. */
function along(s: WallSegment, p: Point): number {
  const l = distance(s.a, s.b);
  return l === 0 ? 0 : dot(sub(p, s.a), sub(s.b, s.a)) / l;
}

const MIN_JOIN_ANGLE = (10 * Math.PI) / 180;

/**
 * Makes a wall graph from the segments. An end that is near the line of another segment moves
 * to the intersection of the two lines: so the ends meet at L and T junctions, and an end that
 * is too long or too short gets the correct length. Then each segment splits where another
 * segment touches or crosses it, so that T and X junctions have a common point.
 */
export function joinCorners(segments: WallSegment[], tolerance: number): WallSegment[] {
  const result = segments.map((s) => ({ a: { ...s.a }, b: { ...s.b }, thickness: s.thickness }));

  // 1. Move the ends to the nearest intersection.
  for (const s of result) {
    for (const end of ["a", "b"] as const) {
      let best: Point | null = null;
      let bestDistance = tolerance;
      for (const t of result) {
        if (t === s) continue;
        if (angleDifference(lineAngle(s), lineAngle(t)) < MIN_JOIN_ANGLE) continue;
        const x = intersect(s, t);
        if (!x) continue;
        const position = along(t, x);
        if (position < -tolerance || position > distance(t.a, t.b) + tolerance) continue;
        const d = distance(s[end], x);
        if (d < bestDistance) {
          bestDistance = d;
          best = x;
        }
      }
      // The move must not turn the segment around or make it very short.
      if (best && distance(best, s[end === "a" ? "b" : "a"]) > tolerance) s[end] = best;
    }
  }

  // 2. Split the segments at the junctions.
  const split: WallSegment[] = [];
  for (const s of result) {
    const l = distance(s.a, s.b);
    const cuts: number[] = [];
    for (const t of result) {
      if (t === s) continue;
      if (angleDifference(lineAngle(s), lineAngle(t)) < MIN_JOIN_ANGLE) continue;
      const x = intersect(s, t);
      if (!x) continue;
      const onT = along(t, x);
      const onS = along(s, x);
      const small = 1e-6 * Math.max(1, l);
      if (onT < -small || onT > distance(t.a, t.b) + small) continue;
      if (onS <= small || onS >= l - small) continue;
      // The point must be really on the segment, not only on its line.
      cuts.push(onS);
    }
    cuts.sort((p, q) => p - q);
    let start = s.a;
    const dir = scale(sub(s.b, s.a), 1 / l);
    for (const cut of cuts) {
      const point = add(s.a, scale(dir, cut));
      if (distance(start, point) > 1e-6) split.push({ a: start, b: point, thickness: s.thickness });
      start = point;
    }
    if (distance(start, s.b) > 1e-6)
      split.push({ a: start, b: { ...s.b }, thickness: s.thickness });
  }
  return split;
}

/** Changes the segments from the pixels of the background image to meters in the plan. */
export function toWorld(
  segments: WallSegment[],
  background: Pick<Background, "x" | "y" | "scale">,
): WallSegment[] {
  const map = (p: Point): Point => ({
    x: background.x + p.x * background.scale,
    y: background.y + p.y * background.scale,
  });
  return segments.map((s) => ({
    a: map(s.a),
    b: map(s.b),
    thickness: s.thickness * background.scale,
  }));
}

export interface AddWallsOptions {
  /** Ends nearer than this (in meters) go to one vertex, or onto an existing wall. */
  tolerance: number;
  /** The height of the new walls in meters. */
  height: number;
}

export const THICKNESS_RANGE = { min: 0.05, max: 0.6 };

/**
 * Adds the segments (in meters) to the plan as walls. An end near an existing vertex uses that
 * vertex. An end near an existing wall splits that wall. An existing vertex on a new wall splits
 * the new wall. Call this function inside a transaction of the document. It gives the ids of the
 * new walls.
 */
export function addWallSegments(
  plan: Plan,
  segments: WallSegment[],
  options: AddWallsOptions,
): Id[] {
  const ours = new Set<Id>();

  /** Splits a wall and keeps the set of our walls correct. It gives the new vertex. */
  const split = (wallId: Id, p: Point): Id => {
    const before = new Set(plan.walls.map((w) => w.id));
    const vertex = splitWall(plan, wallId, p);
    if (ours.delete(wallId)) {
      for (const w of plan.walls) if (!before.has(w.id)) ours.add(w.id);
    }
    return vertex.id;
  };

  const resolve = (p: Point): Id => {
    let best: Id | null = null;
    let bestDistance = options.tolerance;
    for (const v of plan.vertices) {
      const d = distance(v, p);
      if (d < bestDistance) {
        bestDistance = d;
        best = v.id;
      }
    }
    if (best) return best;
    const hit = nearestWall(plan, p, options.tolerance);
    if (hit) return split(hit.wall.id, hit.point);
    return addVertex(plan, p).id;
  };

  for (const s of segments) {
    const a = resolve(s.a);
    const b = resolve(s.b);
    if (a === b) continue;
    const thickness = clamp(
      Math.round(s.thickness * 100) / 100,
      THICKNESS_RANGE.min,
      THICKNESS_RANGE.max,
    );
    const wall = addWall(plan, a, b, { thickness, height: options.height });
    if (!wall) continue;
    ours.add(wall.id);
    splitAtVertices(wall.id);
  }

  /** Splits the new wall where an existing vertex lies on it, so that a T junction connects. */
  function splitAtVertices(wallId: Id): void {
    const queue = [wallId];
    while (queue.length > 0) {
      const id = queue.pop()!;
      const wall = findWall(plan, id);
      if (!wall) continue;
      const [a, b] = wallEnds(plan, wall);
      const l = distance(a, b);
      const vertex = plan.vertices.find((v) => {
        if (v.id === a.id || v.id === b.id) return false;
        const t = dot(sub(v, a), sub(b, a)) / (l * l);
        if (t <= 0 || t >= 1) return false;
        const foot = add(a, scale(sub(b, a), t));
        return distance(foot, v) < options.tolerance;
      });
      if (!vertex) continue;
      const before = new Set(plan.walls.map((w) => w.id));
      const created = split(id, vertex);
      // The merge keeps the existing vertex. The new parts of the wall go back into the queue,
      // because another vertex can be on them.
      mergeVertex(plan, created, vertex.id);
      for (const w of plan.walls) if (!before.has(w.id)) queue.push(w.id);
    }
  }

  return plan.walls.filter((w) => ours.has(w.id)).map((w) => w.id);
}

/**
 * Sorts four corners of a quadrilateral to the order top left, top right, bottom right, bottom
 * left. The user can click the corners in any order. The sort uses the angle of each corner
 * about the center, and the plan uses screen axes (y points down).
 */
export function orderCorners(corners: Point[]): [Point, Point, Point, Point] {
  if (corners.length !== 4) throw new Error("orderCorners needs four points");
  const center = scale(corners.reduce(add, { x: 0, y: 0 }), 1 / 4);
  const sorted = [...corners].sort(
    (p, q) =>
      Math.atan2(p.y - center.y, p.x - center.x) - Math.atan2(q.y - center.y, q.x - center.x),
  );
  // In screen axes, a larger angle is clockwise. Start at the corner with the smallest x + y.
  let first = 0;
  for (let i = 1; i < 4; i++) {
    if (sorted[i].x + sorted[i].y < sorted[first].x + sorted[first].y) first = i;
  }
  const result = [0, 1, 2, 3].map((i) => ({ ...sorted[(first + i) % 4] }));
  return result as [Point, Point, Point, Point];
}
