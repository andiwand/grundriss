import { describe, expect, it } from "vitest";
import { signedArea } from "../src/model/geometry";
import {
  FLAT_THICKNESS,
  presetSides,
  roofGeometry,
  type RoofGeometry,
  type RoofInput,
  type Vec3,
} from "../src/model/roofshape";
import type { Point, RoofSide } from "../src/model/types";

const tan = (degrees: number) => Math.tan((degrees * Math.PI) / 180);

const rectangle = (w: number, d: number): Point[] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: d },
  { x: 0, y: d },
];

/** An L: 10 × 4 along the top, and a wing 4 × 6 down at the left. */
const ell: Point[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 4 },
  { x: 4, y: 4 },
  { x: 4, y: 10 },
  { x: 0, y: 10 },
];

function roof(outline: Point[], sides: RoofSide[], extra: Partial<RoofInput> = {}): RoofGeometry {
  return roofGeometry({ outline, sides, base: 3, flat: false, dormers: [], windows: [], ...extra });
}

/** The area of the projection of a 3D polygon on the plan. */
const planArea = (polygon: Vec3[]) =>
  Math.abs(signedArea(polygon.map((p) => ({ x: p.x, y: p.y }))));

/** The world normal (x, height, y) of a polygon, by Newell's method. */
function worldNormal(polygon: Vec3[]) {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = { x: polygon[i].x, y: polygon[i].z, z: polygon[i].y };
    const q = polygon[(i + 1) % polygon.length];
    const b = { x: q.x, y: q.z, z: q.y };
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  return { x: nx, y: ny, z: nz };
}

function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

const maxZ = (g: RoofGeometry) => Math.max(...g.faces.flatMap((f) => f.polygon.map((p) => p.z)));

describe("presetSides", () => {
  it("makes the long sides of a rectangle eaves for a gable roof", () => {
    const sides = presetSides(rectangle(10, 6), "gable", 35, 0.4);
    expect(sides.map((s) => s.kind)).toEqual(["eave", "gable", "eave", "gable"]);
  });

  it("makes all sides eaves for a hip roof, and one side for a shed roof", () => {
    expect(presetSides(ell, "hip", 30, 0).every((s) => s.kind === "eave")).toBe(true);
    const shed = presetSides(ell, "shed", 15, 0);
    expect(shed.filter((s) => s.kind === "eave")).toHaveLength(1);
    expect(presetSides(ell, "flat", 30, 0).every((s) => s.pitch === 0)).toBe(true);
  });

  it("gives each wing of an L a gable at its end", () => {
    const sides = presetSides(ell, "gable", 35, 0);
    // The ends of the wings are side 1 (x = 10) and side 4 (y = 10). Both have two convex corners
    // and are shorter than their neighbors.
    expect(sides.map((s) => s.kind)).toEqual(["eave", "gable", "eave", "eave", "gable", "eave"]);
    const g = roof(ell, sides);
    // Each wing has its ridge along it, at the middle of its width of 4 m.
    expect(g.top).toBeCloseTo(3 + 2 * tan(35));
    expect(g.gables).toHaveLength(2);
  });

  it("keeps the short sides of a rectangle as the gables", () => {
    const sides = presetSides(rectangle(10, 6), "gable", 35, 0);
    expect(sides.filter((s) => s.kind === "gable")).toHaveLength(2);
    const lengths = rectangle(10, 6).map((p, i, all) => {
      const q = all[(i + 1) % all.length];
      return Math.hypot(q.x - p.x, q.y - p.y);
    });
    sides.forEach((s, i) => expect(s.kind === "gable").toBe(lengths[i] === 6));
  });
});

