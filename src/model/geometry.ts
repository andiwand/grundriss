import type { Point } from "./types";

export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Point, s: number): Point => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
export const length = (a: Point): number => Math.hypot(a.x, a.y);
export const distance = (a: Point, b: Point): number => length(sub(a, b));
/** The vector turned by 90 degrees: from the x axis to the y axis. */
export const perpendicular = (a: Point): Point => ({ x: -a.y, y: a.x });

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export interface SegmentHit {
  /** The position on the segment, from 0 at `a` to 1 at `b`. */
  t: number;
  point: Point;
  distance: number;
}

/** Finds the point on the segment from `a` to `b` that is nearest to `p`. */
export function closestOnSegment(p: Point, a: Point, b: Point): SegmentHit {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 === 0 ? 0 : clamp(dot(sub(p, a), ab) / l2, 0, 1);
  const point = add(a, scale(ab, t));
  return { t, point, distance: distance(p, point) };
}

/** The signed area of a polygon (the shoelace formula). */
export function signedArea(polygon: Point[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return sum / 2;
}

/** The center of mass of a polygon. A polygon without area gives the mean of its points. */
export function centroid(polygon: Point[]): Point {
  const area = signedArea(polygon);
  if (Math.abs(area) < 1e-12) {
    const sum = polygon.reduce(add, { x: 0, y: 0 });
    return scale(sum, 1 / Math.max(1, polygon.length));
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    const cross = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

export const snapToGrid = (p: Point, step: number): Point => ({
  x: Math.round(p.x / step) * step,
  y: Math.round(p.y / step) * step,
});
