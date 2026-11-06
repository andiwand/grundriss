import { describe, expect, it } from "vitest";
import { parsePlan, serializePlan } from "../src/model/file";
import { addOpening, addVertex, addWall, emptyPlan } from "../src/model/plan";

describe("file format", () => {
  it("reads what it writes", () => {
    const plan = emptyPlan();
    const a = addVertex(plan, { x: 0, y: 0 });
    const b = addVertex(plan, { x: 4, y: 0 });
    const wall = addWall(plan, a.id, b.id)!;
    addOpening(plan, wall.id, "window", 2);
    plan.background = {
      image: "data:image/png;base64,AAAA",
      width: 100,
      height: 50,
      x: 1,
      y: 2,
      scale: 0.01,
      opacity: 0.5,
    };
    expect(parsePlan(serializePlan(plan))).toEqual(plan);
  });

  it("rejects a file that is not JSON", () => {
    expect(() => parsePlan("{")).toThrow("not valid JSON");
  });

  it("rejects a different format", () => {
    expect(() => parsePlan('{"walls": []}')).toThrow("not a Grundriss plan");
  });

  it("rejects an unknown version", () => {
    expect(() => parsePlan('{"format": "grundriss", "version": 99}')).toThrow("version 99");
  });

  it("rejects a wall with a missing vertex", () => {
    const text = JSON.stringify({
      format: "grundriss",
      version: 1,
      vertices: [],
      walls: [{ id: "w", a: "x", b: "y", thickness: 0.2, height: 2.5 }],
    });
    expect(() => parsePlan(text)).toThrow("does not exist");
  });
});
