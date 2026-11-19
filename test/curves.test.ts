import { describe, expect, it } from "vitest";
import { wallsAngle } from "../src/model/angles";
import { emptyBuilding } from "../src/model/building";
import { angleSweep, dimensionShape, openingShape, wallOutline } from "../src/model/drawing";
import { parseBuilding, serializeBuilding } from "../src/model/file";
import { distance } from "../src/model/geometry";
import {
  addDimension,
  addOpening,
  addVertex,
  addWall,
  emptyPlan,
  moveFromOrigin,
  moveOrigin,
  nearestWall,
  splitWall,
  wallLength,
} from "../src/model/plan";
import { findRooms, netRoomArea } from "../src/model/rooms";
import { mergeWalls, splitInTwo } from "../src/model/wallsides";
import { bulgeThrough, curveOf, partBulge, wallCurve, wallTangent } from "../src/model/wallcurve";
import { wallFaces } from "../src/model/walljoin";
import type { Plan } from "../src/model/types";

const close = (p: { x: number; y: number }, x: number, y: number, digits = 6) => {
  expect(p.x).toBeCloseTo(x, digits);
  expect(p.y).toBeCloseTo(y, digits);
};

/** A square room of 4 m with the wall at the top (y = 0) bent out by `bulge`. */
function roundRoom(bulge: number) {
  const plan = emptyPlan();
  const v = (x: number, y: number) => addVertex(plan, { x, y }).id;
  const [a, b, c, d] = [v(0, 0), v(4, 0), v(4, 4), v(0, 4)];
  const props = { thickness: 0.2, height: 2.5 };
  // From b to a: perpendicular(a - b) points to -y, out of the room.
  const top = addWall(plan, b, a, props)!;
  top.bulge = bulge;
  addWall(plan, b, c, props);
  addWall(plan, c, d, props);
  addWall(plan, d, a, props);
  return { plan, top };
}

describe("the center line of a curved wall", () => {
  const curve = curveOf({ x: 0, y: 0 }, { x: 4, y: 0 }, 2);

  it("is a half circle for a bulge of half the chord", () => {
    expect(curve.circle!.radius).toBeCloseTo(2);
    close(curve.circle!.center, 2, 0);
    expect(curve.length).toBeCloseTo(2 * Math.PI);
    // perpendicular(b - a) is +y, so the arc goes through (2, 2).
    close(curve.at(curve.length / 2), 2, 2);
    close(curve.at(0), 0, 0);
    close(curve.at(curve.length), 4, 0);
    close(curve.tangent(0), 0, 1);
    close(curve.tangent(curve.length), 0, -1);
  });

  it("puts a position across the wall on the side of the normal", () => {
    // At the middle, the tangent is +x, so the normal is +y: away from the center.
    close(curve.at(curve.length / 2, 0.1), 2, 2.1);
    close(curve.at(curve.length / 2, -0.1), 2, 1.9);
  });

  it("finds the position of a point back", () => {
    for (const s of [0, 0.5, 3, 5.9, curve.length]) {
      expect(curve.project(curve.at(s, 0.3))).toBeCloseTo(s);
    }
    // A point beyond an end goes to that end.
    expect(curve.project({ x: -1, y: -1 })).toBeCloseTo(0);
  });

  it("finds the bulge through a point, for both sides", () => {
    for (const bulge of [0.3, -0.8, 2]) {
      const c = curveOf({ x: 1, y: 1 }, { x: 4, y: 5 }, bulge);
      expect(bulgeThrough(c.a, c.b, c.at(c.length * 0.3))).toBeCloseTo(bulge);
    }
  });

  it("is a straight line without a bulge", () => {
    const line = curveOf({ x: 0, y: 0 }, { x: 3, y: 4 }, 0);
    expect(line.circle).toBeNull();
    expect(line.length).toBeCloseTo(5);
    close(line.at(2.5, 1), 1.5 - 0.8, 2 + 0.6);
  });

  it("keeps the arc in the bulges of its parts", () => {
    const c = curveOf({ x: 0, y: 0 }, { x: 6, y: 1 }, -1.2);
    const s = 2.5;
    const first = curveOf(c.a, c.at(s), partBulge(c, 0, s));
    const second = curveOf(c.at(s), c.b, partBulge(c, s, c.length));
    expect(first.length + second.length).toBeCloseTo(c.length);
    close(first.at(first.length / 2), c.at(s / 2).x, c.at(s / 2).y);
    const m = (s + c.length) / 2;
    close(second.at(second.length / 2), c.at(m).x, c.at(m).y);
  });
});

