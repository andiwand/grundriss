// The roof engine: the faces of a roof on any outline, with settings for each side, dormers,
// and roof windows. The engine does not know the building. It takes an outline and gives
// polygons. The functions are pure, so the tests run in Node.
//
// Coordinates: x and y are plan coordinates (y points down), and z is the height above the
// ground. The 3D view maps (x, y, z) to the world (x, z, y). A roof face goes counterclockwise
// when you look at it from above in that world, so its normal points up. A gable wall goes
// counterclockwise when you look at it from outside, so its normal points out.
//
// The algorithm is a weighted straight skeleton, computed by a simulation of the wavefront in
// height. Each eave side is a plane through its side of the outline at the height `base`. The
// plane rises inward with the tangent of the pitch, so at the height z the side is at the
// distance (z - base) / tan(pitch) inward. A gable side does not move: its wall is vertical,
// and the faces of the other sides end on it. A half-hip side is a gable side up to its gable
// height. There, it starts to move like an eave side, so a small hip face closes the top of the
// gable. The simulation shrinks the outline in height and stops at events:
//
// - An edge event: a side of the wavefront shrinks to zero length. Its two vertices merge.
// - A split event: a reflex vertex hits a side that is not next to it. The wavefront splits in
//   two parts.
// - A start event: a half-hip side starts to move. The vertices on it change their direction.
//
// Each vertex moves on a straight line between two events. Its path separates the faces of its
// two sides. At the end, the face of each side is the loop of its side of the outline and the
// paths that touch it. A plan has at most about 30 sides, so the engine finds the next event by
// trying all pairs.
//
// The overhang: after the skeleton, each face plane goes on outward to the eave line, which is
// the side of the outline moved outward by its overhang. At a gable side, the faces of the
// neighbors go on past the gable wall by the overhang of the gable side (the verge). With equal
// pitches and overhangs, the corners are exact. With different values, the two faces at a corner
// end at different heights, and a small step stays between them. At a half-hip side, the hip
// lines go on outward and down until the hip face reaches its overhang, so the hip face and the
// faces of its neighbors meet without a gap.

import { signedArea } from "./geometry";
import type { Dormer, Id, Point, RoofSide, RoofWindow } from "./types";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface RoofInput {
  /** The polygon of the roof on the plan, where the eaves are at `base`, without the overhang. */
  outline: Point[];
  /** One for each side i, from outline[i] to outline[i + 1]. */
  sides: RoofSide[];
  /** The height of the eaves at the outline. */
  base: number;
  /** A flat roof: a slab of FLAT_THICKNESS with the overhangs. */
  flat: boolean;
  dormers: Dormer[];
  windows: RoofWindow[];
}

export interface RoofFace {
  /** The side of the outline that the face belongs to. -1 for the top of a flat roof. */
  side: number;
  polygon: Vec3[];
  /** The slope in degrees. */
  pitch: number;
  /** The unit normal in plan coordinates (x, y, z), pointing up and out of the roof. */
  normal: Vec3;
}

export interface RoofGeometry {
  /** The faces of the eave sides. A face can have more than one part on an outline with a notch. */
  faces: RoofFace[];
  /** The vertical walls on gable sides, from the eaves up to the roof. Also the sides of a slab. */
  gables: Vec3[][];
  /** The ridges, hips, valleys, verges, and eave lines. */
  edges: [Vec3, Vec3][];
  /** The outline of the roof with the overhangs, on the plan. */
  eaves: Point[];
  /**
   * The dormers. `hole` is the part of the main face under the dormer, on the plane of that
   * face. On the plan, the faces of the dormer cover the hole.
   */
  dormers: { id: Id; faces: Vec3[][]; walls: Vec3[][]; window: Vec3[]; hole: Vec3[] }[];
  windows: { id: Id; quad: Vec3[] }[];
  /** The parts of the faces that dormers and windows take, for example for PV. */
  holes: { side: number; polygon: Vec3[] }[];
  /**
   * The ids of the dormers and windows that do not fit on the faces of their side, for example
   * because they go past the ridge. The geometry leaves them out.
   */
  misfits: Id[];
  /** The height of the highest point of the roof. */
  top: number;
}

export const FLAT_THICKNESS = 0.3;
/** The pitch of an eave side stays in this range, so that the speed of its side stays finite. */
const MIN_PITCH = 1;
const MAX_PITCH = 85;
const EPS = 1e-9;
/** Points closer than this (in meters) are the same point. */
const SAME = 1e-6;
/** A roof window lies this much above its face. */
export const WINDOW_LIFT = 0.02;

// ----- Small vector functions -----

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Point, s: number): Point => ({ x: a.x * s, y: a.y * s });
const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;
const len = (a: Point): number => Math.hypot(a.x, a.y);
const unit = (a: Point): Point => {
  const l = len(a);
  return l < EPS ? { x: 0, y: 0 } : mul(a, 1 / l);
};
const v3 = (p: Point, z: number): Vec3 => ({ x: p.x, y: p.y, z });
const flat2 = (p: Vec3): Point => ({ x: p.x, y: p.y });
const dist3 = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** The normal of a polygon in the 3D world (x, z, y), by Newell's method. */
function worldNormal(polygon: Vec3[]): { x: number; y: number; z: number } {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < polygon.length; i++) {
    // World coordinates: (x, height, plan y).
    const a = { x: polygon[i].x, y: polygon[i].z, z: polygon[i].y };
    const q = polygon[(i + 1) % polygon.length];
    const b = { x: q.x, y: q.z, z: q.y };
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  return { x: nx, y: ny, z: nz };
}

