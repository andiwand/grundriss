import { describe, expect, it } from "vitest";
import { emptyPlan, findWall, wallEnds, wallLength } from "../src/model/plan";
import { CLASSES, CONTRACT_VERSION } from "../src/recognition/contract";
import {
  addRecognized,
  components,
  findOpenings,
  openingsToWorld,
  type RecognizedOpening,
  withoutEdgeLines,
} from "../src/recognition/openings";
import { argmax, blendTile, edgeWeight, padTo32, tileStarts } from "../src/recognition/tiles";
import type { WallSegment } from "../src/tracing/segments";

const BG = CLASSES.indexOf("background");
const WALL = CLASSES.indexOf("wall");
const DOOR = CLASSES.indexOf("door");
const WINDOW = CLASSES.indexOf("window");

/** A class map of `width × height` with background, and a function that fills rectangles. */
function map(width: number, height: number) {
  const classes = new Uint8Array(width * height).fill(BG);
  const fill = (x0: number, y0: number, x1: number, y1: number, value: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) classes[y * width + x] = value;
  };
  return { classes, fill };
}

describe("tiles", () => {
  it("pads to multiples of 32", () => {
    expect(padTo32(1)).toBe(32);
    expect(padTo32(1024)).toBe(1024);
    expect(padTo32(1025)).toBe(1056);
  });

  it("covers an axis with overlapping tiles that end at the end", () => {
    expect(tileStarts(400, 512, 64)).toEqual([0]);
    expect(tileStarts(1024, 512, 64)).toEqual([0, 448, 512]);
    const starts = tileStarts(1056, 512, 64);
    expect(starts[starts.length - 1] + 512).toBe(1056);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i - 1] + 512 - starts[i]).toBeGreaterThanOrEqual(64);
    }
  });

  it("lowers the weight only at the inner edges of a tile", () => {
    expect(edgeWeight(0, 512, 32, true, false)).toBe(1);
    expect(edgeWeight(0, 512, 32, false, false)).toBeLessThan(0.05);
    expect(edgeWeight(256, 512, 32, false, false)).toBe(1);
    expect(edgeWeight(511, 512, 32, false, true)).toBe(1);
  });

  it("blends two tiles and takes the class with the highest score", () => {
    // An image of 3 × 1 pixels and 2 classes. The left tile says class 0, the right tile says
    // class 1, and they overlap at the middle pixel, where both have the same weight.
    const sum = new Float32Array(2 * 3);
    blendTile(sum, 3, 1, new Float32Array([5, 5, 0, 0]), 2, 0, 0, 2, 1, 0);
    blendTile(sum, 3, 1, new Float32Array([0, 0, 1, 9]), 2, 1, 0, 2, 1, 0);
    expect(Array.from(argmax(sum, 2, 3, 1))).toEqual([0, 0, 1]);
  });
});

describe("components", () => {
  it("finds the groups of a class and drops the small ones", () => {
    const { classes, fill } = map(40, 20);
    fill(2, 2, 22, 6, DOOR); // 20 × 4: a long group along x.
    fill(30, 10, 31, 11, DOOR); // One pixel of noise.
    const groups = components(classes, 40, 20, DOOR, 5);
    expect(groups).toHaveLength(1);
    expect(groups[0].area).toBe(80);
    expect(groups[0].center.x).toBeCloseTo(12);
    expect(groups[0].center.y).toBeCloseTo(4);
    expect(Math.abs(groups[0].axis.x)).toBeCloseTo(1);
    expect(groups[0].elongation).toBeGreaterThan(3);
  });
});

