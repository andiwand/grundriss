import { describe, expect, it } from "vitest";
import { addStoryOnTop, buildingTop, emptyBuilding } from "../src/model/building";
import {
  newRoof,
  offsetOutline,
  roofCeiling,
  roofGeometryOf,
  roofLines,
  type Vec3,
} from "../src/model/roof";
import { FLAT_THICKNESS } from "../src/model/roofshape";
import { boxHouse, wallsAround } from "./houses";

const heights = (polygons: Vec3[][]) => polygons.flat().map((p) => p.z);
const tan35 = Math.tan((35 * Math.PI) / 180);

describe("roofs of a building", () => {
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