describe("curved walls in a plan", () => {
  it("has the length of the arc", () => {
    const { plan, top } = roundRoom(2);
    expect(wallLength(plan, top)).toBeCloseTo(2 * Math.PI);
  });

  it("makes a room with the arc in its polygon and its area", () => {
    const { plan } = roundRoom(2);
    const rooms = findRooms(plan);
    expect(rooms).toHaveLength(1);
    const room = rooms[0];
    // A square of 4 × 4 and a half circle of the radius 2 (a polygon of short chords).
    expect(room.area).toBeCloseTo(16 + 2 * Math.PI, 1);
    expect(room.polygon.length).toBeGreaterThan(10);
    expect(room.sides).toHaveLength(room.polygon.length);
    expect(room.vertexIds).toHaveLength(4);
    // The net area is smaller by about half the thickness all around.
    const net = netRoomArea(plan, room);
    expect(net).toBeLessThan(room.area);
    expect(net).toBeGreaterThan(room.area - 0.1 * (12 + 2 * Math.PI) - 0.1);
  });

  it("turns the faces with the wall at the joins", () => {
    const { plan, top } = roundRoom(2);
    // The half circle leaves the corner (4, 0) at a right angle to the chord: along -y, the
    // same line as the wall down to (4, 4). So the join is straight.
    const faces = wallFaces(plan, top);
    expect(faces.joins).toEqual(["straight", "straight"]);
    close(wallTangent(plan, top, top.a), 0, -1);
  });

  it("draws the outline on both faces of the arc", () => {
    const { plan, top } = roundRoom(1);
    const curve = wallCurve(plan, top);
    const outline = wallOutline(plan, top);
    expect(outline.length).toBeGreaterThan(8);
    const { center, radius } = curve.circle!;
    for (const p of outline) {
      const r = distance(p, center);
      expect(Math.min(Math.abs(r - radius - 0.1), Math.abs(r - radius + 0.1))).toBeLessThan(1e-6);
    }
  });

  it("splits a curved wall into two parts on the same arc", () => {
    const { plan, top } = roundRoom(2);
    const curve = wallCurve(plan, top);
    const opening = addOpening(plan, top.id, "window", 5);
    const vertex = splitWall(plan, top.id, curve.at(2, 0.05));
    close(vertex, curve.at(2).x, curve.at(2).y);
    const parts = plan.walls.filter((w) => w.a === vertex.id || w.b === vertex.id);
    expect(parts).toHaveLength(2);
    const total = parts.reduce((sum, w) => sum + wallLength(plan, w), 0);
    expect(total).toBeCloseTo(curve.length);
    // The window stays where it was on the arc.
    const after = openingShape(plan, opening)!;
    expect(after).not.toBeNull();
    expect(plan.openings[0].offset).toBeCloseTo(3);
    expect(findRooms(plan)[0].area).toBeCloseTo(16 + 2 * Math.PI, 1);
  });

  it("splits a curved wall in two halves of the arc, and does not merge it", () => {
    const { plan, top } = roundRoom(2);
    const length = wallLength(plan, top);
    const parts = splitInTwo(plan, top.id)!;
    for (const id of parts) {
      expect(
        wallLength(
          plan,
          plan.walls.find((w) => w.id === id)!,
        ),
      ).toBeCloseTo(length / 2);
    }
    expect(mergeWalls(plan, parts)).toBeNull();
  });

  it("finds the nearest wall on the arc", () => {
    const { plan, top } = roundRoom(2);
    const hit = nearestWall(plan, { x: 2, y: -2.05 }, 0.2);
    expect(hit?.wall.id).toBe(top.id);
    close(hit!.point, 2, -2);
  });

  it("puts an opening along the arc", () => {
    const { plan, top } = roundRoom(2);
    const opening = addOpening(plan, top.id, "door", Math.PI);
    const shape = openingShape(plan, opening)!;
    const curve = wallCurve(plan, top);
    // The gap follows both faces of the arc.
    expect(shape.gap.length).toBeGreaterThan(4);
    for (const p of shape.gap) {
      const r = distance(p, curve.circle!.center);
      expect(Math.abs(Math.abs(r - 2) - 0.11)).toBeLessThan(1e-6);
    }
  });

  it("keeps the bulge in a file", () => {
    const building = emptyBuilding();
    const { plan } = roundRoom(1.5);
    Object.assign(building.stories[0], plan);
    const read = parseBuilding(serializeBuilding(building));
    const walls = read.stories[0].walls;
    expect(walls.filter((w) => w.bulge === 1.5)).toHaveLength(1);
    expect(walls.filter((w) => w.bulge === undefined)).toHaveLength(3);
  });
});

