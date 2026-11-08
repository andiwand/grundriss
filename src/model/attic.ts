// The rooms under a roof, for example in an attic: the ceiling of a room, the area of the roof
// over it, its volume, the walls up to the roof, and the living area by the German WoFlV.
//
// The ceiling of a room is the roof where the roof is lower than the height of the room. Where
// no roof is over the room, the ceiling is flat at the height of the room. A room of a story
// inside a pitched roof (`roofIsCeiling`) has no flat ceiling: it goes up to the roof, unless
// the user gives the room its own height.
//
// The surface of a roof is a set of plane parts with signs (`roofPatches`). The functions here
// clip the room by each part, and then by the half-planes where the height of the part is above
// or below a limit. The height is linear on each part, so the integrals are exact.

import { defaultWallHeight, wallTop } from "./building";
import { clipHalfPlane, distance, intersectPolygons, moments, signedArea } from "./geometry";
import { clearHeight, coveringRoofs, planeOf, roofPatches, type RoofPlane } from "./roof";
import { findRooms, netRoomArea, pointInPolygon, type Room } from "./rooms";
import type { Vec3 } from "./roofshape";
import type { Building, Point, Story } from "./types";

/** A story on its own pitched roof with walls lower than this is an attic with knee walls. */
export const LOW_WALLS = 2;
/** WoFlV: the floor area with at least `full` meters of clear height counts fully. */
export const WOFLV = { full: 2, half: 1 } as const;

/**
 * True if the rooms of the story go up to a pitched roof: the story is inside the roof of a
 * story below (for example an attic on the floor of the roof), or it has its own pitched roof
 * on low walls (knee walls). A full story under its own roof has a flat ceiling.
 */
export function roofIsCeiling(building: Building, story: Story): boolean {
  return coveringRoofs(building, story).some(
    ({ roof }) =>
      !roof.flat && (roof.storyId !== story.id || wallTop(story) - story.elevation < LOW_WALLS),
  );
}

/** A part of the room under one part of a roof. The plane gives the height above the floor. */
interface Piece {
  polygon: Point[];
  plane: RoofPlane;
  sign: 1 | -1;
}

export interface RoomCeiling {
  /** The height of the ceiling where no roof is over the room. */
  flat: number;
  /** The highest ceiling: the height of the room, or Infinity if the room goes up to the roof. */
  cap: number;
  /** The floor area of the room. */
  area: number;
  /** The height of the ceiling above the floor at a point of the plan. */
  at: (p: Point) => number;
  pieces: Piece[];
}

/** The ceiling of a room: the roof where the roof is lower than the height of the room. */
export function roomCeiling(building: Building, story: Story, room: Room): RoomCeiling {
  const height = room.info?.height ?? defaultWallHeight(story);
  const cap = room.info?.height == null && roofIsCeiling(building, story) ? Infinity : height;
  const flat = Math.min(height, cap);
  const polygon = signedArea(room.polygon) >= 0 ? room.polygon : [...room.polygon].reverse();
  const pieces: Piece[] = [];
  for (const { geometry } of coveringRoofs(building, story)) {
    for (const patch of roofPatches(geometry)) {
      const plane = { ...patch.plane, c: patch.plane.c - story.elevation };
      for (const part of intersectPolygons(polygon, patch.plan)) {
        pieces.push({ polygon: part, plane, sign: patch.sign });
      }
    }
  }
  const clear = clearHeight(building, story);
  return {
    flat,
    cap,
    area: Math.abs(signedArea(room.polygon)),
    at: (p) => Math.max(0, Math.min(cap, clear(p) ?? flat)),
    pieces,
  };
}