/** Removes repeated points and points on a straight line between their neighbors. */
function clean(polygon: Vec3[]): Vec3[] {
  let points = polygon.filter(
    (p, i) => dist3(p, polygon[(i + polygon.length - 1) % polygon.length]) > SAME,
  );
  let changed = true;
  while (changed && points.length > 3) {
    changed = false;
    for (let i = 0; i < points.length; i++) {
      const a = points[(i + points.length - 1) % points.length];
      const b = points[i];
      const c = points[(i + 1) % points.length];
      const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
      const bc = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
      const cx = ab.y * bc.z - ab.z * bc.y;
      const cy = ab.z * bc.x - ab.x * bc.z;
      const cz = ab.x * bc.y - ab.y * bc.x;
      const scale = Math.hypot(ab.x, ab.y, ab.z) * Math.hypot(bc.x, bc.y, bc.z);
      if (Math.hypot(cx, cy, cz) <= 1e-9 * Math.max(scale, EPS)) {
        points = points.filter((_, j) => j !== i);
        changed = true;
        break;
      }
    }
  }
  return points;
}

/** Turns the polygon so that its world normal has a positive dot product with `want`. */
function orientTo(polygon: Vec3[], want: { x: number; y: number; z: number }): Vec3[] {
  const n = worldNormal(polygon);
  return n.x * want.x + n.y * want.y + n.z * want.z < 0 ? [...polygon].reverse() : polygon;
}

/** Turns a flat convex polygon so that its world normal points away from the point `center`. */
function orientAway(polygon: Vec3[], center: Vec3): Vec3[] {
  const mean = polygon.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y, z: s.z + p.z }), {
    x: 0,
    y: 0,
    z: 0,
  });
  const m = { x: mean.x / polygon.length, y: mean.y / polygon.length, z: mean.z / polygon.length };
  // The direction from the center to the polygon, in world coordinates.
  return orientTo(polygon, { x: m.x - center.x, y: m.z - center.z, z: m.y - center.y });
}

// ----- The sides -----

interface Line {
  /** The unit direction of the side, and the unit normal that points into the roof. */
  dir: Point;
  normal: Point;
  /** normal · p = c on the side of the outline. */
  c: number;
  /** The inward speed per meter of height when the side moves: 1 / tan(pitch). 0 for a gable side. */
  speed: number;
  tan: number;
  /**
   * The height where the side starts to move: `base` for an eave side, the top of the gable wall
   * for a half-hip side, and Infinity for a gable side. Below it, the side does not move.
   */
  start: number;
  a: Point;
  b: Point;
  side: RoofSide;
}

function lines(outline: Point[], sides: RoofSide[], base: number): Line[] {
  return outline.map((a, i) => {
    const b = outline[(i + 1) % outline.length];
    const dir = unit(sub(b, a));
    // The outline goes with a positive signed area, so the inside is on the left.
    const normal = { x: -dir.y, y: dir.x };
    const side = sides[i] ?? { kind: "eave", pitch: 30, overhang: 0 };
    const pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, side.pitch));
    const tan = Math.tan((pitch * Math.PI) / 180);
    const gable = side.kind === "gable";
    return {
      dir,
      normal,
      c: dot(normal, a),
      speed: gable ? 0 : 1 / tan,
      tan: gable ? Infinity : tan,
      start: gable
        ? Infinity
        : side.kind === "half-hip"
          ? base + Math.max(0, side.gableHeight ?? 0)
          : base,
      a,
      b,
      side,
    };
  });
}

/** True if the side moves at the height z. */
const moves = (line: Line, z: number) => z >= line.start - 1e-9;
/** The inward speed of the side at the height z. */
const speedAt = (line: Line, z: number) => (moves(line, z) ? line.speed : 0);
/** The inward distance of the side from the outline at the height z. */
const offsetAt = (line: Line, z: number) => line.speed * Math.max(0, z - line.start);

// ----- The wavefront -----

interface Vertex {
  id: number;
  /** The position at the current height of the simulation. */
  p: Point;
  /** The change of the position per meter of height. */
  w: Point;
  /** The side on the left (before the vertex) and on the right (after it). */
  left: number;
  right: number;
  prev: Vertex;
  next: Vertex;
  /** The point where the path of the vertex started. */
  start: Vec3;
  active: boolean;
  /** True if the two sides meet head on, so the vertex cannot move. */
  stuck: boolean;
}

interface Arc {
  a: Vec3;
  b: Vec3;
  /** The two sides whose faces the arc separates. */
  left: number;
  right: number;
}

function velocity(l: Line, r: Line, z: number): { w: Point; stuck: boolean } {
  const ls = speedAt(l, z);
  const rs = speedAt(r, z);
  const det = l.normal.x * r.normal.y - l.normal.y * r.normal.x;
  if (Math.abs(det) < 1e-9) {
    if (dot(l.normal, r.normal) > 0) {
      // Collinear sides: the vertex moves with them, along the normal.
      return { w: mul(l.normal, (ls + rs) / 2), stuck: false };
    }
    return { w: { x: 0, y: 0 }, stuck: true };
  }
  // Solve [l.normal; r.normal] · w = [ls; rs].
  return {
    w: {
      x: (ls * r.normal.y - l.normal.y * rs) / det,
      y: (l.normal.x * rs - ls * r.normal.x) / det,
    },
    stuck: false,
  };
}

