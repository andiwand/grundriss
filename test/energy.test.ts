import { describe, expect, it } from "vitest";
import { addStoryOnTop, emptyBuilding } from "../src/model/building";
import {
  AIR_CHANGE,
  AIR_HEAT,
  buildingHeatLoss,
  isOuterWall,
  roomHeatLoss,
  uValue,
} from "../src/model/energy";
import { defaultEnvelope } from "../src/model/insulation";
import { newRoof } from "../src/model/roof";
import { addOpening, addVertex, addWall, splitWall } from "../src/model/plan";
import { editRoomInfo, findRooms } from "../src/model/rooms";
import { newFixture } from "../src/model/services";
import type { Story } from "../src/model/types";

/** A box of w × d meters with walls of 2.5 m. */
function box(story: Story, w: number, d: number): void {
  const v = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: d },
    { x: 0, y: d },
  ].map((p) => addVertex(story, p));
  for (let i = 0; i < 4; i++) addWall(story, v[i].id, v[(i + 1) % 4].id);
}

describe("U-values", () => {
  it("gives about 0.2 for the default wall", () => {
    const u = uValue(defaultEnvelope().wall, "wall");
    expect(u).toBeGreaterThan(0.18);
    expect(u).toBeLessThan(0.22);
  });

  it("gives the surface resistances alone for no layers", () => {
    expect(uValue([], "wall")).toBeCloseTo(1 / 0.17);
    expect(uValue([], "floor")).toBeCloseTo(1 / 0.17);
  });
});

describe("heat loss", () => {
  it("counts all walls of a single room as outer walls", () => {
    const building = emptyBuilding();
    const story = building.stories[0];
    box(story, 5, 4);
    const room = findRooms(story)[0];
    const loss = roomHeatLoss(building, story, room);
    const env = building.envelope;
    const delta = env.inside - env.outside;
    const height = 2.5;
    // The perimeter is 18 m.
    expect(loss.walls).toBeCloseTo(18 * height * uValue(env.wall, "wall") * delta);
    expect(loss.ventilation).toBeCloseTo(AIR_HEAT * AIR_CHANGE * 20 * height * delta);
    // One story is the top and the lowest story: it has the roof and the floor.
    expect(loss.roof).toBeGreaterThan(0);
    expect(loss.floor).toBeGreaterThan(0);
    expect(loss.total).toBeCloseTo(
      loss.walls + loss.windows + loss.doors + loss.roof + loss.floor + loss.ventilation,
    );
  });

  it("does not count an inner wall", () => {
    const building = emptyBuilding();
    const story = building.stories[0];
    box(story, 6, 4);
    const top = splitWall(story, story.walls[0].id, { x: 3, y: 0 });
    const bottom = splitWall(
      story,
      story.walls.find(
        (w) =>
          w.id !== story.walls[0].id &&
          story.vertices.find((v) => v.id === w.a)!.y === 4 &&
          story.vertices.find((v) => v.id === w.b)!.y === 4,
      )!.id,
      { x: 3, y: 4 },
    );
    const inner = addWall(story, top.id, bottom.id)!;
    expect(isOuterWall(story, inner)).toBe(false);
    const rooms = findRooms(story);
    expect(rooms).toHaveLength(2);
    // Each half has 3 + 4 + 3 = 10 m of outer wall, not 14 m.
    const loss = roomHeatLoss(building, story, rooms[0]);
    const env = building.envelope;
    expect(loss.walls).toBeCloseTo(
      10 * 2.5 * uValue(env.wall, "wall") * (env.inside - env.outside),
    );
  });

  it("subtracts a window from the wall and adds it with its own U-value", () => {
    const building = emptyBuilding();
    const story = building.stories[0];
    box(story, 5, 4);
    const plain = roomHeatLoss(building, story, findRooms(story)[0]);
    const window = addOpening(story, story.walls[0].id, "window", 2.5);
    const loss = roomHeatLoss(building, story, findRooms(story)[0]);
    const env = building.envelope;
    const delta = env.inside - env.outside;
    const area = window.width * window.height;
    expect(loss.windows).toBeCloseTo(area * env.windowU * delta);
    expect(plain.walls - loss.walls).toBeCloseTo(area * uValue(env.wall, "wall") * delta);
  });

  it("puts the roof on the roof story and the floor on the lowest story", () => {
    const building = emptyBuilding();
    box(building.stories[0], 5, 4);
    const upper = addStoryOnTop(building);
    box(upper, 5, 4);
    building.roofs.push(newRoof(building, upper, "gable")!);
    const result = buildingHeatLoss(building);
    const [ground, first] = result.rooms;
    expect(ground.roof).toBe(0);
    expect(ground.floor).toBeGreaterThan(0);
    expect(first.roof).toBeGreaterThan(0);
    expect(first.floor).toBe(0);
    expect(result.area).toBeCloseTo(40);
    expect(result.perArea).toBeCloseTo(result.total / 40);
  });

  it("puts the roof on the attic under the roof of the story below", () => {
    const building = emptyBuilding();
    box(building.stories[0], 5, 4);
    building.roofs.push(newRoof(building, building.stories[0], "gable")!);
    // The eaves are on the floor of the attic, so the attic is under the roof.
    const attic = addStoryOnTop(building, true);
    box(attic, 5, 4);
    const [ground, top] = buildingHeatLoss(building).rooms;
    expect(ground.roof).toBe(0);
    expect(top.roof).toBeGreaterThan(0);
    // Without the rooms of the attic, the roof is over the ground floor.
    attic.walls = [];
    expect(buildingHeatLoss(building).rooms[0].roof).toBeGreaterThan(0);
  });

  it("uses the temperature of the room, the heating devices, and the floor heating", () => {
    const building = emptyBuilding();
    const story = building.stories[0];
    box(story, 5, 4);
    const room = findRooms(story)[0];
    const warm = roomHeatLoss(building, story, room).total;
    editRoomInfo(story, room, (info) => {
      info.temperature = 24;
      info.floorHeating = true;
    });
    story.fixtures.push({ ...newFixture("radiator", { x: 2.5, y: 0.2 }, 2.5), power: 1200 });
    story.fixtures.push({ ...newFixture("radiator", { x: 20, y: 20 }, 2.5), power: 999 });
    const loss = roomHeatLoss(building, story, findRooms(story)[0]);
    const env = building.envelope;
    expect(loss.total / warm).toBeCloseTo((24 - env.outside) / (env.inside - env.outside));
    expect(loss.heating).toBe(1200);
    expect(loss.floorHeating?.power).toBeCloseTo(70 * 20);
    expect(loss.floorHeating?.pipe).toBeCloseTo(20 / 0.15);
  });
});
