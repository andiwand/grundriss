import { describe, expect, it } from "vitest";
import { addVertex, addWall, emptyPlan } from "../src/model/plan";
import {
  alignWalls,
  canTurnWalls,
  setWallsAngle,
  straightenWalls,
  wallAngle,
  lineCanChange,
  lineSide,
  mergeProblem,
  mergeWalls,
  splitInTwo,
  wallDimensions,
  setPartLength,
  setSideLength,
  sideRun,
  wallLine,
} from "../src/model/wallsides";
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
    setSideLength(p, [p.walls[0].id], side, 3.5);
    expect(sideRun(p, p.walls[0], side)!.length).toBeCloseTo(3.5, 6);
    // Only the corner at the end of the wall moves. The far corner of the right wall stays.
    expect(p.vertices.filter((v) => v.y === 0).map((v) => v.x)).toEqual([0, expect.any(Number)]);
    expect(p.vertices.some((v) => v.x === 4 && v.y === 3)).toBe(true);
  });

  it("sets the length of a wall as its one part: only the vertex b moves", () => {
    const p = plan(room());
    setPartLength(p, [p.walls[0].id], 0, 3);
    expect(p.vertices[1]).toMatchObject({ x: 3, y: 0 });
    expect(p.vertices[2]).toMatchObject({ x: 4, y: 3 });
  });

  it("does not change a wall to a length of zero", () => {
    const p = plan(room());
    setPartLength(p, [p.walls[0].id], 0, 0);
    expect(p.vertices[1]).toMatchObject({ x: 4, y: 0 });
  });

  it("keeps the T where a wall starts", () => {
    const p = plan([
      [P(0, 0), P(2, 0)],
      [P(2, 0), P(4, 0)],
      [P(2, 0), P(2, 2)],
    ]);
    // The third wall goes from the T at (2,0) to a free end at (2,2).
    const stem = p.walls[2];
    setSideLength(p, [stem.id], 1, 3);
    expect(sideRun(p, stem, 1)!.length).toBeCloseTo(3, 6);
    expect(p.vertices.some((v) => v.x === 2 && v.y === 0)).toBe(true);
  });

  it("sets the length on a side with a corner at an angle", () => {
    const p = plan([
      [P(0, 0), P(4, 0)],
      [P(4, 0), P(6, 3)],
    ]);
    for (const side of [1, -1] as const) {
      setSideLength(p, [p.walls[0].id], side, 3);
      expect(sideRun(p, p.walls[0], side)!.length).toBeCloseTo(3, 6);
    }
  });

  it("moves the other end if the end b is pinned", () => {
    const p = plan(room());
    p.vertices[1].pinned = true;
    setPartLength(p, [p.walls[0].id], 0, 3);
    expect(p.vertices[0]).toMatchObject({ x: 1, y: 0 });
    expect(p.vertices[1]).toMatchObject({ x: 4, y: 0 });
  });

  it("does not change a length with both ends pinned", () => {
    const p = plan(room());
    p.vertices[0].pinned = true;
    p.vertices[1].pinned = true;
    expect(setPartLength(p, [p.walls[0].id], 0, 3)).toBe(false);
    expect(lineCanChange(p, wallLine(p, [p.walls[0].id])!).part(0)).toBe(false);
    expect(p.vertices[1]).toMatchObject({ x: 4, y: 0 });
  });
});

