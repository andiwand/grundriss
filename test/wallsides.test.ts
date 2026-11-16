import { describe, expect, it } from "vitest";
import { addVertex, addWall, emptyPlan } from "../src/model/plan";
import { setCenterLength, setSideLength, sideRun } from "../src/model/wallsides";
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
const lengths = (p: Plan, index: number) =>
  ([1, -1] as const).map((side) => sideRun(p, p.walls[index], side)!.length).sort();

const room = (): [Point, Point][] => [
  [P(0, 0), P(4, 0)],
  [P(4, 0), P(4, 3)],
  [P(4, 3), P(0, 3)],
  [P(0, 3), P(0, 0)],
];

describe("the length of a wall on each side", () => {
  it("is the length of the wall for a free wall", () => {
    expect(lengths(plan([[P(0, 0), P(4, 0)]]), 0)).toEqual([4, 4]);
  });

  it("is shorter inside a room and longer outside", () => {
    const p = plan(room());
    const [inside, outside] = lengths(p, 0);
    expect(inside).toBeCloseTo(3.8);
    expect(outside).toBeCloseTo(4.2);
  });

  it("stops at the face of a wall that meets it on its side", () => {
    // A wall from (2,0) down into the room splits the top wall at (2,0).
    const p = plan([
      [P(0, 0), P(2, 0)],
      [P(2, 0), P(4, 0)],
      [P(4, 0), P(4, 3)],
      [P(4, 3), P(0, 3)],
      [P(0, 3), P(0, 0)],
      [P(2, 0), P(2, 3)],
    ]);
    const [inside, outside] = lengths(p, 0);
    // Inside: from the face of the left wall at 0.1 to the face of the middle wall at 1.9.
    expect(inside).toBeCloseTo(1.8);
    // Outside: the face goes on over the split to the outer corner at 4.1.
    expect(outside).toBeCloseTo(4.2);
  });

  it("gives the ends of the face", () => {
    const p = plan(room());
    const sides = ([1, -1] as const).map((side) => sideRun(p, p.walls[0], side)!);
    const inner = sides.find((s) => s.length < 4)!;
    expect(inner.from.x).toBeCloseTo(0.1);
    expect(inner.from.y).toBeCloseTo(0.1);
    expect(inner.to.x).toBeCloseTo(3.9);
    expect(inner.to.y).toBeCloseTo(0.1);
  });

  it("sets the length on a side", () => {
    const p = plan(room());
    const side = sideRun(p, p.walls[0], 1)!.length < 4 ? 1 : -1;
    setSideLength(p, p.walls[0].id, side, 3.5);
    expect(sideRun(p, p.walls[0], side)!.length).toBeCloseTo(3.5, 6);
    // The right wall moves to x = 3.7 and stays upright, so the room stays rectangular.
    const right = p.vertices.filter((v) => v.x > 1);
    expect(right.map((v) => v.x)).toEqual([expect.closeTo(3.7, 6), expect.closeTo(3.7, 6)]);
  });

  it("sets the length on the center line the same way", () => {
    const p = plan(room());
    setCenterLength(p, p.walls[0].id, 3);
    // The right wall moves to x = 3 and stays upright.
    const right = p.vertices.filter((v) => v.x > 1);
    expect(right.map((v) => v.x)).toEqual([expect.closeTo(3, 6), expect.closeTo(3, 6)]);
  });

  it("does not change a wall to a length of zero", () => {
    const p = plan(room());
    setCenterLength(p, p.walls[0].id, 0);
    expect(p.vertices[1]).toMatchObject({ x: 4, y: 0 });
  });

  it("moves the free end if the other end is at a T", () => {
    const p = plan([
      [P(0, 0), P(2, 0)],
      [P(2, 0), P(4, 0)],
      [P(2, 0), P(2, 2)],
    ]);
    // The third wall goes from the T at (2,0) to a free end at (2,2).
    const stem = p.walls[2];
    setSideLength(p, stem.id, 1, 3);
    expect(sideRun(p, stem, 1)!.length).toBeCloseTo(3, 6);
    expect(p.vertices.some((v) => v.x === 2 && v.y === 0)).toBe(true);
  });

  it("sets the length on a side with a corner at an angle", () => {
    const p = plan([
      [P(0, 0), P(4, 0)],
      [P(4, 0), P(6, 3)],
    ]);
    for (const side of [1, -1] as const) {
      setSideLength(p, p.walls[0].id, side, 3);
      expect(sideRun(p, p.walls[0], side)!.length).toBeCloseTo(3, 6);
    }
  });
});
