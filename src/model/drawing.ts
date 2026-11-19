// The shapes of the 2D drawing: the outlines of walls, the symbols of doors and windows, and
// dimension lines. The 2D editor and the exports draw the same shapes, so they come from here.
// This module has no DOM and no Three.js.

import { fmt } from "./format";
import { add, cross, distance, perpendicular, scale, sub } from "./geometry";
import { chimneyOutline, stairShape, type StairShape } from "./building";
import { findWall } from "./plan";
import { wallCurve } from "./wallcurve";
import { wallFaces } from "./walljoin";
import type { Chimney, Dimension, Opening, OpeningKind, Plan, Point, Stair, Wall } from "./types";

/**
 * The corners of the body of a wall, in order around the body. The ends follow the joins with
 * the other walls (`wallFaces`), so a thick wall does not go out of a thin wall that it meets.
 * Where three or more walls meet, the body also has the vertex, so the joint has no hole.
 */
export function wallOutline(plan: Plan, wall: Wall): Point[] {
  const curve = wallCurve(plan, wall);
  if (curve.length === 0) return [];
  const half = wall.thickness / 2;
  const { body, hub } = wallFaces(plan, wall);
  // A curved face is a line of short chords.
  return [
    ...curve.points(body.right[0], body.right[1], half),
    ...(hub[1] ? [curve.b] : []),
    ...curve.points(body.left[1], body.left[0], -half),
    ...(hub[0] ? [curve.a] : []),
  ];
}

/** A circular arc around `center` from the point `from` to the point `to`. */
export interface Arc {
  center: Point;
  radius: number;
  from: Point;
  to: Point;
  /** The SVG sweep flag: 1 if the arc turns from the x axis to the y axis, else 0. */
  sweep: 0 | 1;
}

/**
 * The symbol of a door or a window. A window has its glass on the center line of the wall. A
 * hinged leaf shows open by 90 degrees, with the path of its free end. A sliding leaf shows at
 * its open place, along the face of the wall. The leaves of a window are thin in the drawing.
 */
export interface OpeningShape {
  kind: OpeningKind;
  /** The hole in the wall. */
  gap: Point[];
  /** The lines of the glass of a window. A sliding window has two panes. */
  glass: [Point, Point][];
  /** The leaves: from the hinge to the free end, or the place of a sliding leaf. */
  leaves: [Point, Point][];
  /** The paths of the free ends of the hinged leaves, from the open to the closed position. */
  arcs: Arc[];
}

/** The distance of a sliding leaf from the face of the wall, and of the panes of a window. */
const SLIDE_GAP = 0.03;

/** The symbol of a door or a window. It gives null if the wall is missing or has no length. */
export function openingShape(plan: Plan, opening: Opening): OpeningShape | null {
  const wall = findWall(plan, opening.wallId);
  if (!wall) return null;
  const curve = wallCurve(plan, wall);
  if (curve.length === 0) return null;
  const half = wall.thickness / 2;
  const s0 = opening.offset - opening.width / 2;
  const s1 = opening.offset + opening.width / 2;
  // In a curved wall, the gap follows the arc.
  const gap = [...curve.points(s0, s1, half + 0.01), ...curve.points(s1, s0, -half - 0.01)];
  const shape: OpeningShape = { kind: opening.kind, gap, glass: [], leaves: [], arcs: [] };
  const window = opening.kind === "window";
  const face = opening.swing * half;
  const two = opening.leaves === 2;

  if (window) {
    if (opening.style === "sliding") {
      // Two panes next to each other, a bit apart across the wall, which overlap in the middle.
      const overlap = opening.width * 0.05;
      shape.glass.push(
        [curve.at(s0, -SLIDE_GAP / 2), curve.at(opening.offset + overlap, -SLIDE_GAP / 2)],
        [curve.at(opening.offset - overlap, SLIDE_GAP / 2), curve.at(s1, SLIDE_GAP / 2)],
      );
      return shape;
    }
    shape.glass.push([curve.at(s0, 0), curve.at(s1, 0)]);
  }
  if (opening.style === "fixed") return shape;

  if (opening.style === "sliding") {
    // A sliding leaf moves along the wall, on the face of the swing side. Two leaves move apart.
    const o = face + opening.swing * SLIDE_GAP;
    const parts: [number, number, number][] = two
      ? [
          [s0, opening.offset, -1],
          [opening.offset, s1, 1],
        ]
      : [[s0, s1, opening.hinge === "a" ? -1 : 1]];
    for (const [p0, p1, way] of parts) {
      const move = way * (p1 - p0);
      shape.leaves.push([curve.at(p0 + move, o), curve.at(p1 + move, o)]);
    }
    return shape;
  }

  // Hinged leaves: the hinge and the closed position of the free end are on the face of the swing
  // side. Two leaves have their hinges at the two ends and meet in the middle.
  const hinged: [number, number][] = two
    ? [
        [s0, opening.offset],
        [s1, opening.offset],
      ]
    : opening.hinge === "a"
      ? [[s0, s1]]
      : [[s1, s0]];
  for (const [h, c] of hinged) {
    const hinge = curve.at(h, face);
    const closed = curve.at(c, face);
    const width = distance(hinge, closed);
    const open = scale(curve.normal(h), opening.swing * width);
    const leaf = add(hinge, open);
    // The arc turns from the open leaf to the closed leaf. The sign of the cross product gives
    // the direction of the turn.
    const sweep = cross(open, sub(closed, hinge)) > 0 ? 1 : 0;
    shape.leaves.push([hinge, leaf]);
    shape.arcs.push({ center: hinge, radius: width, from: leaf, to: closed, sweep });
  }
  return shape;
}