describe("gable roof on a rectangle", () => {
  const g = roof(rectangle(10, 6), presetSides(rectangle(10, 6), "gable", 35, 0));

  it("has two faces, two gables, and the ridge in the middle", () => {
    expect(g.faces).toHaveLength(2);
    expect(g.gables).toHaveLength(2);
    expect(maxZ(g)).toBeCloseTo(3 + 3 * tan(35));
    expect(g.top).toBeCloseTo(3 + 3 * tan(35));
    // The faces together cover the rectangle.
    const total = g.faces.reduce((sum, f) => sum + planArea(f.polygon), 0);
    expect(total).toBeCloseTo(60);
  });

  it("keeps the gable walls at the outline, and they reach the ridge", () => {
    for (const gable of g.gables) {
      const xs = gable.map((p) => p.x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1e-6);
      expect(Math.max(...gable.map((p) => p.z))).toBeCloseTo(3 + 3 * tan(35));
    }
  });

  it("gives faces with normals up and gables with normals out", () => {
    for (const face of g.faces) {
      expect(worldNormal(face.polygon).y).toBeGreaterThan(0);
      expect(face.normal.z).toBeGreaterThan(0);
    }
    for (const gable of g.gables) {
      const n = worldNormal(gable);
      const center = gable.reduce((s, p) => s + p.x, 0) / gable.length;
      // The gable at x = 0 faces -x, and the gable at x = 10 faces +x.
      expect(Math.sign(n.x)).toBe(center < 5 ? -1 : 1);
    }
  });

  it("has the same result for an outline in the other direction", () => {
    const outline = [...rectangle(10, 6)].reverse();
    const sides = presetSides(outline, "gable", 35, 0);
    const other = roof(outline, sides);
    expect(other.faces).toHaveLength(2);
    expect(maxZ(other)).toBeCloseTo(3 + 3 * tan(35));
    // The face numbers refer to the sides of the input.
    for (const face of other.faces) expect(sides[face.side].kind).toBe("eave");
  });
});

describe("hip roofs", () => {
  it("gives a rectangle two trapezoids and two triangles", () => {
    const g = roof(rectangle(10, 6), presetSides(rectangle(10, 6), "hip", 30, 0));
    expect(g.faces).toHaveLength(4);
    expect(g.gables).toHaveLength(0);
    expect(g.faces.map((f) => f.polygon.length).sort()).toEqual([3, 3, 4, 4]);
    expect(maxZ(g)).toBeCloseTo(3 + 3 * tan(30));
  });

  it("gives a square a pyramid", () => {
    const g = roof(rectangle(8, 8), presetSides(rectangle(8, 8), "hip", 45, 0));
    expect(g.faces).toHaveLength(4);
    for (const face of g.faces) expect(face.polygon).toHaveLength(3);
    expect(maxZ(g)).toBeCloseTo(3 + 4);
  });

  it("covers an L, with a valley at the inner corner", () => {
    const g = roof(ell, presetSides(ell, "hip", 35, 0));
    const total = g.faces.reduce((sum, f) => sum + planArea(f.polygon), 0);
    expect(total).toBeCloseTo(Math.abs(signedArea(ell)), 4);
    expect(g.faces.length).toBeGreaterThanOrEqual(6);
    // The valley starts at the inner corner (4, 4) at the height of the eaves and goes up.
    const valley = g.edges.find(
      ([a, b]) =>
        (Math.hypot(a.x - 4, a.y - 4) < 1e-6 && b.z > a.z + 0.1) ||
        (Math.hypot(b.x - 4, b.y - 4) < 1e-6 && a.z > b.z + 0.1),
    );
    expect(valley).toBeDefined();
    // The two wings are 4 m wide, so the ridges are at 2 m inward.
    expect(maxZ(g)).toBeCloseTo(3 + 2 * tan(35));
  });

  it("covers an L with a gable preset", () => {
    const g = roof(ell, presetSides(ell, "gable", 35, 0));
    const faces = g.faces.reduce((sum, f) => sum + planArea(f.polygon), 0);
    expect(faces).toBeCloseTo(Math.abs(signedArea(ell)), 4);
    expect(g.gables.length).toBeGreaterThan(0);
  });

  it("moves the ridge toward the steeper side", () => {
    const sides = presetSides(rectangle(10, 6), "gable", 30, 0);
    sides[0] = { ...sides[0], pitch: 50 };
    const g = roof(rectangle(10, 6), sides);
    const ridge = g.faces.flatMap((f) => f.polygon).filter((p) => Math.abs(p.z - maxZ(g)) < 1e-6);
    // Side 0 is at y = 0. The steeper side rises faster, so the ridge is nearer to y = 0.
    for (const p of ridge) expect(p.y).toBeLessThan(3);
    // The two planes meet where 50° and 30° give the same height: y·tan50 = (6 − y)·tan30.
    const y = (6 * tan(30)) / (tan(50) + tan(30));
    expect(ridge[0].y).toBeCloseTo(y);
  });
});

