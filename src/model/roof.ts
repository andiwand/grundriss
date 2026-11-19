// The bridge from the building to the roof engine (src/model/roofshape.ts). A building has a
// list of roofs. Each roof is on a story and has its own outline and sides. The functions here
// give the engine its input from the building, and they keep the results in a cache.
//
// The points use the plan coordinates x and y, and z is the height above the ground. The 3D
// view maps (x, y, z) to the world (x, z, y).

import { findStory, storyAbove, wallTop } from "./building";
import { DEFAULT_COLORS } from "./colors";
import { closestOnSegment, intersectionArea, signedArea } from "./geometry";
import { newId } from "./plan";
import { isCurved, wallCurve } from "./wallcurve";
import { findRooms, planOutline, pointInPolygon } from "./rooms";
import {
  presetSides,
  roofGeometry,
  type RoofGeometry,
  type RoofInput,
  type Vec3,
} from "./roofshape";
import type { Building, Id, Point, Roof, RoofKind, RoofSide, Story } from "./types";

export type { Vec3 } from "./roofshape";

/** The usual pitch and overhang of a new roof. */
export const ROOF_DEFAULTS = { pitch: 35, overhang: 0.4 };

/**
 * The usual height of the eaves of a roof on the story: the top of its walls. If a story is above,
 * the roof sits on the floor of that story, so that the floor does not come out under the roof.
 */
export function roofBase(building: Building, story: Story): number {
  const above = storyAbove(building, story);
  return Math.max(wallTop(story), above ? above.elevation : -Infinity);
}

/**
 * The input of the engine for a roof of the building. The eaves are at `roofBase`, or at the
 * base of the roof if it has one. The outline of the roof is on the center lines of the walls,
 * but a real roof sits on the outer face of the walls. So the engine gets each side moved out by
 * half the thickness of the thickest wall of the story. Else the outer half of each wall comes up
 * through the roof. A side against a wall of a higher story (`againstWalls`) moves in to the face
 * of that wall instead, and has no overhang. Else the roof goes into that wall.
 */
export function roofInput(building: Building, roof: Roof): RoofInput {
  const story = findStory(building, roof.storyId);
  const base = roof.base ?? (story ? roofBase(building, story) : 0);
  const thickness = story ? Math.max(0, ...story.walls.map((w) => w.thickness)) : 0;
  const n = roof.outline.length;
  const against = story ? againstWalls(building, roof, story) : null;
  const wall = (i: number) => against?.sides[((i % n) + n) % n] ?? 0;
  const distances = roof.outline.map((_, i) => (wall(i) > 0 ? -wall(i) / 2 : thickness / 2));
  // Where a side against a wall goes on in a side on the same line, the step between the two
  // moved sides is at the outer face of the wall of the higher story that ends there.
  const steps = roof.outline.map((_, i) => {
    if (wall(i - 1) > 0 === wall(i) > 0) return 0;
    const end = against?.ends[i] ?? 0;
    return wall(i - 1) > 0 ? end : -end;
  });
  const { outline, from } = offsetSides(roof.outline, distances, steps);
  const sides = from.map((j): RoofSide => {
    if (j < 0) return { kind: "gable", pitch: 0, overhang: 0 };
    const side = roof.sides[j];
    return side && wall(j) > 0 ? { ...side, overhang: 0 } : side;
  });
  // The offset of a dormer or a window counts from the start of its side on the center lines.
  // The moved side starts at another point, so the offset changes by the distance between them.
  const shift = <T extends { side: number; offset: number }>(item: T): T => {
    const a = roof.outline[item.side];
    const b = roof.outline[(item.side + 1) % n];
    const length = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
    if (length === 0) return item;
    const index = from.indexOf(item.side);
    const moved = outline[index];
    const delta = ((a.x - moved.x) * (b.x - a.x) + (a.y - moved.y) * (b.y - a.y)) / length;
    return { ...item, side: index, offset: item.offset + delta };
  };
  return {
    outline,
    sides,
    base,
    flat: roof.flat,
    dormers: roof.dormers.map(shift),
    windows: roof.windows.map(shift),
  };
}

/** A point of a wall closer than this to the line of a side of a roof is on that line. */
const ON_SIDE = 0.02;

/**
 * The sides of a roof that are against a wall of a higher story, for example the side of a
 * lean-to roof on the ground floor next to the part of the house with two stories. A side is
 * against the walls of a story above if they cover at least half of the side, and the story is
 * on the outer side of the side. A story above inside the roof, for example an attic, is not:
 * the roof covers its walls.
 *
 * `sides[i]` is the thickness of the wall that side i is against, or 0. `ends[i]` is half the
 * thickness of a wall of such a story that ends at point i across the outline, or 0: where a
 * side against a wall goes on in a side on the same line, the roof steps at the outer face of
 * that wall.
 */