/**
 * The weighted straight skeleton. It gives the arcs between the faces. The outline must have a
 * positive signed area.
 */
function skeleton(sides: Line[], base: number): Arc[] {
  const arcs: Arc[] = [];
  let nextId = 0;
  const make = (p: Point, z: number, left: number, right: number): Vertex => {
    const { w, stuck } = velocity(sides[left], sides[right], z);
    const vertex = {
      id: nextId++,
      p: { ...p },
      w,
      left,
      right,
      start: v3(p, z),
      active: true,
      stuck,
    } as Vertex;
    return vertex;
  };
  const n = sides.length;
  const vertices: Vertex[] = sides.map((s, i) => make(s.a, base, (i + n - 1) % n, i));
  vertices.forEach((v, i) => {
    v.prev = vertices[(i + n - 1) % n];
    v.next = vertices[(i + 1) % n];
  });
  let all = [...vertices];
  let z = base;

  const end = (v: Vertex, at: Point) => {
    v.active = false;
    const b = v3(at, z);
    if (dist3(v.start, b) > SAME) arcs.push({ a: v.start, b, left: v.left, right: v.right });
  };

  /**
   * Ends a part of the wavefront that has no area left: two vertices or fewer, or vertices on
   * one line, for example on the ridge of a gable roof. The part closes along its vertices.
   */
  const closeFlat = (force = false) => {
    const done = new Set<Vertex>();
    for (const v of all) {
      if (!v.active || done.has(v)) continue;
      const loop = [v];
      let guard = 0;
      for (let u = v.next; u !== v && guard++ < 1000; u = u.next) loop.push(u);
      loop.forEach((u) => done.add(u));
      const area = loop.length < 3 ? 0 : Math.abs(signedArea(loop.map((u) => u.p)));
      if (!force && loop.length > 2 && area > 1e-9) continue;
      loop.forEach((u, k) => {
        const w = loop[(k + 1) % loop.length];
        if (loop.length === 2 && k === 1) return;
        if (len(sub(u.p, w.p)) > SAME) {
          arcs.push({ a: v3(u.p, z), b: v3(w.p, z), left: u.right, right: u.left });
        }
      });
      for (const u of loop) end(u, u.p);
    }
  };

  for (let iteration = 0; iteration < 2000; iteration++) {
    all = all.filter((v) => v.active);
    closeFlat();
    all = all.filter((v) => v.active);
    if (all.length === 0) break;

    // The next event: the smallest step in height.
    let best: { dz: number; kind: "edge" | "split"; v: Vertex; e?: Vertex } | null = null;
    const consider = (dz: number, kind: "edge" | "split", v: Vertex, e?: Vertex) => {
      if (!Number.isFinite(dz) || dz < -1e-9) return;
      const step = Math.max(0, dz);
      // An edge event wins over a split event at the same height.
      if (
        !best ||
        step < best.dz - 1e-9 ||
        (Math.abs(step - best.dz) <= 1e-9 && kind === "edge" && best.kind === "split")
      ) {
        best = { dz: step, kind, v, e };
      }
    };
    for (const v of all) {
      // The edge event of the side after v.
      const u = v.next;
      const t = sides[v.right].dir;
      const gap = dot(sub(u.p, v.p), t);
      const rate = dot(sub(v.w, u.w), t);
      if (len(sub(u.p, v.p)) < SAME) consider(0, "edge", v);
      else if (rate > 1e-12) consider(gap / rate, "edge", v);
    }
    for (const v of all) {
      if (v.stuck) continue;
      const dl = sides[v.left].dir;
      const dr = sides[v.right].dir;
      if (cross(dl, dr) >= -1e-9) continue;
      // A reflex vertex: test each side of its part of the wavefront.
      // The sides next to v are v.left (from v.prev) and v.right (from v). Test the others.
      let guard = 0;
      for (let a = v.next; a !== v.prev && a !== v && guard++ < 200; a = a.next) {
        const e = sides[a.right];
        const f = dot(e.normal, v.p) - (e.c + offsetAt(e, z));
        const rate = dot(e.normal, v.w) - speedAt(e, z);
        if (rate > -1e-12) continue;
        const dz = f / -rate;
        if (dz < -1e-9) continue;
        const hit = add(v.p, mul(v.w, dz));
        const pa = add(a.p, mul(a.w, dz));
        const pb = add(a.next.p, mul(a.next.w, dz));
        const span = dot(sub(pb, pa), e.dir);
        const at = dot(sub(hit, pa), e.dir);
        if (span < -SAME) continue;
        const tolerance = 1e-7;
        if (at < -tolerance || at > span + tolerance) continue;
        consider(dz, "split", v, a);
      }
    }
    // A start event comes before the other events if it is lower. At the start height of a
    // half-hip side, each vertex on the side ends its path and starts a new one.
    const starts = sides.map((s) => s.start).filter((h) => Number.isFinite(h) && h > z + 1e-9);
    const next = starts.length > 0 ? Math.min(...starts) : Infinity;
    const found = best as { dz: number } | null;
    if (Number.isFinite(next) && (!found || z + found.dz > next + 1e-9)) {
      const dz = next - z;
      z = next;
      for (const v of all) v.p = add(v.p, mul(v.w, dz));
      for (const v of all) {
        if (Math.abs(sides[v.left].start - z) > 1e-9 && Math.abs(sides[v.right].start - z) > 1e-9)
          continue;
        const at = v3(v.p, z);
        if (dist3(v.start, at) > SAME) {
          arcs.push({ a: v.start, b: at, left: v.left, right: v.right });
        }
        v.start = at;
        const { w, stuck } = velocity(sides[v.left], sides[v.right], z);
        v.w = w;
        v.stuck = stuck;
      }
      continue;
    }
    if (!best) {
      // Nothing more happens, for example because the rest has only gable sides. The rest
      // closes along its vertices.
      closeFlat(true);
      break;
    }
    const event = best as { dz: number; kind: "edge" | "split"; v: Vertex; e?: Vertex };
    z += event.dz;
    for (const v of all) v.p = add(v.p, mul(v.w, event.dz));

    if (event.kind === "edge") {
      const a = event.v;
      const b = a.next;
      const at = mul(add(a.p, b.p), 0.5);
      end(a, at);
      end(b, at);
      if (a.prev === b) {
        // Only these two were left.
        continue;
      }
      const merged = make(at, z, a.left, b.right);
      merged.prev = a.prev;
      merged.next = b.next;
      a.prev.next = merged;
      b.next.prev = merged;
      all.push(merged);
    } else {
      const v = event.v;
      const a = event.e!;
      const b = a.next;
      const at = v.p;
      end(v, at);
      const one = make(at, z, v.left, a.right);
      const two = make(at, z, a.right, v.right);
      one.prev = v.prev;
      one.next = b;
      v.prev.next = one;
      b.prev = one;
      two.prev = a;
      two.next = v.next;
      a.next = two;
      v.next.prev = two;
      all.push(one, two);
    }
  }
  return arcs;
}

