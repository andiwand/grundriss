import { describe, expect, it } from "vitest";
import {
  chimneySymbol,
  dimensionShape,
  northArrow,
  openingShape,
  planBounds,
  stairDrawing,
  wallOutline,
} from "../src/model/drawing";
import { addOpening, addVertex, addWall, emptyPlan } from "../src/model/plan";

function wallPlan() {
  const plan = emptyPlan();
  const a = addVertex(plan, { x: 0, y: 0 });
  const b = addVertex(plan, { x: 4, y: 0 });
  const wall = addWall(plan, a.id, b.id, { thickness: 0.2, height: 2.5 })!;
  return { plan, wall };
}

const close = (p: { x: number; y: number }, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x);
  expect(p.y).toBeCloseTo(y);
};

describe("drawing shapes", () => {
  it("gives the outline of a free wall", () => {
    const { plan, wall } = wallPlan();
    const outline = wallOutline(plan, wall);
    close(outline[0], 0, 0.1);
    close(outline[1], 4, 0.1);
    close(outline[2], 4, -0.1);
    close(outline[3], 0, -0.1);
  });

  it("draws a door with the hinge at a and the swing to the right side like the editor", () => {
    const { plan, wall } = wallPlan();
    const door = addOpening(plan, wall.id, "door", 2);
    const shape = openingShape(plan, door)!;
    const [[hinge, leaf]] = shape.leaves;
    const [arc] = shape.arcs;
    // The width is 0.9, so the opening goes from 1.55 to 2.45.
    close(hinge, 1.55, 0.1);
    close(leaf, 1.55, 1.0);
    close(arc.to, 2.45, 0.1);
    expect(arc.sweep).toBe(0);
    expect(arc.radius).toBeCloseTo(0.9);
    expect(shape.glass).toHaveLength(0);
  });

  it("moves the hinge and the swing", () => {
    const { plan, wall } = wallPlan();
    const door = addOpening(plan, wall.id, "door", 2);
    door.hinge = "b";
    door.swing = -1;
    const shape = openingShape(plan, door)!;
    close(shape.leaves[0][0], 2.45, -0.1);
    close(shape.leaves[0][1], 2.45, -1.0);
    close(shape.arcs[0].to, 1.55, -0.1);
    // Both turns flip, so the sweep stays the same.
    expect(shape.arcs[0].sweep).toBe(0);
    door.swing = 1;
    expect(openingShape(plan, door)!.arcs[0].sweep).toBe(1);
  });

  it("draws a double door with two leaves that meet in the middle", () => {
    const { plan, wall } = wallPlan();
    const door = addOpening(plan, wall.id, "door", 2);
    door.leaves = 2;
    const shape = openingShape(plan, door)!;
    expect(shape.leaves).toHaveLength(2);
    close(shape.leaves[0][0], 1.55, 0.1);
    close(shape.leaves[1][0], 2.45, 0.1);
    close(shape.arcs[0].to, 2, 0.1);
    close(shape.arcs[1].to, 2, 0.1);
    expect(shape.arcs[0].radius).toBeCloseTo(0.45);
  });

  it("draws a sliding door along the face, and a door without a leaf", () => {
    const { plan, wall } = wallPlan();
    const door = addOpening(plan, wall.id, "door", 2);
    door.style = "sliding";
    // The leaf slides to the end a, along the face of the swing side.
    const [[start, end]] = openingShape(plan, door)!.leaves;
    close(start, 0.65, 0.13);
    close(end, 1.55, 0.13);
    expect(openingShape(plan, door)!.arcs).toHaveLength(0);
    door.style = "fixed";
    expect(openingShape(plan, door)!.leaves).toHaveLength(0);
  });

  it("draws a window as a gap with glass and a thin hinged leaf", () => {
    const { plan, wall } = wallPlan();
    const window = addOpening(plan, wall.id, "window", 2);
    const shape = openingShape(plan, window)!;
    close(shape.glass[0][0], 1.4, 0);
    close(shape.glass[0][1], 2.6, 0);
    expect(shape.gap).toHaveLength(4);
    expect(shape.leaves).toHaveLength(1);
    window.style = "fixed";
    expect(openingShape(plan, window)!.leaves).toHaveLength(0);
    window.style = "sliding";
    expect(openingShape(plan, window)!.glass).toHaveLength(2);
  });

  it("gives a dimension line with readable text", () => {
    const shape = dimensionShape({ id: "d", a: { x: 4, y: 0 }, b: { x: 0, y: 0 }, offset: 0.5 });
    expect(shape.text).toBe("4.00 m");
    // From b to a points to -x, so the side is -y, and the line is at y = -0.5.
    close(shape.line[0], 4, -0.5);
    close(shape.line[1], 0, -0.5);
    close(shape.normal, 0, -1);
    // The direction is 180 degrees, so the text turns to 0 degrees.
    expect(Math.abs(shape.angle)).toBeCloseTo(0);
    expect(shape.extensions[0][1].y).toBeCloseTo(-0.6);
  });

  it("gives the bounds of the plan", () => {
    const { plan } = wallPlan();
    expect(planBounds(emptyPlan())).toBeNull();
    const box = planBounds(plan)!;
    expect(box.minX).toBeCloseTo(0);
    expect(box.maxX).toBeCloseTo(4);
    expect(box.minY).toBeCloseTo(-0.1);
    expect(box.maxY).toBeCloseTo(0.1);
  });
});

describe("stairs, chimneys, and the north arrow", () => {
  it("draws a stair with an arrow head at the top", () => {
    const shape = stairDrawing(
      {
        id: "s",
        a: { x: 0, y: 0 },
        b: { x: 3, y: 0 },
        width: 1,
        kind: "straight",
        turn: 1,
        run2: 1,
      },
      2.7,
    );
    expect(shape.count).toBe(15);
    const [, to] = shape.arrow;
    for (const [a, b] of shape.head) {
      expect(a).toEqual(to);
      // The head points back, to the bottom of the stair.
      expect(b.x).toBeLessThan(to.x);
    }
  });

  it("draws a chimney with two diagonals", () => {
    const symbol = chimneySymbol({ id: "c", x: 1, y: 1, width: 0.4, depth: 0.6, top: null });
    expect(symbol.outline[0]).toEqual({ x: 0.8, y: 0.7 });
    expect(symbol.diagonals[0]).toEqual([symbol.outline[0], symbol.outline[2]]);
  });

  it("turns the north arrow clockwise", () => {
    const up = northArrow({ x: 0, y: 0 }, 1, 0);
    expect(up.arrow[0].x).toBeCloseTo(0);
    expect(up.arrow[0].y).toBeCloseTo(-0.5);
    const east = northArrow({ x: 0, y: 0 }, 1, 90);
    expect(east.arrow[0].x).toBeCloseTo(0.5);
    expect(east.arrow[0].y).toBeCloseTo(0);
    expect(east.label.x).toBeGreaterThan(0.5);
  });
});
