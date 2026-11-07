import { describe, expect, it } from "vitest";
import { addVertex, addWall, emptyPlan, splitWall } from "../src/model/plan";
import type { Plan } from "../src/model/types";

/** Adds a closed ring of walls through the points. */
function ring(plan: Plan, points: [number, number][]): void {
  const v = points.map(([x, y]) => addVertex(plan, { x, y }));
  for (let i = 0; i < v.length; i++) addWall(plan, v[i].id, v[(i + 1) % v.length].id);
}
import { findRooms, planOutline } from "../src/model/rooms";

describe("findRooms", () => {
  it("finds no room in open walls", () => {
    const plan = emptyPlan();
    const a = addVertex(plan, { x: 0, y: 0 });
    const b = addVertex(plan, { x: 3, y: 0 });
    const c = addVertex(plan, { x: 3, y: 3 });
    addWall(plan, a.id, b.id);
    addWall(plan, b.id, c.id);
    expect(findRooms(plan)).toEqual([]);
  });

  it("finds one room in a rectangle, in both directions of drawing", () => {
    for (const ys of [
      [0, 3],
      [3, 0],
    ]) {
      const plan = emptyPlan();
      const corners = [
        addVertex(plan, { x: 0, y: ys[0] }),
        addVertex(plan, { x: 4, y: ys[0] }),
        addVertex(plan, { x: 4, y: ys[1] }),
        addVertex(plan, { x: 0, y: ys[1] }),
      ];
      for (let i = 0; i < 4; i++) addWall(plan, corners[i].id, corners[(i + 1) % 4].id);
      const rooms = findRooms(plan);
      expect(rooms).toHaveLength(1);
      expect(rooms[0].area).toBeCloseTo(12);
    }
  });

  it("finds two rooms when a wall divides a rectangle", () => {
    const plan = emptyPlan();
    const corners = [
      addVertex(plan, { x: 0, y: 0 }),
      addVertex(plan, { x: 6, y: 0 }),
      addVertex(plan, { x: 6, y: 3 }),
      addVertex(plan, { x: 0, y: 3 }),
    ];
    for (let i = 0; i < 4; i++) addWall(plan, corners[i].id, corners[(i + 1) % 4].id);
    const top = splitWall(plan, plan.walls[0].id, { x: 2, y: 0 });
    const bottom = splitWall(plan, plan.walls.find((w) => w.a === corners[2].id)!.id, {
      x: 2,
      y: 3,
    });
    addWall(plan, top.id, bottom.id);
    const areas = findRooms(plan)
      .map((r) => r.area)
      .sort((p, q) => p - q);
    expect(areas).toHaveLength(2);
    expect(areas[0]).toBeCloseTo(6);
    expect(areas[1]).toBeCloseTo(12);
  });

  it("ignores a wall that sticks into a room", () => {
    const plan = emptyPlan();
    const corners = [
      addVertex(plan, { x: 0, y: 0 }),
      addVertex(plan, { x: 4, y: 0 }),
      addVertex(plan, { x: 4, y: 4 }),
      addVertex(plan, { x: 0, y: 4 }),
    ];
    for (let i = 0; i < 4; i++) addWall(plan, corners[i].id, corners[(i + 1) % 4].id);
    const inside = addVertex(plan, { x: 2, y: 2 });
    addWall(plan, corners[0].id, inside.id);
    const rooms = findRooms(plan);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].area).toBeCloseTo(16);
  });
});

describe("room data", () => {
  it("gives the data of a room inside another room only to the inner room", () => {
    const plan = emptyPlan();
    ring(plan, [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    ring(plan, [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
    ]);
    const inner = findRooms(plan).find((r) => r.area < 5)!;
    plan.rooms.push({
      id: "r-1",
      key: inner.key,
      at: inner.labelAt,
      name: "Shaft",
      height: null,
      floorHeating: false,
      temperature: null,
    });
    const named = findRooms(plan).filter((r) => r.info);
    expect(named).toHaveLength(1);
    expect(named[0].key).toBe(inner.key);
  });
});

describe("planOutline", () => {
  it("gives the outer outline of two rooms side by side", () => {
    const plan = emptyPlan();
    const p = [
      [0, 0],
      [4, 0],
      [8, 0],
      [8, 3],
      [4, 3],
      [0, 3],
    ].map(([x, y]) => addVertex(plan, { x, y }));
    for (let i = 0; i < 6; i++) addWall(plan, p[i].id, p[(i + 1) % 6].id);
    addWall(plan, p[1].id, p[4].id);
    const outline = planOutline(plan)!;
    // The inner wall meets the outer walls at (4, 0) and (4, 3). These corners are on straight
    // sides, so the outline leaves them out: a roof gets one side for each straight run.
    expect(outline).toHaveLength(4);
    expect(outline.some((q) => q.x === 4)).toBe(false);
    const xs = outline.map((q) => q.x);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(8);
  });
});

describe("planOutline with a wall that sticks out", () => {
  it("leaves out the free end of the wall", () => {
    const plan = emptyPlan();
    ring(plan, [
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ]);
    const corner = plan.vertices[1];
    const end = addVertex(plan, { x: 6, y: -1 });
    addWall(plan, corner.id, end.id);
    const outline = planOutline(plan)!;
    expect(outline).toHaveLength(4);
    expect(outline.some((p) => p.x === 6)).toBe(false);
  });
});
