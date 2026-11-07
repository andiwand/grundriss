import { describe, expect, it } from "vitest";
import { addVertex, addWall, emptyPlan } from "../src/model/plan";
import { wallFaces } from "../src/model/walljoin";
import type { Plan, Point } from "../src/model/types";

function plan(segments: [Point, Point][], thickness = 0.2): Plan {
  const p = emptyPlan();
  const ids = new Map<string, string>();
  const vertex = (q: Point) => {
    const key = `${q.x},${q.y}`;
    if (!ids.has(key)) ids.set(key, addVertex(p, q).id);
    return ids.get(key)!;
  };
  for (const [a, b] of segments) addWall(p, vertex(a), vertex(b), { thickness, height: 2.5 });
  return p;
}

const P = (x: number, y: number) => ({ x, y });

describe("the faces of a wall at its joins", () => {
  it("stops a free wall at its vertices", () => {
    const p = plan([[P(0, 0), P(4, 0)]]);
    expect(wallFaces(p, p.walls[0])).toEqual({
      right: [0, 4],
      left: [0, 4],
      joins: ["free", "free"],
    });
  });

  it("joins two walls in a straight line flush at the vertex", () => {
    const p = plan([
      [P(0, 0), P(2, 0)],
      [P(2, 0), P(5, 0)],
    ]);
    const first = wallFaces(p, p.walls[0]);
    expect(first.right).toEqual([0, 2]);
    expect(first.left).toEqual([0, 2]);
    expect(first.joins).toEqual(["free", "straight"]);
  });

  it("mitres a corner: the outer face is longer, the inner face shorter", () => {
    // The wall goes along +x, so its right side (perpendicular of +x) is +y, toward the other wall.
    const p = plan([
      [P(0, 0), P(4, 0)],
      [P(0, 0), P(0, 3)],
    ]);
    const faces = wallFaces(p, p.walls[0]);
    expect(faces.joins[0]).toBe("corner");
    expect(faces.right[0]).toBeCloseTo(0.1);
    expect(faces.left[0]).toBeCloseTo(-0.1);
    // The other wall meets the same corner points.
    const other = wallFaces(p, p.walls[1]);
    expect(Math.min(other.right[0], other.left[0])).toBeCloseTo(-0.1);
    expect(Math.max(other.right[0], other.left[0])).toBeCloseTo(0.1);
  });

  it("mitres a corner of 45° along the bisector", () => {
    const p = plan([
      [P(0, 0), P(4, 0)],
      [P(0, 0), P(3, 3)],
    ]);
    const faces = wallFaces(p, p.walls[0]);
    // The inner face (toward the other wall, +y) meets it at 0.1 / tan(22.5°).
    expect(faces.right[0]).toBeCloseTo(0.1 / Math.tan(Math.PI / 8));
    expect(faces.left[0]).toBeCloseTo(-0.1 / Math.tan(Math.PI / 8));
  });

  it("stops the stem of a T at the face of the straight wall", () => {
    const p = plan([
      [P(-2, 0), P(0, 0)],
      [P(0, 0), P(2, 0)],
      [P(0, 0), P(0, 3)],
    ]);
    const stem = wallFaces(p, p.walls[2]);
    expect(stem.joins[0]).toBe("tee");
    expect(stem.right[0]).toBeCloseTo(0.1);
    expect(stem.left[0]).toBeCloseTo(0.1);
    // The straight walls go through flush.
    expect(wallFaces(p, p.walls[0]).joins[1]).toBe("straight");
  });
});