describe("walls in one line", () => {
  // Three parts of 1, 2, and 3 m from (0,0) to (6,0), and a wall down from (1,0).
  const parts = () =>
    plan([
      [P(0, 0), P(1, 0)],
      [P(3, 0), P(1, 0)],
      [P(3, 0), P(6, 0)],
      [P(1, 0), P(1, 2)],
    ]);
  const ids = (p: Plan) => p.walls.slice(0, 3).map((w) => w.id);
  const x = (p: Plan) => p.vertices.slice(0, 4).map((v) => v.x);

  it("finds the line in the direction of its first wall, also with a wall the other way", () => {
    const p = parts();
    const line = wallLine(p, [ids(p)[2], ids(p)[0], ids(p)[1]])!;
    expect(line.vertices.map((id) => p.vertices.find((v) => v.id === id)!.x)).toEqual([0, 1, 3, 6]);
    expect(wallLine(p, [ids(p)[0], p.walls[3].id])).toBeNull();
    expect(wallLine(p, [ids(p)[0], ids(p)[2]])).toBeNull();
  });

  it("has the side lengths of the whole line", () => {
    const p = parts();
    const line = wallLine(p, ids(p))!;
    const lengths = ([1, -1] as const).map((side) => lineSide(p, line, side)!.length);
    expect(lengths).toEqual([6, 6]);
  });

  it("changes a part, and the parts after it move", () => {
    const p = parts();
    setPartLength(p, ids(p), 1, 2.5);
    expect(x(p)).toEqual([0, 1, 3.5, 6.5]);
  });

  it("moves the parts before it if a vertex after it is pinned", () => {
    const p = parts();
    p.vertices[3].pinned = true;
    setPartLength(p, ids(p), 1, 2.5);
    expect(x(p)).toEqual([-0.5, 0.5, 3, 6]);
  });

  it("does not merge walls where another wall meets them", () => {
    const p = parts();
    expect(mergeProblem(p, wallLine(p, ids(p))!)).toBe("branch");
    expect(mergeWalls(p, ids(p))).toBeNull();
  });

  it("merges walls into one, and keeps the openings in their places", () => {
    const p = plan([
      [P(0, 0), P(2, 0)],
      [P(5, 0), P(2, 0)],
    ]);
    const [first, second] = p.walls.map((w) => w.id);
    // A door 1 m from (5,0) is at x = 4.
    p.openings.push({
      id: "o",
      wallId: second,
      kind: "door",
      offset: 1,
      width: 0.8,
      height: 2,
      sill: 0,
      style: "hinged",
      leaves: 1,
      hinge: "a",
      swing: 1,
    });
    expect(mergeWalls(p, [first, second])).toBe(first);
    expect(p.walls).toHaveLength(1);
    expect(p.vertices.map((v) => v.x)).toEqual([0, 5]);
    expect(p.openings[0]).toMatchObject({ wallId: first, offset: 4, hinge: "b", swing: -1 });
  });

  it("does not merge walls of other thickness", () => {
    const p = plan([[P(0, 0), P(2, 0)]]);
    const other = plan([[P(2, 0), P(5, 0)]], 0.3);
    p.vertices.push(other.vertices[1]);
    p.walls.push({ ...other.walls[0], a: p.vertices[1].id });
    expect(
      mergeProblem(
        p,
        wallLine(
          p,
          p.walls.map((w) => w.id),
        )!,
      ),
    ).toBe("different");
  });

  it("splits a wall in the middle, and merges it again", () => {
    const p = plan([[P(0, 0), P(4, 0)]]);
    const [first, second] = splitInTwo(p, p.walls[0].id)!;
    expect(p.vertices.map((v) => v.x)).toEqual([0, 4, 2]);
    expect(mergeWalls(p, [first, second])).toBe(first);
    expect(p.walls).toHaveLength(1);
  });

  it("splits a wall beside a door in the middle", () => {
    const p = plan([[P(0, 0), P(4, 0)]]);
    p.openings.push({
      id: "o",
      wallId: p.walls[0].id,
      kind: "door",
      offset: 2.2,
      width: 1,
      height: 2,
      sill: 0,
      style: "hinged",
      leaves: 1,
      hinge: "a",
      swing: 1,
    });
    splitInTwo(p, p.walls[0].id);
    // The door goes from 1.7 to 2.7: the nearer free place is at 1.69.
    expect(p.vertices[2].x).toBeCloseTo(1.69);
    expect(p.openings[0]).toMatchObject({ offset: expect.closeTo(0.51) });
  });
});