describe("shed roofs", () => {
  it("gives one face and three gable walls", () => {
    const sides = presetSides(rectangle(10, 6), "shed", 15, 0);
    const g = roof(rectangle(10, 6), sides);
    expect(g.faces).toHaveLength(1);
    expect(g.gables).toHaveLength(3);
    // The high side is 6 m from the eave.
    expect(maxZ(g)).toBeCloseTo(3 + 6 * tan(15));
  });
});

describe("overhangs", () => {
  it("extends the faces to the eave line and lowers the eaves", () => {
    const sides = presetSides(rectangle(10, 6), "hip", 30, 0.5);
    const g = roof(rectangle(10, 6), sides);
    const total = g.faces.reduce((sum, f) => sum + planArea(f.polygon), 0);
    expect(total).toBeCloseTo(11 * 7, 4);
    expect(Math.abs(signedArea(g.eaves))).toBeCloseTo(77);
    const low = Math.min(...g.faces.flatMap((f) => f.polygon.map((p) => p.z)));
    expect(low).toBeCloseTo(3 - 0.5 * tan(30));
    for (const face of g.faces) {
      for (const p of face.polygon) expect(p.z).toBeGreaterThanOrEqual(3 - 0.5 * tan(30) - 1e-9);
    }
  });

  it("extends a gable roof past the gable walls (the verge)", () => {
    const sides = presetSides(rectangle(10, 6), "gable", 35, 0.4);
    const g = roof(rectangle(10, 6), sides);
    const xs = g.faces.flatMap((f) => f.polygon.map((p) => p.x));
    expect(Math.min(...xs)).toBeCloseTo(-0.4);
    expect(Math.max(...xs)).toBeCloseTo(10.4);
    // The gable walls stay at the wall line.
    for (const gable of g.gables) {
      const x = gable[0].x;
      expect(Math.abs(x) < 1e-6 || Math.abs(x - 10) < 1e-6).toBe(true);
    }
  });

  it("covers an L with overhang", () => {
    const g = roof(ell, presetSides(ell, "hip", 35, 0.5));
    const total = g.faces.reduce((sum, f) => sum + planArea(f.polygon), 0);
    expect(total).toBeCloseTo(Math.abs(signedArea(g.eaves)), 3);
  });
});

