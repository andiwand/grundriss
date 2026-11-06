// The shapes of the 2D drawing: the outlines of walls, the symbols of doors and windows, and
// dimension lines. The 2D editor and the exports draw the same shapes, so they come from here.
// This module has no DOM and no Three.js.

import { add, distance, perpendicular, scale, sub } from "./geometry";
import { chimneyOutline, stairShape, type StairShape } from "./building";
import { findWall, wallEnds, wallExtents } from "./plan";
import type { Chimney, Dimension, Opening, Plan, Point, Stair, Wall } from "./types";

/** The four corners of the body of a wall, in order around the body. */
export function wallOutline(plan: Plan, wall: Wall): Point[] {
  const [a, b] = wallEnds(plan, wall);
  const length = distance(a, b);
  if (length === 0) return [];
  const dir = scale(sub(b, a), 1 / length);
  const normal = scale(perpendicular(dir), wall.thickness / 2);
  const { start, end } = wallExtents(plan, wall);
  const p = add(a, scale(dir, start));
  const q = add(a, scale(dir, end));
  return [add(p, normal), add(q, normal), sub(q, normal), sub(p, normal)];
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

export interface DoorShape {
  kind: "door";
  /** The hole in the wall. */
  gap: Point[];
  hinge: Point;
  /** The free end of the leaf, which is open by 90 degrees. */
  leaf: Point;
  /** The path of the free end of the leaf, from `leaf` to the closed position. */
  arc: Arc;
}

export interface WindowShape {
  kind: "window";
  gap: Point[];
  /** The line of the glass, on the center line of the wall. */
  glass: [Point, Point];
}

export type OpeningShape = DoorShape | WindowShape;

const cross = (u: Point, v: Point) => u.x * v.y - u.y * v.x;

/** The symbol of a door or a window. It gives null if the wall is missing or has no length. */
export function openingShape(plan: Plan, opening: Opening): OpeningShape | null {
  const wall = findWall(plan, opening.wallId);
  if (!wall) return null;
  const [a, b] = wallEnds(plan, wall);
  const length = distance(a, b);
  if (length === 0) return null;
  const dir = scale(sub(b, a), 1 / length);
  const side = perpendicular(dir);
  const half = wall.thickness / 2;
  const start = add(a, scale(dir, opening.offset - opening.width / 2));
  const end = add(a, scale(dir, opening.offset + opening.width / 2));
  const across = scale(side, half + 0.01);
  const gap = [add(start, across), add(end, across), sub(end, across), sub(start, across)];

  if (opening.kind === "window") return { kind: "window", gap, glass: [start, end] };

  // The hinge and the closed position of the free end are on the face of the swing side.
  const face = scale(side, opening.swing * half);
  const [hingeCenter, closedCenter] = opening.hinge === "a" ? [start, end] : [end, start];
  const hinge = add(hingeCenter, face);
  const closed = add(closedCenter, face);
  const open = scale(side, opening.swing * opening.width);
  const leaf = add(hinge, open);
  // The arc turns from the open leaf to the closed leaf. The sign of the cross product gives
  // the direction of the turn.
  const sweep = cross(open, sub(closed, hinge)) > 0 ? 1 : 0;
  return {
    kind: "door",
    gap,
    hinge,
    leaf,
    arc: { center: hinge, radius: opening.width, from: leaf, to: closed, sweep },
  };
}

export interface DimensionShape {
  /** The dimension line, at the offset from the measured points. */
  line: [Point, Point];
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
  length: number;
}

/** The length past the dimension line of an extension line, and the half length of a tick. */
export const DIMENSION_OVERSHOOT = 0.1;
export const DIMENSION_TICK = 0.08;

export function dimensionShape(dimension: Dimension): DimensionShape {
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
    text: `${length.toFixed(2)} m`,
    length,
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
    if (shape?.kind === "door") points.push(shape.leaf);
  }
  for (const dimension of plan.dimensions) {
    const shape = dimensionShape(dimension);
    points.push(...shape.extensions.flat());
  }
  // The rise does not change the outline of a stair, so any rise works here.
  for (const stair of plan.stairs ?? []) points.push(...stairShape(stair, 1).outline);
  for (const chimney of plan.chimneys ?? []) points.push(...chimneyOutline(chimney));
  if (points.length === 0) return null;
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
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
