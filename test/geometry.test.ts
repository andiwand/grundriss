import { describe, expect, it } from "vitest";
import { intersectionArea, signedArea, triangulate } from "../src/model/geometry";

describe("polygon intersections", () => {
  const concave = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 2, y: 2 },
    { x: 0, y: 4 },
  ];

  it("does not cut an ear across a vertex on its diagonal", () => {
    const triangles = triangulate(concave);
    expect(triangles.every((triangle) => signedArea(triangle) > 0)).toBe(true);
    expect(triangles.reduce((sum, triangle) => sum + signedArea(triangle), 0)).toBe(12);
    expect(intersectionArea(concave, concave)).toBeCloseTo(12);
    const box = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ];
    expect(intersectionArea(box, concave)).toBeCloseTo(12);
    expect(intersectionArea(box, [...concave].reverse())).toBeCloseTo(12);
  });

  it("has no intersection with an empty polygon", () => {
    expect(intersectionArea(concave, [])).toBe(0);
    expect(intersectionArea([], concave)).toBe(0);
  });
});
