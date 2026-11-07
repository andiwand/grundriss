import { describe, expect, it } from "vitest";
import {
  areaWithHeight,
  ceilingArea,
  ceilingVolume,
  clearHeightLines,
  livingArea,
  roofIsCeiling,
  roomCeiling,
  stripArea,
} from "../src/model/attic";
import { addStoryOnTop, emptyBuilding } from "../src/model/building";
import { roomHeatLoss, uValue } from "../src/model/energy";
import {
  clipConvex,
  intersectionArea,
  intersectPolygons,
  isConvex,
  signedArea,
  triangulate,
} from "../src/model/geometry";
import { clearHeight, newRoof, planeOf, roofCeiling } from "../src/model/roof";
import { editRoomInfo, findRooms } from "../src/model/rooms";
import type { Building, Dormer, Point, Story } from "../src/model/types";
import { wallsAround } from "./houses";

const TAN = Math.tan((35 * Math.PI) / 180);
const COS = Math.cos((35 * Math.PI) / 180);

const rect = (w: number, d: number): Point[] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: d },
  { x: 0, y: d },
];

/**
 * A house of 10 × 8 m with an attic. With `own`, the gable roof is on the attic, on knee walls of
 * 1 m. Else the roof is on the ground floor, and its eaves are on the floor of the attic.
 */
function atticHouse(own: boolean, outline: Point[] = rect(10, 8)): [Building, Story] {
  const building = emptyBuilding();
  wallsAround(building.stories[0], outline);
  const attic = addStoryOnTop(building, true);
  wallsAround(attic, outline);
  for (const wall of attic.walls) wall.height = 1;
  const roofStory = own ? attic : building.stories[0];
  building.roofs.push({ ...newRoof(building, roofStory, "gable")!, id: "roof" });
  return [building, attic];
}

/** The mean of the ceiling over a fine grid, as a check of the exact integrals. */
function sampled(building: Building, story: Story, step = 0.02) {
  const room = findRooms(story)[0];
  const ceiling = roomCeiling(building, story, room);
  const xs = room.polygon.map((p) => p.x);
  const ys = room.polygon.map((p) => p.y);
  let volume = 0;
  let full = 0;
  let half = 0;
  for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) {
    for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) {
      const p = { x, y };
      let inside = false;
      const poly = room.polygon;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i];
        const b = poly[j];
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
          inside = !inside;
        }
      }
      if (!inside) continue;
      const h = ceiling.at(p);
      volume += h * step * step;
      if (h >= 2) full += step * step;
      else if (h >= 1) half += step * step;
    }
  }
  return { ceiling, volume, full, half };
}

describe("polygon clipping", () => {
  const square = rect(2, 2);
  const ell: Point[] = [
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    { x: 3, y: 1 },
    { x: 1, y: 1 },
    { x: 1, y: 3 },
    { x: 0, y: 3 },
  ];

  it("clips a non-convex polygon by a convex polygon", () => {
    expect(isConvex(square)).toBe(true);
    expect(isConvex(ell)).toBe(false);
    // The L and the square share the square without its corner of 1 × 1.
    expect(Math.abs(signedArea(clipConvex(ell, square)))).toBeCloseTo(3);
    expect(intersectionArea(ell, square)).toBeCloseTo(3);
  });

  it("cuts a non-convex polygon into triangles of the same area", () => {
    const triangles = triangulate(ell);
    expect(triangles).toHaveLength(4);
    const sum = triangles.reduce((s, t) => s + signedArea(t), 0);
    expect(sum).toBeCloseTo(5);
    expect(triangles.every((t) => signedArea(t) > 0)).toBe(true);
  });

  it("clips by a non-convex polygon, in both directions", () => {
    const moved = square.map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 }));
    // The square from 0.5 to 2.5 overlaps the L in 2 × 0.5 + 0.5 × 1.5 = 1.75 m².
    expect(intersectionArea(moved, ell)).toBeCloseTo(1.75);
    expect(intersectionArea(ell, moved)).toBeCloseTo(1.75);
    expect(intersectionArea([...ell].reverse(), moved)).toBeCloseTo(1.75);
    expect(intersectPolygons(ell, ell).reduce((s, p) => s + signedArea(p), 0)).toBeCloseTo(5);
  });

  it("gives the plane of a roof face", () => {
    const plane = planeOf([
      { x: 0, y: 0, z: 1 },
      { x: 4, y: 0, z: 1 },
      { x: 4, y: 2, z: 3 },
      { x: 0, y: 2, z: 3 },
    ])!;
    expect(plane.gx).toBeCloseTo(0);
    expect(plane.gy).toBeCloseTo(1);
    expect(plane.c).toBeCloseTo(1);
    expect(plane.slope).toBeCloseTo(Math.SQRT2);
    // A vertical polygon has no plane over the plan.
    expect(
      planeOf([
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 1, y: 0, z: 1 },
      ]),
    ).toBeNull();
  });
});

