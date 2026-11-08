import { describe, expect, it } from "vitest";
import { emptyBuilding } from "../src/model/building";
import { pvYieldPerKwp } from "../src/model/climate";
import {
  defaultRack,
  faceInfo,
  pvLayout,
  pvPanels,
  pvSummary,
  specificYield,
  winterSunElevation,
  yieldFactor,
} from "../src/model/pv";
import { parseBuilding, serializeBuilding } from "../src/model/file";
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
  rack: null,
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

describe("racks on a flat roof", () => {
  /** The tilt and the azimuth of a panel from its corners: the low edge and the high edge. */
  const panelOrientation = (quad: { x: number; y: number; z: number }[]) => {
    const sorted = [...quad].sort((p, q) => p.z - q.z);
    const mid = (a: (typeof quad)[number], b: (typeof quad)[number]) => ({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      z: (a.z + b.z) / 2,
    });
    const low = mid(sorted[0], sorted[1]);
    const high = mid(sorted[2], sorted[3]);
    const run = Math.hypot(high.x - low.x, high.y - low.y);
    const tilt = (Math.atan2(high.z - low.z, run) * 180) / Math.PI;
    // The panel faces from its high edge to its low edge, on the plan with y down.
    const azimuth = ((Math.atan2(low.x - high.x, -(low.y - high.y)) * 180) / Math.PI + 360) % 360;
    return { tilt, azimuth };
  };

  it("tilts the panels to the south and keeps the rows out of the shade", () => {
    const building = house("flat");
    const flat = pvLayout(building, field(0))!;
    const layout = pvLayout(building, field(0, { rack: defaultRack(false) }))!;
    expect(layout.tilt).toBe(15);
    expect(layout.azimuth).toBe(180);
    expect(layout.count).toBeGreaterThan(0);
    // A rack needs space between the rows, so fewer panels fit, but each one gives more.
    expect(layout.count).toBeLessThan(flat.count);
    expect(layout.yield / layout.peak).toBeGreaterThan(flat.yield / flat.peak);
    for (const quad of layout.panels) {
      const o = panelOrientation(quad);
      expect(o.tilt).toBeCloseTo(15);
      expect(o.azimuth).toBeCloseTo(180);
    }
    // The shade of the high edge of a row at the winter sun ends before the next row starts.
    const rows = [
      ...new Set(layout.panels.map((q) => Math.round(Math.min(...q.map((p) => p.y)) * 1000))),
    ]
      .map((y) => y / 1000)
      .sort((a, b) => a - b);
    expect(rows.length).toBeGreaterThan(1);
    const quad = layout.panels[0];
    const rise = Math.max(...quad.map((p) => p.z)) - Math.min(...quad.map((p) => p.z));
    const shade = rise / Math.tan((winterSunElevation(48) * Math.PI) / 180);
    const depth = Math.max(...quad.map((p) => p.y)) - Math.min(...quad.map((p) => p.y));
    expect(rows[1] - rows[0]).toBeGreaterThanOrEqual(depth + shade - 1e-3);
  });

  it("puts two panels back to back on an east-west rack, with two directions", () => {
    const building = house("flat");
    const layout = pvLayout(building, field(0, { rack: defaultRack(true) }))!;
    expect(layout.count % 2).toBe(0);
    expect(layout.parts.map((p) => p.azimuth).sort((a, b) => a - b)).toEqual([90, 270]);
    expect(layout.parts[0].peak).toBeCloseTo(layout.parts[1].peak);
    const directions = layout.panels.map((q) => Math.round(panelOrientation(q).azimuth));
    expect(new Set(directions)).toEqual(new Set([90, 270]));
  });

  it("ignores the rack on a sloped face", () => {
    const building = house("gable");
    const index = faceTo(building, 180);
    const plain = pvLayout(building, field(index))!;
    const racked = pvLayout(building, field(index, { rack: defaultRack(false) }))!;
    expect(racked.count).toBe(plain.count);
    expect(racked.tilt).toBeCloseTo(35);
  });

  it("splits the PV of the months by the directions of an east-west rack", () => {
    const building = house("flat");
    building.climate = vienna as Climate;
    building.pv = [field(0, { rack: defaultRack(true) })];
    const layout = pvLayout(building, building.pv[0])!;
    const east = pvYieldPerKwp(building.climate, 10, 90);
    const west = pvYieldPerKwp(building.climate, 10, 270);
    expect(layout.yield).toBeCloseTo(layout.parts[0].peak * east + layout.parts[1].peak * west);
  });

  it("keeps the rack in the file, and an old file has no rack", () => {
    const building = house("flat");
    building.pv = [field(0, { rack: { tilt: 12, azimuth: 95, eastWest: true } })];
    const read = parseBuilding(serializeBuilding(building));
    expect(read.pv[0].rack).toEqual({ tilt: 12, azimuth: 95, eastWest: true });
    const data = JSON.parse(serializeBuilding(building));
    delete data.pv[0].rack;
    expect(parseBuilding(JSON.stringify(data)).pv[0].rack).toBeNull();
  });
});
