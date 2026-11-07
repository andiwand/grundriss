import { describe, expect, it } from "vitest";
import {
  addDimension,
  addOpening,
  addStair,
  addVertex,
  addWall,
  copyItems,
  emptyPlan,
  moveFromOrigin,
  moveOrigin,
  pasteClip,
  removeItems,
  wallMoveTargets,
} from "../src/model/plan";
import type { Plan, Point } from "../src/model/types";

/** A square room of 4 × 4 m with the corners v0 (0, 0), v1 (4, 0), v2 (4, 4), v3 (0, 4). */
function square(): Plan {
  const plan = emptyPlan();
  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ];
  const vertices = corners.map((p) => addVertex(plan, p));
  for (let i = 0; i < 4; i++) addWall(plan, vertices[i].id, vertices[(i + 1) % 4].id);
  return plan;
}

describe("copy and paste", () => {
  it("copies the selected walls with their vertices and openings", () => {
    const plan = square();
    const wall = plan.walls[0];
    addOpening(plan, wall.id, "door", 2);
    const clip = copyItems(plan, [{ kind: "wall", id: wall.id }]);
    expect(clip.walls).toHaveLength(1);
    expect(clip.vertices).toHaveLength(2);
    expect(clip.openings).toHaveLength(1);

    const items = pasteClip(plan, clip, { x: 0, y: 10 });
    expect(plan.walls).toHaveLength(5);
    expect(plan.vertices).toHaveLength(6);
    expect(plan.openings).toHaveLength(2);
    expect(items.filter((i) => i.kind === "wall")).toHaveLength(1);
    const pasted = plan.walls[4];
    expect(pasted.id).not.toBe(wall.id);
    expect(plan.vertices.find((v) => v.id === pasted.a)).toMatchObject({ x: 0, y: 10 });
    expect(plan.openings[1].wallId).toBe(pasted.id);
  });

  it("copies the walls between two selected vertices", () => {
    const plan = square();
    const items = plan.vertices.slice(0, 2).map((v) => ({ kind: "vertex" as const, id: v.id }));
    expect(copyItems(plan, items).walls).toHaveLength(1);
  });

  it("copies dimension lines", () => {
    const plan = square();
    const dimension = addDimension(plan, { x: 0, y: 0 }, { x: 4, y: 0 }, 1);
    const clip = copyItems(plan, [{ kind: "dimension", id: dimension.id }]);
    pasteClip(plan, clip, { x: 1, y: 1 });
    expect(plan.dimensions[1]).toMatchObject({ a: { x: 1, y: 1 }, b: { x: 5, y: 1 }, offset: 1 });
  });

  it("keeps the kind and the second flight of a pasted stair", () => {
    const plan = square();
    const stair = addStair(plan, { x: 1, y: 1 }, { x: 3, y: 1 });
    Object.assign(stair, { kind: "u", turn: -1, run2: 1.7 });
    const clip = copyItems(plan, [{ kind: "stair", id: stair.id }]);
    pasteClip(plan, clip, { x: 0, y: 1 });
    expect(plan.stairs[1]).toMatchObject({ kind: "u", turn: -1, run2: 1.7, a: { x: 1, y: 2 } });
    expect(plan.stairs[1].id).not.toBe(stair.id);
  });
});

describe("move and remove", () => {
  it("moves the vertices of the selected walls and the dimension lines", () => {
    const plan = square();
    const dimension = addDimension(plan, { x: 0, y: 0 }, { x: 4, y: 0 }, 1);
    const items = [
      { kind: "wall" as const, id: plan.walls[0].id },
      { kind: "dimension" as const, id: dimension.id },
    ];
    moveFromOrigin(plan, moveOrigin(plan, items), { x: 0, y: -1 });
    expect(plan.vertices[0]).toMatchObject({ x: 0, y: -1 });
    expect(plan.vertices[1]).toMatchObject({ x: 4, y: -1 });
    expect(plan.vertices[2]).toMatchObject({ x: 4, y: 4 });
    expect(plan.dimensions[0].a).toEqual({ x: 0, y: -1 });
  });

  it("removes more than one item", () => {
    const plan = square();
    removeItems(plan, [
      { kind: "wall", id: plan.walls[0].id },
      { kind: "wall", id: plan.walls[1].id },
    ]);
    expect(plan.walls).toHaveLength(2);
  });
});

describe("wall move that keeps the angles", () => {
  it("slides the ends along the next walls", () => {
    const plan = square();
    // The top wall from (0, 0) to (4, 0). A shift of -1 moves it up, to y = -1.
    const [a, b] = wallMoveTargets(
      plan,
      plan.walls[0].id,
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ],
      -1,
    );
    expect(a.x).toBeCloseTo(0);
    expect(a.y).toBeCloseTo(-1);
    expect(b.x).toBeCloseTo(4);
    expect(b.y).toBeCloseTo(-1);
  });

  it("keeps the angle of a slanted next wall", () => {
    const plan = emptyPlan();
    const v0 = addVertex(plan, { x: 0, y: 4 });
    const v1 = addVertex(plan, { x: 2, y: 0 });
    const v2 = addVertex(plan, { x: 6, y: 0 });
    addWall(plan, v0.id, v1.id);
    const top = addWall(plan, v1.id, v2.id)!;
    // The top wall moves down by 1 m. Its end v1 slides along the wall from v0 to v1.
    const [a] = wallMoveTargets(
      plan,
      top.id,
      [
        { x: 2, y: 0 },
        { x: 6, y: 0 },
      ],
      1,
    );
    expect(a.y).toBeCloseTo(1);
    expect(a.x).toBeCloseTo(1.5);
  });
});