/** The area and the integral of the height of the part of a piece where lo ≤ h ≤ hi. */
function band(piece: Piece, lo: number, hi: number): { area: number; volume: number } {
  const { c, gx, gy } = piece.plane;
  let polygon = piece.polygon;
  if (lo > -Infinity) polygon = clipHalfPlane(polygon, gx, gy, c - lo);
  if (hi < Infinity && polygon.length > 0) polygon = clipHalfPlane(polygon, -gx, -gy, hi - c);
  if (polygon.length === 0) return { area: 0, volume: 0 };
  const m = moments(polygon);
  return { area: m.area, volume: c * m.area + gx * m.x + gy * m.y };
}

/** The volume under the ceiling of the room, in m³. */
export function ceilingVolume(ceiling: RoomCeiling): number {
  const { flat, cap } = ceiling;
  let volume = flat * ceiling.area;
  for (const piece of ceiling.pieces) {
    const low = band(piece, 0, cap);
    const high = cap < Infinity ? band(piece, cap, Infinity).area * cap : 0;
    const all = band(piece, -Infinity, Infinity).area;
    volume += piece.sign * (low.volume + high - flat * all);
  }
  return Math.max(0, volume);
}

/**
 * The area of the ceiling of the room, in m²: the sloped area of the roof where the roof is the
 * ceiling, and the floor area where the ceiling is flat.
 */
export function ceilingArea(ceiling: RoomCeiling): number {
  let area = ceiling.area;
  for (const piece of ceiling.pieces) {
    area += piece.sign * band(piece, -Infinity, ceiling.cap).area * (piece.plane.slope - 1);
  }
  return area;
}

/** The floor area of the room where the clear height is at least `level`, in m². */
export function areaWithHeight(ceiling: RoomCeiling, level: number): number {
  const flatCounts = ceiling.flat >= level ? 1 : 0;
  let area = flatCounts * ceiling.area;
  for (const piece of ceiling.pieces) {
    const high = ceiling.cap >= level ? band(piece, level, Infinity).area : 0;
    area += piece.sign * (high - flatCounts * band(piece, -Infinity, Infinity).area);
  }
  return Math.min(ceiling.area, Math.max(0, area));
}

export interface LivingArea {
  /** The floor area in m². */
  floor: number;
  /** The living area by the WoFlV in m². */
  living: number;
  /** The floor areas with a clear height of at least 2 m, and from 1 m to 2 m. */
  full: number;
  half: number;
}

/**
 * The living area of a room by the German WoFlV: the floor area with a clear height of at least
 * 2 m counts fully, from 1 m to 2 m it counts half, and below 1 m it does not count. The other
 * rules of the WoFlV, for example for stairs and balconies, do not apply here.
 */
export function livingArea(building: Building, story: Story, room: Room): LivingArea {
  const ceiling = roomCeiling(building, story, room);
  const full = areaWithHeight(ceiling, WOFLV.full);
  const one = areaWithHeight(ceiling, WOFLV.half);
  // The WoFlV measures inside the walls. The ceiling is on the center lines of the walls, so all
  // areas take the part of the net area.
  const net = room.area > 0 ? netRoomArea(story, room) / room.area : 1;
  return {
    floor: ceiling.area * net,
    living: (full + 0.5 * (one - full)) * net,
    full: full * net,
    half: (one - full) * net,
  };
}

/** The step between two samples along a wall, in meters. */
const WALL_STEP = 0.02;

/**
 * The area of a vertical strip under the ceiling along the line from a to b, from `from` to `to`
 * meters from a. The strip starts at `sill` above the floor and has the height `height` at most.
 * The function samples the ceiling every 2 cm, so the error stays far below 1 %.
 */
