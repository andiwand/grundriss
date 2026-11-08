import { describe, expect, it } from "vitest";
import { makeHouse } from "../src/model/example";
import {
  overheatingVerdict,
  RISK_DEGREE_HOURS,
  summerOverheating,
  WARNING_DEGREE_HOURS,
  type RoomOverheating,
} from "../src/model/overheating";
import type { Building, Climate, Opening, Story } from "../src/model/types";
import vienna from "./fixtures/vienna-climate.json";

function house(edit: (b: Building) => void = () => {}): Building {
  const building = makeHouse();
  building.climate = vienna as Climate;
  edit(building);
  return building;
}

/** The window of the story with its middle at the point. */
function windowAt(story: Story, x: number, y: number): Opening {
  const found = story.openings.find((o) => {
    if (o.kind !== "window") return false;
    const wall = story.walls.find((w) => w.id === o.wallId)!;
    const a = story.vertices.find((v) => v.id === wall.a)!;
    const b = story.vertices.find((v) => v.id === wall.b)!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const px = a.x + ((b.x - a.x) * o.offset) / length;
    const py = a.y + ((b.y - a.y) * o.offset) / length;
    return Math.hypot(px - x, py - y) < 1e-6;
  });
  if (!found) throw new Error(`No window at ${x}, ${y}`);
  return found;
}

const remove = (story: Story, opening: Opening) =>
  (story.openings = story.openings.filter((o) => o.id !== opening.id));

/** The result of the room with the name on the ground floor. */
const room = (result: RoomOverheating[], building: Building, name: string) =>
  result.find((r) => r.name === name && r.storyId === building.stories[0].id)!;

/** The hours of the summer from 1 June to 31 August. */
const SUMMER_HOURS = (30 + 31 + 31) * 24;

describe("summer overheating", () => {
  it("needs a climate", () => {
    expect(summerOverheating(makeHouse())).toBeNull();
  });

  it("gives plausible values for each heated room", () => {
    const building = house();
    const result = summerOverheating(building)!;
    expect(result.length).toBeGreaterThan(0);
    for (const r of result) {
      expect(r.max).toBeGreaterThan(20);
      expect(r.max).toBeLessThan(45);
      expect(r.hoursOver27).toBeLessThanOrEqual(r.hoursOver25);
      expect(r.hoursOver25).toBeLessThanOrEqual(SUMMER_HOURS);
      expect(r.glazingRatio).toBeGreaterThanOrEqual(0);
      expect(r.glazingRatio).toBeLessThan(1);
      expect(r.verdict).toBe(overheatingVerdict(r.degreeHours));
    }
    // The living room has the large glass to the south: it is the warmest room.
    const living = room(result, building, "Living");
    expect(living.max).toBe(Math.max(...result.map((r) => r.max)));
    expect(living.glazingRatio).toBeGreaterThan(room(result, building, "Hall").glazingRatio);
  });

  it("gives more hours over 27 °C with more glass to the south", () => {
    const plain = house();
    const glass = house((b) => {
      const story = b.stories[0];
      for (const x of [5.2, 9.5]) Object.assign(windowAt(story, x, 9), { height: 2.2, sill: 0 });
    });
    const before = summerOverheating(plain)!;
    const after = summerOverheating(glass)!;
    const sum = (result: RoomOverheating[]) => result.reduce((s, r) => s + r.hoursOver27, 0);
    expect(sum(after)).toBeGreaterThan(sum(before));
    expect(room(after, glass, "Living").hoursOver27).toBeGreaterThan(
      room(before, plain, "Living").hoursOver27,
    );
  });

  it("keeps a room without windows cooler than a room with large west windows", () => {
    // The kitchen has a window to the west and one to the north.
    const closed = house((b) => {
      const story = b.stories[0];
      remove(story, windowAt(story, 0, 2));
      remove(story, windowAt(story, 2, 0));
    });
    const open = house((b) => {
      const story = b.stories[0];
      remove(story, windowAt(story, 2, 0));
      Object.assign(windowAt(story, 0, 2), { width: 3, height: 2.2, sill: 0 });
    });
    const cool = room(summerOverheating(closed)!, closed, "Kitchen");
    const warm = room(summerOverheating(open)!, open, "Kitchen");
    expect(cool.glazingRatio).toBe(0);
    expect(warm.max).toBeGreaterThan(cool.max + 1);
    expect(warm.hoursOver27).toBeGreaterThan(cool.hoursOver27);
  });

  it("cools the rooms with external blinds", () => {
    const open = summerOverheating(house())!;
    const blinds = summerOverheating(house(), { blinds: true })!;
    open.forEach((r, i) => {
      expect(blinds[i].max).toBeLessThanOrEqual(r.max + 1e-9);
      expect(blinds[i].hoursOver27).toBeLessThanOrEqual(r.hoursOver27);
    });
  });

  it("gives the verdict by the K·h over 27 °C", () => {
    expect(overheatingVerdict(0)).toBe("ok");
    expect(overheatingVerdict(WARNING_DEGREE_HOURS)).toBe("warning");
    expect(overheatingVerdict(RISK_DEGREE_HOURS)).toBe("risk");
  });

  it("is fast", () => {
    const building = house();
    summerOverheating(building);
    const start = performance.now();
    summerOverheating(building);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
