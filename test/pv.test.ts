import { describe, expect, it } from "vitest";
import { emptyBuilding } from "../src/model/building";
import { pvYieldPerKwp } from "../src/model/climate";
import {
  faceInfo,
  pvLayout,
  pvPanels,
  pvSummary,
  specificYield,
  yieldFactor,
} from "../src/model/pv";
import { roofGeometryOf } from "../src/model/roof";
import { boxHouse } from "./houses";
import type { Building, Climate, PvArray, RoofKind } from "../src/model/types";
import vienna from "./fixtures/vienna-climate.json";

/** A house of 12 × 8 m with a roof of the preset and a pitch of 35°. The ridge goes along x. */
const house = (kind: RoofKind, north = 0): Building => boxHouse(12, 8, kind, north);

const field = (face: number, change: Partial<PvArray> = {}): PvArray => ({
  id: "pv",
  roofId: "roof",
  face,
  panelWidth: 1.13,
  panelHeight: 1.72,
  panelPower: 430,
  portrait: true,
  margin: 0.3,
  gap: 0.02,
  limit: null,
  ...change,
});

/** The face that points to the azimuth, about. */
const faceTo = (building: Building, azimuth: number) =>
  faceInfo(building).find((f) => Math.abs(f.azimuth - azimuth) < 1)!.index;

describe("yield factor", () => {
  it("is 1 for south at 35° and smaller for other directions", () => {
    expect(yieldFactor(35, 180)).toBeCloseTo(1);
    expect(yieldFactor(35, 90)).toBeGreaterThan(0.78);
    expect(yieldFactor(35, 90)).toBeLessThan(0.86);
    expect(yieldFactor(35, 270)).toBeCloseTo(yieldFactor(35, 90));
    expect(yieldFactor(35, 0)).toBeGreaterThan(0.53);
    expect(yieldFactor(35, 0)).toBeLessThan(0.62);
    expect(yieldFactor(0, 0)).toBeCloseTo(yieldFactor(0, 180));
    expect(yieldFactor(0, 180)).toBeCloseTo(0.87, 2);
  });
});

describe("faces", () => {
  it("gives the two faces of a gable roof with their directions", () => {
    const building = house("gable");
    const faces = faceInfo(building);
    expect(faces).toHaveLength(2);
    for (const face of faces) expect(face.tilt).toBeCloseTo(35);
    // The plan y points down, so the face toward +y faces south when north is up.
    expect(faces.map((f) => Math.round(f.azimuth)).sort()).toEqual([0, 180]);
  });

  it("turns the directions with north", () => {
    const faces = faceInfo(house("gable", 90));
    expect(faces.map((f) => Math.round(f.azimuth)).sort((a, b) => a - b)).toEqual([90, 270]);
  });

  it("gives only the top face of a flat roof", () => {
    const faces = faceInfo(house("flat"));
    expect(faces).toHaveLength(1);
    expect(faces[0].tilt).toBeCloseTo(0);
  });
});

