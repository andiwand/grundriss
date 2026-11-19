// The center line of a wall: a straight line, or a circular arc for a curved wall.
//
// A wall has a position `s` along its center line, from 0 at the vertex `a` to `length` at the
// vertex `b`, and a position `o` across it, + on the side of `perpendicular(tangent)`. On a
// straight wall, this is the side of `perpendicular(b - a)`. All code that puts something on a
// wall (the faces, the openings, the joins) uses these two positions, so it works for both kinds.
//
// `Wall.bulge` is the sagitta of the arc: the distance from the middle of the chord to the middle
// of the center line, + on the side of `perpendicular(b - a)`. 0 or nothing is a straight wall.

import { add, distance, dot, perpendicular, scale, sub } from "./geometry";
import type { Id, Plan, Point, Wall } from "./types";

/** A bulge smaller than this is a straight wall. */
const FLAT = 1e-6;
/** The largest angle in radians of one chord when a curve becomes a polyline. */
const STEP = Math.PI / 36;

export interface WallCurve {
  a: Point;
  b: Point;
  /** The length of the center line. */
  length: number;
  /** The circle of a curved wall, or null for a straight wall. */
  circle: { center: Point; radius: number } | null;
  /** The point at `s` along the center line, and `o` across it. */
  at(s: number, o?: number): Point;
  /** The unit direction of the center line at `s`, from `a` toward `b`. */
  tangent(s: number): Point;
  /** `perpendicular(tangent(s))`: the + side across the wall. */
  normal(s: number): Point;
  /** The points from `s0` to `s1` at `o` across, with short chords on a curve. */
  points(s0: number, s1: number, o?: number): Point[];
  /** The position along the center line that is nearest to `p`, from 0 to `length`. */
  project(p: Point): number;
}

/** The largest bulge for a chord: a half circle. */
export function maxBulge(chord: number): number {
  return chord / 2;
}