export interface DimensionShape {
  /** The ends of the dimension line, at the offset from the measured points. */
  line: [Point, Point];
  /**
   * The dimension line as segments: one for a distance, and the short chords of the arc for an
   * angle.
   */
  segments: [Point, Point][];
  /** The lines from the measured points to the dimension line, and a bit past it. */
  extensions: [Point, Point][];
  /** Short slashes at 45 degrees at the two ends of the dimension line. */
  ticks: [Point, Point][];
  /** The middle of the dimension line. Move the text by `normal` times its size. */
  textAt: Point;
  /** The unit vector that points away from the measured points. */
  normal: Point;
  /** The angle of the text in degrees, from -90 to 90, so that the text is never upside down. */
  angle: number;
  text: string;
  /** The measured distance, or the length of the arc of an angle. */
  length: number;
  /** The measured angle in degrees, only for an angle dimension. */
  degrees?: number;
}

/** The length past the dimension line of an extension line, and the half length of a tick. */
export const DIMENSION_OVERSHOOT = 0.1;
export const DIMENSION_TICK = 0.08;

export function dimensionShape(dimension: Dimension): DimensionShape {
  if (dimension.center)
    return angleShape(dimension.center, dimension.a, dimension.b, dimension.offset);
  const { a, b, offset } = dimension;
  const length = distance(a, b);
  const dir = length === 0 ? { x: 1, y: 0 } : scale(sub(b, a), 1 / length);
  const side = perpendicular(dir);
  const sign = offset < 0 ? -1 : 1;
  const normal = scale(side, sign);
  const p = add(a, scale(side, offset));
  const q = add(b, scale(side, offset));
  const past = scale(normal, DIMENSION_OVERSHOOT);
  const tick = scale(add(dir, side), DIMENSION_TICK / Math.SQRT2);
  let angle = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle <= -90) angle += 180;
  return {
    line: [p, q],
    segments: [[p, q]],
    extensions: [
      [a, add(p, past)],
      [b, add(q, past)],
    ],
    ticks: [
      [sub(p, tick), add(p, tick)],
      [sub(q, tick), add(q, tick)],
    ],
    textAt: scale(add(p, q), 0.5),
    normal,
    angle,
    text: `${fmt(length)} m`,
    length,
  };
}

/**
 * The angle at `center` from the ray to `a` to the ray to `b`, in radians from 0 to 2π. It turns
 * in the direction of a growing `atan2` in the plan axes, which is clockwise on the screen.
 */
export function angleSweep(center: Point, a: Point, b: Point): number {
  const from = Math.atan2(a.y - center.y, a.x - center.x);
  const to = Math.atan2(b.y - center.y, b.x - center.x);
  const sweep = (to - from) % (2 * Math.PI);
  return sweep < 0 ? sweep + 2 * Math.PI : sweep;
}

/** The two arms in the order that makes the angle at `center` from the first not more than 180°. */
export function smallerAngle(center: Point, a: Point, b: Point): [Point, Point] {
  return angleSweep(center, a, b) > Math.PI ? [b, a] : [a, b];
}

/** The radius of a new angle dimension: half of the shorter side, from 0.2 m to 0.8 m. */
export function defaultAngleRadius(center: Point, a: Point, b: Point): number {
  const side = Math.min(distance(center, a), distance(center, b));
  return Math.round(Math.min(0.8, Math.max(0.2, side / 2)) * 20) / 20;
}

/** The text of an angle in degrees. */
export function angleText(degrees: number): string {
  // A whole number of degrees has no decimals: "90°", but "37.5°".
  const rounded = Math.round(degrees * 10) / 10;
  return `${fmt(rounded, Number.isInteger(rounded) ? 0 : 1)}°`;
}

/**
 * The shape of an angle dimension: an arc of the radius `radius` around `center`, from the ray
 * to `a` to the ray to `b` (see `angleSweep`). An arm that is shorter than the radius gets an
 * extension line up to the arc.
 */
