// Exports the plan as an ASCII DXF file of version R12 (AC1009), which nearly all CAD programs
// read. The units are meters. The plan y points down and the DXF y points up, so the export
// turns the sign of y.

import { centroid } from "../model/geometry";
import { dimensionShape, openingShape, wallOutline } from "../model/drawing";
import { findRooms } from "../model/rooms";
import type { Plan, Point } from "../model/types";

/** The layers and their AutoCAD color numbers. */
export const DXF_LAYERS = {
  WALLS: 7,
  OPENINGS: 3,
  ROOMS: 8,
  DIMENSIONS: 5,
  TEXT: 2,
} as const;

type Layer = keyof typeof DXF_LAYERS;

const n = (value: number) => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(Object.is(rounded, -0) ? 0 : rounded);
};

export function planToDxf(plan: Plan): string {
  const out: string[] = [];
  const pair = (code: number, value: string | number) => {
    out.push(String(code), typeof value === "number" ? n(value) : value);
  };
  const xy = (p: Point, xCode = 10) => {
    pair(xCode, p.x);
    pair(xCode + 10, -p.y);
    pair(xCode + 20, 0);
  };

  const line = (layer: Layer, a: Point, b: Point) => {
    pair(0, "LINE");
    pair(8, layer);
    xy(a, 10);
    xy(b, 11);
  };
  const polygon = (layer: Layer, points: Point[]) => {
    pair(0, "POLYLINE");
    pair(8, layer);
    pair(66, 1);
    pair(70, 1);
    xy({ x: 0, y: 0 });
    for (const p of points) {
      pair(0, "VERTEX");
      pair(8, layer);
      xy(p);
    }
    pair(0, "SEQEND");
    pair(8, layer);
  };
  const text = (layer: Layer, at: Point, value: string, height: number, angle = 0) => {
    pair(0, "TEXT");
    pair(8, layer);
    xy(at, 10);
    pair(40, height);
    pair(1, value);
    // The plan angle turns from x to y down, so the DXF angle has the other sign.
    pair(50, -angle);
    pair(72, 1);
    pair(73, 2);
    xy(at, 11);
  };

  pair(0, "SECTION");
  pair(2, "HEADER");
  pair(9, "$ACADVER");
  pair(1, "AC1009");
  pair(9, "$INSUNITS");
  pair(70, 6);
  pair(0, "ENDSEC");

  pair(0, "SECTION");
  pair(2, "TABLES");
  pair(0, "TABLE");
  pair(2, "LTYPE");
  pair(70, 1);
  pair(0, "LTYPE");
  pair(2, "CONTINUOUS");
  pair(70, 0);
  pair(3, "Solid line");
  pair(72, 65);
  pair(73, 0);
  pair(40, 0);
  pair(0, "ENDTAB");
  pair(0, "TABLE");
  pair(2, "LAYER");
  pair(70, Object.keys(DXF_LAYERS).length);
  for (const [name, color] of Object.entries(DXF_LAYERS)) {
    pair(0, "LAYER");
    pair(2, name);
    pair(70, 0);
    pair(62, color);
    pair(6, "CONTINUOUS");
  }
  pair(0, "ENDTAB");
  pair(0, "ENDSEC");

  pair(0, "SECTION");
  pair(2, "ENTITIES");
  const rooms = findRooms(plan);
  for (const room of rooms) {
    polygon("ROOMS", room.polygon);
    // R12 has no Unicode text, so the area uses "m2".
    text("TEXT", centroid(room.polygon), `${room.area.toFixed(2)} m2`, 0.2);
  }
  for (const wall of plan.walls) {
    const outline = wallOutline(plan, wall);
    if (outline.length > 0) polygon("WALLS", outline);
  }
  for (const opening of plan.openings) {
    const shape = openingShape(plan, opening);
    if (!shape) continue;
    polygon("OPENINGS", shape.gap);
    if (shape.kind === "window") {
      line("OPENINGS", ...shape.glass);
      continue;
    }
    line("OPENINGS", shape.hinge, shape.leaf);
    const { arc } = shape;
    // DXF angles are in degrees, with y up, and an ARC always turns counterclockwise.
    const angle = (p: Point) =>
      (Math.atan2(-(p.y - arc.center.y), p.x - arc.center.x) * 180) / Math.PI;
    // Sweep 1 turns to larger plan angles, which is clockwise with y up.
    const [start, end] = arc.sweep === 1 ? [arc.to, arc.from] : [arc.from, arc.to];
    pair(0, "ARC");
    pair(8, "OPENINGS");
    xy(arc.center);
    pair(40, arc.radius);
    pair(50, angle(start));
    pair(51, angle(end));
  }
  for (const dimension of plan.dimensions) {
    const shape = dimensionShape(dimension);
    for (const [a, b] of [shape.line, ...shape.extensions, ...shape.ticks]) {
      line("DIMENSIONS", a, b);
    }
    const at = {
      x: shape.textAt.x + shape.normal.x * 0.15,
      y: shape.textAt.y + shape.normal.y * 0.15,
    };
    text("DIMENSIONS", at, shape.text, 0.15, shape.angle);
  }
  pair(0, "ENDSEC");
  pair(0, "EOF");
  return out.join("\n") + "\n";
}