/** The center line from `a` to `b` with the sagitta `bulge`. */
export function curveOf(a: Point, b: Point, bulge = 0): WallCurve {
  const chord = distance(a, b);
  const h = Math.max(-maxBulge(chord), Math.min(maxBulge(chord), bulge));
  if (chord < 1e-9 || Math.abs(h) < FLAT) return straightCurve(a, b, chord);

  const dir = scale(sub(b, a), 1 / chord);
  const n = perpendicular(dir);
  const radius = (chord * chord) / 4 / (2 * Math.abs(h)) + Math.abs(h) / 2;
  const middle = scale(add(a, b), 0.5);
  const center = add(middle, scale(n, h - Math.sign(h) * radius));
  // The angle of the whole arc: tan(angle / 4) = |h| / (chord / 2).
  const total = 4 * Math.atan2(Math.abs(h), chord / 2);
  const length = radius * total;
  const start = Math.atan2(a.y - center.y, a.x - center.x);
  // The direction of the turn: the one that goes through the middle of the arc.
  const top = add(middle, scale(n, h));
  const turn =
    distance(add(center, scale(polar(start + total / 2), radius)), top) <
    distance(add(center, scale(polar(start - total / 2), radius)), top)
      ? 1
      : -1;
  const angleAt = (s: number) => start + (turn * s) / radius;
  const tangent = (s: number) => scale(perpendicular(polar(angleAt(s))), turn);
  const normal = (s: number) => perpendicular(tangent(s));
  const at = (s: number, o = 0) =>
    add(add(center, scale(polar(angleAt(s)), radius)), scale(normal(s), o));
  return {
    a,
    b,
    length,
    circle: { center, radius },
    at,
    tangent,
    normal,
    points(s0, s1, o = 0) {
      const steps = Math.max(1, Math.ceil(Math.abs(s1 - s0) / radius / STEP));
      return Array.from({ length: steps + 1 }, (_, i) => at(s0 + ((s1 - s0) * i) / steps, o));
    },
    project(p) {
      const angle = Math.atan2(p.y - center.y, p.x - center.x);
      // The turn from the start, in the direction of the wall, from -π to π around the middle.
      let delta = turn * (angle - start);
      delta = ((delta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (delta > total / 2 + Math.PI) delta -= 2 * Math.PI;
      return Math.max(0, Math.min(length, delta * radius));
    },
  };
}

function polar(angle: number): Point {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function straightCurve(a: Point, b: Point, length: number): WallCurve {
  const dir = length < 1e-9 ? { x: 1, y: 0 } : scale(sub(b, a), 1 / length);
  const n = perpendicular(dir);
  const at = (s: number, o = 0) => add(a, add(scale(dir, s), scale(n, o)));
  return {
    a,
    b,
    length,
    circle: null,
    at,
    tangent: () => dir,
    normal: () => n,
    points: (s0, s1, o = 0) => [at(s0, o), at(s1, o)],
    project(p) {
      const s = (p.x - a.x) * dir.x + (p.y - a.y) * dir.y;
      return Math.max(0, Math.min(length, s));
    },
  };
}

function vertexOf(plan: Plan, id: Id): Point {
  const vertex = plan.vertices.find((v) => v.id === id);
  if (!vertex) throw new Error(`Unknown vertex ${id}`);
  return vertex;
}

/** The center line of the wall. */
export function wallCurve(plan: Plan, wall: Wall): WallCurve {
  return curveOf(vertexOf(plan, wall.a), vertexOf(plan, wall.b), wall.bulge ?? 0);
}

/** True if the wall is curved. */
export function isCurved(wall: Wall): boolean {
  return Math.abs(wall.bulge ?? 0) >= FLAT;
}

/** The unit direction from the vertex into the wall, along its center line. */
export function wallTangent(plan: Plan, wall: Wall, vertexId: Id): Point {
  const curve = wallCurve(plan, wall);
  return vertexId === wall.a ? curve.tangent(0) : scale(curve.tangent(curve.length), -1);
}

/**
 * The bulge of the part of a curved wall from `s0` to `s1` along it, for a split. It is 0 for a
 * straight wall.
 */
export function partBulge(curve: WallCurve, s0: number, s1: number): number {
  if (!curve.circle) return 0;
  const angle = Math.abs(s1 - s0) / curve.circle.radius;
  // The sagitta of a part keeps the side of the whole arc.
  const h = curve.circle.radius * (1 - Math.cos(angle / 2));
  const middle = curve.at((s0 + s1) / 2);
  const p = curve.at(s0);
  const q = curve.at(s1);
  const across = perpendicular(sub(q, p));
  const side = dot(sub(middle, scale(add(p, q), 0.5)), across);
  return side >= 0 ? h : -h;
}

/**
 * The bulge of a wall from `a` to `b` whose center line goes through the point `p`, as far as
 * the largest bulge allows. The editor uses it to bend a wall with the pointer.
 */
export function bulgeThrough(a: Point, b: Point, p: Point): number {
  const chord = distance(a, b);
  if (chord < 1e-9) return 0;
  const dir = scale(sub(b, a), 1 / chord);
  const n = perpendicular(dir);
  // The circle through a, b, and p has its center on the line middle + t·n.
  const middle = scale(add(a, b), 0.5);
  const u = (p.x - middle.x) * dir.x + (p.y - middle.y) * dir.y;
  const v = (p.x - middle.x) * n.x + (p.y - middle.y) * n.y;
  const half = chord / 2;
  if (Math.abs(v) < 1e-9 || Math.abs(u) >= half) {
    // The point is on the chord, or beyond the ends: take its distance across as the bulge.
    return Math.max(-maxBulge(chord), Math.min(maxBulge(chord), v));
  }
  // |center - a| = |center - p| with center = middle + t·n.
  const t = (u * u + v * v - half * half) / (2 * v);
  const radius = Math.hypot(half, t);
  const h = v > 0 ? t + radius : t - radius;
  return Math.max(-maxBulge(chord), Math.min(maxBulge(chord), h));
}
