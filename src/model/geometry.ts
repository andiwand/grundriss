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

// ----- Clipping -----

const cross3 = (o: Point, a: Point, b: Point): number =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/**
 * The part of the polygon where a·x + b·y + c ≥ 0 (one step of Sutherland–Hodgman). The
 * polygon can be non-convex. Then the result can have edges of zero width, but its area and
 * its moments stay correct.
 */
export function clipHalfPlane(polygon: Point[], a: number, b: number, c: number): Point[] {
  const out: Point[] = [];
  const value = (p: Point) => a * p.x + b * p.y + c;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    const vp = value(p);
    const vq = value(q);
    if (vp >= 0) out.push(p);
    if (vp >= 0 !== vq >= 0) {
      const t = vp / (vp - vq);
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  }
  return out.length >= 3 ? out : [];
}

/** True if the polygon is convex. Points on a straight line do not count against it. */
export function isConvex(polygon: Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const turn = cross3(
      polygon[i],
      polygon[(i + 1) % polygon.length],
      polygon[(i + 2) % polygon.length],
    );
    if (Math.abs(turn) < 1e-12) continue;
    if (sign === 0) sign = Math.sign(turn);
    else if (Math.sign(turn) !== sign) return false;
  }
  return true;
}

/** The part of `subject` inside the convex polygon `clip`. The subject can be non-convex. */
export function clipConvex(subject: Point[], clip: Point[]): Point[] {
  const sign = signedArea(clip) >= 0 ? 1 : -1;
  let result = subject;
  for (let i = 0; i < clip.length && result.length >= 3; i++) {
    const p = clip[i];
    const q = clip[(i + 1) % clip.length];
    // The inside of each side is on the left for a positive area: cross(q − p, x − p) ≥ 0.
    const a = -(q.y - p.y) * sign;
    const b = (q.x - p.x) * sign;
    if (a === 0 && b === 0) continue;
    result = clipHalfPlane(result, a, b, -(a * p.x + b * p.y));
  }
  return result.length >= 3 ? result : [];
}

/**
 * Cuts a simple polygon into triangles by ear clipping. The triangles have the same direction
 * as a polygon with a positive area.
 */
export function triangulate(polygon: Point[]): Point[][] {
  let points = signedArea(polygon) >= 0 ? [...polygon] : [...polygon].reverse();
  const triangles: Point[][] = [];
  while (points.length > 3) {
    const n = points.length;
    let cut = -1;
    for (let i = 0; i < n && cut < 0; i++) {
      const a = points[(i + n - 1) % n];
      const b = points[i];
      const c = points[(i + 1) % n];
      const turn = cross3(a, b, c);
      // A point on a straight line between its neighbors goes away without a triangle.
      if (Math.abs(turn) < 1e-12) {
        cut = i;
        break;
      }
      if (turn < 0) continue;
      const blocked = points.some(
        (p) =>
          p !== a &&
          p !== b &&
          p !== c &&
          cross3(a, b, p) > 1e-12 &&
          cross3(b, c, p) > 1e-12 &&
          cross3(c, a, p) > 1e-12,
      );
      if (!blocked) {
        triangles.push([a, b, c]);
        cut = i;
      }
    }
    // A polygon that is not simple has no ear: the rest becomes a fan.
    if (cut < 0) {
      for (let i = 1; i + 1 < points.length; i++) {
        triangles.push([points[0], points[i], points[i + 1]]);
      }
      return triangles;
    }
    points = points.filter((_, j) => j !== cut);
  }
  if (points.length === 3 && Math.abs(signedArea(points)) > 1e-12) triangles.push(points);
  return triangles;
}

/**
 * The parts of `subject` inside `clip`. Both polygons can be non-convex: a non-convex clip
 * polygon becomes triangles, and each triangle clips the subject. The parts do not overlap.
 */
export function intersectPolygons(subject: Point[], clip: Point[]): Point[][] {
  const pieces = isConvex(clip) ? [clip] : triangulate(clip);
  return pieces.map((piece) => clipConvex(subject, piece)).filter((p) => p.length >= 3);
}

/** The area of the intersection of two polygons. */
export function intersectionArea(a: Point[], b: Point[]): number {
  const subject = signedArea(a) >= 0 ? a : [...a].reverse();
  return intersectPolygons(subject, b).reduce((sum, p) => sum + signedArea(p), 0);
}

/** The area and the first moments (∫x dA and ∫y dA) of a polygon, with signs. */
export function moments(polygon: Point[]): { area: number; x: number; y: number } {
  let area = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    const cross = p.x * q.y - q.x * p.y;
    area += cross;
    x += (p.x + q.x) * cross;
    y += (p.y + q.y) * cross;
  }
  return { area: area / 2, x: x / 6, y: y / 6 };
}
