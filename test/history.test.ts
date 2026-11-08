import { describe, expect, it } from "vitest";
import { copyTree, HISTORY_LIMIT, PlanDocument } from "../src/model/history";
import { addVertex, getVertex } from "../src/model/plan";

describe("PlanDocument", () => {
  it("undoes and redoes an edit", () => {
    const doc = new PlanDocument();
    doc.edit((plan) => addVertex(plan, { x: 1, y: 2 }));
    expect(doc.plan.vertices).toHaveLength(1);
    doc.undo();
    expect(doc.plan.vertices).toHaveLength(0);
    doc.redo();
    expect(doc.plan.vertices).toHaveLength(1);
  });

  it("makes one entry for a drag with many updates", () => {
    const doc = new PlanDocument();
    let id = "";
    doc.edit((plan) => (id = addVertex(plan, { x: 0, y: 0 }).id));
    doc.begin();
    for (let x = 1; x <= 5; x++) doc.update((plan) => (getVertex(plan, id).x = x));
    doc.commit();
    expect(getVertex(doc.plan, id).x).toBe(5);
    doc.undo();
    expect(getVertex(doc.plan, id).x).toBe(0);
  });

  it("makes no entry for a drag that ends where it started", () => {
    const doc = new PlanDocument();
    let id = "";
    doc.edit((plan) => (id = addVertex(plan, { x: 0, y: 0 }).id));
    const before = doc.building;
    doc.begin();
    doc.update((plan) => (getVertex(plan, id).x = 3));
    doc.update((plan) => (getVertex(plan, id).x = 0));
    doc.commit();
    expect(doc.building).toBe(before);
    doc.undo();
    expect(doc.plan.vertices).toHaveLength(0);
  });

  it("makes no entry for a transaction without changes", () => {
    const doc = new PlanDocument();
    doc.begin();
    doc.commit();
    expect(doc.canUndo).toBe(false);
    expect(doc.dirty).toBe(false);
  });

  it("is not dirty after an undo back to the saved plan", () => {
    const doc = new PlanDocument();
    doc.edit((plan) => addVertex(plan, { x: 0, y: 0 }));
    doc.markSaved();
    doc.edit((plan) => addVertex(plan, { x: 1, y: 0 }));
    expect(doc.dirty).toBe(true);
    doc.undo();
    expect(doc.dirty).toBe(false);
  });

  it("drops the changes of a cancelled transaction", () => {
    const doc = new PlanDocument();
    doc.begin();
    doc.update((plan) => addVertex(plan, { x: 0, y: 0 }));
    doc.cancel();
    expect(doc.plan.vertices).toHaveLength(0);
    expect(doc.canUndo).toBe(false);
  });

  it("makes no entry if editIf gives false, and drops the change", () => {
    const doc = new PlanDocument();
    const before = doc.building;
    const changed = doc.editIf((plan) => {
      addVertex(plan, { x: 0, y: 0 });
      return false;
    });
    expect(changed).toBe(false);
    expect(doc.building).toBe(before);
    expect(doc.plan.vertices).toHaveLength(0);
    expect(doc.canUndo).toBe(false);
    expect(doc.dirty).toBe(false);
  });

  it("makes one entry if editIf gives true", () => {
    const doc = new PlanDocument();
    expect(doc.editIf((plan) => !!addVertex(plan, { x: 0, y: 0 }))).toBe(true);
    expect(doc.plan.vertices).toHaveLength(1);
    doc.undo();
    expect(doc.plan.vertices).toHaveLength(0);
    expect(doc.canUndo).toBe(false);
  });
});

describe("history: limit, copies, and the end of a drag", () => {
  it("keeps at most HISTORY_LIMIT entries", () => {
    const doc = new PlanDocument();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) doc.editBuilding((b) => (b.north = i));
    let undos = 0;
    while (doc.canUndo) {
      doc.undo();
      undos++;
    }
    expect(undos).toBe(HISTORY_LIMIT);
    expect(doc.building.north).toBe(19);
  });

  it("copies the objects but keeps the same content", () => {
    const original = { a: [1, { b: "x".repeat(1000) }], c: null, d: true };
    const copy = copyTree(original);
    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    expect(copy.a).not.toBe(original.a);
    expect(copy.a[1]).not.toBe(original.a[1]);
  });

  it("finds no change after a drag back to the start, also with a large image", () => {
    const doc = new PlanDocument();
    doc.editBuilding((b) => {
      b.stories[0].background = {
        image: `data:image/png;base64,${"A".repeat(100000)}`,
        width: 10,
        height: 10,
        x: 0,
        y: 0,
        scale: 1,
        opacity: 0.5,
      };
    });
    const before = doc.building;
    doc.begin();
    doc.updateBuilding((b) => (b.stories[0].background!.x = 5));
    doc.updateBuilding((b) => (b.stories[0].background!.x = 0));
    doc.commit();
    expect(doc.building).toBe(before);
  });
});