describe("angles", () => {
  it("measures the angle of an angle dimension clockwise on the screen", () => {
    const center = { x: 0, y: 0 };
    // From +x to +y is a quarter turn clockwise on the screen (y points down).
    expect(angleSweep(center, { x: 1, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(Math.PI / 2);
    expect(angleSweep(center, { x: 0, y: 1 }, { x: 1, y: 0 })).toBeCloseTo((3 * Math.PI) / 2);
    const shape = dimensionShape({
      id: "d",
      a: { x: 2, y: 0 },
      b: { x: 0, y: 2 },
      offset: 0.5,
      center,
    });
    expect(shape.degrees).toBeCloseTo(90);
    expect(shape.text).toBe("90°");
    close(shape.line[0], 0.5, 0);
    close(shape.line[1], 0, 0.5);
    close(shape.textAt, 0.5 / Math.SQRT2, 0.5 / Math.SQRT2);
    // The sides are longer than the radius, so the arc needs no extension lines.
    expect(shape.extensions).toHaveLength(0);
    expect(shape.segments.length).toBeGreaterThan(4);
  });

  it("moves and copies the center of an angle dimension", () => {
    const plan: Plan = emptyPlan();
    const d = addDimension(plan, { x: 1, y: 0 }, { x: 0, y: 1 }, 0.4, { x: 0, y: 0 });
    const origin = moveOrigin(plan, [{ kind: "dimension", id: d.id }]);
    moveFromOrigin(plan, origin, { x: 2, y: 3 });
    close(plan.dimensions[0].center!, 2, 3);
    close(plan.dimensions[0].a, 3, 3);
  });

  it("keeps the center of an angle dimension in a file", () => {
    const building = emptyBuilding();
    addDimension(building.stories[0], { x: 1, y: 0 }, { x: 0, y: 1 }, 0.4, { x: 0.5, y: 0.5 });
    addDimension(building.stories[0], { x: 1, y: 0 }, { x: 0, y: 1 }, 0.4);
    const read = parseBuilding(serializeBuilding(building));
    expect(read.stories[0].dimensions[0].center).toEqual({ x: 0.5, y: 0.5 });
    expect(read.stories[0].dimensions[1].center).toBeUndefined();
  });

  it("gives the angle between two walls at their corner", () => {
    const plan = emptyPlan();
    const v = (x: number, y: number) => addVertex(plan, { x, y }).id;
    const corner = v(0, 0);
    const one = addWall(plan, corner, v(4, 0))!;
    const two = addWall(plan, v(-3, 3), corner)!;
    const angle = wallsAngle(plan, one.id, two.id)!;
    expect(angle.degrees).toBeCloseTo(135);
    close(angle.center!, 0, 0);
  });

  it("gives the angle between two walls that do not meet", () => {
    const plan = emptyPlan();
    const v = (x: number, y: number) => addVertex(plan, { x, y }).id;
    const one = addWall(plan, v(1, 0), v(4, 0))!;
    const two = addWall(plan, v(0, 1), v(0, 4))!;
    const angle = wallsAngle(plan, one.id, two.id)!;
    expect(angle.degrees).toBeCloseTo(90);
    close(angle.center!, 0, 0);
    const parallel = addWall(plan, v(1, 2), v(4, 2))!;
    const none = wallsAngle(plan, one.id, parallel.id)!;
    expect(none.degrees).toBe(0);
    expect(none.center).toBeNull();
  });

  it("uses the direction of a curved wall at the corner", () => {
    const { plan, top } = roundRoom(2);
    const right = plan.walls.find((w) => w.id !== top.id && (w.a === top.a || w.b === top.a))!;
    // The half circle goes on in the line of the wall at the corner: 180°.
    expect(wallsAngle(plan, top.id, right.id)!.degrees).toBeCloseTo(180);
  });
});