describe("layout", () => {
  it("fills the south face and keeps the panels inside it", () => {
    const building = house("gable");
    const index = faceTo(building, 180);
    const layout = pvLayout(building, field(index))!;
    expect(layout.count).toBeGreaterThan(10);
    expect(layout.peak).toBeCloseTo((layout.count * 430) / 1000);
    expect(layout.yield).toBeCloseTo(layout.peak * 1000, -1);
    const face = roofGeometryOf(building, building.roofs[0]).faces[index].polygon;
    const xs = face.map((p) => p.x);
    const ys = face.map((p) => p.y);
    const zs = face.map((p) => p.z);
    for (const panel of layout.panels) {
      for (const p of panel) {
        expect(p.x).toBeGreaterThanOrEqual(Math.min(...xs) + 0.29);
        expect(p.x).toBeLessThanOrEqual(Math.max(...xs) - 0.29);
        expect(p.y).toBeGreaterThanOrEqual(Math.min(...ys) - 1e-6);
        expect(p.y).toBeLessThanOrEqual(Math.max(...ys) + 1e-6);
        expect(p.z).toBeGreaterThan(Math.min(...zs));
        expect(p.z).toBeLessThan(Math.max(...zs) + 0.1);
      }
    }
  });

  it("puts fewer panels with a larger margin, and stops at the limit", () => {
    const building = house("gable");
    const index = faceTo(building, 180);
    const many = pvLayout(building, field(index))!.count;
    expect(pvLayout(building, field(index, { margin: 1.2 }))!.count).toBeLessThan(many);
    expect(pvLayout(building, field(index, { limit: 5 }))!.count).toBe(5);
  });

  it("fits panels in the triangle of a hip roof inside the face", () => {
    const building = house("hip");
    for (const face of faceInfo(building)) {
      const layout = pvLayout(building, field(face.index, { margin: 0.2 }))!;
      expect(layout.count).toBeGreaterThanOrEqual(0);
      expect(layout.area).toBeLessThanOrEqual(face.area);
    }
  });

  it("gives panels with the normal up and sums all fields", () => {
    const building = house("gable");
    const south = faceTo(building, 180);
    const north = faceTo(building, 0);
    building.pv = [field(south), { ...field(north), id: "pv2" }];
    const panels = pvPanels(building);
    const summary = pvSummary(building);
    expect(panels).toHaveLength(summary.count);
    // The north field yields less per kWp.
    const s = pvLayout(building, building.pv[0])!;
    const n = pvLayout(building, building.pv[1])!;
    expect(n.yield / n.peak).toBeLessThan(s.yield / s.peak);
    expect(summary.yield).toBeCloseTo(s.yield + n.yield);
    // Each panel goes counterclockwise from above in the world (x, z, y): its normal points up.
    for (const { corners } of panels) {
      const [a, b, c] = corners;
      const u = { x: b.x - a.x, y: b.z - a.z, z: b.y - a.y };
      const v = { x: c.x - b.x, y: c.z - b.z, z: c.y - b.y };
      const up = u.z * v.x - u.x * v.z;
      expect(up).toBeGreaterThan(0);
    }
  });

  it("gives null for a face that does not exist", () => {
    expect(pvLayout(house("gable"), field(99))).toBeNull();
    expect(pvLayout(emptyBuilding(), field(0))).toBeNull();
  });
});

describe("holes in a field", () => {
  it("leaves out the panels where a roof window is", () => {
    const building = house("gable");
    const index = faceTo(building, 180);
    const before = pvLayout(building, field(index))!;
    const roof = building.roofs[0];
    const side = roofGeometryOf(building, roof).faces[index].side;
    // A window of 1.2 × 1.4 m in the middle of the south face.
    roof.windows.push({ id: "w", side, offset: 6, distance: 1.5, width: 1.2, length: 1.4 });
    const after = pvLayout(building, field(index))!;
    expect(after.count).toBeLessThan(before.count);
    const quad = roofGeometryOf(building, roof).windows[0].quad;
    const xs = quad.map((p) => p.x);
    const ys = quad.map((p) => p.y);
    // No panel corner lies inside the box of the window on the plan.
    for (const panel of after.panels) {
      for (const p of panel) {
        const inside =
          p.x > Math.min(...xs) &&
          p.x < Math.max(...xs) &&
          p.y > Math.min(...ys) &&
          p.y < Math.max(...ys);
        expect(inside).toBe(false);
      }
    }
  });
});

describe("yield from the climate", () => {
  it("uses the stored climate of the building, else the estimate", () => {
    const building = house("gable");
    const south = faceTo(building, 180);
    const north = faceTo(building, 0);
    const estimate = pvLayout(building, field(south))!;
    expect(specificYield(building, 35, 180)).toBeCloseTo(1000);
    building.climate = vienna as Climate;
    const layout = pvLayout(building, field(south))!;
    expect(layout.count).toBe(estimate.count);
    expect(layout.yield / layout.peak).toBeCloseTo(pvYieldPerKwp(building.climate, 35, 180), 0);
    expect(layout.yield / layout.peak).toBeGreaterThan(1100);
    const back = pvLayout(building, field(north))!;
    expect(back.yield / back.peak).toBeLessThan(0.6 * (layout.yield / layout.peak));
  });
});