// ----- From arcs to faces -----

interface Graph {
  nodes: { p: Point; top: number }[];
  /** The bounded regions of the plan, as lists of node indices, counterclockwise. */
  regions: number[][];
}

/**
 * The plan of the skeleton as a planar graph: the sides of the outline and the arcs, with equal
 * points merged and each segment split at the nodes on it. A walk around each node gives the
 * regions. A region is the face of the eave side whose part of the outline it contains.
 *
 * This works also where many arcs meet at one point, or where an arc lies on a gable side.
 */
function planarGraph(sides: Line[], arcs: Arc[], base: number): Graph {
  const nodes: { p: Point; top: number }[] = [];
  const node = (p: Point, z: number) => {
    let i = nodes.findIndex((q) => len(sub(p, q.p)) < SAME * 10);
    if (i < 0) {
      nodes.push({ p: { ...p }, top: z });
      i = nodes.length - 1;
    } else {
      nodes[i].top = Math.max(nodes[i].top, z);
    }
    return i;
  };
  const raw: [number, number][] = [];
  for (const s of sides) raw.push([node(s.a, base), node(s.b, base)]);
  for (const arc of arcs) raw.push([node(flat2(arc.a), arc.a.z), node(flat2(arc.b), arc.b.z)]);

  // Split each segment at the nodes that lie on it, and keep each piece once.
  const keys = new Set<string>();
  const edges: [number, number][] = [];
  const addEdge = (a: number, b: number) => {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (keys.has(key)) return;
    keys.add(key);
    edges.push([a, b]);
  };
  for (const [a, b] of raw) {
    if (a === b) continue;
    const pa = nodes[a].p;
    const d = sub(nodes[b].p, pa);
    const l2 = dot(d, d);
    const on: { t: number; i: number }[] = [
      { t: 0, i: a },
      { t: 1, i: b },
    ];
    nodes.forEach((n, i) => {
      if (i === a || i === b) return;
      const t = dot(sub(n.p, pa), d) / l2;
      if (t <= 1e-9 || t >= 1 - 1e-9) return;
      const off = Math.abs(cross(d, sub(n.p, pa))) / Math.sqrt(l2);
      if (off < SAME * 10) on.push({ t, i });
    });
    on.sort((p, q) => p.t - q.t);
    for (let k = 1; k < on.length; k++) addEdge(on[k - 1].i, on[k].i);
  }

  // The neighbors of each node, by angle.
  const around = nodes.map(() => [] as number[]);
  for (const [a, b] of edges) {
    around[a].push(b);
    around[b].push(a);
  }
  const angle = (from: number, to: number) => {
    const d = sub(nodes[to].p, nodes[from].p);
    return Math.atan2(d.y, d.x);
  };
  around.forEach((list, i) => list.sort((p, q) => angle(i, p) - angle(i, q)));

  // Walk each directed edge once. At each node, take the next edge clockwise from the way back.
  // With a positive signed area, this keeps each region on the left.
  const used = new Set<string>();
  const regions: number[][] = [];
  for (const [a, b] of edges) {
    for (const [u0, v0] of [
      [a, b],
      [b, a],
    ]) {
      if (used.has(`${u0}>${v0}`)) continue;
      const cycle: number[] = [];
      let u = u0;
      let v = v0;
      let guard = 0;
      while (!used.has(`${u}>${v}`) && guard++ < 10000) {
        used.add(`${u}>${v}`);
        cycle.push(u);
        const list = around[v];
        const k = list.indexOf(u);
        const w = list[(k - 1 + list.length) % list.length];
        u = v;
        v = w;
      }
      const area = signedArea(cycle.map((i) => nodes[i].p));
      if (cycle.length >= 3 && area > 1e-9) regions.push(cycle);
    }
  }
  return { nodes, regions };
}

