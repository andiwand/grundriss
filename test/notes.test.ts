import { describe, expect, it } from "vitest";
import { emptyBuilding } from "../src/model/building";
import { parseBuilding, serializeBuilding } from "../src/model/file";
import { addVertex, addWall } from "../src/model/plan";
import { circuitQuantities } from "../src/model/quantities";
import { newFixture } from "../src/model/services";

describe("notes", () => {
  it("keeps the notes of the objects in the file, and drops an empty note", () => {
    const building = emptyBuilding();
    const story = building.stories[0];
    const a = addVertex(story, { x: 0, y: 0 });
    const b = addVertex(story, { x: 4, y: 0 });
    const wall = addWall(story, a.id, b.id)!;
    wall.note = { text: "Damp in the corner", photos: ["data:image/jpeg;base64,AAAA"] };
    const fixture = newFixture("socket", { x: 1, y: 0.1 }, 0.3);
    fixture.note = { text: "", photos: [] };
    story.fixtures.push(fixture);
    const read = parseBuilding(serializeBuilding(building));
    expect(read.stories[0].walls[0].note).toEqual(wall.note);
    expect(read.stories[0].fixtures[0].note).toBeUndefined();
  });

  it("rejects a photo that is not an image", () => {
    const building = emptyBuilding();
    const data = JSON.parse(serializeBuilding(building));
    data.stories[0].fixtures = [
      { ...newFixture("socket", { x: 0, y: 0 }, 0.3), note: { text: "x", photos: ["http://x"] } },
    ];
    expect(parseBuilding(JSON.stringify(data)).stories[0].fixtures[0].note).toEqual({
      text: "x",
      photos: [],
    });
  });
});

describe("circuits", () => {
  it("groups the electric devices and cables by circuit, in the order of the numbers", () => {
    const building = emptyBuilding();
    const story = building.stories[0];
    const add = (type: string, circuit?: string) => {
      const f = newFixture(type, { x: 0, y: 0 }, 0.3);
      if (circuit) f.circuit = circuit;
      story.fixtures.push(f);
    };
    add("socket", "F10");
    add("socket", "F2");
    add("socket", "F2");
    add("light-ceiling", "F2");
    add("socket");
    add("radiator", "F2");
    const circuits = circuitQuantities(building);
    expect(circuits.map((c) => c.circuit)).toEqual(["F2", "F10", ""]);
    const f2 = circuits[0].fixtures.map((f) => `${f.count} ${f.type}`);
    expect(f2).toEqual(["2 socket", "1 light-ceiling"]);
    // A file keeps the circuit.
    const read = parseBuilding(serializeBuilding(building));
    expect(read.stories[0].fixtures[0].circuit).toBe("F10");
  });
});
