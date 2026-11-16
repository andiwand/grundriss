import { describe, expect, it } from "vitest";
import { emptyBuilding } from "../src/model/building";
import { parseBuilding, serializeBuilding } from "../src/model/file";
import { copyTree, PlanDocument, sameTree } from "../src/model/history";
import { applyPatch, diffBuildings, diffTree, patchBuilding, rebase } from "../src/model/patch";
import { addOpening, addVertex, addWall, removeVertex } from "../src/model/plan";
import type { Building } from "../src/model/types";

/** A building with one wall from (0,0) to (4,0) on the first story. */
function oneWall(): { building: Building; wall: string; a: string; b: string } {
  const building = emptyBuilding();
  const plan = building.stories[0];
  const a = addVertex(plan, { x: 0, y: 0 });
  const b = addVertex(plan, { x: 4, y: 0 });
  const wall = addWall(plan, a.id, b.id)!;
  return { building, wall: wall.id, a: a.id, b: b.id };
}

/** A copy of the building after a change of its first story. */
function edited(building: Building, edit: (b: Building) => void): Building {
  const copy = copyTree(building);
  edit(copy);
  return copy;
}

describe("patches", () => {
  it("gives no patch for the same data, and the patch makes the target", () => {
    const from = { a: 1, list: [{ id: "x", n: 1 }], points: [{ x: 0, y: 0 }] };
    expect(diffTree(from, copyTree(from))).toBeUndefined();
    const to = {
      a: 2,
      list: [
        { id: "x", n: 3 },
        { id: "y", n: 1 },
      ],
      points: [{ x: 1, y: 0 }],
    };
    const patch = diffTree(from, to);
    expect(sameTree(applyPatch(from, patch), to)).toBe(true);
    // The source does not change.
    expect(from.a).toBe(1);
  });

  it("names objects by id, so a patch applies after other changes of the list", () => {
    const base = {
      list: [
        { id: "a", n: 1 },
        { id: "b", n: 1 },
      ],
    };
    const mine = diffTree(base, {
      list: [
        { id: "a", n: 1 },
        { id: "b", n: 2 },
      ],
    });
    const theirs = {
      list: [
        { id: "c", n: 0 },
        { id: "a", n: 5 },
        { id: "b", n: 1 },
      ],
    };
    expect(applyPatch(theirs, mine)).toEqual({
      list: [
        { id: "c", n: 0 },
        { id: "a", n: 5 },
        { id: "b", n: 2 },
      ],
    });
  });

  it("keeps a new order and puts the new objects of others after it", () => {
    const base = { list: [{ id: "a" }, { id: "b" }] };
    const mine = diffTree(base, { list: [{ id: "b" }, { id: "a" }] });
    expect(applyPatch({ list: [{ id: "a" }, { id: "c" }, { id: "b" }] }, mine)).toEqual({
      list: [{ id: "b" }, { id: "a" }, { id: "c" }],
    });
  });

  it("does nothing to an object that another person removed", () => {
    const base = { list: [{ id: "a", n: 1 }], box: { x: 1 } };
    const mine = diffTree(base, { list: [{ id: "a", n: 2 }], box: { x: 2 } });
    expect(applyPatch({ list: [], box: null }, mine)).toEqual({ list: [], box: null });
  });

  it("merges the changes of two people on one plan", () => {
    const { building, wall, a } = oneWall();
    // One person moves the corner, the other puts a door in the wall.
    const moved = edited(building, (b) => {
      b.stories[0].vertices.find((v) => v.id === a)!.y = 1;
    });
    const door = edited(building, (b) => {
      addOpening(b.stories[0], wall, "door", 1);
    });
    const merged = rebase(building, door, moved);
    expect(merged.stories[0].vertices.find((v) => v.id === a)!.y).toBe(1);
    expect(merged.stories[0].openings).toHaveLength(1);
  });

  it("removes a wall whose corner another person removed", () => {
    const { building, a, b } = oneWall();
    // A second wall at b, so that b stays when a goes.
    const d = addVertex(building.stories[0], { x: 4, y: 4 });
    addWall(building.stories[0], b, d.id);
    const removed = edited(building, (x) => removeVertex(x.stories[0], a));
    const added = edited(building, (x) => {
      const plan = x.stories[0];
      const c = addVertex(plan, { x: 0, y: 4 });
      addWall(plan, a, c.id);
      addWall(plan, b, c.id);
    });
    const merged = rebase(building, added, removed);
    const plan = merged.stories[0];
    expect(plan.vertices.some((v) => v.id === a)).toBe(false);
    // The wall to the removed corner goes; the wall between the corners that stay remains.
    expect(plan.walls).toHaveLength(2);
    expect(() => parseBuilding(serializeBuilding(merged))).not.toThrow();
  });

  it("applies the same patch to the plan that the server reads from its file", () => {
    const { building, wall } = oneWall();
    const after = edited(building, (b) => {
      addOpening(b.stories[0], wall, "window", 2);
      b.north = 20;
    });
    const patch = JSON.parse(JSON.stringify(diffBuildings(building, after)));
    const server = patchBuilding(parseBuilding(serializeBuilding(building)), patch);
    expect(sameTree(server.stories, after.stories)).toBe(true);
    expect(server.north).toBe(20);
  });
});

describe("the history with the changes of others", () => {
  it("undoes and redoes only the own change", () => {
    const { building, a, b } = oneWall();
    const doc = new PlanDocument(building);
    doc.edit((plan) => {
      plan.vertices.find((v) => v.id === a)!.x = -1;
    });
    // Another person moves the other corner.
    doc.applyRemote(
      edited(doc.building, (x) => {
        x.stories[0].vertices.find((v) => v.id === b)!.x = 5;
      }),
    );
    doc.undo();
    const vertex = (id: string) => doc.plan.vertices.find((v) => v.id === id)!;
    expect(vertex(a).x).toBe(0);
    expect(vertex(b).x).toBe(5);
    doc.redo();
    expect(vertex(a).x).toBe(-1);
    expect(vertex(b).x).toBe(5);
  });

  it("keeps the snapshots of the history without the changes of others", () => {
    const doc = new PlanDocument();
    doc.edit((plan) => addVertex(plan, { x: 1, y: 1 }));
    const after = doc.building;
    doc.undo();
    doc.redo();
    // Without other changes, redo gives back the same object, so the saved state stays exact.
    expect(doc.building).toBe(after);
  });
});
