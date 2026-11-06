import { describe, expect, it } from "vitest";
import {
  addCellar,
  addStoryOnTop,
  chimneyExtent,
  chimneysThrough,
  defaultRoof,
  emptyBuilding,
  roofFrame,
  stairRise,
  stairShape,
} from "../src/model/building";
import { PlanDocument } from "../src/model/history";
import { addChimney, addVertex, addWall, normalize } from "../src/model/plan";
import {
  editRoomInfo,
  findRooms,
  interiorPoint,
  pointInPolygon,
  roomLabel,
} from "../src/model/rooms";
import type { Building, Story } from "../src/model/types";

/** A rectangle of walls, `w` × `d` meters, with a height of 2.5 m. */
function walls(story: Story, w: number, d: number): void {
  const corners = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: d },
    { x: 0, y: d },
  ].map((p) => addVertex(story, p));
  for (let i = 0; i < 4; i++) addWall(story, corners[i].id, corners[(i + 1) % 4].id);
}

describe("stories", () => {
  it("stacks new stories on top and puts a cellar under the ground", () => {
    const building = emptyBuilding();
    const first = addStoryOnTop(building);
    const cellar = addCellar(building);
    expect(first.elevation).toBeCloseTo(2.75);
    expect(first.name).toBe("First floor");
    expect(cellar.elevation).toBeCloseTo(-2.5);
    expect(building.stories.map((s) => s.name)).toEqual(["Cellar", "Ground floor", "First floor"]);
  });

  it("gives the rise of a stair up to the next floor", () => {
    const building = emptyBuilding();
    const ground = building.stories[0];
    expect(stairRise(building, ground)).toBeCloseTo(2.75);
    const shape = stairShape(
      {
        id: "s",
        a: { x: 0, y: 0 },
        b: { x: 3, y: 0 },
        width: 1,
        kind: "straight",
        turn: 1,
        run2: 1,
      },
      2.75,
    );
    expect(shape.count).toBe(15);
    expect(shape.stepHeight * shape.count).toBeCloseTo(2.75);
    expect(shape.steps).toHaveLength(15);
  });
});

describe("roof and chimneys", () => {
  function house(): Building {
    const building = emptyBuilding();
    walls(building.stories[0], 10, 6);
    building.roof = defaultRoof(building);
    return building;
  }

  it("puts the ridge along the longer side", () => {
    const building = house();
    expect(building.roof!.ridge).toBe("x");
    const frame = roofFrame(building)!;
    expect(frame.base).toBeCloseTo(2.5);
    // The span across the ridge is 6 m plus two overhangs of 0.4 m.
    expect(frame.top).toBeCloseTo(2.5 + 3.4 * Math.tan((35 * Math.PI) / 180));
  });

  it("puts a chimney above the roof and shows it on the stories above", () => {
    const building = house();
    const ground = building.stories[0];
    const chimney = addChimney(ground, { x: 5, y: 3 });
    const top = addStoryOnTop(building);
    const extent = chimneyExtent(building, ground, chimney);
    expect(extent.top).toBeCloseTo(roofFrame(building)!.top + 0.8);
    expect(chimneysThrough(building, top)).toHaveLength(1);
  });
});

describe("PlanDocument with stories", () => {
  it("edits the active story and undoes across stories", () => {
    const doc = new PlanDocument();
    let id = "";
    doc.editBuilding((building) => (id = addStoryOnTop(building).id));
    doc.setActiveStory(id);
    doc.edit((plan) => addVertex(plan, { x: 1, y: 1 }));
    expect(doc.plan.id).toBe(id);
    expect(doc.plan.vertices).toHaveLength(1);
    expect(doc.building.stories[0].vertices).toHaveLength(0);
    doc.undo();
    doc.undo();
    // The active story does not exist after the undo, so the ground floor becomes active.
    expect(doc.building.stories).toHaveLength(1);
    expect(doc.plan.name).toBe("Ground floor");
  });
});

describe("L and U stairs", () => {
  const base = { id: "s", a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, width: 1, turn: 1 as const };

  it("puts the landing between the flights of an L stair", () => {
    const shape = stairShape({ ...base, kind: "l", run2: 1.5 }, 2.75);
    expect(shape.steps).toHaveLength(shape.count);
    expect(shape.landing).toBeGreaterThan(0);
    // The landing is the square after the first flight: from x = 3 to x = 4.
    const xs = shape.steps[shape.landing].map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(3);
    expect(Math.max(...xs)).toBeCloseTo(4);
    // The turn 1 goes to the side of perpendicular(b - a), which is +y. The second flight ends
    // at y = 0.5 + 1.5.
    const last = shape.steps[shape.count - 1];
    expect(Math.max(...last.map((p) => p.y))).toBeCloseTo(2);
    expect(shape.arrow).toHaveLength(3);
  });

  it("brings the second flight of a U stair back next to the first", () => {
    const shape = stairShape({ ...base, kind: "u", run2: 3 }, 2.75);
    const last = shape.steps[shape.count - 1];
    // The second flight goes back to x = 0, at the other side of the eye of 0.1 m.
    expect(Math.min(...last.map((p) => p.x))).toBeCloseTo(0);
    expect(Math.min(...last.map((p) => p.y))).toBeCloseTo(0.6);
    expect(shape.outline).toHaveLength(8);
  });
});

describe("room data", () => {
  it("follows the room when the walls move, and labels it", () => {
    const building = emptyBuilding();
    const story = building.stories[0];
    walls(story, 4, 3);
    const room = findRooms(story)[0];
    editRoomInfo(story, room, (info) => {
      info.name = "Bath";
      info.height = 2.4;
    });
    for (const vertex of story.vertices) vertex.x += 10;
    normalize(story);
    const moved = findRooms(story)[0];
    expect(moved.info?.name).toBe("Bath");
    expect(roomLabel(moved)).toEqual(["Bath", "12.00 m² · h 2.40 m"]);
  });

  it("finds a label point inside an L-shaped room", () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 6 },
      { x: 0, y: 6 },
    ];
    expect(pointInPolygon(interiorPoint(polygon), polygon)).toBe(true);
  });
});