describe("the dimension lines of the walls", () => {
  it("has each inside length of a room once, and each outside face", () => {
    const p = plan(room());
    const lines = wallDimensions(p);
    const length = (d: (typeof lines)[number]) =>
      Math.round(Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) * 100) / 100;
    const inside = lines
      .filter((d) => Math.abs(d.offset) === 0.3)
      .map(length)
      .sort();
    const outside = lines
      .filter((d) => Math.abs(d.offset) === 0.8)
      .map(length)
      .sort();
    expect(inside).toEqual([2.8, 3.8]);
    expect(outside).toEqual([3.2, 3.2, 4.2, 4.2]);
  });

  it("gives only the inside lines or only the outside lines", () => {
    const p = plan(room());
    const inside = wallDimensions(p, { inside: true, outside: false });
    const outside = wallDimensions(p, { inside: false, outside: true });
    expect(inside.map((d) => Math.abs(d.offset))).toEqual([0.3, 0.3]);
    expect(outside.map((d) => Math.abs(d.offset))).toEqual([0.8, 0.8, 0.8, 0.8]);
  });

  it("puts the inside line in the room and the outside line outside", () => {
    const p = plan(room());
    for (const d of wallDimensions(p)) {
      const n = { x: -(d.b.y - d.a.y), y: d.b.x - d.a.x };
      const scale = d.offset / Math.hypot(n.x, n.y);
      const mid = { x: (d.a.x + d.b.x) / 2 + n.x * scale, y: (d.a.y + d.b.y) / 2 + n.y * scale };
      const inRoom = mid.x > 0 && mid.x < 4 && mid.y > 0 && mid.y < 3;
      expect(inRoom).toBe(Math.abs(d.offset) === 0.3);
    }
  });
});

describe("the alignment of walls", () => {
  const angle = (p: Plan, i: number) => {
    const [a, b] = [p.walls[i].a, p.walls[i].b].map((id) => p.vertices.find((v) => v.id === id)!);
    return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  };

  it("turns a wall parallel, and a wall near a right angle to a right angle", () => {
    const p = plan([
      [P(0, 0), P(4, 0)],
      [P(0, 2), P(4, 2.2)],
      [P(6, 0), P(6.1, 3)],
    ]);
    const ids = p.walls.map((w) => w.id);
    expect(alignWalls(p, ids)).toEqual({ stuck: [], turned: 2 });
    expect(angle(p, 1)).toBeCloseTo(0);
    expect(angle(p, 2)).toBeCloseTo(90);
    // The walls keep their lengths.
    const [a, b] = [p.walls[1].a, p.walls[1].b].map((id) => p.vertices.find((v) => v.id === id)!);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(Math.hypot(4, 0.2));
  });

  it("turns around the pinned corner, and not a wall with two pinned corners", () => {
    const p = plan([
      [P(0, 0), P(4, 0)],
      [P(0, 2), P(4, 2.2)],
      [P(0, 4), P(4, 4.2)],
    ]);
    p.vertices[3].pinned = true;
    p.vertices[4].pinned = true;
    p.vertices[5].pinned = true;
    const ids = p.walls.map((w) => w.id);
    expect(alignWalls(p, ids)).toEqual({ stuck: [ids[2]], turned: 1 });
    expect(p.vertices[3]).toMatchObject({ x: 4, y: 2.2 });
    expect(p.vertices[2].y).toBeCloseTo(2.2);
  });
});

