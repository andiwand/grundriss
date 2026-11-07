// Doors and windows from the class map of the segmentation, and the step into the plan. The
// functions are pure: no DOM and no OpenCV, so tests run them in Node.

import { closestOnSegment, distance, dot, scale, sub } from "../model/geometry";
import { addOpening, clampOpening, nearestWall, wallEnds } from "../model/plan";
import type { Background, Id, Plan, Point } from "../model/types";
import { addWallSegments, toWorld, type WallSegment } from "../tracing/segments";

/** A connected group of pixels of one class. */
export interface Component {
  /** The number of pixels. */
  area: number;
  /** The center of mass. */
  center: Point;
  /** The unit vector of the long axis of the pixels. */
  axis: Point;
  /** The length along the long axis divided by the length across. 1 for a round group. */
  elongation: number;
  /** The pixels as indices into the class map, row by row. */
  pixels: Int32Array;
}

/**
 * The groups of 8-connected pixels with the class `value` in a class map of `width × height`.
 * Groups with fewer than `minArea` pixels go away, because they are noise.
 */
export function components(
  classes: Uint8Array,
  width: number,
  height: number,
  value: number,
  minArea: number,
): Component[] {
  const seen = new Uint8Array(classes.length);
  const queue = new Int32Array(classes.length);
  const result: Component[] = [];
  for (let start = 0; start < classes.length; start++) {
    if (classes[start] !== value || seen[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    while (head < tail) {
      const p = queue[head++];
      const x = p % width;
      const y = (p - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const q = ny * width + nx;
          if (classes[q] === value && !seen[q]) {
            seen[q] = 1;
            queue[tail++] = q;
          }
        }
      }
    }
    if (tail < minArea) continue;
    result.push(describe(queue.slice(0, tail), width));
  }
  return result;
}

/** The center, the long axis, and the elongation of a group, from its second moments. */
function describe(pixels: Int32Array, width: number): Component {
  let sx = 0;
  let sy = 0;
  for (const p of pixels) {
    sx += p % width;
    sy += Math.floor(p / width);
  }
  const n = pixels.length;
  const cx = sx / n;
  const cy = sy / n;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const p of pixels) {
    const dx = (p % width) - cx;
    const dy = Math.floor(p / width) - cy;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  // The eigenvector of the larger eigenvalue of the covariance is the long axis.
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const mean = (xx + yy) / 2;
  const spread = Math.sqrt(((xx - yy) / 2) ** 2 + xy * xy);
  const major = mean + spread;
  const minor = Math.max(mean - spread, 1e-9);
  return {
    area: n,
    center: { x: cx + 0.5, y: cy + 0.5 },
    axis: { x: Math.cos(angle), y: Math.sin(angle) },
    elongation: Math.sqrt(major / minor),
    pixels,
  };
}

export type OpeningKind = "door" | "window";

/** A door or a window that the recognition found, on one of its wall segments. */
export interface RecognizedOpening {
  kind: OpeningKind;
  /** The index of the wall segment in the list of walls. */
  segment: number;
  /** The center of the opening on the center line of the wall. */
  center: Point;
  /** The width of the opening along the wall. */
  width: number;
}

export interface OpeningOptions {
  /** The class indices of the doors and the windows in the class map. */
  door: number;
  window: number;
  /** Groups with fewer pixels go away. */
  minArea: number;
}

/**
 * The doors and the windows of a class map, on the wall segments. The segments must be in the
 * pixels of the class map. A group goes to the nearest segment whose direction fits the long
 * axis of the group. A round group, for example a door with its swing, fits each direction. The
 * width is the extent of the group along the segment.
 */
export function findOpenings(
  classes: Uint8Array,
  width: number,
  height: number,
  walls: WallSegment[],
  options: OpeningOptions,
): RecognizedOpening[] {
  const result: RecognizedOpening[] = [];
  for (const kind of ["door", "window"] as const) {
    for (const group of components(classes, width, height, options[kind], options.minArea)) {
      const opening = placeOnWall(group, kind, width, walls);
      if (opening) result.push(opening);
    }
  }
  return result;
}

/** The angle within which the long axis of a group fits the direction of a wall. */
const AXIS_TOLERANCE = Math.cos((30 * Math.PI) / 180);

function placeOnWall(
  group: Component,
  kind: OpeningKind,
  width: number,
  walls: WallSegment[],
): RecognizedOpening | null {
  let best: { index: number; distance: number; length: number; dir: Point } | null = null;
  for (const [index, wall] of walls.entries()) {
    const length = distance(wall.a, wall.b);
    if (length === 0) continue;
    const dir = scale(sub(wall.b, wall.a), 1 / length);
    if (group.elongation > 1.5 && Math.abs(dot(dir, group.axis)) < AXIS_TOLERANCE) continue;
    const d = closestOnSegment(group.center, wall.a, wall.b).distance;
    // A group further than about two wall thicknesses from the wall is not in that wall.
    const limit = 2 * wall.thickness + Math.sqrt(group.area) / 2;
    if (d > limit) continue;
    if (!best || d < best.distance) best = { index, distance: d, length, dir };
  }
  if (!best) return null;
  const { index, length, dir } = best;
  const wall = walls[index];
  // The extent of the pixels along the wall gives the width and the center.
  let min = Infinity;
  let max = -Infinity;
  for (const p of group.pixels) {
    const x = (p % width) + 0.5;
    const y = Math.floor(p / width) + 0.5;
    const along = (x - wall.a.x) * dir.x + (y - wall.a.y) * dir.y;
    min = Math.min(min, along - 0.5);
    max = Math.max(max, along + 0.5);
  }
  const start = Math.max(0, min);
  const end = Math.min(length, max);
  if (end - start <= 0) return null;
  const middle = (start + end) / 2;
  return {
    kind,
    segment: index,
    center: { x: wall.a.x + dir.x * middle, y: wall.a.y + dir.y * middle },
    width: end - start,
  };
}

/** Changes the openings from pixels of the background image to meters in the plan. */
export function openingsToWorld(
  openings: RecognizedOpening[],
  background: Pick<Background, "x" | "y" | "scale">,
): RecognizedOpening[] {
  return openings.map((o) => ({
    ...o,
    center: {
      x: background.x + o.center.x * background.scale,
      y: background.y + o.center.y * background.scale,
    },
    width: o.width * background.scale,
  }));
}

/** Changes the walls and the openings from pixels of the background image to meters. */
export function recognizedToWorld(
  result: { walls: WallSegment[]; openings: RecognizedOpening[] },
  background: Pick<Background, "x" | "y" | "scale">,
): { walls: WallSegment[]; openings: RecognizedOpening[] } {
  return {
    walls: toWorld(result.walls, background),
    openings: openingsToWorld(result.openings, background),
  };
}

export interface AddRecognizedOptions {
  /** Ends nearer than this (in meters) go to one vertex. */
  tolerance: number;
  /** The height of the new walls in meters. */
  height: number;
}

/** The smallest width of an opening, in meters. A narrower group is noise. */
const MIN_OPENING_WIDTH = 0.3;

/**
 * Adds the recognized walls and openings (in meters) to the plan. The walls go in first, with
 * `addWallSegments`, which can split them. Then each opening goes into the wall of the plan that
 * is nearest to its center, with its width, and the height and the sill of its kind. Call this
 * function inside a transaction of the document.
 */
export function addRecognized(
  plan: Plan,
  walls: WallSegment[],
  openings: RecognizedOpening[],
  options: AddRecognizedOptions,
): { walls: Id[]; openings: Id[] } {
  const wallIds = addWallSegments(plan, walls, options);
  const openingIds: Id[] = [];
  for (const recognized of openings) {
    if (recognized.width < MIN_OPENING_WIDTH) continue;
    const source = walls[recognized.segment];
    const reach = Math.max(options.tolerance, source ? source.thickness : 0) + 0.05;
    const hit = nearestWall(plan, recognized.center, reach);
    if (!hit) continue;
    const [a, b] = wallEnds(plan, hit.wall);
    const length = distance(a, b);
    const opening = addOpening(plan, hit.wall.id, recognized.kind, hit.t * length);
    // addOpening clamps with the default width, so the center goes back before the next clamp.
    opening.width = Math.min(recognized.width, length);
    opening.offset = hit.t * length;
    clampOpening(plan, opening);
    openingIds.push(opening.id);
  }
  return { walls: wallIds, openings: openingIds };
}

/**
 * Drops the walls along the edges of the image. The border of a scan or a shadow at the edge of a
 * photo often looks like a dark line, and the network takes it for a wall. A wall counts as an
 * edge line if both of its ends are within 1.5 % of the same edge of the image.
 */
export function withoutEdgeLines(
  walls: WallSegment[],
  width: number,
  height: number,
): WallSegment[] {
  const margin = 0.015 * Math.max(width, height);
  const near = (p: { x: number; y: number }) => ({
    left: p.x < margin,
    right: p.x > width - margin,
    top: p.y < margin,
    bottom: p.y > height - margin,
  });
  return walls.filter((wall) => {
    const a = near(wall.a);
    const b = near(wall.b);
    return !(
      (a.left && b.left) ||
      (a.right && b.right) ||
      (a.top && b.top) ||
      (a.bottom && b.bottom)
    );
  });
}