export function stripArea(
  ceiling: RoomCeiling,
  a: Point,
  b: Point,
  from: number,
  to: number,
  sill = 0,
  height = Infinity,
): number {
  const length = distance(a, b);
  if (length < 1e-9 || to <= from) return 0;
  const steps = Math.max(1, Math.ceil((to - from) / WALL_STEP));
  const top = (s: number) => {
    const t = s / length;
    const h = ceiling.at({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    return Math.max(0, Math.min(height, h - sill));
  };
  let sum = 0;
  let previous = top(from);
  for (let i = 1; i <= steps; i++) {
    const next = top(from + ((to - from) * i) / steps);
    sum += (previous + next) / 2;
    previous = next;
  }
  return (sum * (to - from)) / steps;
}

/** The area of a flat polygon in 3D, in m². */
export function area3(polygon: Vec3[]): number {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    x += p.y * q.z - p.z * q.y;
    y += p.z * q.x - p.x * q.z;
    z += p.x * q.y - p.y * q.x;
  }
  return Math.hypot(x, y, z) / 2;
}

/**
 * A window in the roof over a room: a window in the front wall of a dormer, or a roof window in a
 * face. `normal` is its unit normal to the outside, in plan coordinates (x, y, z up).
 */
export interface RoofGlass {
  area: number;
  normal: Vec3;
}

/** The unit normal of a flat polygon in plan coordinates, by Newell's method. */
function planNormal(polygon: Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    x += (a.y - b.y) * (a.z + b.z);
    y += (a.z - b.z) * (a.x + b.x);
    z += (a.x - b.x) * (a.y + b.y);
  }
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

/** The middle of a polygon on the plan. */
const middleOf = (polygon: Vec3[]): Point => {
  const n = polygon.length || 1;
  return polygon.reduce((s, p) => ({ x: s.x + p.x / n, y: s.y + p.y / n }), { x: 0, y: 0 });
};

/**
 * The windows in the roof over the room: the windows of its dormers and its roof windows. The
 * normal of each points to the outside. A roof window points up, and a dormer window points away
 * from the dormer.
 */
export function roofGlass(building: Building, story: Story, room: Room): RoofGlass[] {
  const result: RoofGlass[] = [];
  for (const { geometry } of coveringRoofs(building, story)) {
    for (const dormer of geometry.dormers) {
      if (dormer.window.length < 3 || dormer.hole.length === 0) continue;
      if (!pointInPolygon(middleOf(dormer.hole), room.polygon)) continue;
      let normal = planNormal(dormer.window);
      // The window faces away from the middle of the dormer.
      const window = middleOf(dormer.window);
      const hole = middleOf(dormer.hole);
      if (normal.x * (window.x - hole.x) + normal.y * (window.y - hole.y) < 0) {
        normal = { x: -normal.x, y: -normal.y, z: -normal.z };
      }
      result.push({ area: area3(dormer.window), normal });
    }
    for (const window of geometry.windows) {
      if (window.quad.length < 3 || !pointInPolygon(middleOf(window.quad), room.polygon)) continue;
      let normal = planNormal(window.quad);
      if (normal.z < 0) normal = { x: -normal.x, y: -normal.y, z: -normal.z };
      result.push({ area: area3(window.quad), normal });
    }
  }
  return result;
}

/**
 * The walls and the windows of the dormers over the room, in m². A dormer is over the room if
 * the middle of its hole is inside the room.
 */
export function dormerAreas(
  building: Building,
  story: Story,
  room: Room,
): { walls: number; windows: number } {
  let walls = 0;
  let windows = 0;
  for (const { geometry } of coveringRoofs(building, story)) {
    for (const dormer of geometry.dormers) {
      if (dormer.hole.length === 0 || !pointInPolygon(middleOf(dormer.hole), room.polygon))
        continue;
      const window = dormer.window.length >= 3 ? area3(dormer.window) : 0;
      walls += Math.max(0, dormer.walls.reduce((s, w) => s + area3(w), 0) - window);
      windows += window;
    }
  }
  return { walls, windows };
}

// ----- The lines of equal clear height -----

type Interval = [number, number];

/** The intervals of the line p0 + t·dir inside the polygon. The polygon can be non-convex. */
function lineIntervals(p0: Point, dir: Point, polygon: Point[]): Interval[] {
  const ts: number[] = [];
  const side = (p: Point) => dir.x * (p.y - p0.y) - dir.y * (p.x - p0.x);
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const sa = side(a);
    const sb = side(b);
    if (sa > 0 === sb > 0) continue;
    const k = sa / (sa - sb);
    const p = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    ts.push((p.x - p0.x) * dir.x + (p.y - p0.y) * dir.y);
  }
  ts.sort((p, q) => p - q);
  const out: Interval[] = [];
  for (let i = 0; i + 1 < ts.length; i += 2) out.push([ts[i], ts[i + 1]]);
  return out;
}