describe("clear height under a roof", () => {
  it("includes the roof on the story itself", () => {
    const [building, attic] = atticHouse(true);
    // The eaves are on the knee walls of 1 m at the outer face, 0.1 m out of the center line.
    const clear = clearHeight(building, attic);
    expect(clear({ x: 5, y: 0 })).toBeCloseTo(1 + 0.1 * TAN);
    expect(clear({ x: 5, y: 4 })).toBeCloseTo(1 + 4.1 * TAN);
    // The walls of the attic stay under the roofs of the stories below only.
    expect(roofCeiling(building, attic)({ x: 5, y: 4 })).toBeNull();
    expect(roofIsCeiling(building, attic)).toBe(true);
  });

  it("goes up to the roof of a dormer", () => {
    const [building, attic] = atticHouse(false);
    const dormer: Dormer = {
      id: "d",
      side: 0,
      offset: 5,
      distance: 1,
      width: 2,
      height: 1.2,
      kind: "flat",
      pitch: 0,
    };
    const plain = sampled(building, attic);
    building.roofs[0].dormers.push(dormer);
    const clear = clearHeight(building, attic);
    // Under the dormer, the ceiling is the flat roof of the dormer: 1.2 m over the main face at
    // the front of the dormer. Side 0 of the outline is at y = 8, so the front is 1 m in from
    // the outer face, at y = 7.1.
    const front = 1 * TAN + 1.2;
    expect(clear({ x: 5, y: 6.6 })).toBeCloseTo(front);
    expect(roofCeiling(building, attic)({ x: 5, y: 6.6 })).toBeCloseTo(attic.elevation + front);
    // In front of the dormer and next to it, the main face stays.
    expect(clear({ x: 5, y: 7.5 })).toBeCloseTo(0.6 * TAN);
    expect(clear({ x: 7, y: 6.6 })).toBeCloseTo(1.5 * TAN);
    // The dormer adds a prism with a triangle of 1.2 m × 1.2 / tan(35°) and a width of 2 m.
    const ceiling = roomCeiling(building, attic, findRooms(attic)[0]);
    const extra = ceilingVolume(ceiling) - ceilingVolume(plain.ceiling);
    expect(extra).toBeCloseTo((2 * 1.2 * 1.2) / TAN / 2, 6);
    const check = sampled(building, attic);
    expect(ceilingVolume(ceiling)).toBeCloseTo(check.volume, 0);
  });
});

describe("the ceiling of an attic room", () => {
  it("has the sloped roof area, the walls up to the roof, and the volume under it", () => {
    const [building, attic] = atticHouse(false);
    const room = findRooms(attic)[0];
    const ceiling = roomCeiling(building, attic, room);
    expect(ceiling.cap).toBe(Infinity);
    // The two faces cover the room fully.
    expect(ceilingArea(ceiling)).toBeCloseTo(80 / COS);
    // The clear height goes from 0.1 · tan at the eaves to 4.1 · tan at the ridge.
    const eave = 0.1 * TAN;
    const ridge = 4.1 * TAN;
    expect(ceilingVolume(ceiling)).toBeCloseTo((80 * (eave + ridge)) / 2);
    // An eave wall has the height of the eaves. A gable wall is a pentagon.
    expect(stripArea(ceiling, { x: 0, y: 0 }, { x: 10, y: 0 }, 0, 10)).toBeCloseTo(10 * eave, 3);
    expect(stripArea(ceiling, { x: 0, y: 0 }, { x: 0, y: 8 }, 0, 8)).toBeCloseTo(
      (8 * (eave + ridge)) / 2,
      3,
    );
  });

  it("gives the same results as a fine grid", () => {
    // An L-shaped house has faces that are not convex.
    const ell: Point[] = [
      { x: 0, y: 0 },
      { x: 14, y: 0 },
      { x: 14, y: 7 },
      { x: 7, y: 7 },
      { x: 7, y: 13 },
      { x: 0, y: 13 },
    ];
    const [building, attic] = atticHouse(false, ell);
    const { ceiling, volume, full, half } = sampled(building, attic, 0.03);
    expect(full).toBeGreaterThan(10);
    // The grid has an error at the edges, so the check allows 1 % of the floor area.
    expect(Math.abs(ceilingVolume(ceiling) / volume - 1)).toBeLessThan(0.01);
    expect(Math.abs(areaWithHeight(ceiling, 2) - full)).toBeLessThan(1.4);
    expect(Math.abs(areaWithHeight(ceiling, 1) - areaWithHeight(ceiling, 2) - half)).toBeLessThan(
      1.4,
    );
  });

  it("has a flat ceiling where the room has its own height", () => {
    const [building, attic] = atticHouse(false);
    editRoomInfo(attic, findRooms(attic)[0], (info) => (info.height = 2.3));
    const room = findRooms(attic)[0];
    const ceiling = roomCeiling(building, attic, room);
    expect(ceiling.cap).toBe(2.3);
    // The roof is the ceiling where it is below 2.3 m: up to (2.3 − eave) / tan from each side.
    const run = (2.3 - 0.1 * TAN) / TAN;
    const sloped = 2 * 10 * run;
    expect(ceilingArea(ceiling)).toBeCloseTo(80 + sloped * (1 / COS - 1));
    const check = sampled(building, attic);
    expect(ceilingVolume(ceiling)).toBeCloseTo(check.volume, 0);
  });

  it("does not change a full story under its own roof", () => {
    const building = emptyBuilding();
    const story = building.stories[0];
    wallsAround(story, rect(10, 8));
    building.roofs.push(newRoof(building, story, "gable")!);
    expect(roofIsCeiling(building, story)).toBe(false);
    const ceiling = roomCeiling(building, story, findRooms(story)[0]);
    expect(ceilingArea(ceiling)).toBeCloseTo(80);
    expect(ceilingVolume(ceiling)).toBeCloseTo(80 * 2.5);
    expect(livingArea(building, story, findRooms(story)[0]).living).toBeCloseTo(80);
  });
});

