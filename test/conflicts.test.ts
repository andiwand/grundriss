import { describe, expect, it } from "vitest";
import { conflictIds, planConflicts } from "../src/model/conflicts";
import { newFurniture } from "../src/model/furniture";
import { freeOffset, freeRange, roomSide } from "../src/model/openings";
import { addOpening, addVertex, addWall, emptyPlan } from "../src/model/plan";
import type { Plan } from "../src/model/types";

/** A room of 4 × 3 m on the center lines, with walls of 0.2 m. */
function room(): Plan {
  const plan = emptyPlan();
  const v = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
    { x: 0, y: 3 },
  ].map((p) => addVertex(plan, p));
  for (let i = 0; i < 4; i++) {
    addWall(plan, v[i].id, v[(i + 1) % 4].id, { thickness: 0.2, height: 2.5 });
  }
  return plan;
}

describe("the place of an opening", () => {
  it("keeps an opening out of the corners", () => {
    const plan = room();
    const [lo, hi] = freeRange(plan, plan.walls[0]);
    expect(lo).toBeCloseTo(0.1);
    expect(hi).toBeCloseTo(3.9);
  });

  it("moves an opening to the nearest free place next to the other openings", () => {
    const plan = room();
    const wall = plan.walls[0];
    addOpening(plan, wall.id, "window", 2);
    const door = addOpening(plan, wall.id, "door", 2.2);
    // The window goes from 1.4 to 2.6, so the door (0.9 wide) fits right of it at 3.05.
    expect(freeOffset(plan, door, 2.2)).toBeCloseTo(3.05);
    expect(freeOffset(plan, door, 1.6)).toBeCloseTo(0.95);
    // Too wide for both gaps: the door stays where it is, inside the wall.
    door.width = 1.5;
    expect(freeOffset(plan, door, 2.2)).toBeCloseTo(2.2);
  });

  it("finds the side of the room", () => {
    const plan = room();
    // The wall goes from (0, 0) to (4, 0), so its right side (+y) is inside the room.
    const window = addOpening(plan, plan.walls[0].id, "window", 2);
    expect(roomSide(plan, window)).toBe(1);
  });
});

describe("conflicts", () => {
  it("finds two openings that overlap, and an opening in the corner", () => {
    const plan = room();
    const wall = plan.walls[0];
    const a = addOpening(plan, wall.id, "window", 2);
    const b = addOpening(plan, wall.id, "window", 2);
    // Fixed glass, so that the leaves do not hit each other too.
    a.style = b.style = "fixed";
    b.offset = 2.5;
    const kinds = planConflicts(plan).map((c) => c.kind);
    expect(kinds).toEqual(["overlap"]);
    a.offset = 0.6;
    b.offset = 3;
    expect(planConflicts(plan).map((c) => c.kind)).toEqual(["corner"]);
  });

  it("finds an opening that is higher than its wall", () => {
    const plan = room();
    const door = addOpening(plan, plan.walls[0].id, "door", 2);
    door.height = 2.6;
    expect(planConflicts(plan).map((c) => c.kind)).toEqual(["too-high"]);
  });

  it("finds furniture in a wall, on another piece, and in the way of a door", () => {
    const plan = room();
    const sofa = newFurniture({ kind: "generic", type: "sofa" }, { x: 2, y: 1.5 });
    plan.furniture.push(sofa);
    expect(planConflicts(plan)).toEqual([]);
    // Into the wall at y = 0.
    sofa.y = 0.3;
    expect(planConflicts(plan)).toEqual([
      {
        kind: "overlap",
        a: { kind: "furniture", id: sofa.id },
        b: expect.objectContaining({ kind: "wall" }),
      },
    ]);
    sofa.y = 1.5;
    const shelf = newFurniture({ kind: "generic", type: "shelf" }, { x: 2.5, y: 1.5 });
    plan.furniture.push(shelf);
    expect(planConflicts(plan).map((c) => c.kind)).toEqual(["overlap"]);
    plan.furniture.pop();
    // The door opens into the room (+y), and its leaf sweeps to y = 1. The sofa is in its way.
    addOpening(plan, plan.walls[0].id, "door", 2);
    sofa.y = 0.8;
    const conflicts = planConflicts(plan);
    expect(conflicts.map((c) => c.kind)).toEqual(["swing"]);
    expect(conflictIds(conflicts).has(sofa.id)).toBe(true);
  });

  it("lets a chair stand under a table, and a low piece under a window", () => {
    const plan = room();
    const sideboard = newFurniture({ kind: "generic", type: "sideboard" }, { x: 2, y: 0.4 });
    plan.furniture.push(
      newFurniture({ kind: "generic", type: "table" }, { x: 2, y: 2 }),
      newFurniture({ kind: "generic", type: "chair" }, { x: 2, y: 1.6 }),
      sideboard,
    );
    const window = addOpening(plan, plan.walls[0].id, "window", 2);
    window.sill = 1;
    expect(planConflicts(plan)).toEqual([]);
    window.sill = 0.5;
    expect(planConflicts(plan)).toEqual([
      {
        kind: "swing",
        a: { kind: "opening", id: window.id },
        b: { kind: "furniture", id: sideboard.id },
      },
    ]);
  });
});
