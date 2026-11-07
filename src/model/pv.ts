// Photovoltaic fields on the faces of the roof: the layout of the panels, the peak power, and an
// estimate of the yield.
//
// The yield model is a simple estimate for Central Europe from general knowledge, not from a
// standard. A south face with a tilt of 35° gives about SPECIFIC_YIELD kWh per kWp and year. A
// factor reduces it for other tilts and directions:
//
//   tilt:      f0 = 1 − 1.06·10⁻⁴ · (tilt − 35)²     (flat ≈ 0.87, vertical ≈ 0.68)
//   direction: f  = f0 · (1 − k · ((1 − cos Δ) / 2)^1.3),  k = 0.42 · sin(tilt) / sin(35°)
//
// Δ is the difference of the azimuth from south. With a tilt of 35°, east and west give about
// 0.83, and north gives about 0.58. A flat field gives the same in each direction. Real values
// depend on the place, the shade, and the products. Use a tool with weather data for a real
// project.

import { findRoof, roofGeometries, roofGeometryOf, type Vec3 } from "./roof";
import type { Building, Id, PvArray } from "./types";

/** The yield of 1 kWp on a south face with a tilt of 35°, in kWh per year. */
export const SPECIFIC_YIELD = 1000;
/** The panels lie this far above the face of the roof. */
export const PANEL_LIFT = 0.05;
/** A face with less tilt than this counts as flat. */
const FLAT_TILT = 1;

export type Quad = [Vec3, Vec3, Vec3, Vec3];

export interface PvLayout {
  /** The corners of each panel, counterclockwise from above. */
  panels: Quad[];
  count: number;
  /** The peak power in kWp. */
  peak: number;
  /** The tilt of the face in degrees. */
  tilt: number;
  /** The direction of the face in degrees from north, clockwise. */
  azimuth: number;
  /** The area of the panels in m². */
  area: number;
  /** The estimate of the yield in kWh per year. */
  yield: number;
}

const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot3 = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const scale3 = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const add3 = (...vectors: Vec3[]): Vec3 =>
  vectors.reduce((sum, v) => ({ x: sum.x + v.x, y: sum.y + v.y, z: sum.z + v.z }), {
    x: 0,
    y: 0,
    z: 0,
  });
const cross3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const unit3 = (a: Vec3): Vec3 => scale3(a, 1 / (Math.hypot(a.x, a.y, a.z) || 1));

/**
 * The normal of a face in plan coordinates (x, y, z up). The faces of roof.ts go counterclockwise
 * seen from outside in the world (x, z, y), so the normal comes from the cross product in that
 * world and goes back to plan coordinates.
 */
function faceNormal(face: Vec3[]): Vec3 {
  // Newell's method in the world (wx, wy, wz) = (x, z, y).
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < face.length; i++) {
    const p = face[i];
    const q = face[(i + 1) % face.length];
    const [px, py, pz] = [p.x, p.z, p.y];
    const [qx, qy, qz] = [q.x, q.z, q.y];
    nx += (py - qy) * (pz + qz);
    ny += (pz - qz) * (px + qx);
    nz += (px - qx) * (py + qy);
  }
  return unit3({ x: nx, y: nz, z: ny });
}

/** The area of a flat polygon in 3D. */
function area3(face: Vec3[]): number {
  let sum: Vec3 = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < face.length; i++)
    sum = add3(sum, cross3(face[i], face[(i + 1) % face.length]));
  return Math.hypot(sum.x, sum.y, sum.z) / 2;
}

export interface FaceInfo {
  roofId: Id;
  roofName: string;
  /** The index in the faces of the geometry of the roof. */
  index: number;
  tilt: number;
  azimuth: number;
  area: number;
}

/**
 * The tilt in degrees, and the azimuth in degrees from north, clockwise. The plan y points down,
 * and north is `north` degrees clockwise from the top of the plan (−y).
 */
function orientation(normal: Vec3, north: number): { tilt: number; azimuth: number } {
  const tilt = (Math.acos(Math.min(1, Math.max(-1, normal.z))) * 180) / Math.PI;
  const plan = (Math.atan2(normal.x, -normal.y) * 180) / Math.PI;
  const azimuth = (((plan - north) % 360) + 360) % 360;
  return { tilt, azimuth: tilt < FLAT_TILT ? 180 : azimuth };
}

