import { describe, expect, it } from "vitest";
import { buildingHeatLoss } from "../src/model/energy";
import { pvSummary } from "../src/model/pv";
import { furnitureOutline } from "../src/model/furniture";
import { clearHeight, roofGeometryOf } from "../src/model/roof";
import { findRooms } from "../src/model/rooms";
import { makeHouse, partOf } from "../src/model/example";

describe("the house of the website", () => {
  const house = makeHouse();

  it("has closed rooms with names on both stories", () => {
    const [ground, attic] = house.stories;
    const names = (rooms: ReturnType<typeof findRooms>) => rooms.map((r) => r.info?.name).sort();
    expect(names(findRooms(ground))).toEqual(
      ["Bath", "Bedroom", "Hall", "Kitchen", "Living", "Utility"].sort(),
    );
    expect(names(findRooms(attic))).toEqual(["Bath", "Bedroom", "Kids", "Study"].sort());
    expect(ground.openings.length).toBeGreaterThan(10);
  });

  it("has a roof where the dormer and the windows fit, and PV", () => {
    const geometry = roofGeometryOf(house, house.roofs[0]);
    expect(geometry.misfits).toEqual([]);
    expect(geometry.dormers).toHaveLength(1);
    expect(geometry.windows).toHaveLength(2);
    const pv = pvSummary(house);
    expect(pv.count).toBeGreaterThan(8);
    // The peak power is in kW.
    expect(pv.peak).toBeGreaterThan(5);
    expect(buildingHeatLoss(house).total).toBeGreaterThan(1000);
  });

  it("has no furniture that goes through the roof", () => {
    for (const story of house.stories) {
      const clear = clearHeight(house, story);
      for (const piece of story.furniture) {
        for (const corner of furnitureOutline(piece)) {
          const height = clear(corner);
          if (height !== null) {
            expect(piece.elevation + piece.height, piece.name).toBeLessThanOrEqual(height);
          }
        }
      }
    }
  });

  it("gives parts of the house", () => {
    const shell = partOf(house, {});
    expect(shell.stories).toHaveLength(1);
    expect(shell.roofs).toHaveLength(0);
    expect(shell.stories[0].furniture).toHaveLength(0);
    expect(house.stories[0].furniture.length).toBeGreaterThan(10);
  });
});