export function againstWalls(
  building: Building,
  roof: Roof,
  story: Story,
): { sides: number[]; ends: number[] } {
  const outline = roof.outline;
  const n = outline.length;
  const sides = new Array<number>(n).fill(0);
  const ends = new Array<number>(n).fill(0);
  if (n < 3) return { sides, ends };
  const sign = signedArea(outline) >= 0 ? 1 : -1;
  const walls: { a: Point; b: Point; thickness: number }[] = [];
  for (const upper of building.stories) {
    if (upper.elevation <= story.elevation + 1e-6) continue;
    const footprint = planOutline(upper);
    // A story over the roof, for example an attic, is under the roof.
    if (!footprint || Math.abs(intersectionArea(footprint, outline)) >= 0.5) continue;
    const straight = upper.walls
      .filter((wall) => !isCurved(wall))
      .map((wall) => {
        const curve = wallCurve(upper, wall);
        return { a: curve.at(0), b: curve.at(curve.length), thickness: wall.thickness };
      });
    for (let i = 0; i < n; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % n];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length < 1e-6) continue;
      const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
      const out = { x: sign * dir.y, y: -sign * dir.x };
      const across = (p: Point) => (p.x - a.x) * out.x + (p.y - a.y) * out.y;
      const along = (p: Point) => (p.x - a.x) * dir.x + (p.y - a.y) * dir.y;
      let covered = 0;
      let thickness = 0;
      let longest: { length: number; middle: number; thickness: number } | null = null;
      for (const wall of straight) {
        if (Math.abs(across(wall.a)) > ON_SIDE || Math.abs(across(wall.b)) > ON_SIDE) continue;
        const s0 = Math.max(0, Math.min(along(wall.a), along(wall.b)));
        const s1 = Math.min(length, Math.max(along(wall.a), along(wall.b)));
        if (s1 - s0 < 1e-6) continue;
        covered += s1 - s0;
        thickness = Math.max(thickness, wall.thickness);
        if (!longest || s1 - s0 > longest.length)
          longest = { length: s1 - s0, middle: (s0 + s1) / 2, thickness: wall.thickness };
      }
      if (!longest || covered < length / 2) continue;
      // The story must be on the outer side of the wall, not on the side of the roof.
      const d = longest.thickness / 2 + 0.05;
      const probe = {
        x: a.x + longest.middle * dir.x + d * out.x,
        y: a.y + longest.middle * dir.y + d * out.y,
      };
      if (!pointInPolygon(probe, footprint)) continue;
      sides[i] = Math.max(sides[i], thickness);
      walls.push(...straight);
    }
  }
  for (let i = 0; i < n; i++) {
    const before = sides[(i + n - 1) % n];
    if (before > 0 === sides[i] > 0) continue;
    const j = before > 0 ? (i + n - 1) % n : i;
    const a = outline[j];
    const b = outline[(j + 1) % n];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const p = outline[i];
    for (const wall of walls) {
      const at = [wall.a, wall.b].find((q) => Math.hypot(q.x - p.x, q.y - p.y) <= ON_SIDE);
      const wallLength = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
      if (!at || wallLength < 1e-6) continue;
      // Only a wall across the side: a wall on the side ends at the step itself.
      const cos =
        ((wall.b.x - wall.a.x) * (b.x - a.x) + (wall.b.y - wall.a.y) * (b.y - a.y)) /
        (wallLength * length);
      if (Math.abs(cos) < 0.5) ends[i] = Math.max(ends[i], wall.thickness / 2);
    }
  }
  return { sides, ends };
}

/**
 * The cache of the geometry. The key is the roof object, because the history makes a new
 * object for each change. A drag changes the roof in place inside a transaction, so the cache
 * also keeps the inputs and computes again when they change.
 */
const cache = new WeakMap<Roof, { key: string; geometry: RoofGeometry }>();

/** The faces, gables, edges, dormers, and windows of a roof. */
export function roofGeometryOf(building: Building, roof: Roof): RoofGeometry {
  const input = roofInput(building, roof);
  const key = JSON.stringify(input);
  const cached = cache.get(roof);
  if (cached && cached.key === key) return cached.geometry;
  const geometry = roofGeometry(input);
  cache.set(roof, { key, geometry });
  return geometry;
}