/** The height of the plane of an eave or a half-hip side at a point of the plan. */
const planeHeight = (line: Line, p: Point) =>
  line.start + (dot(line.normal, p) - line.c) * line.tan;

/** True if the point lies on the side, between its ends, within a small distance. */
function onSide(line: Line, p: Point): boolean {
  const d = Math.abs(dot(line.normal, p) - line.c);
  if (d > 1e-6) return false;
  const along = dot(sub(p, line.a), line.dir);
  return along > -1e-6 && along < len(sub(line.b, line.a)) + 1e-6;
}

/** The intersection of two lines: normal · p = c for each. */
function meet(n1: Point, c1: number, n2: Point, c2: number): Point | null {
  const det = n1.x * n2.y - n1.y * n2.x;
  if (Math.abs(det) < 1e-12) return null;
  return { x: (c1 * n2.y - n1.y * c2) / det, y: (n1.x * c2 - c1 * n2.x) / det };
}

/**
 * Moves a point of the face of the eave side `i` outward to the overhang. A point on the side
 * of `i` itself, on the side of a neighbor, or on a gable side moves out by the overhangs of
 * those sides, and its height follows the plane of `i`.
 */
function extend(sides: Line[], i: number, p: Vec3): Vec3 {
  const n = sides.length;
  const plan = flat2(p);
  const on: number[] = [];
  for (let j = 0; j < n; j++) {
    const neighbor = j === i || j === (i + 1) % n || j === (i + n - 1) % n;
    const s = sides[j];
    if (!neighbor && s.side.kind !== "gable") continue;
    if (onSide(s, plan)) on.push(j);
  }
  if (on.length === 0) return p;
  // A point at the top of a half-hip gable is the low end of a hip line. The hip line goes on
  // outward and down until the hip face reaches its overhang.
  const hip = on.find((j) => sides[j].side.kind === "half-hip" && p.z > sides[j].start - 1e-6);
  if (hip !== undefined) {
    const h = sides[hip];
    // The other plane of the hip line: the face itself, or for the hip face a neighbor whose
    // plane goes through the point.
    const other =
      i !== hip
        ? sides[i]
        : [sides[(hip + n - 1) % n], sides[(hip + 1) % n]].find(
            (s) => s.side.kind !== "gable" && Math.abs(planeHeight(s, plan) - p.z) < 1e-6,
          );
    if (other) {
      // The hip line ends at the overhang of the hip face, but not lower than the eave of the
      // other face. A steep hip face would else go below that eave and make a spike.
      const eave = other.start - other.side.overhang * other.tan;
      const z = Math.max(p.z - h.side.overhang * h.tan, eave);
      const out = (p.z - z) / h.tan;
      const at = meet(h.normal, h.c - out, other.normal, other.c + (z - other.start) / other.tan);
      if (at) return v3(at, z);
    }
  }
  let q = plan;
  if (on.length === 1) {
    q = sub(plan, mul(sides[on[0]].normal, sides[on[0]].side.overhang));
  } else {
    const [j, k] = on;
    const hit = meet(
      sides[j].normal,
      sides[j].c - sides[j].side.overhang,
      sides[k].normal,
      sides[k].c - sides[k].side.overhang,
    );
    if (hit) q = hit;
  }
  return v3(q, planeHeight(sides[i], q));
}

/** The outline with the overhangs: each corner where the two moved sides meet. */
function eaveOutline(sides: Line[]): Point[] {
  const n = sides.length;
  return sides.map((s, i) => {
    const prev = sides[(i + n - 1) % n];
    return (
      meet(prev.normal, prev.c - prev.side.overhang, s.normal, s.c - s.side.overhang) ??
      sub(s.a, mul(s.normal, s.side.overhang))
    );
  });
}

// ----- Flat roofs -----

function flatRoof(sides: Line[], base: number): RoofGeometry {
  const eaves = eaveOutline(sides);
  const top = base + FLAT_THICKNESS;
  const face = orientTo(
    eaves.map((p) => v3(p, top)),
    { x: 0, y: 1, z: 0 },
  );
  const gables: Vec3[][] = [];
  const edges: [Vec3, Vec3][] = [];
  eaves.forEach((a, i) => {
    const b = eaves[(i + 1) % eaves.length];
    // The side of the slab faces outward: the opposite of the inward normal of its side. The
    // center of the slab does not work for this, because it can be outside a non-convex outline.
    const out = { x: -sides[i].normal.x, y: 0, z: -sides[i].normal.y };
    gables.push(orientTo([v3(a, base), v3(b, base), v3(b, top), v3(a, top)], out));
    edges.push([v3(a, top), v3(b, top)]);
  });
  return {
    faces: [{ side: -1, polygon: face, pitch: 0, normal: { x: 0, y: 0, z: 1 } }],
    gables,
    edges,
    eaves,
    dormers: [],
    windows: [],
    holes: [],
    misfits: [],
    top,
  };
}

