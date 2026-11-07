import { describe, expect, it } from "vitest";
import { closestOnSegment, signedArea } from "../src/model/geometry";
import {
  addOpening,
  addVertex,
  addWall,
  emptyPlan,
  mergeVertex,
  removeVertex,
  removeWall,
  setWallLength,
  splitWall,
  wallExtents,
} from "../src/model/plan";
import type { Plan } from "../src/model/types";

/** A plan with the corners of a rectangle and its four walls. */
function rectangle(width: number, height: number): Plan {
  const plan = emptyPlan();
  const corners = [
    addVertex(plan, { x: 0, y: 0 }),
    addVertex(plan, { x: width, y: 0 }),
    addVertex(plan, { x: width, y: height }),
    addVertex(plan, { x: 0, y: height }),
  ];
  for (let i = 0; i < 4; i++) addWall(plan, corners[i].id, corners[(i + 1) % 4].id);
  return plan;
}

describe("geometry", () => {
  it("finds the nearest point on a segment", () => {
    const hit = closestOnSegment({ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 4, y: 0 });
    expect(hit.t).toBeCloseTo(0.25);
    expect(hit.distance).toBeCloseTo(1);
  });

  it("clamps to the ends of the segment", () => {
    expect(closestOnSegment({ x: -3, y: 0 }, { x: 0, y: 0 }, { x: 4, y: 0 }).t).toBe(0);
  });

  it("calculates the signed area", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    expect(signedArea(square)).toBeCloseTo(4);
    expect(signedArea([...square].reverse())).toBeCloseTo(-4);
  });
});

describe("plan", () => {
  it("does not add a wall twice", () => {
    const plan = rectangle(4, 3);
    expect(addWall(plan, plan.walls[0].b, plan.walls[0].a)).toBeNull();
    expect(plan.walls).toHaveLength(4);
  });

  it("splits a wall and keeps the openings in their places", () => {
    const plan = rectangle(4, 3);
    const wall = plan.walls[0];
    const near = addOpening(plan, wall.id, "door", 1);
    const far = addOpening(plan, wall.id, "window", 3);
    const vertex = splitWall(plan, wall.id, { x: 2, y: 0.1 });
    expect(vertex).toMatchObject({ x: 2, y: 0 });
    expect(plan.walls).toHaveLength(5);
    expect(plan.walls.some((w) => w.id === wall.id)).toBe(false);
    expect(near.offset).toBeCloseTo(1);
    expect(far.offset).toBeCloseTo(1);
    expect(near.wallId).not.toBe(far.wallId);
  });

  it("removes a wall with its openings and the free vertices", () => {
    const plan = emptyPlan();
    const a = addVertex(plan, { x: 0, y: 0 });
    const b = addVertex(plan, { x: 3, y: 0 });
    const wall = addWall(plan, a.id, b.id)!;
    addOpening(plan, wall.id, "door", 1.5);
    removeWall(plan, wall.id);
    expect(plan).toEqual(emptyPlan());
  });

  it("removes a vertex with its walls", () => {
    const plan = rectangle(4, 3);
    removeVertex(plan, plan.vertices[0].id);
    expect(plan.vertices).toHaveLength(3);
    expect(plan.walls).toHaveLength(2);
  });

  it("merges a vertex and removes the walls that collapse", () => {
    const plan = rectangle(4, 3);
    const [a, b] = plan.vertices;
    mergeVertex(plan, b.id, a.id);
    expect(plan.vertices).toHaveLength(3);
    expect(plan.walls).toHaveLength(3);
    expect(plan.walls.every((w) => w.a !== w.b)).toBe(true);
  });

  it("moves the openings of a copy of a wall to the wall that stays", () => {
    const plan = emptyPlan();
    const a = addVertex(plan, { x: 0, y: 0 });
    const b = addVertex(plan, { x: 4, y: 0 });
    const c = addVertex(plan, { x: 4, y: 0.1 });
    const kept = addWall(plan, a.id, b.id)!;
    // The copy goes from c to a, so it has the direction opposite to the kept wall.
    const copy = addWall(plan, c.id, a.id)!;
    const door = addOpening(plan, copy.id, "door", 1);
    door.hinge = "a";
    door.swing = 1;
    const window = addOpening(plan, copy.id, "window", 3.9);
    const before = window.offset;
    mergeVertex(plan, c.id, b.id);
    expect(plan.walls).toEqual([kept]);
    expect(plan.openings).toHaveLength(2);
    expect(door.wallId).toBe(kept.id);
    expect(door.offset).toBeCloseTo(3);
    expect(door.hinge).toBe("b");
    expect(door.swing).toBe(-1);
    // The offset of the window counts from the other end now.
    expect(window.wallId).toBe(kept.id);
    expect(window.offset).toBeCloseTo(4 - before, 2);
  });

  it("keeps the offset of an opening on a copy in the same direction", () => {
    const plan = emptyPlan();
    const a = addVertex(plan, { x: 0, y: 0 });
    const b = addVertex(plan, { x: 4, y: 0 });
    const c = addVertex(plan, { x: 4, y: 0.1 });
    const kept = addWall(plan, a.id, b.id)!;
    const copy = addWall(plan, a.id, c.id)!;
    const door = addOpening(plan, copy.id, "door", 1);
    mergeVertex(plan, c.id, b.id);
    expect(plan.walls).toEqual([kept]);
    expect(door.wallId).toBe(kept.id);
    expect(door.offset).toBeCloseTo(1);
    expect(door.hinge).toBe("a");
  });

  it("extends a wall at the corners only", () => {
    const plan = emptyPlan();
    const a = addVertex(plan, { x: 0, y: 0 });
    const b = addVertex(plan, { x: 4, y: 0 });
    const c = addVertex(plan, { x: 4, y: 3 });
    const first = addWall(plan, a.id, b.id)!;
    addWall(plan, b.id, c.id);
    expect(wallExtents(plan, first)).toEqual({ start: 0, end: 4 + first.thickness / 2 });
  });

  it("keeps an opening inside its wall", () => {
    const plan = rectangle(4, 3);
    const door = addOpening(plan, plan.walls[0].id, "door", 10);
    expect(door.offset).toBeCloseTo(4 - door.width / 2);
  });

  it("does not change a wall to a length of zero", () => {
    const plan = rectangle(4, 3);
    setWallLength(plan, plan.walls[0].id, 0);
    expect(plan.vertices[1]).toMatchObject({ x: 4, y: 0 });
    setWallLength(plan, plan.walls[0].id, 2);
    expect(plan.vertices[1]).toMatchObject({ x: 2, y: 0 });
  });
});
