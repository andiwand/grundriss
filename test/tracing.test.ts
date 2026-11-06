import { describe, expect, it } from "vitest";
import { addVertex, addWall, emptyPlan, wallEnds } from "../src/model/plan";
import {
  addWallSegments,
  joinCorners,
  mergeSegments,
  orderCorners,
  snapToAxis,
  toWorld,
  type WallSegment,
} from "../src/tracing/segments";

const seg = (ax: number, ay: number, bx: number, by: number, thickness = 10): WallSegment => ({
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  thickness,
});

/** The ends of the segment as a sorted string, so that a test does not depend on the order. */
const key = (s: WallSegment) =>
  [s.a, s.b]
    .map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)
    .sort()
    .join(" ");

describe("snapToAxis", () => {
  it("makes a nearly horizontal segment horizontal", () => {
    const s = snapToAxis(seg(0, 10, 100, 12), 0.05);
    expect(s.a.y).toBe(11);
    expect(s.b.y).toBe(11);
  });

  it("keeps a diagonal segment", () => {
    const s = snapToAxis(seg(0, 0, 100, 100), 0.05);
    expect(s.b).toEqual({ x: 100, y: 100 });
  });
});

describe("mergeSegments", () => {
  it("merges parallel parts of one thick line", () => {
    // HoughLinesP gives some lines across the thickness of a wall.
    const result = mergeSegments([
      seg(0, 98, 200, 98),
      seg(5, 102, 210, 102),
      seg(0, 100, 190, 101),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].a.y).toBeCloseTo(result[0].b.y);
    expect(Math.abs(result[0].a.y - 100)).toBeLessThan(2);
    expect(Math.min(result[0].a.x, result[0].b.x)).toBe(0);
    expect(Math.max(result[0].a.x, result[0].b.x)).toBe(210);
  });

  it("closes a small gap but keeps a large gap", () => {
    expect(mergeSegments([seg(0, 0, 100, 0), seg(105, 0, 200, 0)], { gap: 10 })).toHaveLength(1);
    expect(mergeSegments([seg(0, 0, 100, 0), seg(150, 0, 250, 0)], { gap: 10 })).toHaveLength(2);
  });

  it("keeps parallel walls apart", () => {
    expect(mergeSegments([seg(0, 0, 100, 0), seg(0, 50, 100, 50)])).toHaveLength(2);
  });

  it("drops short segments", () => {
    expect(mergeSegments([seg(0, 0, 10, 0)], { minLength: 20 })).toHaveLength(0);
  });

  it("merges diagonal segments", () => {
    const result = mergeSegments([seg(0, 0, 100, 100), seg(102, 101, 200, 200)]);
    expect(result).toHaveLength(1);
  });
});

describe("joinCorners", () => {
  it("makes the ends of an L meet", () => {
    // The horizontal wall is too long, and the vertical wall is too short.
    const result = joinCorners([seg(0, 0, 105, 0), seg(100, 4, 100, 100)], 8);
    expect(result.map(key).sort()).toEqual(["0,0 100,0", "100,0 100,100"]);
  });

  it("splits the wall at a T junction", () => {
    const result = joinCorners([seg(0, 0, 200, 0), seg(100, 5, 100, 100)], 8);
    expect(result.map(key).sort()).toEqual(["0,0 100,0", "100,0 100,100", "100,0 200,0"]);
  });

  it("splits both walls at an X junction", () => {
    const result = joinCorners([seg(0, 50, 100, 50), seg(50, 0, 50, 100)], 8);
    expect(result).toHaveLength(4);
  });

  it("does not join ends that are far away", () => {
    const result = joinCorners([seg(0, 0, 50, 0), seg(100, 30, 100, 100)], 8);
    expect(result.map(key).sort()).toEqual(["0,0 50,0", "100,100 100,30"]);
  });
});

describe("toWorld", () => {
  it("uses the position and the scale of the background", () => {
    const [s] = toWorld([seg(100, 200, 300, 200, 20)], { x: 1, y: 2, scale: 0.01 });
    expect(s.a).toEqual({ x: 2, y: 4 });
    expect(s.b).toEqual({ x: 4, y: 4 });
    expect(s.thickness).toBeCloseTo(0.2);
  });
});

describe("addWallSegments", () => {
  const options = { tolerance: 0.1, height: 2.5 };

  it("makes a rectangle of four noisy segments into four walls with four corners", () => {
    const noisy = [
      seg(0, 0.02, 4, -0.01, 0.24),
      seg(4.03, 0, 3.98, 3, 0.24),
      seg(4, 3.01, 0, 2.97, 0.24),
      seg(0.01, 3, -0.02, 0.03, 0.24),
    ];
    const plan = emptyPlan();
    const ids = addWallSegments(plan, noisy, options);
    expect(ids).toHaveLength(4);
    expect(plan.walls).toHaveLength(4);
    expect(plan.vertices).toHaveLength(4);
    expect(plan.walls.every((w) => w.thickness === 0.24 && w.height === 2.5)).toBe(true);
  });

  it("clamps the thickness", () => {
    const plan = emptyPlan();
    addWallSegments(plan, [seg(0, 0, 4, 0, 0.01), seg(0, 1, 4, 1, 2)], options);
    expect(plan.walls.map((w) => w.thickness)).toEqual([0.05, 0.6]);
  });

  it("splits an existing wall where a new wall ends on it", () => {
    const plan = emptyPlan();
    const a = addVertex(plan, { x: 0, y: 0 });
    const b = addVertex(plan, { x: 4, y: 0 });
    addWall(plan, a.id, b.id);
    const ids = addWallSegments(plan, [seg(2, 0.05, 2, 3, 0.2)], options);
    expect(ids).toHaveLength(1);
    expect(plan.walls).toHaveLength(3);
    const [start] = wallEnds(
      plan,
      plan.walls.find((w) => w.id === ids[0])!,
    );
    expect(start).toMatchObject({ x: 2, y: 0 });
  });

  it("splits a new wall where an existing vertex is on it", () => {
    const plan = emptyPlan();
    const a = addVertex(plan, { x: 2, y: 0 });
    const b = addVertex(plan, { x: 2, y: 3 });
    addWall(plan, a.id, b.id);
    const ids = addWallSegments(plan, [seg(0, 0.02, 4, 0.02, 0.2)], options);
    expect(ids).toHaveLength(2);
    expect(plan.walls).toHaveLength(3);
    expect(plan.vertices).toHaveLength(4);
  });

  it("uses an existing vertex", () => {
    const plan = emptyPlan();
    const a = addVertex(plan, { x: 0, y: 0 });
    addWallSegments(plan, [seg(0.03, 0, 4, 0, 0.2)], options);
    expect(plan.vertices).toHaveLength(2);
    expect(plan.walls[0].a).toBe(a.id);
  });

  it("does not add a wall twice", () => {
    const plan = emptyPlan();
    const ids = addWallSegments(plan, [seg(0, 0, 4, 0, 0.2), seg(4, 0, 0, 0, 0.2)], options);
    expect(ids).toHaveLength(1);
  });
});

describe("orderCorners", () => {
  it("sorts the corners of a tilted photo", () => {
    const tl = { x: 12, y: 30 };
    const tr = { x: 410, y: 5 };
    const br = { x: 430, y: 320 };
    const bl = { x: 0, y: 300 };
    expect(orderCorners([br, tl, bl, tr])).toEqual([tl, tr, br, bl]);
    expect(orderCorners([bl, br, tr, tl])).toEqual([tl, tr, br, bl]);
  });
});
