import { describe, expect, it } from "vitest";
import { addStoryOnTop, buildingTop, emptyBuilding } from "../src/model/building";
import {
  againstWalls,
  newRoof,
  offsetOutline,
  offsetSides,
  roofCeiling,
  roofGeometryOf,
  roofBounds,
  roofLines,
  roofsFromAbove,
  roofsInView,
  type Vec3,
} from "../src/model/roof";
import { addVertex, addWall } from "../src/model/plan";
import { FLAT_THICKNESS } from "../src/model/roofshape";
import { boxHouse, wallsAround } from "./houses";

const heights = (polygons: Vec3[][]) => polygons.flat().map((p) => p.z);
const tan35 = Math.tan((35 * Math.PI) / 180);

describe("roofs of a building", () => {
  it("shows the roofs of all stories from above, a roof of a lower story first", () => {
    // A house with two stories, and a roof on the ground floor over the part without a story
    // above, for example a garage.
    const building = boxHouse(16, 6, null);
    const ground = building.stories[0];
    const upper = addStoryOnTop(building);
    upper.walls = [];
    upper.vertices = [];
    wallsAround(upper, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 6 },
      { x: 0, y: 6 },
    ]);
    const main = { ...newRoof(building, upper, "gable")!, id: "main" };
    const garage = { ...newRoof(building, ground, "shed")!, id: "garage" };
    garage.outline = [
      { x: 10, y: 0 },
      { x: 16, y: 0 },
      { x: 16, y: 6 },
      { x: 10, y: 6 },
    ];
    garage.sides = garage.sides.slice(0, 4);
    building.roofs.push(main, garage);
    expect(roofsFromAbove(building).map(({ roof }) => roof.id)).toEqual(["garage", "main"]);
    const box = roofBounds(building)!;
    // The eaves of both roofs, with their overhangs.
    expect(box.minX).toBeLessThan(0);
    expect(box.maxX).toBeGreaterThan(16);
    expect(roofBounds(boxHouse(4, 4, null))).toBeNull();
  });

  it("shows the roof of a low wing with the story above, and not the roof over that story", () => {
    const building = boxHouse(16, 6, null);
    const ground = building.stories[0];
    const upper = addStoryOnTop(building);
    upper.walls = [];
    upper.vertices = [];
    wallsAround(upper, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 6 },
      { x: 0, y: 6 },
    ]);
    const main = { ...newRoof(building, upper, "hip")!, id: "main" };
    const wing = { ...newRoof(building, ground, "hip")!, id: "wing" };
    wing.outline = [
      { x: 10, y: 0 },
      { x: 16, y: 0 },
      { x: 16, y: 6 },
      { x: 10, y: 6 },
    ];
    wing.sides = wing.sides.slice(0, 4);
    // A roof of the ground floor over the rooms of the upper story, for example in an attic.
    const over = { ...newRoof(building, ground, "hip")!, id: "over" };
    building.roofs.push(main, wing, over);
    const ids = (activeId: string, all = false) =>
      roofsInView(building, activeId, all).map((r) => r.id);
    expect(ids(upper.id)).toEqual(["wing"]);
    expect(ids(ground.id)).toEqual([]);
    expect(ids(upper.id, true)).toEqual(["main", "wing", "over"]);
    // A wall of the upper story over the wing, which closes no room yet, hides the wing roof.
    const a = addVertex(upper, { x: 12, y: 1 });
    const b = addVertex(upper, { x: 14, y: 1 });
    addWall(upper, a.id, b.id);
    expect(ids(upper.id)).toEqual([]);
  });

  it("puts a gable roof on the walls, with the ridge in the middle", () => {
    const building = boxHouse(10, 6, "gable");
    const roof = building.roofs[0];
    const geometry = roofGeometryOf(building, roof);
    expect(geometry.faces).toHaveLength(2);
    expect(geometry.gables).toHaveLength(2);
    // The eaves are at the top of the walls (2.5 m), on the outer face of the walls (0.2 m
    // thick). So the ridge is 3.1 m in from the eaves.
    expect(geometry.top).toBeCloseTo(2.5 + 3.1 * tan35);
    expect(buildingTop(building)).toBeCloseTo(geometry.top);
    // The gables stand on the outer faces of the walls at x = -0.1 and x = 10.1.
    for (const gable of geometry.gables) {
      const xs = gable.map((p) => p.x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1e-6);
    }
  });

  it("moves an outline out by the same distance on each side, in both directions", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ];
    const expected = [
      { x: -0.1, y: -0.1 },
      { x: 4.1, y: -0.1 },
      { x: 4.1, y: 4.1 },
      { x: -0.1, y: 4.1 },
    ];
    const close = (points: { x: number; y: number }[], want: { x: number; y: number }[]) =>
      points.forEach((p, i) => {
        expect(p.x).toBeCloseTo(want[i].x);
        expect(p.y).toBeCloseTo(want[i].y);
      });
    close(offsetOutline(square, 0.1), expected);
    close(offsetOutline([...square].reverse(), 0.1), [...expected].reverse());
    // The inner corner of an L moves out too: into the notch.
    const l = offsetOutline(
      [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
        { x: 8, y: 4 },
        { x: 4, y: 4 },
        { x: 4, y: 8 },
        { x: 0, y: 8 },
      ],
      0.1,
    );
    close([l[3]], [{ x: 4.1, y: 4.1 }]);
    // Both copies of a repeated point go to the same corner.
    const repeated = offsetOutline([square[0], ...square], 0.1);
    close(repeated, [expected[0], ...expected]);
  });

  it("moves each side by its own distance, with a step between two sides on one line", () => {
    const close = (points: { x: number; y: number }[], want: { x: number; y: number }[]) => {
      expect(points).toHaveLength(want.length);
      points.forEach((p, i) => {
        expect(p.x).toBeCloseTo(want[i].x);
        expect(p.y).toBeCloseTo(want[i].y);
      });
    };
    const square = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ];
    // The side x = 0 (side 3) moves in by 0.1, the others out by 0.2.
    const moved = offsetSides(square, [0.2, 0.2, 0.2, -0.1]);
    close(moved.outline, [
      { x: 0.1, y: -0.2 },
      { x: 4.2, y: -0.2 },
      { x: 4.2, y: 4.2 },
      { x: 0.1, y: 4.2 },
    ]);
    expect(moved.from).toEqual([0, 1, 2, 3]);
    // A point on the side x = 0 splits it in two sides on one line. The step at the point moves
    // 0.3 toward side 4.
    const split = offsetSides(
      [...square, { x: 0, y: 2 }],
      [0.2, 0.2, 0.2, -0.1, 0.2],
      [0, 0, 0, 0, 0.3],
    );
    close(split.outline, [
      { x: -0.2, y: -0.2 },
      { x: 4.2, y: -0.2 },
      { x: 4.2, y: 4.2 },
      { x: 0.1, y: 4.2 },
      { x: 0.1, y: 1.7 },
      { x: -0.2, y: 1.7 },
    ]);
    expect(split.from).toEqual([0, 1, 2, 3, -1, 4]);
  });

  it("ends a lean-to roof at the face of the wall of the higher story next to it", () => {
    // A house of 16 × 9 m. The upper story is 10 × 6 m in the corner at (0, 0). The lean-to roof
    // on the ground floor is east of the upper story, and it goes south past its corner.
    const building = boxHouse(16, 9, null);
    const ground = building.stories[0];
    const upper = addStoryOnTop(building);
    upper.walls = [];
    upper.vertices = [];
    wallsAround(upper, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 6 },
      { x: 0, y: 6 },
    ]);
    const roof = { ...newRoof(building, ground, "shed")!, id: "lean-to" };
    roof.outline = [
      { x: 10, y: 0 },
      { x: 16, y: 0 },
      { x: 16, y: 9 },
      { x: 10, y: 9 },
      { x: 10, y: 6 },
    ];
    roof.sides = roof.outline.map(() => ({ kind: "gable", pitch: 15, overhang: 0.3 }));
    roof.sides[1] = { kind: "eave", pitch: 15, overhang: 0.3 };
    building.roofs.push(roof);
    // Only the side x = 10 from y = 6 to y = 0 is against the upper story. The south wall of the
    // upper story ends at its start, across it.
    expect(againstWalls(building, roof, ground)).toEqual({
      sides: [0, 0, 0, 0, 0.2],
      ends: [0.1, 0, 0, 0, 0.1],
    });
    const ceiling = roofCeiling(building, upper);
    // The faces of the east wall and of the south wall of the upper story are not under the roof.
    expect(ceiling({ x: 10.099, y: 3 })).toBeNull();
    expect(ceiling({ x: 10.05, y: 6.099 })).toBeNull();
    // Next to them, the roof is there.
    expect(ceiling({ x: 10.11, y: 3 })).not.toBeNull();
    expect(ceiling({ x: 10.05, y: 6.11 })).not.toBeNull();
    // South of the upper story, the roof covers the wall of the ground floor at x = 10.
    expect(ceiling({ x: 9.95, y: 8 })).not.toBeNull();
    // The side against the wall has no overhang, and the roof does not go under the upper story.
    const geometry = roofGeometryOf(building, roof);
    const north = geometry.eaves.filter((p) => p.y < 6);
    expect(Math.min(...north.map((p) => p.x))).toBeCloseTo(10.1);
  });

  it("keeps an attic under the roof of the story below", () => {
    const building = boxHouse(10, 6, "gable");
    const ground = building.stories[0];
    const attic = addStoryOnTop(building);
    expect(againstWalls(building, building.roofs[0], ground).sides).toEqual([0, 0, 0, 0]);
    // The walls of the attic are on the outline of the roof, and the roof covers them.
    expect(roofCeiling(building, attic)({ x: 0.099, y: 3 })).not.toBeNull();
    expect(roofCeiling(building, attic)({ x: 5, y: 0.099 })).not.toBeNull();
  });

  it("puts a dormer at its offset from the start of its side on the center lines", () => {
    const building = boxHouse(10, 6, "gable");
    const roof = building.roofs[0];
    const side = roof.sides.findIndex((s) => s.kind === "eave");
    const a = roof.outline[side];
    const b = roof.outline[(side + 1) % roof.outline.length];
    const dir = { x: (b.x - a.x) / 10, y: (b.y - a.y) / 10 };
    roof.dormers.push({
      id: "d",
      side,
      offset: 2,
      distance: 0.5,
      width: 1.2,
      height: 1,
      kind: "flat",
      pitch: 0,
    });
    const { dormers } = roofGeometryOf(building, roof);
    expect(dormers).toHaveLength(1);
    const xs = dormers[0].window.map((p) => p.x);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(a.x + 2 * dir.x);
  });

  it("gives the height of the roof over the walls of the story above", () => {
    const building = boxHouse(10, 6, "gable");
    const ground = building.stories[0];
    const attic = addStoryOnTop(building);
    const ceiling = roofCeiling(building, attic);
    // The eaves are on the floor of the attic now, not on the top of the walls (2.5 m). The
    // ridge is along y = 3. The eave is 3.1 m from it, on the outer face of the wall.
    expect(attic.elevation).toBeGreaterThan(2.5);
    expect(ceiling({ x: 5, y: 3 })).toBeCloseTo(attic.elevation + 3.1 * tan35);
    expect(ceiling({ x: 5, y: 1 })).toBeCloseTo(attic.elevation + 1.1 * tan35);
    expect(ceiling({ x: 5, y: 20 })).toBeNull();
    // The walls of the story of the roof itself are not under it.
    expect(roofCeiling(building, ground)({ x: 5, y: 3 })).toBeNull();
  });

  it("makes four faces for a hip roof and a slab for a flat roof", () => {
    expect(
      roofGeometryOf(boxHouse(10, 6, "hip"), boxHouse(10, 6, "hip").roofs[0]).faces,
    ).toHaveLength(4);
    const flat = boxHouse(10, 6, "flat");
    const zs = heights(roofGeometryOf(flat, flat.roofs[0]).faces.map((f) => f.polygon));
    expect(Math.max(...zs)).toBeCloseTo(2.5 + FLAT_THICKNESS);
  });

  it("uses its own eave height instead of the top of the walls", () => {
    const building = boxHouse(10, 6, "gable");
    building.roofs[0].base = 4;
    expect(roofGeometryOf(building, building.roofs[0]).top).toBeCloseTo(4 + 3.1 * tan35);
  });

  it("computes again after a change in place", () => {
    const building = boxHouse(10, 6, "gable");
    const roof = building.roofs[0];
    const before = roofGeometryOf(building, roof).top;
    for (const side of roof.sides) side.pitch = 45;
    expect(roofGeometryOf(building, roof).top).toBeGreaterThan(before);
  });

  it("gives the lines of the roofs of a story only", () => {
    const building = boxHouse(10, 6, "hip");
    const story = building.stories[0];
    // The eaves (4), the ridge (1), and the hips (4), and no vertical edges.
    expect(roofLines(building, story.id)).toHaveLength(9);
    expect(roofLines(building, "other")).toEqual([]);
  });

  it("makes a roof on the outline of an L-shaped story", () => {
    const building = emptyBuilding();
    const story = building.stories[0];
    wallsAround(story, [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 8 },
      { x: 0, y: 8 },
    ]);
    const roof = newRoof(building, story, "hip")!;
    expect(roof.outline).toHaveLength(6);
    expect(roof.sides).toHaveLength(6);
    expect(roof.sides.every((s) => s.kind === "eave")).toBe(true);
    building.roofs.push(roof);
    const geometry = roofGeometryOf(building, roof);
    expect(geometry.faces.length).toBeGreaterThanOrEqual(6);
    expect(geometry.top).toBeCloseTo(2.5 + 2.1 * tan35);
  });

  it("gives no roof for a story without closed walls", () => {
    const building = emptyBuilding();
    expect(newRoof(building, building.stories[0], "gable")).toBeNull();
    expect(buildingTop(building)).toBeCloseTo(2.75);
  });
});