// ----- Dormers and roof windows -----

/** True if the point is inside the polygon on the plan, or on its border. */
function inside(p: Point, polygon: Point[]): boolean {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    // A point on the border counts as inside.
    const ab = sub(b, a);
    const t = dot(sub(p, a), ab) / Math.max(dot(ab, ab), EPS);
    if (t >= 0 && t <= 1 && len(sub(p, add(a, mul(ab, t)))) < 1e-4) return true;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      result = !result;
    }
  }
  return result;
}

/**
 * True if the part of a face that a dormer or a window takes lies on the faces of its side. The
 * corners and the middles of the borders of the part must be on one of these faces.
 */
function fits(hole: Vec3[], faces: Point[][]): boolean {
  const points = hole.flatMap((p, k) => {
    const q = hole[(k + 1) % hole.length];
    return [flat2(p), mul(add(flat2(p), flat2(q)), 0.5)];
  });
  return points.every((p) => faces.some((face) => inside(p, face)));
}

/** The frame of the face of side i: u along the side, v inward, z from the plane. */
function frame(line: Line, base: number) {
  const point = (u: number, v: number, z?: number): Vec3 => {
    const p = add(add(line.a, mul(line.dir, u)), mul(line.normal, v));
    return v3(p, z ?? base + v * line.tan);
  };
  return { point, height: (v: number) => base + v * line.tan };
}

function dormerGeometry(line: Line, base: number, dormer: Dormer) {
  const { point, height } = frame(line, base);
  const u0 = dormer.offset - dormer.width / 2;
  const u1 = dormer.offset + dormer.width / 2;
  const uc = dormer.offset;
  const d = dormer.distance;
  const zf = height(d);
  // The height of the front wall is the height above the main face at the front.
  const zt = zf + dormer.height;
  const tanMain = line.tan;
  const tanOwn = Math.tan((Math.min(80, Math.max(0, dormer.pitch)) * Math.PI) / 180);
  const faces: Vec3[][] = [];
  const walls: Vec3[][] = [];
  let hole: Vec3[];
  const center = point(uc, d + 0.1, (zf + zt) / 2);
  if (dormer.kind === "gable") {
    const half = dormer.width / 2;
    const zr = zt + half * tanOwn;
    // The eaves and the ridge of the dormer go inward until they meet the main face.
    const ve = (zt - base) / tanMain;
    const vr = (zr - base) / tanMain;
    faces.push([point(u0, d, zt), point(uc, d, zr), point(uc, vr, zr), point(u0, ve, zt)]);
    faces.push([point(uc, d, zr), point(u1, d, zt), point(u1, ve, zt), point(uc, vr, zr)]);
    walls.push([
      point(u0, d, zf),
      point(u1, d, zf),
      point(u1, d, zt),
      point(uc, d, zr),
      point(u0, d, zt),
    ]);
    walls.push([point(u0, d, zf), point(u0, d, zt), point(u0, ve, zt)]);
    walls.push([point(u1, d, zf), point(u1, d, zt), point(u1, ve, zt)]);
    hole = [point(u0, d), point(u1, d), point(u1, ve), point(uc, vr), point(u0, ve)];
  } else {
    // A shed dormer rises inward with its own pitch. A flat dormer has a pitch of 0.
    const tan = dormer.kind === "flat" ? 0 : Math.min(tanOwn, tanMain * 0.9);
    const vb = (zt - base - d * tan) / (tanMain - tan);
    const zb = base + vb * tanMain;
    faces.push([point(u0, d, zt), point(u1, d, zt), point(u1, vb, zb), point(u0, vb, zb)]);
    walls.push([point(u0, d, zf), point(u1, d, zf), point(u1, d, zt), point(u0, d, zt)]);
    walls.push([point(u0, d, zf), point(u0, d, zt), point(u0, vb, zb)]);
    walls.push([point(u1, d, zf), point(u1, d, zt), point(u1, vb, zb)]);
    hole = [point(u0, d), point(u1, d), point(u1, vb), point(u0, vb)];
  }
  // The window is in the front wall, a bit in front of it.
  const inset = Math.min(0.1, dormer.width / 4, dormer.height / 4);
  const window = [
    point(u0 + inset, d - 0.01, zf + inset),
    point(u1 - inset, d - 0.01, zf + inset),
    point(u1 - inset, d - 0.01, zt - inset),
    point(u0 + inset, d - 0.01, zt - inset),
  ];
  return {
    id: dormer.id,
    faces: faces.map((f) => orientAway(clean(f), point(uc, (d + 1) * 2, zf - 10))),
    walls: walls.map((w) => orientAway(clean(w), center)),
    window: orientAway(window, point(uc, d + 1, (zf + zt) / 2)),
    hole: orientTo(hole, { x: 0, y: 1, z: 0 }),
  };
}

