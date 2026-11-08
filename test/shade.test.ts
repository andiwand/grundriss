import { describe, expect, it } from "vitest";
import { energyBalance } from "../src/model/balance";
import { climateFace, HOURS } from "../src/model/climate";
import { makeHouse } from "../src/model/example";
import { faceInfo, fieldShade, pvLayout, specificYield } from "../src/model/pv";
import { BEAM_SHARE, shadePolygons } from "../src/model/shade";
import { boxHouse } from "./houses";
import type { Building, Climate, PvArray, RoofKind } from "../src/model/types";
import vienna from "./fixtures/vienna-climate.json";

/** A house of 12 × 8 m with a roof of the preset. The ridge goes along x, south is +y. */
function house(kind: RoofKind = "gable", climate = true): Building {
  const building = boxHouse(12, 8, kind);
  if (climate) building.climate = vienna as Climate;
  return building;
}

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

/** A field on the face to the azimuth. */
function withField(building: Building, azimuth: number, change: Partial<PvArray> = {}) {
  const array = field(faceTo(building, azimuth), change);
  building.pv = [array];
  return array;
}

/** A chimney south of the house: 1 m in front of the south wall, as high as the ridge + 0.8 m. */
function addChimney(building: Building, size: number, x = 6) {
  building.stories[0].chimneys.push({
    id: `chimney-${size}-${x}`,
    x,
    y: 9,
    width: size,
    depth: size,
    top: null,
  });
}

