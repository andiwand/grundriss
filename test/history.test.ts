import { describe, expect, it } from "vitest";
import { PlanDocument } from "../src/model/history";
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
});
