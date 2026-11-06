// A test of the OpenCV part of the tracing. It loads the WASM build of OpenCV in Node, so it
// takes about one second.

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { resolveOpenCV } from "../src/tracing/opencv";
import type { WallSegment } from "../src/tracing/segments";
import { suggestWallsInGray } from "../src/tracing/trace";

/** Makes a gray image of a plan: thick walls, a door gap, a diagonal wall, and some noise. */
async function drawPlan() {
  const cv = await resolveOpenCV(createRequire(import.meta.url)("@techstark/opencv-js"));
  const width = 2000;
  const height = 1500;
  const gray = new cv.Mat(height, width, cv.CV_8UC1);
  // The light of a photo is not even: the paper is darker on the left.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) gray.data[y * width + x] = 200 + Math.round((40 * x) / width);
  }
  const ink = new cv.Scalar(20);
  const line = (x1: number, y1: number, x2: number, y2: number, thickness = 16) =>
    cv.line(gray, new cv.Point(x1, y1), new cv.Point(x2, y2), ink, thickness, cv.LINE_8);
  line(100, 100, 1900, 100);
  line(1900, 100, 1900, 1400);
  line(1900, 1400, 100, 1400);
  line(100, 1400, 100, 100);
  line(1000, 100, 1000, 600);
  line(1000, 700, 1000, 1400);
  line(1000, 800, 1600, 1400);
  // Thin lines like hatching and dimension lines, and specks. They are not walls.
  for (let i = 0; i < 40; i++) line(200 + i * 20, 300, 200 + i * 20, 340, 2);
  line(150, 900, 900, 900, 2);
  let seed = 1;
  for (let i = 0; i < 300; i++) {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    gray.data[seed % (width * height)] = 0;
  }
  return { cv, gray };
}

const near = (s: WallSegment, a: [number, number], b: [number, number], tolerance = 4) => {
  const d = (p: { x: number; y: number }, q: [number, number]) =>
    Math.hypot(p.x - q[0], p.y - q[1]);
  return (
    (d(s.a, a) < tolerance && d(s.b, b) < tolerance) ||
    (d(s.a, b) < tolerance && d(s.b, a) < tolerance)
  );
};

describe("suggestWallsInGray", () => {
  it("finds the walls of a plan as a joined graph", async () => {
    const { cv, gray } = await drawPlan();
    try {
      const segments = suggestWallsInGray(cv, gray, 1);
      const expected: [[number, number], [number, number]][] = [
        [
          [100, 100],
          [1000, 100],
        ],
        [
          [1000, 100],
          [1900, 100],
        ],
        [
          [1900, 100],
          [1900, 1400],
        ],
        [
          [100, 100],
          [100, 1400],
        ],
        [
          [100, 1400],
          [1000, 1400],
        ],
        [
          [1000, 1400],
          [1597, 1400],
        ],
        [
          [1597, 1400],
          [1900, 1400],
        ],
        // The inner wall has a door gap from about 608 to 695.
        [
          [1000, 100],
          [1000, 608],
        ],
        [
          [1000, 695],
          [1000, 803],
        ],
        [
          [1000, 803],
          [1000, 1400],
        ],
        [
          [1000, 803],
          [1597, 1400],
        ],
      ];
      for (const [a, b] of expected) {
        expect(
          segments.some((s) => near(s, a, b, 8)),
          `wall ${a} – ${b}`,
        ).toBe(true);
      }
      expect(segments).toHaveLength(expected.length);
      for (const s of segments) expect(s.thickness).toBeGreaterThan(14);
      for (const s of segments) expect(s.thickness).toBeLessThan(20);
    } finally {
      gray.delete();
    }
  }, 30_000);
});
