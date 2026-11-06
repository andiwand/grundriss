// The surfaces of the roof, for the 3D view and the 2D editor. The roof covers the box of
// `roofFrame`. The functions are pure, so the tests run in Node.
//
// The points use the plan coordinates x and y, and z is the height above the ground. The 3D
// view maps (x, y, z) to the world (x, z, y). Each polygon goes counterclockwise when you look
// at it from outside the roof in that world, so its normal points out.

import { FLAT_ROOF, roofFrame, type RoofFrame } from "./building";
import type { Building, Point } from "./types";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface RoofSurfaces {
  /** The surfaces of the roof itself. */
  faces: Vec3[][];
  /** The walls under the roof that close the attic: the gable triangles and the shed walls. */
  gables: Vec3[][];
}

/**
 * The roof works in local coordinates: u goes along the ridge, v goes across it. For a ridge
 * along the plan x axis, u is x and v is y. For a ridge along the y axis, u is y and v is x.
 */
interface Local {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  base: number;
  top: number;
  /** The overhang: the distance from the edge of the roof to the wall line. */
  overhang: number;
  point: (u: number, v: number, z: number) => Vec3;
}

function local(frame: RoofFrame, ridge: "x" | "y", overhang: number): Local {
  const alongX = ridge === "x";
  return {
    u0: alongX ? frame.minX : frame.minY,
    u1: alongX ? frame.maxX : frame.maxY,
    v0: alongX ? frame.minY : frame.minX,
    v1: alongX ? frame.maxY : frame.maxX,
    base: frame.base,
    top: frame.top,
    overhang,
    point: alongX ? (u, v, z) => ({ x: u, y: v, z }) : (u, v, z) => ({ x: v, y: u, z }),
  };
}

/** The point in the 3D world (x, height, y), where the cross product is right-handed. */
const world = (p: Vec3) => ({ x: p.x, y: p.z, z: p.y });

/** Removes a point that is equal to the point before it, for example at the top of a hip. */
function dedupe(polygon: Vec3[]): Vec3[] {
  return polygon.filter((p, i) => {
    const q = polygon[(i + polygon.length - 1) % polygon.length];
    return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) > 1e-9;
  });
}

/**
 * Turns the polygon so that its normal in the world points away from `center`. The polygon must
 * be flat and convex.
 */
function orient(polygon: Vec3[], center: Vec3): Vec3[] {
  const points = dedupe(polygon);
  if (points.length < 3) return points;
  const [a, b, c] = points.map(world);
  const e1 = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const e2 = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  const normal = {
    x: e1.y * e2.z - e1.z * e2.y,
    y: e1.z * e2.x - e1.x * e2.z,
    z: e1.x * e2.y - e1.y * e2.x,
  };
  const n = points.length;
  const mid = world({
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
    z: points.reduce((s, p) => s + p.z, 0) / n,
  });
  const out = world(center);
  const dot = normal.x * (mid.x - out.x) + normal.y * (mid.y - out.y) + normal.z * (mid.z - out.z);
  return dot < 0 ? points.reverse() : points;
}

