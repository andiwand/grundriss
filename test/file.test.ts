import { describe, expect, it } from "vitest";
import { addCellar, addStoryOnTop, emptyBuilding } from "../src/model/building";
import { newRoof } from "../src/model/roof";
import { parseBuilding, serializeBuilding } from "../src/model/file";
import type { Climate, Plan } from "../src/model/types";
import vienna from "./fixtures/vienna-climate.json";

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
    const corners = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 4 },
      { x: 0, y: 4 },
    ].map((p) => addVertex(ground, p));
    for (let i = 0; i < 4; i++) addWall(ground, corners[i].id, corners[(i + 1) % 4].id);
    addStair(ground, { x: 1, y: 1 }, { x: 4, y: 1 });
    addChimney(ground, { x: 3, y: 3 });
    addCellar(building);
    addStoryOnTop(building, true);
    const roof = newRoof(building, ground, "gable")!;
    roof.dormers.push({
      id: "d",
      side: 0,
      offset: 3,
      distance: 0.8,
      width: 1.2,
      height: 1.1,
      kind: "gable",
      pitch: 40,
    });
    roof.windows.push({ id: "w", side: 2, offset: 2, distance: 1, width: 0.8, length: 1.2 });
    building.roofs.push(roof);
    building.pv.push({
      id: "pv",
      roofId: roof.id,
      face: 0,
      panelWidth: 1.13,
      panelHeight: 1.72,
      panelPower: 430,
      portrait: true,
      margin: 0.3,
      gap: 0.02,
      limit: null,
    });
    building.north = 30;
    expect(parseBuilding(serializeBuilding(building))).toEqual(building);
  });

  it("rejects a roof on a story that does not exist", () => {
    const building = emptyBuilding();
    const story = building.stories[0];
    const corners = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
    ].map((p) => addVertex(story, p));
    for (let i = 0; i < 3; i++) addWall(story, corners[i].id, corners[(i + 1) % 3].id);
    building.roofs.push({ ...newRoof(building, story, "hip")!, storyId: "nothing" });
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

describe("files with the old single roof", () => {
  /** A file of a house of 10 × 6 m with the old roof, as the app wrote it before the roofs. */
  function oldFile(roof: Record<string, unknown>, pv: unknown[] = []): string {
    const corners = [
      [0, 0],
      [10, 0],
      [10, 6],
      [0, 6],
    ];
    const story = {
      id: "st-1",
      name: "Ground floor",
      elevation: 0,
      height: 2.75,
      vertices: corners.map(([x, y], i) => ({ id: `v${i}`, x, y })),
      walls: corners.map((_, i) => ({
        id: `w${i}`,
        a: `v${i}`,
        b: `v${(i + 1) % 4}`,
        thickness: 0.2,
        height: 2.5,
      })),
    };
    return JSON.stringify({
      format: "grundriss",
      version: 2,
      stories: [story],
      roof: { storyId: "st-1", pitch: 30, overhang: 0.5, ...roof },
      north: 0,
      pv,
    });
  }

  const kinds = (text: string) => parseBuilding(text).roofs[0].sides.map((s) => s.kind);

  it("makes a gable roof with the eaves along the ridge", () => {
    expect(kinds(oldFile({ kind: "gable", ridge: "x" }))).toEqual([
      "eave",
      "gable",
      "eave",
      "gable",
    ]);
    expect(kinds(oldFile({ kind: "gable", ridge: "y" }))).toEqual([
      "gable",
      "eave",
      "gable",
      "eave",
    ]);
    const roof = parseBuilding(oldFile({ kind: "gable", ridge: "x" })).roofs[0];
    expect(roof.outline).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 6 },
      { x: 0, y: 6 },
    ]);
    expect(roof.sides.every((s) => s.pitch === 30 && s.overhang === 0.5)).toBe(true);
    expect(roof.flat).toBe(false);
  });

  it("puts the eave of a shed roof at the large side, and keeps a flat roof flat", () => {
    expect(kinds(oldFile({ kind: "shed", ridge: "x" }))).toEqual([
      "gable",
      "gable",
      "eave",
      "gable",
    ]);
    expect(kinds(oldFile({ kind: "shed", ridge: "y" }))).toEqual([
      "gable",
      "eave",
      "gable",
      "gable",
    ]);
    const flat = parseBuilding(oldFile({ kind: "flat", ridge: "x" })).roofs[0];
    expect(flat.flat).toBe(true);
    expect(kinds(oldFile({ kind: "hip", ridge: "x" }))).toEqual(["eave", "eave", "eave", "eave"]);
  });

  it("puts the old PV fields on the converted roof", () => {
    const building = parseBuilding(
      oldFile({ kind: "gable", ridge: "x" }, [
        {
          id: "pv",
          face: 1,
          panelWidth: 1.13,
          panelHeight: 1.72,
          panelPower: 430,
          portrait: true,
          margin: 0.3,
          gap: 0.02,
          limit: null,
        },
      ]),
    );
    expect(building.pv[0].roofId).toBe(building.roofs[0].id);
    expect(building.pv[0].face).toBe(1);
  });
});