export function angleShape(center: Point, a: Point, b: Point, radius: number): DimensionShape {
  const r = Math.max(Math.abs(radius), 1e-3);
  const from = Math.atan2(a.y - center.y, a.x - center.x);
  const sweep = angleSweep(center, a, b);
  const ray = (angle: number) => ({ x: Math.cos(angle), y: Math.sin(angle) });
  const on = (angle: number, distance = r) => add(center, scale(ray(angle), distance));
  const steps = Math.max(2, Math.ceil(sweep / (Math.PI / 36)));
  const points = Array.from({ length: steps + 1 }, (_, i) => on(from + (sweep * i) / steps));
  const segments = points.slice(1).map((p, i) => [points[i], p] as [Point, Point]);
  const extensions: [Point, Point][] = [];
  for (const [arm, angle] of [
    [a, from],
    [b, from + sweep],
  ] as const) {
    const length = distance(center, arm);
    if (length < r) extensions.push([on(angle, length), on(angle, r + DIMENSION_OVERSHOOT)]);
  }
  // A tick at each end, across the arc at 45 degrees, like the ticks of a distance.
  const tick = (angle: number) => {
    const d = scale(add(ray(angle), ray(angle + Math.PI / 2)), DIMENSION_TICK / Math.SQRT2);
    const p = on(angle);
    return [sub(p, d), add(p, d)] as [Point, Point];
  };
  const middle = from + sweep / 2;
  const normal = ray(middle);
  const degrees = (sweep * 180) / Math.PI;
  return {
    line: [points[0], points[points.length - 1]],
    segments,
    extensions,
    ticks: [tick(from), tick(from + sweep)],
    textAt: on(middle),
    normal,
    // The text of an angle stands upright, so that it is easy to read at any place of the arc.
    angle: 0,
    text: angleText(degrees),
    length: sweep * r,
    degrees,
  };
}

/** The box around all points of the plan: vertices, wall bodies, and dimension lines. */
export function planBounds(
  plan: Plan,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const points: Point[] = [];
  for (const wall of plan.walls) points.push(...wallOutline(plan, wall));
  for (const vertex of plan.vertices) points.push(vertex);
  for (const opening of plan.openings) {
    const shape = openingShape(plan, opening);
    if (shape) for (const leaf of shape.leaves) points.push(...leaf);
  }
  for (const dimension of plan.dimensions) {
    const shape = dimensionShape(dimension);
    points.push(...shape.extensions.flat(), ...shape.segments.flat());
  }
  // The rise does not change the outline of a stair, so any rise works here.
  for (const stair of plan.stairs ?? []) points.push(...stairShape(stair, 1).outline);
  for (const chimney of plan.chimneys ?? []) points.push(...chimneyOutline(chimney));
  if (points.length === 0) return null;
  // A loop, not Math.min(...points): a spread of a very large plan exceeds the call stack.
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of points) {
    box.minX = Math.min(box.minX, p.x);
    box.minY = Math.min(box.minY, p.y);
    box.maxX = Math.max(box.maxX, p.x);
    box.maxY = Math.max(box.maxY, p.y);
  }
  return box;
}

// ----- Stairs and chimneys -----

export interface StairDrawing extends StairShape {
  /** The two short lines of the arrow head at the top end of the walking line. */
  head: [Point, Point][];
}

/** The plan symbol of a stair: the steps, the outline, and the walking line with an arrow. */
export function stairDrawing(stair: Stair, rise: number): StairDrawing {
  const shape = stairShape(stair, rise);
  const [from, to] = shape.arrow.slice(-2);
  const length = distance(from, to);
  const dir = length === 0 ? { x: 1, y: 0 } : scale(sub(to, from), 1 / length);
  const size = Math.min(0.25, stair.width / 4);
  const back = scale(dir, -size);
  const side = scale(perpendicular(dir), size * 0.6);
  return {
    ...shape,
    head: [
      [to, add(add(to, back), side)],
      [to, sub(add(to, back), side)],
    ],
  };
}

export interface ChimneySymbol {
  outline: Point[];
  /** The two diagonals: the usual plan symbol of a shaft. */
  diagonals: [Point, Point][];
}

export function chimneySymbol(chimney: Chimney): ChimneySymbol {
  const outline = chimneyOutline(chimney);
  return {
    outline,
    diagonals: [
      [outline[0], outline[2]],
      [outline[1], outline[3]],
    ],
  };
}

export interface NorthArrow {
  /** The arrow: a triangle with a notch at the back, pointing to north. */
  arrow: Point[];
  /** The middle of the letter "N", in front of the tip. */
  label: Point;
}

/**
 * The north arrow at `at`, `size` meters long. `north` is the direction of north in degrees,
 * clockwise from the top of the plan (the -y axis).
 */
export function northArrow(at: Point, size: number, north: number): NorthArrow {
  const angle = (north * Math.PI) / 180;
  const dir = { x: Math.sin(angle), y: -Math.cos(angle) };
  const side = scale(perpendicular(dir), size * 0.4);
  const tip = add(at, scale(dir, size / 2));
  const back = add(at, scale(dir, -size / 2));
  return {
    arrow: [tip, add(back, side), add(at, scale(dir, -size / 4)), sub(back, side)],
    label: add(at, scale(dir, size * 0.95)),
  };
}