export function roofSurfaces(building: Building): RoofSurfaces | null {
  const roof = building.roof;
  const frame = roofFrame(building);
  if (!roof || !frame) return null;
  const l = local(frame, roof.ridge, roof.overhang);
  const { u0, u1, v0, v1, base, top, point } = l;
  const vm = (v0 + v1) / 2;
  const um = (u0 + u1) / 2;
  const center = point(um, vm, (base + top) / 2);
  const faces: Vec3[][] = [];
  const gables: Vec3[][] = [];
  // The wall lines are inside the edge of the roof by the overhang. A very large overhang must
  // not put the wall lines past each other.
  const inset = Math.min(roof.overhang, (u1 - u0) / 2 - 1e-3, (v1 - v0) / 2 - 1e-3);
  const w0 = u0 + Math.max(0, inset);
  const w1 = u1 - Math.max(0, inset);
  const x0 = v0 + Math.max(0, inset);
  const x1 = v1 - Math.max(0, inset);

  switch (roof.kind) {
    case "flat": {
      const z0 = base;
      const z1 = base + FLAT_ROOF;
      const corners = [
        [u0, v0],
        [u1, v0],
        [u1, v1],
        [u0, v1],
      ];
      faces.push(corners.map(([u, v]) => point(u, v, z1)));
      faces.push(corners.map(([u, v]) => point(u, v, z0)));
      for (let i = 0; i < 4; i++) {
        const [ua, va] = corners[i];
        const [ub, vb] = corners[(i + 1) % 4];
        faces.push([point(ua, va, z0), point(ub, vb, z0), point(ub, vb, z1), point(ua, va, z1)]);
      }
      break;
    }
    case "shed": {
      // The roof is high at v0 and low at v1.
      const height = (v: number) => base + ((top - base) * (v1 - v)) / (v1 - v0);
      faces.push([
        point(u0, v1, base),
        point(u1, v1, base),
        point(u1, v0, top),
        point(u0, v0, top),
      ]);
      for (const u of [w0, w1]) {
        gables.push([
          point(u, x1, base),
          point(u, x0, base),
          point(u, x0, height(x0)),
          point(u, x1, height(x1)),
        ]);
      }
      // The high wall under the high eave, and the low wall under the low eave.
      for (const v of [x0, x1]) {
        if (height(v) - base < 1e-6) continue;
        gables.push([
          point(w0, v, base),
          point(w1, v, base),
          point(w1, v, height(v)),
          point(w0, v, height(v)),
        ]);
      }
      break;
    }
    case "gable": {
      faces.push([
        point(u0, v0, base),
        point(u1, v0, base),
        point(u1, vm, top),
        point(u0, vm, top),
      ]);
      faces.push([
        point(u1, v1, base),
        point(u0, v1, base),
        point(u0, vm, top),
        point(u1, vm, top),
      ]);
      // The height of the roof at the distance v across the ridge.
      const height = (v: number) => top - ((top - base) * Math.abs(v - vm)) / ((v1 - v0) / 2);
      for (const u of [w0, w1]) {
        gables.push([
          point(u, x0, base),
          point(u, x1, base),
          point(u, x1, height(x1)),
          point(u, vm, top),
          point(u, x0, height(x0)),
        ]);
      }
      break;
    }
    case "hip": {
      // The hips go up at the same slope as the long faces, so the ridge is shorter than the
      // roof by half the span at each end. A roof shorter than its span becomes a pyramid.
      const half = (v1 - v0) / 2;
      const r0 = Math.min(u0 + half, um);
      const r1 = Math.max(u1 - half, um);
      faces.push([
        point(u0, v0, base),
        point(u1, v0, base),
        point(r1, vm, top),
        point(r0, vm, top),
      ]);
      faces.push([
        point(u1, v1, base),
        point(u0, v1, base),
        point(r0, vm, top),
        point(r1, vm, top),
      ]);
      faces.push([point(u0, v1, base), point(u0, v0, base), point(r0, vm, top)]);
      faces.push([point(u1, v0, base), point(u1, v1, base), point(r1, vm, top)]);
      break;
    }
  }

  return {
    faces: faces.map((f) => orient(f, center)),
    gables: gables.map((g) => orient(g, center)),
  };
}

/** The lines of the roof seen from above: the edge of the roof, the ridge, and the hips. */
export function roofLines(building: Building): [Point, Point][] {
  const roof = building.roof;
  const frame = roofFrame(building);
  if (!roof || !frame) return [];
  const { u0, u1, v0, v1, point } = local(frame, roof.ridge, roof.overhang);
  const p = (u: number, v: number): Point => {
    const q = point(u, v, 0);
    return { x: q.x, y: q.y };
  };
  const lines: [Point, Point][] = [
    [p(u0, v0), p(u1, v0)],
    [p(u1, v0), p(u1, v1)],
    [p(u1, v1), p(u0, v1)],
    [p(u0, v1), p(u0, v0)],
  ];
  const vm = (v0 + v1) / 2;
  const um = (u0 + u1) / 2;
  if (roof.kind === "gable") lines.push([p(u0, vm), p(u1, vm)]);
  if (roof.kind === "hip") {
    const half = (v1 - v0) / 2;
    const r0 = Math.min(u0 + half, um);
    const r1 = Math.max(u1 - half, um);
    if (r1 - r0 > 1e-9) lines.push([p(r0, vm), p(r1, vm)]);
    lines.push([p(u0, v0), p(r0, vm)], [p(u0, v1), p(r0, vm)]);
    lines.push([p(u1, v0), p(r1, vm)], [p(u1, v1), p(r1, vm)]);
  }
  return lines;
}