describe("shade of the building on a field", () => {
  it("gives the factor 1 on the faces of a plain gable roof", () => {
    for (const azimuth of [180, 0]) {
      const building = house();
      const array = withField(building, azimuth);
      const layout = pvLayout(building, array)!;
      expect(layout.count).toBeGreaterThan(0);
      expect(layout.shade.factor).toBe(1);
      expect(layout.shade.hourly).toBeNull();
      expect(layout.shade.panels.every((f) => f === 1)).toBe(true);
      expect(layout.shade.samples).toBe(layout.count * 5);
      // The yield is the same as without the shade model.
      const free = layout.peak * specificYield(building, layout.tilt, layout.azimuth);
      expect(layout.yield).toBeCloseTo(free, 6);
      expect(layout.unshadedYield).toBeCloseTo(free, 6);
    }
  });

  it("gives the factor 1 on a hip roof and on a rack of a flat roof", () => {
    const hip = house("hip");
    expect(pvLayout(hip, withField(hip, 180))!.shade.factor).toBe(1);
    const flat = house("flat");
    const array = withField(flat, 180, { rack: { tilt: 15, azimuth: 180, eastWest: false } });
    expect(pvLayout(flat, array)!.shade.factor).toBe(1);
  });

  it("finds the polygons of the roofs and the chimneys", () => {
    const building = house();
    const before = shadePolygons(building).length;
    addChimney(building, 0.5);
    // A chimney adds four sides and a top.
    expect(shadePolygons(building).length).toBe(before + 5);
  });

  it("gives shade from a chimney south of a south field, more for a bigger chimney", () => {
    const small = house();
    const array = withField(small, 180);
    addChimney(small, 0.5);
    const big = house();
    withField(big, 180);
    addChimney(big, 1.5);

    const a = fieldShade(small, array)!;
    const b = fieldShade(big, array)!;
    expect(a.source).toBe("climate");
    expect(a.factor).toBeLessThan(1);
    expect(a.factor).toBeGreaterThan(0.8);
    expect(b.factor).toBeLessThan(a.factor);

    // The yield of the layout uses the factor.
    const layout = pvLayout(big, array)!;
    expect(layout.yield).toBeCloseTo(layout.unshadedYield * b.factor, 6);

    // The panels behind the chimney get more shade than the panels at the ends of the field.
    const middle = layout.panels.findIndex((quad) => {
      const x = quad.reduce((s, p) => s + p.x, 0) / 4;
      return Math.abs(x - 6) < 0.6;
    });
    expect(middle).toBeGreaterThanOrEqual(0);
    expect(b.panels[middle]).toBeLessThan(Math.max(...b.panels));
    expect(Math.min(...b.panels)).toBeLessThan(b.factor);
  });

  it("removes the beam only in the hours of the shade", () => {
    const building = house();
    const array = withField(building, 180);
    addChimney(building, 1.5);
    const shade = fieldShade(building, array)!;
    const hourly = shade.hourly!;
    expect(hourly).toHaveLength(HOURS);
    let shaded = 0;
    for (let h = 0; h < HOURS; h++) {
      expect(hourly[h]).toBeGreaterThanOrEqual(0);
      expect(hourly[h]).toBeLessThanOrEqual(1 + 1e-6);
      if (hourly[h] < 0.999) shaded++;
    }
    expect(shaded).toBeGreaterThan(50);
    // At night and in the hours without sun on the face, nothing changes.
    expect(hourly[0]).toBe(1);
    // The diffuse light stays, so no hour loses all of its yield.
    expect(Math.min(...hourly)).toBeGreaterThan(0);
  });

  it("uses a clear sky without a climate", () => {
    const building = house("gable", false);
    const array = withField(building, 180);
    addChimney(building, 1.5);
    const shade = fieldShade(building, array)!;
    expect(shade.source).toBe("estimate");
    expect(shade.hourly).toBeNull();
    expect(shade.factor).toBeLessThan(1);
    expect(shade.factor).toBeGreaterThan(1 - BEAM_SHARE);
    // The climate gives a similar loss.
    const climate = house();
    withField(climate, 180);
    addChimney(climate, 1.5);
    const withClimate = fieldShade(climate, array)!.factor;
    expect(Math.abs(1 - shade.factor - (1 - withClimate))).toBeLessThan(0.05);
  });

  it("gives shade from the dormer of the example house beside it", () => {
    const building = makeHouse();
    building.climate = vienna as Climate;
    const shade = fieldShade(building, building.pv[0])!;
    expect(shade.factor).toBeLessThan(1);
    expect(shade.factor).toBeGreaterThan(0.95);
    expect(Math.min(...shade.panels)).toBeLessThan(1);
  });

  it("keeps the result in a cache for a copy of the building", () => {
    const building = house();
    const array = withField(building, 180);
    addChimney(building, 1.5);
    const first = fieldShade(building, array);
    const copy = structuredClone(building);
    expect(fieldShade(copy, copy.pv[0])).toBe(first);
    copy.stories[0].chimneys[0].width = 1;
    expect(fieldShade(copy, copy.pv[0])).not.toBe(first);
  });

  it("is fast for the example house", () => {
    const building = makeHouse();
    building.climate = vienna as Climate;
    // A new north direction is a new key of the cache.
    building.north = 0.5;
    const start = performance.now();
    for (const array of building.pv) pvLayout(building, array);
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe("balance with shade", () => {
  it("uses the shaded hourly PV", () => {
    const free = house();
    withField(free, 180);
    const shaded = house();
    const array = withField(shaded, 180);
    addChimney(shaded, 1.5);
    const a = energyBalance(free)!;
    const b = energyBalance(shaded)!;
    const factor = fieldShade(shaded, array)!.factor;
    expect(b.pv).toBeLessThan(a.pv);
    expect(b.pv / a.pv).toBeCloseTo(factor, 3);
    // The sum of the hours is the yield of the layout.
    expect(b.pv).toBeCloseTo(pvLayout(shaded, array)!.yield, -1);
    // Without shade, the hours are the hours of the face.
    const layout = pvLayout(free, free.pv[0])!;
    const hourly = climateFace(free.climate!, layout.tilt, layout.azimuth).hourly;
    let sum = 0;
    for (let h = 0; h < HOURS; h++) sum += hourly[h];
    expect(a.pv).toBeCloseTo(layout.peak * sum, 3);
  });
});
