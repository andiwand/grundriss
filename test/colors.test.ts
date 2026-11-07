import { describe, expect, it } from "vitest";
import { emptyBuilding } from "../src/model/building";
import { DEFAULT_COLORS, roomOnSide, wallSideColor } from "../src/model/colors";
import { makeHouse } from "../src/model/example";
import { parseBuilding, serializeBuilding } from "../src/model/file";
import { splitWall, wallEnds } from "../src/model/plan";
import { editRoomInfo, findRooms } from "../src/model/rooms";
import type { Story, Wall } from "../src/model/types";

/** The south outer wall of the bedroom of the example house: on y = 9, east of x = 7. */
function bedroomWall(story: Story): Wall {
  return story.walls.find((w) => {
    const [a, b] = wallEnds(story, w);
    return Math.abs(a.y - 9) < 1e-6 && Math.abs(b.y - 9) < 1e-6 && Math.min(a.x, b.x) >= 7 - 1e-6;
  })!;
}

describe("the colors of the walls", () => {
  it("gives the room side the room color and the outside the facade color", () => {
    const house = makeHouse();
    const story = house.stories[0];
    const wall = bedroomWall(story);
    const sides = ([1, -1] as const).map((side) => roomOnSide(story, wall, side));
    const inner = sides[0] ? 1 : -1;
    expect(sides.filter(Boolean)).toHaveLength(1);
    expect(roomOnSide(story, wall, inner)!.info?.name).toBe("Bedroom");
    expect(wallSideColor(house, story, wall, inner)).toBe(DEFAULT_COLORS.room);
    expect(wallSideColor(house, story, wall, -inner as 1 | -1)).toBe(DEFAULT_COLORS.facade);

    const bedroom = findRooms(story).find((r) => r.info?.name === "Bedroom")!;
    editRoomInfo(story, bedroom, (info) => (info.wallColor = "#7fa7c9"));
    house.facade = "#e9dcc3";
    expect(wallSideColor(house, story, wall, inner)).toBe("#7fa7c9");
    expect(wallSideColor(house, story, wall, -inner as 1 | -1)).toBe("#e9dcc3");
    // An own color of a side wins over the room and the facade.
    wall.colors[inner === 1 ? "right" : "left"] = "#123456";
    expect(wallSideColor(house, story, wall, inner)).toBe("#123456");
    expect(wallSideColor(house, story, wall, -inner as 1 | -1)).toBe("#e9dcc3");
  });

  it("keeps the own colors when a wall splits", () => {
    const house = makeHouse();
    const story = house.stories[0];
    const wall = bedroomWall(story);
    wall.colors.right = "#123456";
    const [a, b] = wallEnds(story, wall);
    splitWall(story, wall.id, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const parts = story.walls.filter((w) => w.colors.right === "#123456");
    expect(parts).toHaveLength(2);
  });

  it("reads and writes the colors, with defaults for an older file", () => {
    const house = makeHouse();
    const story = house.stories[0];
    bedroomWall(story).colors.left = "#abcdef";
    story.rooms[0].wallColor = "#7fa7c9";
    house.roofs[0].color = "#333333";
    house.roofs[0].underside = "#eeeeee";
    house.facade = "#e9dcc3";
    const copy = parseBuilding(serializeBuilding(house));
    expect(bedroomWall(copy.stories[0]).colors.left).toBe("#abcdef");
    expect(copy.stories[0].rooms[0].wallColor).toBe("#7fa7c9");
    expect(copy.roofs[0]).toMatchObject({ color: "#333333", underside: "#eeeeee" });
    expect(copy.facade).toBe("#e9dcc3");

    const data = JSON.parse(serializeBuilding(emptyBuilding()));
    delete data.facade;
    data.stories[0].walls = [];
    expect(parseBuilding(JSON.stringify(data)).facade).toBe(DEFAULT_COLORS.facade);
    // A value that is not a color "#rrggbb" gives the default.
    const bad = JSON.parse(serializeBuilding(house));
    bad.facade = "red";
    bad.roofs[0].color = 7;
    const parsed = parseBuilding(JSON.stringify(bad));
    expect(parsed.facade).toBe(DEFAULT_COLORS.facade);
    expect(parsed.roofs[0].color).toBe(DEFAULT_COLORS.roof);
  });
});