describe("living area by the WoFlV", () => {
  it("counts 2 m and more fully, 1 m to 2 m half, and less than 1 m not", () => {
    const [building, attic] = atticHouse(false);
    const room = findRooms(attic)[0];
    const eave = 0.1 * TAN;
    // The distances from the outer face where the clear height is 1 m and 2 m.
    const d1 = 1 / TAN;
    const d2 = 2 / TAN;
    const full = 10 * (8.2 - 2 * d2);
    const half = 2 * 10 * (d2 - d1);
    const area = livingArea(building, attic, room);
    expect(eave).toBeLessThan(1);
    expect(area.floor).toBeCloseTo(80);
    expect(area.full).toBeCloseTo(full);
    expect(area.half).toBeCloseTo(half);
    expect(area.living).toBeCloseTo(full + half / 2);
  });

  it("counts a knee wall of 1 m at least half", () => {
    const [building, attic] = atticHouse(true);
    const area = livingArea(building, attic, findRooms(attic)[0]);
    const d2 = (2 - 1) / TAN - 0.1;
    expect(area.full).toBeCloseTo(10 * (8 - 2 * d2));
    expect(area.full + area.half).toBeCloseTo(80);
  });

  it("gives the lines of 1 m and 2 m clear height", () => {
    const [building, attic] = atticHouse(false);
    const lines = clearHeightLines(building, attic, 1);
    expect(lines).toHaveLength(2);
    const ys = lines.map(([a, b]) => (expect(a.y).toBeCloseTo(b.y), a.y)).sort((p, q) => p - q);
    expect(ys[0]).toBeCloseTo(1 / TAN - 0.1);
    expect(ys[1]).toBeCloseTo(8.1 - 1 / TAN);
    for (const [a, b] of lines) expect(Math.abs(a.x - b.x)).toBeCloseTo(10);
    // A room with a ceiling lower than the level has no line at that level.
    editRoomInfo(attic, findRooms(attic)[0], (info) => (info.height = 1.8));
    expect(clearHeightLines(building, attic, 2)).toHaveLength(0);
    // A full story under its own roof has none.
    expect(clearHeightLines(building, building.stories[0], 1)).toHaveLength(0);
  });
});

describe("heat loss of an attic room", () => {
  it("uses the sloped roof area, the walls up to the roof, and the volume under the roof", () => {
    const [building, attic] = atticHouse(true);
    const loss = roomHeatLoss(building, attic, findRooms(attic)[0]);
    const env = building.envelope;
    const delta = env.inside - env.outside;
    const eave = 1 + 0.1 * TAN;
    const ridge = 1 + 4.1 * TAN;
    expect(loss.roofArea).toBeCloseTo(80 / COS);
    expect(loss.roof).toBeCloseTo((80 / COS) * uValue(env.roof, "roof") * delta);
    expect(loss.wallArea).toBeCloseTo(2 * 10 * eave + 2 * ((8 * (eave + ridge)) / 2), 2);
    expect(loss.volume).toBeCloseTo((80 * (eave + ridge)) / 2);
  });

  it("adds the walls and the window of a dormer", () => {
    const [building, attic] = atticHouse(false);
    const before = roomHeatLoss(building, attic, findRooms(attic)[0]);
    building.roofs[0].dormers.push({
      id: "d",
      side: 0,
      offset: 5,
      distance: 1,
      width: 2,
      height: 1.2,
      kind: "flat",
      pitch: 0,
    });
    const after = roomHeatLoss(building, attic, findRooms(attic)[0]);
    expect(after.windows).toBeGreaterThan(before.windows);
    // The front wall of 2 × 1.2 m and two triangles of 1.2 × 1.2 / tan, without the window.
    const window = (2 - 0.2) * (1.2 - 0.2);
    const walls = 2 * 1.2 + 1.2 * (1.2 / TAN) - window;
    expect(after.wallArea - before.wallArea).toBeCloseTo(walls, 2);
  });
});
