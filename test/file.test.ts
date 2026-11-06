import { describe, expect, it } from "vitest";
import { addCellar, addStoryOnTop, defaultRoof, emptyBuilding } from "../src/model/building";
import { parseBuilding, serializeBuilding } from "../src/model/file";
import type { Plan } from "../src/model/types";

/** Reads a file of version 1 and gives the plan of its only story. */
function parsePlan(text: string): Plan {
  const building = parseBuilding(text);
  expect(building.stories).toHaveLength(1);
  const {
    id: _id,
    name: _name,
    elevation: _elevation,
    height: _height,
    ...plan
  } = building.stories[0];
  return plan;
}

/** Writes the plan as a file of version 1, as the old app did. */
const serializePlan = (plan: Plan) => JSON.stringify({ format: "grundriss", version: 1, ...plan });
import {
  addChimney,
  addDimension,
  addOpening,
  addStair,
  addVertex,
  addWall,
  emptyPlan,
} from "../src/model/plan";

describe("file format", () => {
  it("reads what it writes", () => {
    const plan = emptyPlan();
    const a = addVertex(plan, { x: 0, y: 0 });
    const b = addVertex(plan, { x: 4, y: 0 });
    const wall = addWall(plan, a.id, b.id)!;
    addOpening(plan, wall.id, "window", 2);
    const door = addOpening(plan, wall.id, "door", 1);
    door.hinge = "b";
    door.swing = -1;
    addDimension(plan, { x: 0, y: 0 }, { x: 4, y: 0 }, -0.5);
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

  it("gives defaults to the fields that old files do not have", () => {
    const text = JSON.stringify({
      format: "grundriss",
      version: 1,
      vertices: [
        { id: "v1", x: 0, y: 0 },
        { id: "v2", x: 4, y: 0 },
      ],
      walls: [{ id: "w1", a: "v1", b: "v2", thickness: 0.2, height: 2.5 }],
      openings: [
        { id: "o1", wallId: "w1", kind: "door", offset: 1, width: 0.9, height: 2.1, sill: 0 },
      ],
      background: null,
    });
    const plan = parsePlan(text);
    expect(plan.openings[0]).toMatchObject({ hinge: "a", swing: 1 });
    expect(plan.dimensions).toEqual([]);
  });

  it("reads what it writes for a building with stories, stairs, chimneys, and a roof", () => {
    const building = emptyBuilding();
    const ground = building.stories[0];
    const a = addVertex(ground, { x: 0, y: 0 });
    const b = addVertex(ground, { x: 6, y: 0 });
    addWall(ground, a.id, b.id);
    addStair(ground, { x: 1, y: 1 }, { x: 4, y: 1 });
    addChimney(ground, { x: 3, y: 3 });
    addCellar(building);
    addStoryOnTop(building, true);
    building.roof = defaultRoof(building);
    building.north = 30;
    expect(parseBuilding(serializeBuilding(building))).toEqual(building);
  });

  it("rejects a roof on a story that does not exist", () => {
    const building = emptyBuilding();
    building.roof = { ...defaultRoof(building), storyId: "nothing" };
    expect(() => parseBuilding(serializeBuilding(building))).toThrow("does not exist");
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
