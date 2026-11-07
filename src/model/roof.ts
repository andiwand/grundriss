// The bridge from the building to the roof engine (src/model/roofshape.ts). A building has a
// list of roofs. Each roof is on a story and has its own outline and sides. The functions here
// give the engine its input from the building, and they keep the results in a cache.
//
// The points use the plan coordinates x and y, and z is the height above the ground. The 3D
// view maps (x, y, z) to the world (x, z, y).

import { findStory, storyAbove, wallTop } from "./building";
import { signedArea } from "./geometry";
import { newId } from "./plan";
import { planOutline, pointInPolygon } from "./rooms";
import {
  presetSides,
  roofGeometry,
  type RoofGeometry,
  type RoofInput,
  type Vec3,
} from "./roofshape";
import type { Building, Id, Point, Roof, RoofKind, Story } from "./types";

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
 * base of the roof if it has one. The outline of the roof is on the center lines of the walls, but a real roof sits on the outer
 * face of the walls. So the engine gets the outline moved out by half the thickness of the
 * thickest wall of the story. Else the outer half of each wall comes up through the roof.
 */
export function roofInput(building: Building, roof: Roof): RoofInput {
  const story = findStory(building, roof.storyId);
  const base = roof.base ?? (story ? roofBase(building, story) : 0);
  const thickness = story ? Math.max(0, ...story.walls.map((w) => w.thickness)) : 0;
  const outline = offsetOutline(roof.outline, thickness / 2);
  // The offset of a dormer or a window counts from the start of its side on the center lines.
  // The moved side starts at another point, so the offset changes by the distance between them.
  const n = roof.outline.length;
  const shift = <T extends { side: number; offset: number }>(item: T): T => {
    const a = roof.outline[item.side];
    const b = roof.outline[(item.side + 1) % n];
    const length = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
    if (length === 0) return item;
    const moved = outline[item.side];
    const delta = ((a.x - moved.x) * (b.x - a.x) + (a.y - moved.y) * (b.y - a.y)) / length;
    return { ...item, offset: item.offset + delta };
  };
  return {
    outline,
    sides: roof.sides,
    base,
    flat: roof.flat,
    dormers: roof.dormers.map(shift),
    windows: roof.windows.map(shift),
  };
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
  const n = points.length;
  if (n < 3 || d === 0) return points.map((p) => ({ ...p }));
  const sign = signedArea(points) >= 0 ? 1 : -1;
  // The outward normal of the side from i to i + 1. A side of zero length, for example from a
  // repeated point, has no normal: the nearest side in the direction `step` gives it, so that
  // both copies of a repeated point go to the same corner.
  const normal = (i: number, step: 1 | -1): Point => {
    for (let k = 0; k < n; k++) {
      const j = (((i + step * k) % n) + n) % n;
      const p = points[j];
      const q = points[(j + 1) % n];
      const length = Math.hypot(q.x - p.x, q.y - p.y);
      if (length > 1e-9)
        return { x: (sign * (q.y - p.y)) / length, y: (sign * -(q.x - p.x)) / length };
    }
    return { x: 0, y: 0 };
  };
  return points.map((p, i) => {
    const n1 = normal(i - 1, -1);
    const n2 = normal(i, 1);
    const cos = n1.x * n2.x + n1.y * n2.y;
    // A spike (the sides go back on themselves) has no meeting point: use the first normal.
    if (cos < -0.99) return { x: p.x + d * n1.x, y: p.y + d * n1.y };
    const k = d / (1 + cos);
    return { x: p.x + k * (n1.x + n2.x), y: p.y + k * (n1.y + n2.y) };
  });
}