describe("the turn of walls", () => {
  it("gives the angle as on a protractor: 90 is up on the screen", () => {
    const p = plan([
      [P(0, 0), P(4, 0)],
      [P(0, 0), P(0, -3)],
    ]);
    expect(wallAngle(p, p.walls[0])).toBeCloseTo(0);
    expect(wallAngle(p, p.walls[1])).toBeCloseTo(90);
  });

  it("straightens a wall that is a little off, around its middle", () => {
    const p = plan([[P(0, 0), P(4, 0.2)]]);
    expect(straightenWalls(p, [p.walls[0].id])).toBe(true);
    expect(wallAngle(p, p.walls[0]) % 360).toBeCloseTo(0);
    // The middle stays, and the length stays.
    expect(p.vertices[0].x + p.vertices[1].x).toBeCloseTo(4);
    expect(p.vertices[0].y).toBeCloseTo(0.1);
    expect(p.vertices[1].x - p.vertices[0].x).toBeCloseTo(Math.hypot(4, 0.2));
  });

  it("takes the smaller turn: a wall at 180° goes to 3° by a turn of 3°", () => {
    const p = plan([[P(4, 0), P(0, 0)]]);
    expect(wallAngle(p, p.walls[0])).toBeCloseTo(180);
    setWallsAngle(p, [p.walls[0].id], 3);
    expect(wallAngle(p, p.walls[0])).toBeCloseTo(183);
  });

  it("turns walls together around a pinned corner", () => {
    const p = plan([
      [P(0, 0), P(4, 0)],
      [P(4, 0), P(4, 3)],
    ]);
    p.vertices[0].pinned = true;
    expect(
      setWallsAngle(
        p,
        p.walls.map((w) => w.id),
        90,
      ),
    ).toBe(true);
    expect(p.vertices[0]).toMatchObject({ x: 0, y: 0 });
    expect(p.vertices[1].x).toBeCloseTo(0);
    expect(p.vertices[1].y).toBeCloseTo(-4);
    // The corner between the walls stays a right angle.
    expect(p.vertices[2].x).toBeCloseTo(3);
    expect(p.vertices[2].y).toBeCloseTo(-4);
  });

  it("does not turn walls with two pinned corners", () => {
    const p = plan([[P(0, 0), P(4, 0.2)]]);
    p.vertices[0].pinned = true;
    p.vertices[1].pinned = true;
    expect(canTurnWalls(p, [p.walls[0].id])).toBe(false);
    expect(straightenWalls(p, [p.walls[0].id])).toBe(false);
  });
});

describe("a wall with a small kink", () => {
  // A room 6 × 4 m. The top wall has a kink at (3, 0.08), and its two parts differ in thickness.
  const kinked = () => {
    const p = emptyPlan();
    const ids = [P(0, 0), P(3, 0.08), P(6, 0), P(6, 4), P(0, 4)].map((q) => addVertex(p, q).id);
    const thickness = [0.3, 0.2, 0.3, 0.3, 0.3];
    ids.forEach((id, i) =>
      addWall(p, id, ids[(i + 1) % ids.length], { thickness: thickness[i], height: 2.5 }),
    );
    return p;
  };

  it("ends each face at the kink", () => {
    const p = kinked();
    for (const side of [1, -1] as const) {
      const run = sideRun(p, p.walls[0], side)!;
      expect(run.to.x).toBeCloseTo(3, 1);
    }
  });

  it("keeps one of two lines on top of each other: a wall traced twice", () => {
    const p = plan([
      [P(0, 0), P(4, 0)],
      [P(0, 0.25), P(4, 0.25)],
    ]);
    // The y of each dimension line. Without the filter, two pairs are only 0.25 m apart.
    const ys = wallDimensions(p)
      .map((d) => {
        const dx = d.b.x - d.a.x;
        return (d.a.y + d.b.y) / 2 + (Math.sign(dx) || 1) * d.offset;
      })
      .sort((a, b) => a - b);
    expect(ys).toHaveLength(2);
    expect(ys[1] - ys[0]).toBeGreaterThan(0.4);
  });

  it("has no dimension line on top of another one", () => {
    const p = kinked();
    const lines = wallDimensions(p);
    for (const [i, x] of lines.entries()) {
      for (const y of lines.slice(i + 1)) {
        const same = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < 0.05;
        expect(same(x.a, y.a) && same(x.b, y.b)).toBe(false);
      }
    }
  });
});