/** The faces of all roofs that point up, so that panels can go on them. */
export function faceInfo(building: Building): FaceInfo[] {
  const result: FaceInfo[] = [];
  for (const { roof, geometry } of roofGeometries(building)) {
    geometry.faces.forEach((face, index) => {
      if (face.polygon.length < 3) return;
      const normal = faceNormal(face.polygon);
      if (normal.z < 0.1) return;
      result.push({
        roofId: roof.id,
        roofName: roof.name,
        index,
        ...orientation(normal, building.north),
        area: area3(face.polygon),
      });
    });
  }
  return result;
}

/** The factor of the yield for a tilt and an azimuth, relative to south at 35°. */
export function yieldFactor(tilt: number, azimuth: number): number {
  const f0 = 1 - 1.06e-4 * (tilt - 35) ** 2;
  const delta = ((azimuth - 180) * Math.PI) / 180;
  const k = Math.min(
    0.85,
    (0.42 * Math.sin((tilt * Math.PI) / 180)) / Math.sin((35 * Math.PI) / 180),
  );
  const away = ((1 - Math.cos(delta)) / 2) ** 1.3;
  return Math.max(0, f0 * (1 - k * away));
}

/** The interval of s where the line t of a convex polygon in (s, t) is inside, or null. */
function span(polygon: { s: number; t: number }[], t: number): [number, number] | null {
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    if ((p.t - t) * (q.t - t) > 0) continue;
    if (Math.abs(q.t - p.t) < 1e-12) {
      low = Math.min(low, p.s, q.s);
      high = Math.max(high, p.s, q.s);
      continue;
    }
    const s = p.s + ((t - p.t) / (q.t - p.t)) * (q.s - p.s);
    low = Math.min(low, s);
    high = Math.max(high, s);
  }
  return low <= high ? [low, high] : null;
}

/** The distance from a point to the edges of a polygon in (s, t), negative outside. */
function inset(polygon: { s: number; t: number }[], p: { s: number; t: number }): number {
  let inside = false;
  let nearest = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.t > p.t !== b.t > p.t && p.s < ((b.s - a.s) * (p.t - a.t)) / (b.t - a.t) + a.s) {
      inside = !inside;
    }
    const ds = b.s - a.s;
    const dt = b.t - a.t;
    const l2 = ds * ds + dt * dt;
    const u = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.s - a.s) * ds + (p.t - a.t) * dt) / l2));
    nearest = Math.min(nearest, Math.hypot(p.s - (a.s + u * ds), p.t - (a.t + u * dt)));
  }
  return inside ? nearest : -nearest;
}