function windowGeometry(line: Line, base: number, window: RoofWindow) {
  const { point, height } = frame(line, base);
  const u0 = window.offset - window.width / 2;
  const u1 = window.offset + window.width / 2;
  const v0 = window.distance;
  // The length goes up the slope, so its run on the plan is shorter.
  const v1 = v0 + window.length * Math.cos(Math.atan(line.tan));
  const lift = (v: number) => height(v) + WINDOW_LIFT;
  const quad = [
    point(u0, v0, lift(v0)),
    point(u1, v0, lift(v0)),
    point(u1, v1, lift(v1)),
    point(u0, v1, lift(v1)),
  ];
  const hole = [point(u0, v0), point(u1, v0), point(u1, v1), point(u0, v1)];
  return {
    quad: orientTo(quad, { x: 0, y: 1, z: 0 }),
    hole: orientTo(hole, { x: 0, y: 1, z: 0 }),
  };
}

// ----- The engine -----

export function roofGeometry(input: RoofInput): RoofGeometry {
  // The engine works with a positive signed area and without sides of zero length. `order` maps
  // its sides back to the input. A side of zero length, for example from a repeated point, has
  // no direction, so the skeleton cannot move its vertices.
  const n = input.outline.length;
  const end = (j: number) => input.outline[(j + 1) % n];
  const order = input.outline
    .map((_, j) => j)
    .filter((j) => len(sub(end(j), input.outline[j])) > SAME);
  const reversed = signedArea(input.outline) < 0;
  if (reversed) {
    // A reversed side goes from the end to the start of its side of the input. The engine starts
    // at the side before the last side, so that the faces keep their order (`PvArray.face`).
    order.reverse();
    if (order.length > 0) order.push(order.shift()!);
  }
  const outline = order.map((j) => ({ ...(reversed ? end(j) : input.outline[j]) }));
  const base = input.base;
  const all = lines(
    outline,
    order.map((j) => input.sides[j]),
    base,
  );
  if (input.flat) return flatRoof(all, base);

  const arcs = skeleton(all, base);
  const graph = planarGraph(all, arcs, base);
  const faces: RoofFace[] = [];
  for (const region of graph.regions) {
    const points = region.map((k) => graph.nodes[k].p);
    // The region belongs to the eave side whose outline holds one of its edges. A half-hip side
    // owns only the edge at the top of its gable wall. Its lower edges belong to the neighbors.
    let owner = -1;
    for (let k = 0; k < points.length && owner < 0; k++) {
      const p = points[k];
      const q = points[(k + 1) % points.length];
      const mid = mul(add(p, q), 0.5);
      const tops = [graph.nodes[region[k]].top, graph.nodes[region[(k + 1) % region.length]].top];
      owner = all.findIndex(
        (line) =>
          (line.side.kind === "eave" ||
            (line.side.kind === "half-hip" &&
              tops.every((t) => Math.abs(t - line.start) < 1e-6))) &&
          onSide(line, p) &&
          onSide(line, q) &&
          onSide(line, mid),
      );
    }
    if (owner < 0) continue;
    const line = all[owner];
    const polygon = clean(points.map((p) => extend(all, owner, v3(p, planeHeight(line, p)))));
    if (polygon.length < 3) continue;
    const slope = Math.atan(line.tan);
    faces.push({
      side: order[owner],
      polygon: orientTo(polygon, { x: 0, y: 1, z: 0 }),
      pitch: (slope * 180) / Math.PI,
      normal: {
        x: -line.normal.x * Math.sin(slope),
        y: -line.normal.y * Math.sin(slope),
        z: Math.cos(slope),
      },
    });
  }

  // A gable wall goes from its side of the outline up to the heights of the nodes on its line.
  // The wall of a half-hip side ends at the hip face.
  const gables: Vec3[][] = [];
  for (const line of all) {
    if (line.side.kind === "eave") continue;
    const length = len(sub(line.b, line.a));
    const top = graph.nodes
      .filter((nd) => onSide(line, nd.p))
      .map((nd) => ({ t: dot(sub(nd.p, line.a), line.dir), p: nd.p, z: nd.top }))
      .sort((p, q) => q.t - p.t);
    if (top.length < 2 || top.every((t) => t.z <= base + 1e-9)) continue;
    const polygon = clean([
      v3(line.a, base),
      v3(line.b, base),
      ...top.filter((t) => t.t >= -1e-9 && t.t <= length + 1e-9).map((t) => v3(t.p, t.z)),
    ]);
    if (polygon.length < 3) continue;
    // The wall faces outward: the opposite of the inward normal of its side.
    gables.push(orientTo(polygon, { x: -line.normal.x, y: 0, z: -line.normal.y }));
  }

  const dormers: RoofGeometry["dormers"] = [];
  const holes: RoofGeometry["holes"] = [];
  const misfits: Id[] = [];
  const toEngine = (side: number) => order.indexOf(side);
  const facesOf = (side: number) =>
    faces.filter((f) => f.side === side).map((f) => f.polygon.map(flat2));
  // The offset counts from the start of the side of the input. A reversed side starts at the
  // other end, so the offset counts from that end.
  const along = <T extends Dormer | RoofWindow>(item: T, line: Line): T =>
    reversed ? { ...item, offset: len(sub(line.b, line.a)) - item.offset } : item;
  for (const dormer of input.dormers) {
    const i = toEngine(dormer.side);
    if (i < 0 || all[i].side.kind !== "eave") continue;
    const geometry = dormerGeometry(all[i], base, along(dormer, all[i]));
    if (!fits(geometry.hole, facesOf(dormer.side))) {
      misfits.push(dormer.id);
      continue;
    }
    dormers.push({
      id: geometry.id,
      faces: geometry.faces,
      walls: geometry.walls,
      window: geometry.window,
      hole: geometry.hole,
    });
    holes.push({ side: dormer.side, polygon: geometry.hole });
  }
  const windows: RoofGeometry["windows"] = [];
  for (const window of input.windows) {
    const i = toEngine(window.side);
    if (i < 0 || all[i].side.kind !== "eave") continue;
    const geometry = windowGeometry(all[i], base, along(window, all[i]));
    if (!fits(geometry.hole, facesOf(window.side))) {
      misfits.push(window.id);
      continue;
    }
    windows.push({ id: window.id, quad: geometry.quad });
    holes.push({ side: window.side, polygon: geometry.hole });
  }

  // The edges: each border of each face and gable once.
  const edges: [Vec3, Vec3][] = [];
  const known = (a: Vec3, b: Vec3) =>
    edges.some(
      ([p, q]) =>
        (dist3(p, a) < SAME * 10 && dist3(q, b) < SAME * 10) ||
        (dist3(p, b) < SAME * 10 && dist3(q, a) < SAME * 10),
    );
  for (const polygon of [...faces.map((f) => f.polygon), ...gables]) {
    polygon.forEach((a, k) => {
      const b = polygon[(k + 1) % polygon.length];
      if (!known(a, b)) edges.push([a, b]);
    });
  }

  let top = base;
  for (const polygon of [
    ...faces.map((f) => f.polygon),
    ...gables,
    ...dormers.flatMap((d) => [...d.faces, ...d.walls]),
  ]) {
    for (const p of polygon) top = Math.max(top, p.z);
  }
  return {
    faces,
    gables,
    edges,
    eaves: eaveOutline(all),
    dormers,
    windows,
    holes,
    misfits,
    top,
  };
}