/** The geometry of all roofs of the building. A roof with less than three points has none. */
export function roofGeometries(building: Building): { roof: Roof; geometry: RoofGeometry }[] {
  return building.roofs
    .filter((roof) => roof.outline.length >= 3 && findStory(building, roof.storyId))
    .map((roof) => ({ roof, geometry: roofGeometryOf(building, roof) }));
}

/**
 * The roofs of all stories as the view from above shows them: the lowest top first, so that a
 * higher roof covers a lower one where they overlap. A roof on a lower story, for example over a
 * part of the ground floor without a story above, is there too.
 */
export function roofsFromAbove(building: Building): { roof: Roof; geometry: RoofGeometry }[] {
  return roofGeometries(building).sort((a, b) => a.geometry.top - b.geometry.top);
}

/**
 * The roofs that the 3D view shows with the active story and the stories below it. The roof of
 * the active story does not show, so that the view goes into its rooms. A roof of a lower story
 * shows if it is not over a room of the active story, for example the roof of a low wing next to
 * the higher part. With `all`, all roofs show.
 */
export function roofsInView(building: Building, activeId: Id, all: boolean): Roof[] {
  if (all) return building.roofs;
  const active = findStory(building, activeId);
  if (!active) return building.roofs;
  const rooms = findRooms(active).map((r) => r.polygon);
  // The middle of each wall, also of a wall that closes no room yet.
  const middles = active.walls.map((wall) => {
    const curve = wallCurve(active, wall);
    return curve.at(curve.length / 2);
  });
  return building.roofs.filter((roof) => {
    const story = findStory(building, roof.storyId);
    if (!story || story.elevation >= active.elevation - 1e-6) return false;
    // A shared side or a small overlap at the walls does not count.
    if (rooms.some((room) => Math.abs(intersectionArea(roof.outline, room)) >= 0.5)) return false;
    // A wall on the outline of the roof is next to it, not under it.
    const n = roof.outline.length;
    const under = (p: Point) =>
      pointInPolygon(p, roof.outline) &&
      roof.outline.every(
        (a, i) => closestOnSegment(p, a, roof.outline[(i + 1) % n]).distance > 0.05,
      );
    return !middles.some(under);
  });
}

