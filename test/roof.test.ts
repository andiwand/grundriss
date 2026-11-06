import { describe, expect, it } from "vitest";
import { defaultRoof, emptyBuilding, FLAT_ROOF, roofFrame } from "../src/model/building";
import { addVertex, addWall } from "../src/model/plan";
import { roofLines, roofSurfaces, type Vec3 } from "../src/model/roof";
import type { Building, RoofKind } from "../src/model/types";

/** A house of 10 × 6 m with one story and a roof of the kind. */
function house(kind: RoofKind, ridge: "x" | "y" = "x"): Building {
  const building = emptyBuilding();
  const story = building.stories[0];
  const corners = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 6 },
    { x: 0, y: 6 },
  ].map((p) => addVertex(story, p));
  for (let i = 0; i < 4; i++) addWall(story, corners[i].id, corners[(i + 1) % 4].id);
  building.roof = { ...defaultRoof(building), kind, ridge };
  return building;
}

const heights = (polygons: Vec3[][]) => polygons.flat().map((p) => p.z);

/** The normal of the polygon in the world (x, height, y). */
function normal(polygon: Vec3[]): { x: number; y: number; z: number } {
  const w = polygon.map((p) => ({ x: p.x, y: p.z, z: p.y }));
  const e1 = { x: w[1].x - w[0].x, y: w[1].y - w[0].y, z: w[1].z - w[0].z };
  const e2 = { x: w[2].x - w[0].x, y: w[2].y - w[0].y, z: w[2].z - w[0].z };
  return {
    x: e1.y * e2.z - e1.z * e2.y,
    y: e1.z * e2.x - e1.x * e2.z,
    z: e1.x * e2.y - e1.y * e2.x,
  };
}

describe("roof surfaces", () => {
  it("puts the ridge of a gable roof at the top of the frame", () => {
    const building = house("gable");
    const frame = roofFrame(building)!;
    const surfaces = roofSurfaces(building)!;
    expect(surfaces.faces).toHaveLength(2);
    expect(surfaces.gables).toHaveLength(2);
    expect(Math.max(...heights(surfaces.faces))).toBeCloseTo(frame.top);
    expect(Math.min(...heights(surfaces.faces))).toBeCloseTo(frame.base);
    // The gables stand on the wall lines, not on the edge of the roof.
    expect(surfaces.gables[0].every((p) => Math.abs(p.x) < 1e-9 || Math.abs(p.x - 10) < 1e-9)).toBe(
      true,
    );
  });

  it("makes four faces for a hip roof and no gables", () => {
    const surfaces = roofSurfaces(house("hip"))!;
    expect(surfaces.faces).toHaveLength(4);
    expect(surfaces.gables).toHaveLength(0);
  });

  it("puts a flat roof from the base to the base plus its thickness", () => {
    const building = house("flat");
    const frame = roofFrame(building)!;
    const zs = heights(roofSurfaces(building)!.faces);
    expect(Math.min(...zs)).toBeCloseTo(frame.base);
    expect(Math.max(...zs)).toBeCloseTo(frame.base + FLAT_ROOF);
  });

  it("raises a shed roof across the ridge and closes it with walls", () => {
    const building = house("shed", "y");
    const frame = roofFrame(building)!;
    const surfaces = roofSurfaces(building)!;
    expect(surfaces.faces).toHaveLength(1);
    expect(Math.max(...heights(surfaces.faces))).toBeCloseTo(frame.top);
    // Two side walls and the high wall. The low wall has a height of more than 0 too, because
    // the low eave is the edge of the overhang.
    expect(surfaces.gables.length).toBeGreaterThanOrEqual(3);
  });

  it("turns the roof faces up and out", () => {
    for (const kind of ["gable", "hip", "shed"] as const) {
      for (const face of roofSurfaces(house(kind))!.faces) {
        expect(normal(face).y).toBeGreaterThan(0);
      }
    }
  });

  it("gives the lines of the roof from above", () => {
    expect(roofLines(house("flat"))).toHaveLength(4);
    expect(roofLines(house("gable"))).toHaveLength(5);
    expect(roofLines(house("hip"))).toHaveLength(9);
  });

  it("gives no roof without walls", () => {
    const building = emptyBuilding();
    building.roof = defaultRoof(building);
    expect(roofSurfaces(building)).toBeNull();
    expect(roofLines(building)).toEqual([]);
  });
});