/**
 * The usual height of the gable wall of a half-hip side of the length `length`: 60 % of the rise
 * of a ridge across the side with the pitch, rounded to 5 cm.
 */
export function halfHipHeight(length: number, pitch: number): number {
  const rise =
    (length / 2) * Math.tan((Math.min(MAX_PITCH, Math.max(MIN_PITCH, pitch)) * Math.PI) / 180);
  return Math.round(rise * 0.6 * 20) / 20;
}

/**
 * The settings of the sides for a usual kind of roof:
 *
 * - gable: the sides that go along the longest side are eaves, the others are gables.
 * - half-hip: as gable, but the gables are half-hip sides.
 * - hip: all sides are eaves.
 * - shed: the longest side is an eave, the others are gables.
 * - flat: all sides are eaves with a pitch of 0. Use `flat` in RoofInput for the slab.
 */
export function presetSides(
  outline: Point[],
  preset: "gable" | "half-hip" | "hip" | "shed" | "flat",
  pitch: number,
  overhang: number,
): RoofSide[] {
  const n = outline.length;
  const dirs = outline.map((a, i) => unit(sub(outline[(i + 1) % n], a)));
  const lengths = outline.map((a, i) => len(sub(outline[(i + 1) % n], a)));
  const longest = lengths.indexOf(Math.max(...lengths));
  const gables =
    preset === "gable" || preset === "half-hip"
      ? wingEnds(outline, dirs, lengths)
      : new Set<number>();
  return outline.map((_, i): RoofSide => {
    if (preset === "flat") return { kind: "eave", pitch: 0, overhang };
    if (preset === "hip") return { kind: "eave", pitch, overhang };
    if (preset === "shed") {
      return i === longest ? { kind: "eave", pitch, overhang } : { kind: "gable", pitch, overhang };
    }
    if (!gables.has(i)) return { kind: "eave", pitch, overhang };
    if (preset === "gable") return { kind: "gable", pitch, overhang };
    return { kind: "half-hip", pitch, overhang, gableHeight: halfHipHeight(lengths[i], pitch) };
  });
}

/**
 * The gable sides of the gable preset: the ends of the wings of the building. An end is a side
 * with two convex corners that is shorter than both of its neighbors. On a rectangle, these are
 * the two short sides. On an L, a T, or a U, they are the end of each wing, so that each wing gets
 * a ridge along it. A square has no such side, so the function falls back to the sides across
 * the longest side.
 */
function wingEnds(outline: Point[], dirs: Point[], lengths: number[]): Set<number> {
  const n = outline.length;
  // The sign of the area tells the direction of the outline, so that "convex" is the same turn.
  const area = signedArea(outline);
  const turn = (i: number) => {
    const d0 = dirs[(i - 1 + n) % n];
    const d1 = dirs[i];
    return (d0.x * d1.y - d0.y * d1.x) * Math.sign(area);
  };
  // turn(i) is the turn at the start corner of side i. It is positive at a convex corner.
  const ends = new Set<number>();
  for (let i = 0; i < n; i++) {
    const convex = turn(i) > 1e-6 && turn((i + 1) % n) > 1e-6;
    const before = lengths[(i - 1 + n) % n];
    const after = lengths[(i + 1) % n];
    if (convex && lengths[i] < before - 1e-6 && lengths[i] < after - 1e-6) ends.add(i);
  }
  if (ends.size > 0) return ends;
  const longest = lengths.indexOf(Math.max(...lengths));
  for (let i = 0; i < n; i++) {
    if (Math.abs(dot(dirs[i], dirs[longest])) <= 0.9) ends.add(i);
  }
  return ends;
}