/** The box of the eaves of all roofs on the plan, or null without roofs. */
export function roofBounds(
  building: Building,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const points = roofGeometries(building).flatMap(({ geometry }) => geometry.eaves);
  if (points.length === 0) return null;
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

export const findRoof = (building: Building, id: Id): Roof | undefined =>
  building.roofs.find((r) => r.id === id);

/**
 * A plane of the roof over the plan: the height above the ground is z = c + gx·x + gy·y.
 * `slope` is the sloped area over 1 m² of the plan: 1 / cos(pitch).
 */
export interface RoofPlane {
  c: number;
  gx: number;
  gy: number;
  slope: number;
}

/** The height of the plane over a point of the plan. */
export const planeHeight = (plane: RoofPlane, p: Point): number =>
  plane.c + plane.gx * p.x + plane.gy * p.y;

/** The plane of a flat polygon in 3D, by Newell's method. A vertical polygon gives null. */
export function planeOf(polygon: Vec3[]): RoofPlane | null {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  const size = Math.hypot(nx, ny, nz);
  if (size < 1e-12 || Math.abs(nz) < 1e-9 * size) return null;
  const at = polygon[0];
  const gx = -nx / nz;
  const gy = -ny / nz;
  return { c: at.z - gx * at.x - gy * at.y, gx, gy, slope: size / Math.abs(nz) };
}

/**
 * A part of the roof surface over the plan. The parts of a roof with their signs give its
 * surface: each main face adds its part, the hole under each dormer removes its part of the
 * main face, and the faces of each dormer add their parts. The part on the plan can be
 * non-convex.
 */
export interface RoofPatch {
  plan: Point[];
  plane: RoofPlane;
  sign: 1 | -1;
}

const toPlan = (polygon: Vec3[]): Point[] => polygon.map((p) => ({ x: p.x, y: p.y }));

/** The parts of the surface of a roof, with dormers. */
export function roofPatches(geometry: RoofGeometry): RoofPatch[] {
  const patches: RoofPatch[] = [];
  const push = (polygon: Vec3[], sign: 1 | -1) => {
    const plane = planeOf(polygon);
    if (plane && polygon.length >= 3) patches.push({ plan: toPlan(polygon), plane, sign });
  };
  for (const face of geometry.faces) push(face.polygon, 1);
  for (const dormer of geometry.dormers) {
    push(dormer.hole, -1);
    for (const face of dormer.faces) push(face, 1);
  }
  return patches;
}

/**
 * A function that gives the height above the ground of the surface of one roof over a point of
 * the plan, or null if the roof is not over the point. Under a dormer, the surface is the roof
 * of the dormer, not the main face.
 */
export function roofSurface(geometry: RoofGeometry): (p: Point) => number | null {
  const faces = geometry.faces
    .map((face) => ({ plan: toPlan(face.polygon), plane: planeOf(face.polygon) }))
    .filter((f): f is { plan: Point[]; plane: RoofPlane } => f.plane !== null);
  const dormers = geometry.dormers
    .flatMap((d) => d.faces)
    .map((face) => ({ plan: toPlan(face), plane: planeOf(face) }))
    .filter((f): f is { plan: Point[]; plane: RoofPlane } => f.plane !== null);
  const lowest = (list: typeof faces, p: Point): number | null => {
    let z: number | null = null;
    for (const face of list) {
      if (!pointInPolygon(p, face.plan)) continue;
      const h = planeHeight(face.plane, p);
      if (z === null || h < z) z = h;
    }
    return z;
  };
  return (p) => lowest(dormers, p) ?? lowest(faces, p);
}

/** The lowest surface of the roofs over a point, or null if none of them is over it. */
function lowestSurface(roofs: RoofGeometry[]): (p: Point) => number | null {
  const surfaces = roofs.map(roofSurface);
  return (p) => {
    let lowest: number | null = null;
    for (const surface of surfaces) {
      const z = surface(p);
      if (z !== null && (lowest === null || z < lowest)) lowest = z;
    }
    return lowest;
  };
}

/**
 * A function that gives the height above the ground of the lowest pitched roof over a point of
 * the plan, or null if no such roof is over it. Only the roofs of the stories below `story`
 * count: they are the roofs that the walls of `story` must stay under, for example the walls of
 * an attic. Flat roofs do not count, because a story on a flat roof is usual, for example with a
 * terrace around it. Under a dormer, the height is the roof of the dormer.
 */
export function roofCeiling(building: Building, story: Story): (p: Point) => number | null {
  const roofs = roofGeometries(building)
    .filter(({ roof }) => {
      const own = findStory(building, roof.storyId);
      return !roof.flat && own != null && own.elevation < story.elevation;
    })
    .map(({ geometry }) => geometry);
  return lowestSurface(roofs);
}

/**
 * The roofs that cover a story. A roof covers its own story. A pitched roof also covers the
 * stories above its story up to its top, for example an attic: its eaves are on the floor of
 * the story above. A story on a flat roof is not under that roof.
 */
export function coveringRoofs(
  building: Building,
  story: Story,
): { roof: Roof; geometry: RoofGeometry }[] {
  return roofGeometries(building).filter(({ roof, geometry }) => {
    const own = findStory(building, roof.storyId);
    if (!own) return false;
    if (own.id === story.id) return true;
    return !roof.flat && story.elevation > own.elevation && story.elevation < geometry.top;
  });
}

/**
 * A function that gives the clear height above the floor of the story at a point of the plan,
 * under the roofs that cover the story (`coveringRoofs`), or null if no such roof is over the
 * point. The roof on the story itself counts too, for example the roof on an attic with knee
 * walls. Under a dormer, the clear height goes up to the roof of the dormer. The height can be
 * below zero, for example under the eaves outside the walls. The function ignores the
 * thickness of the roof.
 */
export function clearHeight(building: Building, story: Story): (p: Point) => number | null {
  const surface = lowestSurface(coveringRoofs(building, story).map(({ geometry }) => geometry));
  return (p) => {
    const z = surface(p);
    return z === null ? null : z - story.elevation;
  };
}

/** The lines of the roofs of a story seen from above: the eaves, ridges, hips, and valleys. */
export function roofLines(building: Building, storyId: Id): [Point, Point][] {
  const lines: [Point, Point][] = [];
  for (const { roof, geometry } of roofGeometries(building)) {
    if (roof.storyId !== storyId) continue;
    for (const [a, b] of geometry.edges) {
      // A vertical edge, for example the corner of a gable wall, is a point on the plan.
      if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-6) continue;
      lines.push([
        { x: a.x, y: a.y },
        { x: b.x, y: b.y },
      ]);
    }
  }
  return lines;
}

/**
 * A new roof on the story, with the outline of its walls and the sides of the preset. It gives
 * null if the walls of the story close no room.
 */