describe("degenerate outlines", () => {
  it("ignores a repeated point", () => {
    const outline = [{ x: 0, y: 0 }, ...rectangle(10, 6)];
    const sides = presetSides(outline, "hip", 30, 0);
    const g = roof(outline, sides);
    expect(g.faces).toHaveLength(4);
    expect(g.top).toBeCloseTo(3 + 3 * tan(30));
    // The faces keep the numbers of the sides of the input. Side 0 has zero length.
    expect(g.faces.map((f) => f.side).sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("flat roofs", () => {
  it("gives a slab with the overhangs", () => {
    const g = roofGeometry({
      outline: rectangle(10, 6),
      sides: presetSides(rectangle(10, 6), "flat", 0, 0.2),
      base: 3,
      flat: true,
      dormers: [],
      windows: [],
    });
    expect(g.faces).toHaveLength(1);
    expect(g.faces[0].side).toBe(-1);
    expect(g.top).toBeCloseTo(3 + FLAT_THICKNESS);
    expect(planArea(g.faces[0].polygon)).toBeCloseTo(10.4 * 6.4);
    expect(g.gables).toHaveLength(4);
  });

  it("turns the sides of the slab of an L outward", () => {
    // The center of the points of the L is in the notch, outside the L.
    const g = roofGeometry({
      outline: ell,
      sides: presetSides(ell, "flat", 0, 0),
      base: 3,
      flat: true,
      dormers: [],
      windows: [],
    });
    expect(g.gables).toHaveLength(6);
    for (const gable of g.gables) {
      const n = worldNormal(gable);
      const length = Math.hypot(n.x, n.z);
      const mid = gable.reduce((s, p) => ({ x: s.x + p.x / 4, y: s.y + p.y / 4 }), { x: 0, y: 0 });
      // A point a bit out along the normal is outside the L.
      const out = { x: mid.x + (0.01 * n.x) / length, y: mid.y + (0.01 * n.z) / length };
      expect(pointInPolygon(out, ell)).toBe(false);
    }
  });
});

describe("dormers and roof windows", () => {
  const outline = rectangle(10, 8);
  const sides = presetSides(outline, "gable", 45, 0);

  for (const kind of ["gable", "shed", "flat"] as const) {
    it(`puts a ${kind} dormer inside its face`, () => {
      const g = roof(outline, sides, {
        dormers: [
          { id: "d", side: 0, offset: 5, distance: 1, width: 2, height: 1.2, kind, pitch: 30 },
        ],
      });
      expect(g.dormers).toHaveLength(1);
      const face = g.faces.find((f) => f.side === 0)!;
      const facePlan = face.polygon.map((p) => ({ x: p.x, y: p.y }));
      const dormer = g.dormers[0];
      for (const p of [...dormer.faces, ...dormer.walls].flat()) {
        expect(pointInPolygon({ x: p.x, y: p.y + 1e-9 }, facePlan) || p.y < 1e-6).toBe(true);
      }
      // The back of the dormer ends on the main face: the face of side 0 has z = 3 + y.
      const back = Math.max(...dormer.faces.flat().map((p) => p.y));
      const atBack = dormer.faces.flat().filter((p) => Math.abs(p.y - back) < 1e-6);
      for (const p of atBack) expect(p.z).toBeCloseTo(3 + p.y);
      expect(g.holes).toHaveLength(1);
      expect(dormer.window).toHaveLength(4);
      for (const wall of dormer.walls) expect(wall.length).toBeGreaterThanOrEqual(3);
      expect(g.top).toBeCloseTo(3 + 4);
    });
  }

  it("puts a roof window in its face, a bit above it", () => {
    const g = roof(outline, sides, {
      windows: [{ id: "w", side: 2, offset: 4, distance: 1, width: 0.8, length: 1.2 }],
    });
    expect(g.windows).toHaveLength(1);
    const face = g.faces.find((f) => f.side === 2)!;
    const facePlan = face.polygon.map((p) => ({ x: p.x, y: p.y }));
    for (const p of g.windows[0].quad) {
      expect(pointInPolygon({ x: p.x, y: p.y }, facePlan)).toBe(true);
      // Side 2 is at y = 8, so the face has z = 3 + (8 − y).
      expect(p.z).toBeCloseTo(3 + (8 - p.y) + 0.02);
    }
    expect(worldNormal(g.windows[0].quad).y).toBeGreaterThan(0);
    // The length goes up the slope: the run on the plan is 1.2 · cos 45°.
    const ys = g.windows[0].quad.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(1.2 * Math.SQRT1_2);
  });

  it("leaves out a dormer and a window that go past the ridge", () => {
    // The ridge is 4 m in from side 0. The dormer is 1.2 m high at 3 m: its back meets the
    // main face only at 4.2 m. The window goes from 3.5 m to 3.5 + 1.2 · cos 45° = 4.35 m.
    const g = roof(outline, sides, {
      dormers: [
        { id: "d", side: 0, offset: 5, distance: 3, width: 2, height: 1.2, kind: "flat", pitch: 0 },
      ],
      windows: [{ id: "w", side: 0, offset: 2, distance: 3.5, width: 0.8, length: 1.2 }],
    });
    expect(g.dormers).toHaveLength(0);
    expect(g.windows).toHaveLength(0);
    expect(g.holes).toHaveLength(0);
    expect(g.misfits).toEqual(["d", "w"]);
  });

  it("counts the offset from the start of the side for an outline in the other direction", () => {
    // Side 2 of the reversed rectangle goes from (10, 0) to (0, 0).
    const reversed = [...outline].reverse();
    const g = roof(reversed, presetSides(reversed, "gable", 45, 0), {
      windows: [{ id: "w", side: 2, offset: 2, distance: 1, width: 0.8, length: 1 }],
    });
    const xs = g.windows[0].quad.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(7.6);
    expect(Math.max(...xs)).toBeCloseTo(8.4);
  });

  it("ignores a dormer on a gable side", () => {
    const g = roof(outline, sides, {
      dormers: [
        { id: "d", side: 1, offset: 4, distance: 1, width: 2, height: 1, kind: "flat", pitch: 0 },
      ],
    });
    expect(g.dormers).toHaveLength(0);
  });
});

describe("more outlines", () => {
  it("handles a T and a U", () => {
    const t: Point[] = [
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 4 },
      { x: 8, y: 4 },
      { x: 8, y: 10 },
      { x: 4, y: 10 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ];
    const u: Point[] = [
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 10 },
      { x: 8, y: 10 },
      { x: 8, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 10 },
      { x: 0, y: 10 },
    ];
    for (const outline of [t, u]) {
      const g = roof(outline, presetSides(outline, "hip", 35, 0));
      const total = g.faces.reduce((sum, f) => sum + planArea(f.polygon), 0);
      expect(total).toBeCloseTo(Math.abs(signedArea(outline)), 3);
      expect(maxZ(g)).toBeCloseTo(3 + 2 * tan(35));
      for (const face of g.faces) expect(worldNormal(face.polygon).y).toBeGreaterThan(0);
    }
  });

  it("handles a slanted quadrilateral", () => {
    const outline: Point[] = [
      { x: 0, y: 0 },
      { x: 9, y: 1 },
      { x: 8, y: 7 },
      { x: 1, y: 6 },
    ];
    const g = roof(outline, presetSides(outline, "hip", 40, 0));
    const total = g.faces.reduce((sum, f) => sum + planArea(f.polygon), 0);
    expect(total).toBeCloseTo(Math.abs(signedArea(outline)), 3);
  });
});

describe("mixed sides", () => {
  it("makes a gable at one end and a hip at the other", () => {
    const outline = rectangle(10, 6);
    const sides = presetSides(outline, "hip", 30, 0);
    sides[1] = { ...sides[1], kind: "gable" };
    const g = roof(outline, sides);
    expect(g.gables).toHaveLength(1);
    expect(g.faces).toHaveLength(3);
    const total = g.faces.reduce((sum, f) => sum + planArea(f.polygon), 0);
    expect(total).toBeCloseTo(60, 4);
    // The ridge reaches the gable at x = 10 and ends 3 m from the hip end at x = 0.
    const ridge = g.faces.flatMap((f) => f.polygon).filter((p) => Math.abs(p.z - maxZ(g)) < 1e-6);
    expect(Math.max(...ridge.map((p) => p.x))).toBeCloseTo(10);
    expect(Math.min(...ridge.map((p) => p.x))).toBeCloseTo(3);
  });

  it("accepts different overhangs on each side", () => {
    const outline = rectangle(10, 6);
    const sides = presetSides(outline, "hip", 35, 0.3);
    sides[0] = { ...sides[0], overhang: 0.8 };
    const g = roof(outline, sides);
    expect(g.faces).toHaveLength(4);
    const ys = g.eaves.map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(-0.8);
    expect(Math.max(...ys)).toBeCloseTo(6.3);
    for (const face of g.faces) expect(worldNormal(face.polygon).y).toBeGreaterThan(0);
  });

  it("covers an octagon with a hip roof", () => {
    const outline: Point[] = Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4 + Math.PI / 8;
      return { x: 5 + 5 * Math.cos(a), y: 5 + 5 * Math.sin(a) };
    });
    const g = roof(outline, presetSides(outline, "hip", 30, 0));
    expect(g.faces).toHaveLength(8);
    const total = g.faces.reduce((sum, f) => sum + planArea(f.polygon), 0);
    expect(total).toBeCloseTo(Math.abs(signedArea(outline)), 3);
    // All faces meet at one apex above the center.
    expect(maxZ(g)).toBeCloseTo(3 + 5 * Math.cos(Math.PI / 8) * tan(30));
  });

  it("gives every face of an L with mixed pitches an upward normal", () => {
    const sides = presetSides(ell, "hip", 35, 0.4);
    sides[0] = { ...sides[0], pitch: 45 };
    sides[3] = { ...sides[3], kind: "gable" };
    const g = roof(ell, sides);
    for (const face of g.faces) expect(worldNormal(face.polygon).y).toBeGreaterThan(0);
    for (const face of g.faces) {
      for (const p of face.polygon) expect(p.z).toBeGreaterThan(3 - 0.4 * tan(45) - 1e-6);
    }
    expect(g.gables.length).toBeGreaterThan(0);
  });
});