/** The layout of the panels of a field, or null if its face does not exist or points down. */
export function pvLayout(building: Building, array: PvArray): PvLayout | null {
  const roof = findRoof(building, array.roofId);
  if (!roof || roof.outline.length < 3) return null;
  const geometry = roofGeometryOf(building, roof);
  const roofFace = geometry.faces[array.face];
  const face = roofFace?.polygon;
  if (!face || face.length < 3) return null;
  const normal = faceNormal(face);
  if (normal.z < 0.1) return null;
  const { tilt, azimuth } = orientation(normal, building.north);

  // The frame of the face: s along the eave, t up the slope. A flat face uses the plan axes.
  let up: Vec3;
  if (tilt < FLAT_TILT) {
    up = { x: 0, y: -1, z: 0 };
  } else {
    up = unit3(sub3({ x: 0, y: 0, z: 1 }, scale3(normal, normal.z)));
  }
  const along = unit3(cross3(up, normal));
  const origin = face[0];
  const polygon = face.map((p) => ({
    s: dot3(sub3(p, origin), along),
    t: dot3(sub3(p, origin), up),
  }));

  // `portrait` puts the long side of the panel up the slope.
  const long = Math.max(array.panelWidth, array.panelHeight);
  const short = Math.min(array.panelWidth, array.panelHeight);
  const pw = array.portrait ? short : long;
  const ph = array.portrait ? long : short;
  const { margin, gap } = array;

  // The dormers and the windows of the side of the face take parts of the face. A panel keeps
  // the margin from them too.
  const holes = geometry.holes
    .filter((hole) => hole.side === roofFace.side && hole.polygon.length >= 3)
    .map((hole) =>
      hole.polygon.map((p) => ({
        s: dot3(sub3(p, origin), along),
        t: dot3(sub3(p, origin), up),
      })),
    );
  const clearOfHoles = (s: number, t: number) =>
    holes.every((hole) => !overlaps(hole, s, t, pw, ph, margin));

  const ts = polygon.map((p) => p.t);
  const t0 = Math.min(...ts) + margin;
  const t1 = Math.max(...ts) - margin;
  const rows = Math.floor((t1 - t0 + gap) / (ph + gap));
  const panels2d: { s: number; t: number }[] = [];
  if (rows > 0) {
    // The rows are centered between the bottom and the top of the usable area.
    const start = t0 + (t1 - t0 - (rows * (ph + gap) - gap)) / 2;
    for (let r = 0; r < rows; r++) {
      const bottom = start + r * (ph + gap);
      const a = span(polygon, bottom);
      const b = span(polygon, bottom + ph);
      if (!a || !b) continue;
      const s0 = Math.max(a[0], b[0]) + margin;
      const s1 = Math.min(a[1], b[1]) - margin;
      const columns = Math.floor((s1 - s0 + gap) / (pw + gap));
      if (columns <= 0) continue;
      const left = s0 + (s1 - s0 - (columns * (pw + gap) - gap)) / 2;
      for (let c = 0; c < columns; c++) {
        const s = left + c * (pw + gap);
        // A sloped edge of the face can cut the corner of a panel, so each corner keeps the margin.
        const corners = [
          { s, t: bottom },
          { s: s + pw, t: bottom },
          { s: s + pw, t: bottom + ph },
          { s, t: bottom + ph },
        ];
        if (corners.every((p) => inset(polygon, p) >= margin - 1e-6) && clearOfHoles(s, bottom))
          panels2d.push({ s, t: bottom });
      }
    }
  }
  const chosen = array.limit == null ? panels2d : panels2d.slice(0, Math.max(0, array.limit));

  const lift = scale3(normal, PANEL_LIFT);
  const at = (s: number, t: number) => add3(origin, scale3(along, s), scale3(up, t), lift);
  const panels: Quad[] = chosen.map(({ s, t }) => {
    const quad: Quad = [at(s, t), at(s + pw, t), at(s + pw, t + ph), at(s, t + ph)];
    return counterclockwise(quad);
  });

  const count = panels.length;
  const peak = (count * array.panelPower) / 1000;
  return {
    panels,
    count,
    peak,
    tilt,
    azimuth,
    area: count * pw * ph,
    yield: peak * SPECIFIC_YIELD * yieldFactor(tilt, azimuth),
  };
}

/**
 * True if the panel from (s, t) with the size pw × ph comes nearer than `margin` to the hole.
 * The test checks points on the edges and in the middle of the panel against the hole, and the
 * corners of the hole against the panel with the margin.
 */
function overlaps(
  hole: { s: number; t: number }[],
  s: number,
  t: number,
  pw: number,
  ph: number,
  margin: number,
): boolean {
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const p = { s: s + (pw * i) / steps, t: t + (ph * j) / steps };
      if (inset(hole, p) > -margin) return true;
    }
  }
  return hole.some(
    (p) => p.s > s - margin && p.s < s + pw + margin && p.t > t - margin && p.t < t + ph + margin,
  );
}

/**
 * Puts the corners counterclockwise seen from above in the world (x, z, y) of roof.ts, so that
 * the normal of the panel points up, like the normals of the roof faces.
 */
function counterclockwise(quad: Quad): Quad {
  return faceNormal(quad).z >= 0 ? quad : [quad[0], quad[3], quad[2], quad[1]];
}

/** All panels of the building, for the 3D view. */
export function pvPanels(building: Building): { array: Id; corners: Quad }[] {
  const result: { array: Id; corners: Quad }[] = [];
  for (const array of building.pv) {
    for (const corners of pvLayout(building, array)?.panels ?? []) {
      result.push({ array: array.id, corners });
    }
  }
  return result;
}

/** The number of panels, the peak power in kWp, and the yield in kWh per year of all fields. */
export function pvSummary(building: Building): { count: number; peak: number; yield: number } {
  let count = 0;
  let peak = 0;
  let total = 0;
  for (const array of building.pv) {
    const layout = pvLayout(building, array);
    if (!layout) continue;
    count += layout.count;
    peak += layout.peak;
    total += layout.yield;
  }
  return { count, peak, yield: total };
}
