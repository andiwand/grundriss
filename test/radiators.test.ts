import { describe, expect, it } from "vitest";
import { emptyBuilding } from "../src/model/building";
import { addVertex, addWall } from "../src/model/plan";
import {
  designFlow,
  floorHeatingPower,
  NOMINAL_DELTA,
  radiatorPower,
  readinessOf,
  roomReadiness,
} from "../src/model/radiators";
import { editRoomInfo, findRooms } from "../src/model/rooms";
import { newFixture } from "../src/model/services";

function box() {
  const building = emptyBuilding();
  const story = building.stories[0];
  const v = [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 5, y: 4 },
    { x: 0, y: 4 },
  ].map((p) => addVertex(story, p));
  for (let i = 0; i < 4; i++) addWall(story, v[i].id, v[(i + 1) % 4].id);
  return { building, story };
}

describe("radiators", () => {
  it("gives the nominal power at 75/65/20 °C, and less at a lower flow", () => {
    // A heat pump has a spread of 5 K, so 75 °C flow gives a little more than 75/65.
    expect(radiatorPower(1000, 75, 20)).toBeGreaterThan(1000);
    expect(radiatorPower(1000, 45, 20)).toBeLessThan(500);
    expect(radiatorPower(1000, 45, 20)).toBeGreaterThan(300);
    expect(radiatorPower(1000, 20, 20)).toBe(0);
    expect(NOMINAL_DELTA).toBeCloseTo(49.83, 1);
  });

  it("gives floor heating its power at 35 °C", () => {
    expect(floorHeatingPower(10, 35, 20)).toBeCloseTo(700);
    expect(floorHeatingPower(10, 30, 20)).toBeLessThan(700);
  });

  it("finds the lowest flow that gives the heat loss of a room", () => {
    const { building, story } = box();
    story.fixtures.push({ ...newFixture("radiator", { x: 2.5, y: 0.2 }, 0.3), power: 3000 });
    const [room] = roomReadiness(building);
    expect(room.radiators).toBe(3000);
    expect(room.flow).not.toBeNull();
    expect(radiatorPower(3000, room.flow!, 20)).toBeGreaterThanOrEqual(room.loss);
    expect(radiatorPower(3000, room.flow! - 1, 20)).toBeLessThan(room.loss);
    expect(designFlow([room])).toBe(room.flow);
  });

  it("calls a room with a small radiator poor, and a room without heating none", () => {
    const { building, story } = box();
    const [empty] = roomReadiness(building);
    expect(empty.readiness).toBe("none");
    expect(designFlow([empty])).toBeNull();
    story.fixtures.push({ ...newFixture("radiator", { x: 2.5, y: 0.2 }, 0.3), power: 200 });
    expect(roomReadiness(building)[0].readiness).toBe("poor");
    expect(readinessOf(40, true)).toBe("good");
    expect(readinessOf(50, true)).toBe("fair");
  });

  it("counts floor heating", () => {
    const { building, story } = box();
    const room = findRooms(story)[0];
    editRoomInfo(story, room, (info) => (info.floorHeating = true));
    const [ready] = roomReadiness(building);
    expect(ready.floorArea).toBeCloseTo(20);
    expect(ready.flow).not.toBeNull();
  });
});
