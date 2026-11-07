import { describe, expect, it } from "vitest";
import { emptyBuilding } from "../src/model/building";
import { parseBuilding, serializeBuilding } from "../src/model/file";
import {
  FIXTURE_TYPES,
  RUN_KINDS,
  SERVICE_SYSTEMS,
  fixtureSymbol,
  newFixture,
  newRun,
  serviceSystem,
} from "../src/model/services";

describe("services", () => {
  it("gives each device type and line kind a known system", () => {
    const systems = SERVICE_SYSTEMS.map((s) => s.system);
    for (const type of FIXTURE_TYPES) expect(systems).toContain(type.system);
    for (const kind of RUN_KINDS) expect(systems).toContain(kind.system);
    for (const system of systems) {
      expect(FIXTURE_TYPES.some((t) => t.system === system)).toBe(true);
      expect(RUN_KINDS.some((k) => k.system === system)).toBe(true);
    }
  });

  it("draws a symbol for each device type", () => {
    for (const type of FIXTURE_TYPES) {
      const symbol = fixtureSymbol(newFixture(type.type, { x: 0, y: 0 }, 2.5));
      const parts = symbol.shapes.length + symbol.lines.length + symbol.filled.length;
      expect(parts, type.type).toBeGreaterThan(0);
    }
  });

  it("takes the system from a known type, else from the file", () => {
    const data = FIXTURE_TYPES.find((t) => t.type === "data");
    expect(serviceSystem("electric", data)).toBe("comms");
    expect(serviceSystem("water", undefined)).toBe("water");
    expect(serviceSystem("gas", undefined)).toBe("electric");
  });

  it("moves the network sockets and cables of an old file to communication", () => {
    const building = emptyBuilding();
    const story = building.stories[0];
    story.fixtures.push(newFixture("data", { x: 0, y: 0 }, 2.5));
    story.fixtures.push(newFixture("hot-water-tank", { x: 1, y: 0 }, 2.5));
    story.runs.push(
      newRun("data-cable", [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
    );
    const data = JSON.parse(serializeBuilding(building));
    // The first versions stored the network socket and the data cable as electric.
    data.stories[0].fixtures[0].system = "electric";
    data.stories[0].runs[0].system = "electric";
    const parsed = parseBuilding(JSON.stringify(data)).stories[0];
    expect(parsed.fixtures.map((f) => f.system)).toEqual(["comms", "water"]);
    expect(parsed.runs[0].system).toBe("comms");
  });
});