function intersect(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const [a0, a1] of a) {
    for (const [b0, b1] of b) {
      const lo = Math.max(a0, b0);
      const hi = Math.min(a1, b1);
      if (hi > lo) out.push([lo, hi]);
    }
  }
  return out;
}

function subtract(a: Interval[], b: Interval[]): Interval[] {
  let out = a;
  for (const [b0, b1] of b) {
    out = out.flatMap(([a0, a1]): Interval[] => {
      if (b1 <= a0 || b0 >= a1) return [[a0, a1]];
      const parts: Interval[] = [];
      if (b0 > a0) parts.push([a0, b0]);
      if (b1 < a1) parts.push([b1, a1]);
      return parts;
    });
  }
  return out;
}

/** The segments of the line where the plane has the height `level`, or null for a flat plane. */
function levelLine(plane: RoofPlane, level: number): { p0: Point; dir: Point } | null {
  const g2 = plane.gx * plane.gx + plane.gy * plane.gy;
  if (g2 < 1e-12) return null;
  const k = (level - plane.c) / g2;
  const g = Math.sqrt(g2);
  return { p0: { x: plane.gx * k, y: plane.gy * k }, dir: { x: -plane.gy / g, y: plane.gx / g } };
}

/**
 * The lines in the rooms of the story where the clear height under the roof is `level`, for
 * example 1 m and 2 m for the WoFlV. A room with its own height lower than `level` has none.
 */
export function clearHeightLines(
  building: Building,
  story: Story,
  level: number,
): [Point, Point][] {
  const roofs = coveringRoofs(building, story);
  if (roofs.length === 0) return [];
  const segments: [Point, Point][] = [];
  const shift = (polygon: Vec3[]) => {
    const plan = polygon.map((p) => ({ x: p.x, y: p.y }));
    return { plan, plane: planeAbove(polygon, story.elevation) };
  };
  const parts = roofs.map(({ geometry }) => ({
    faces: geometry.faces.map((f) => shift(f.polygon)),
    dormers: geometry.dormers.flatMap((d) => d.faces).map(shift),
  }));
  for (const room of findRooms(story)) {
    const ceiling = roomCeiling(building, story, room);
    if (ceiling.cap <= level) continue;
    const add = (
      part: { plan: Point[]; plane: RoofPlane | null },
      cut: { plan: Point[] }[],
    ): void => {
      const line = part.plane && levelLine(part.plane, level);
      if (!line) return;
      const { p0, dir } = line;
      let inside = intersect(
        lineIntervals(p0, dir, part.plan),
        lineIntervals(p0, dir, room.polygon),
      );
      for (const c of cut) inside = subtract(inside, lineIntervals(p0, dir, c.plan));
      for (const [t0, t1] of inside) {
        if (t1 - t0 < 1e-6) continue;
        segments.push([
          { x: p0.x + dir.x * t0, y: p0.y + dir.y * t0 },
          { x: p0.x + dir.x * t1, y: p0.y + dir.y * t1 },
        ]);
      }
    };
    for (const { faces, dormers } of parts) {
      for (const face of faces) add(face, dormers);
      for (const face of dormers) add(face, []);
    }
  }
  return segments;
}

/** The plane of a polygon, with the height above the floor at `elevation`. */
function planeAbove(polygon: Vec3[], elevation: number): RoofPlane | null {
  const plane = planeOf(polygon);
  return plane && { ...plane, c: plane.c - elevation };
}