export function newRoof(building: Building, story: Story, preset: RoofKind): Roof | null {
  const outline = planOutline(story);
  if (!outline || outline.length < 3) return null;
  const { pitch, overhang } = ROOF_DEFAULTS;
  return {
    id: newId("roof"),
    name: `Roof ${building.roofs.length + 1}`,
    storyId: story.id,
    outline,
    sides: presetSides(outline, preset, pitch, overhang),
    base: null,
    flat: preset === "flat",
    dormers: [],
    windows: [],
    color: DEFAULT_COLORS.roof,
    underside: DEFAULT_COLORS.underside,
  };
}

/** The rectangle around the walls of a story, or null if the story has no walls. */
export function storyBox(story: Story): Point[] | null {
  const points = story.vertices.filter((v) =>
    story.walls.some((w) => w.a === v.id || w.b === v.id),
  );
  if (points.length === 0) return null;
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

/**
 * The polygon moved out by `d` on each side. Each corner goes to the point where the two moved
 * sides meet. The polygon can go in either direction.
 */
export function offsetOutline(points: Point[], d: number): Point[] {
  if (points.length < 3 || d === 0) return points.map((p) => ({ ...p }));
  return offsetSides(
    points,
    points.map(() => d),
  ).outline;
}

/**
 * The polygon with each side i moved out by `d[i]`, or in for a negative distance. Each corner
 * goes to the point where the two moved sides meet. Where two sides on one line move by
 * different distances, a short step joins them. `steps[i]` moves the step at point i along the
 * line: toward side i for a positive distance, toward side i - 1 for a negative one. `from[k]`
 * is the side of `points` that side k of `outline` comes from, or -1 for a step. The polygon can
 * go in either direction.
 */
export function offsetSides(
  points: Point[],
  d: number[],
  steps: number[] = [],
): { outline: Point[]; from: number[] } {
  const n = points.length;
  if (n < 3) return { outline: points.map((p) => ({ ...p })), from: points.map((_, i) => i) };
  const sign = signedArea(points) >= 0 ? 1 : -1;
  // The outward normal and the direction of the side from i to i + 1. A side of zero length,
  // for example from a repeated point, has none: the nearest side in the direction `step` gives
  // them, so that both copies of a repeated point go to the same corner.
  const side = (i: number, step: 1 | -1): { normal: Point; dir: Point; index: number } => {
    for (let k = 0; k < n; k++) {
      const j = (((i + step * k) % n) + n) % n;
      const p = points[j];
      const q = points[(j + 1) % n];
      const length = Math.hypot(q.x - p.x, q.y - p.y);
      if (length > 1e-9) {
        const dir = { x: (q.x - p.x) / length, y: (q.y - p.y) / length };
        return { normal: { x: sign * dir.y, y: -sign * dir.x }, dir, index: j };
      }
    }
    return { normal: { x: 0, y: 0 }, dir: { x: 0, y: 0 }, index: ((i % n) + n) % n };
  };
  const outline: Point[] = [];
  const from: number[] = [];
  points.forEach((p, i) => {
    const s1 = side(i - 1, -1);
    const s2 = side(i, 1);
    const n1 = s1.normal;
    const n2 = s2.normal;
    const d1 = d[s1.index] ?? 0;
    const d2 = d[s2.index] ?? 0;
    const cos = n1.x * n2.x + n1.y * n2.y;
    if (cos < -0.99) {
      // A spike (the sides go back on themselves) has no meeting point: use the first normal.
      outline.push({ x: p.x + d1 * n1.x, y: p.y + d1 * n1.y });
    } else if (Math.abs(d1 - d2) < 1e-9) {
      const k = d1 / (1 + cos);
      outline.push({ x: p.x + k * (n1.x + n2.x), y: p.y + k * (n1.y + n2.y) });
    } else if (cos > 1 - 1e-6) {
      // Two sides on one line with different distances: a step joins them.
      const shift = steps[i] ?? 0;
      const q = { x: p.x + shift * s2.dir.x, y: p.y + shift * s2.dir.y };
      outline.push({ x: q.x + d1 * n1.x, y: q.y + d1 * n1.y });
      from.push(-1);
      outline.push({ x: q.x + d2 * n2.x, y: q.y + d2 * n2.y });
    } else {
      // The point x with x · n1 = p · n1 + d1 and x · n2 = p · n2 + d2.
      const a = (d1 - d2 * cos) / (1 - cos * cos);
      const b = (d2 - d1 * cos) / (1 - cos * cos);
      outline.push({ x: p.x + a * n1.x + b * n2.x, y: p.y + a * n1.y + b * n2.y });
    }
    from.push(i);
  });
  return { outline, from };
}