describe("openings on walls", () => {
  // A horizontal wall at y = 10 from x = 0 to 100 with a door from x = 20 to 40, and a vertical
  // wall at x = 100 from y = 10 to 90 with a window from y = 50 to 70. The walls are 6 px thick.
  function plan() {
    const { classes, fill } = map(110, 100);
    fill(0, 7, 103, 13, WALL);
    fill(97, 7, 103, 90, WALL);
    fill(20, 7, 40, 13, DOOR);
    fill(97, 50, 103, 70, WINDOW);
    const walls: WallSegment[] = [
      { a: { x: 0, y: 10 }, b: { x: 100, y: 10 }, thickness: 6 },
      { a: { x: 100, y: 10 }, b: { x: 100, y: 90 }, thickness: 6 },
    ];
    return { classes, walls };
  }

  it("puts a door and a window on the right walls with their widths", () => {
    const { classes, walls } = plan();
    const openings = findOpenings(classes, 110, 100, walls, {
      door: DOOR,
      window: WINDOW,
      minArea: 10,
    });
    const door = openings.find((o) => o.kind === "door")!;
    const window = openings.find((o) => o.kind === "window")!;
    expect(door.segment).toBe(0);
    expect(door.width).toBeCloseTo(20);
    expect(door.center.x).toBeCloseTo(30);
    expect(door.center.y).toBeCloseTo(10);
    expect(window.segment).toBe(1);
    expect(window.width).toBeCloseTo(20);
    expect(window.center.x).toBeCloseTo(100);
    expect(window.center.y).toBeCloseTo(60);
  });

  it("ignores a group far from all walls", () => {
    const { classes, fill } = map(110, 100);
    fill(40, 50, 60, 56, DOOR);
    const walls: WallSegment[] = [{ a: { x: 0, y: 10 }, b: { x: 100, y: 10 }, thickness: 6 }];
    const openings = findOpenings(classes, 110, 100, walls, {
      door: DOOR,
      window: WINDOW,
      minArea: 5,
    });
    expect(openings).toHaveLength(0);
  });
});

describe("into the plan", () => {
  it("adds the walls and puts the openings on the right walls with their widths", () => {
    // An L of two walls in meters, with a door in the top wall and a window in the right wall.
    const walls: WallSegment[] = [
      { a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, thickness: 0.24 },
      { a: { x: 5, y: 0 }, b: { x: 5, y: 4 }, thickness: 0.24 },
    ];
    const openings: RecognizedOpening[] = [
      { kind: "door", segment: 0, center: { x: 2, y: 0.02 }, width: 0.9 },
      { kind: "window", segment: 1, center: { x: 5, y: 3 }, width: 1.4 },
      { kind: "window", segment: 1, center: { x: 5, y: 1 }, width: 0.1 }, // Too narrow: noise.
    ];
    const plan = emptyPlan();
    const result = addRecognized(plan, walls, openings, { tolerance: 0.1, height: 2.5 });
    expect(result.walls).toHaveLength(2);
    expect(plan.vertices).toHaveLength(3);
    expect(result.openings).toHaveLength(2);

    const door = plan.openings.find((o) => o.kind === "door")!;
    const doorWall = findWall(plan, door.wallId)!;
    const [a, b] = wallEnds(plan, doorWall);
    expect(Math.abs(a.y) + Math.abs(b.y)).toBeCloseTo(0);
    expect(door.width).toBeCloseTo(0.9);
    // The offset goes from the vertex `a` of the wall, so the door center is at x = 2.
    const at = a.x + ((b.x - a.x) * door.offset) / wallLength(plan, doorWall);
    expect(at).toBeCloseTo(2);
    expect(door.sill).toBe(0);

    const window = plan.openings.find((o) => o.kind === "window")!;
    const [c, d] = wallEnds(plan, findWall(plan, window.wallId)!);
    expect(c.x).toBeCloseTo(5);
    expect(d.x).toBeCloseTo(5);
    expect(window.width).toBeCloseTo(1.4);
    expect(window.sill).toBeGreaterThan(0);
  });

  it("converts openings from background pixels to meters", () => {
    const [o] = openingsToWorld(
      [{ kind: "door", segment: 0, center: { x: 100, y: 50 }, width: 90 }],
      { x: 1, y: 2, scale: 0.01 },
    );
    expect(o.center).toEqual({ x: 2, y: 2.5 });
    expect(o.width).toBeCloseTo(0.9);
  });
});

describe("contract", () => {
  it("has four classes and version 1", () => {
    expect(CLASSES).toEqual(["background", "wall", "door", "window"]);
    expect(CONTRACT_VERSION).toBe(1);
  });
});

describe("withoutEdgeLines", () => {
  it("drops a wall along an edge of the image and keeps the others", () => {
    const walls = [
      { a: { x: 998, y: 10 }, b: { x: 998, y: 700 }, thickness: 4 },
      { a: { x: 100, y: 100 }, b: { x: 900, y: 100 }, thickness: 10 },
      // A wall that starts at the edge and goes inward stays.
      { a: { x: 0, y: 300 }, b: { x: 500, y: 300 }, thickness: 10 },
    ];
    const kept = withoutEdgeLines(walls, 1000, 800);
    expect(kept).toHaveLength(2);
    expect(kept[0].a.x).toBe(100);
  });
});
