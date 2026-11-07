import { describe, expect, it } from "vitest";
import { addStoryOnTop, emptyBuilding } from "../src/model/building";
import {
  buildingQuantities,
  fixtureQuantities,
  runQuantities,
  runTotalLength,
  storyQuantities,
} from "../src/model/quantities";
import { newFixture, newRun } from "../src/model/services";

describe("quantities", () => {
  it("adds the vertical parts to the connected devices", () => {
    const building = emptyBuilding();
    const story = building.stories[0];
    const socket = newFixture("socket", { x: 0, y: 0 }, 2.5);
    const light = newFixture("light-ceiling", { x: 4, y: 0 }, 2.5);
    story.fixtures.push(socket, light);
    const run = {
      ...newRun("cable", [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ]),
      elevation: 0.3,
    };
    run.from = socket.id;
    run.to = light.id;
    story.runs.push(run);
    // 4 m on the plan, 0 m to the socket at 0.3 m, and 2.2 m up to the light at 2.5 m.
    expect(runTotalLength(story, run)).toBeCloseTo(6.2);
    expect(storyQuantities(story).runs).toEqual([
      { kind: "cable", name: "Power cable", length: expect.closeTo(6.2) },
    ]);
  });

  it("counts the devices and sums the lines of all stories", () => {
    const building = emptyBuilding();
    const ground = building.stories[0];
    const upper = addStoryOnTop(building);
    ground.fixtures.push(newFixture("socket", { x: 0, y: 0 }, 2.5));
    ground.fixtures.push(newFixture("socket", { x: 1, y: 0 }, 2.5));
    upper.fixtures.push(newFixture("radiator", { x: 1, y: 0 }, 2.5));
    upper.fixtures.push({ ...newFixture("socket", { x: 2, y: 0 }, 2.5), type: "custom" });
    ground.runs.push(
      newRun("flow", [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
      ]),
    );
    upper.runs.push(
      newRun("flow", [
        { x: 0, y: 0 },
        { x: 0, y: 2 },
        { x: 1, y: 2 },
      ]),
    );
    const result = buildingQuantities(building);
    expect(result.fixtures).toEqual([
      { type: "radiator", name: "Radiator", count: 1 },
      { type: "socket", name: "Socket", count: 2 },
      { type: "custom", name: "custom", count: 1 },
    ]);
    expect(result.runs).toEqual([{ kind: "flow", name: "Flow pipe", length: 6 }]);
    expect(runQuantities([])).toEqual([]);
    expect(fixtureQuantities([])).toEqual([]);
  });
});