describe("numbers out of range", () => {
  it("gives an optional number its default if the file has an infinite value", () => {
    const building = emptyBuilding();
    building.north = 12345;
    building.stories[0].stairs.push({
      id: "s1",
      a: { x: 0, y: 0 },
      b: { x: 3, y: 0 },
      width: 1,
      kind: "l",
      turn: 1,
      run2: 12345,
    });
    building.stories[0].rooms.push({
      id: "r1",
      key: "",
      at: { x: 1, y: 1 },
      name: "",
      height: null,
      floorHeating: false,
      temperature: 12345,
      wallColor: null,
    });
    // JSON.parse reads "1e999" as Infinity.
    const text = serializeBuilding(building).replaceAll("12345", "1e999");
    const result = parseBuilding(text);
    expect(result.north).toBe(0);
    expect(result.stories[0].stairs[0].run2).toBe(1);
    expect(result.stories[0].rooms[0].temperature).toBeNull();
    expect(parseBuilding(serializeBuilding(result))).toEqual(result);
  });
});

describe("location and climate", () => {
  const climate = vienna as Climate;

  it("gives null for both to a file without them", () => {
    const old = JSON.parse(serializeBuilding(emptyBuilding()));
    delete old.location;
    delete old.climate;
    const building = parseBuilding(JSON.stringify(old));
    expect(building.location).toBeNull();
    expect(building.climate).toBeNull();
    const v1 = parseBuilding(JSON.stringify({ format: "grundriss", version: 1, vertices: [] }));
    expect(v1.location).toBeNull();
    expect(v1.climate).toBeNull();
  });

  it("reads what it writes, and the climate adds well under 100 kB", () => {
    const building = emptyBuilding();
    building.location = { name: "Vienna, Austria", latitude: 48.2, longitude: 16.37, x: 3, y: -2 };
    building.climate = structuredClone(climate);
    const text = serializeBuilding(building);
    expect(parseBuilding(text)).toEqual(building);
    expect(text.length - serializeBuilding(emptyBuilding()).length).toBeLessThan(50000);
  });

  it("puts the place of an older location at the origin of the plan", () => {
    const data = JSON.parse(serializeBuilding(emptyBuilding()));
    data.location = { name: "Vienna", latitude: 48.2, longitude: 16.37 };
    expect(parseBuilding(JSON.stringify(data)).location).toEqual({
      name: "Vienna",
      latitude: 48.2,
      longitude: 16.37,
      x: 0,
      y: 0,
    });
  });

  it("rejects a damaged location or climate", () => {
    const building = emptyBuilding();
    building.location = { name: "", latitude: 95, longitude: 0, x: 0, y: 0 };
    expect(() => parseBuilding(serializeBuilding(building))).toThrow(/location.*latitude/);
    building.location = null;
    building.climate = { ...climate, dni: "AAAA" };
    expect(() => parseBuilding(serializeBuilding(building))).toThrow(/climate.*"dni"/);
    const { temperature: _temperature, ...partial } = climate;
    const data = { ...JSON.parse(serializeBuilding(emptyBuilding())), climate: partial };
    expect(() => parseBuilding(JSON.stringify(data))).toThrow(/climate.*"temperature"/);
  });
});
