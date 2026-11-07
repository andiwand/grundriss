// Exports the plan as an ASCII DXF file of version R12 (AC1009), which nearly all CAD programs
// read. The units are meters. The plan y points down and the DXF y points up, so the export
// turns the sign of y.
//
// A building puts each story on its own layers: "<STORY>_WALLS", "<STORY>_OPENINGS", and so on.

import {
  chimneySymbol,
  dimensionShape,
  openingShape,
  stairDrawing,
  wallOutline,
} from "../model/drawing";
import { findRooms, roomLabel } from "../model/rooms";
import type { Building, Plan, Point } from "../model/types";
import { furnitureSymbol } from "../model/furniture";
import { fixtureSymbol } from "../model/services";
import { riseOf, storyExtras, type StoryExtras } from "./context";

/** The layers and their AutoCAD color numbers. */
export const DXF_LAYERS = {
  WALLS: 7,
  OPENINGS: 3,
  ROOMS: 8,
  DIMENSIONS: 5,
  TEXT: 2,
  STAIRS: 4,
  CHIMNEYS: 1,
  FURNITURE: 6,
  ELECTRIC: 30,
  HEATING: 1,
} as const;

type Layer = keyof typeof DXF_LAYERS;

const n = (value: number) => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(Object.is(rounded, -0) ? 0 : rounded);
};

/**
 * A text value for DXF. A line break would end the value, so it becomes a space. R12 has no
 * UTF-8, so a character outside ASCII becomes the code "\U+XXXX", which CAD programs read.
 */
function dxfText(text: string): string {
  return [...text.replace(/[\r\n\t]+/g, " ")]
    .map((c) => {
      const code = c.codePointAt(0)!;
      if (code < 0x80) return c;
      return code > 0xffff ? "?" : `\\U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
    })
    .join("");
}

/** The name of a story as a prefix of a layer: upper case, with "_" for other characters. */
export function layerPrefix(name: string): string {
  return `${name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_`;
}

/** Exports one story. Its layers have no prefix. */
export function planToDxf(plan: Plan, extras: StoryExtras = {}): string {
  return writeDxf([{ plan, extras, prefix: "" }]);
}

/** Exports all stories in one file, each story on its own layers. */
export function buildingToDxf(building: Building): string {
  const used = new Set<string>();
  return writeDxf(
    building.stories.map((story) => {
      // Two stories with the same name get different layers.
      let prefix = layerPrefix(story.name);
      for (let i = 2; used.has(prefix); i++) prefix = layerPrefix(`${story.name} ${i}`);
      used.add(prefix);
      return { plan: story, extras: storyExtras(building, story), prefix };
    }),
  );
}

function writeDxf(stories: { plan: Plan; extras: StoryExtras; prefix: string }[]): string {
  const out: string[] = [];
  const pair = (code: number, value: string | number) => {
    out.push(String(code), typeof value === "number" ? n(value) : value);
  };
  const xy = (p: Point, xCode = 10) => {
    pair(xCode, p.x);
    pair(xCode + 10, -p.y);
    pair(xCode + 20, 0);
  };

  const line = (layer: string, a: Point, b: Point) => {
    pair(0, "LINE");
    pair(8, layer);
    xy(a, 10);
    xy(b, 11);
  };
  const polygon = (layer: string, points: Point[], closed = true) => {
    pair(0, "POLYLINE");
    pair(8, layer);
    pair(66, 1);
    pair(70, closed ? 1 : 0);
    xy({ x: 0, y: 0 });
    for (const p of points) {
      pair(0, "VERTEX");
      pair(8, layer);
      xy(p);
    }
    pair(0, "SEQEND");
    pair(8, layer);
  };
  const text = (layer: string, at: Point, value: string, height: number, angle = 0) => {
    pair(0, "TEXT");
    pair(8, layer);
    xy(at, 10);
    pair(40, height);
    pair(1, dxfText(value));
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
  pair(70, Object.keys(DXF_LAYERS).length * stories.length);
  for (const { prefix } of stories) {
    for (const [name, color] of Object.entries(DXF_LAYERS)) {
      pair(0, "LAYER");
      pair(2, prefix + name);
      pair(70, 0);
      pair(62, color);
      pair(6, "CONTINUOUS");
    }
  }
  pair(0, "ENDTAB");
  pair(0, "ENDSEC");

  pair(0, "SECTION");
  pair(2, "ENTITIES");
  for (const { plan, extras, prefix } of stories) {
    const L = Object.fromEntries(
      Object.keys(DXF_LAYERS).map((name) => [name, prefix + name]),
    ) as Record<Layer, string>;
    const rooms = findRooms(plan);
    for (const room of rooms) {
      polygon(L.ROOMS, room.polygon);
      // Plain ASCII is easier to read than codes, so "m²" becomes "m2" and "·" becomes "-".
      const lines = roomLabel(room).map((t) => t.replace(/²/g, "2").replace(/·/g, "-"));
      lines.forEach((t, i) => {
        const y = room.labelAt.y + (i - (lines.length - 1) / 2) * 0.3;
        text(L.TEXT, { x: room.labelAt.x, y }, t, 0.2);
      });
    }
    for (const piece of plan.furniture) {
      const symbol = furnitureSymbol(piece);
      for (const shape of symbol.shapes) polygon(L.FURNITURE, shape);
      for (const [a, b] of symbol.lines) line(L.FURNITURE, a, b);
      // A piece with a model has no plan symbol, so its name tells what it is.
      if (piece.source.kind === "model" && piece.name) {
        text(L.FURNITURE, piece, piece.name, 0.12);
      }
    }
    for (const wall of plan.walls) {
      const outline = wallOutline(plan, wall);
      if (outline.length > 0) polygon(L.WALLS, outline);
    }
    // The building services: each system on its own layer. A line is an open polyline.
    const serviceLayer = (system: "electric" | "heating") =>
      system === "electric" ? L.ELECTRIC : L.HEATING;
    for (const run of plan.runs) {
      if (run.points.length >= 2) polygon(serviceLayer(run.system), run.points, false);
    }
    for (const fixture of plan.fixtures) {
      const layer = serviceLayer(fixture.system);
      const symbol = fixtureSymbol(fixture);
      for (const shape of [...symbol.shapes, ...symbol.filled]) polygon(layer, shape);
      for (const points of symbol.lines) polygon(layer, points, false);
    }
    for (const opening of plan.openings) {
      const shape = openingShape(plan, opening);
      if (!shape) continue;
      polygon(L.OPENINGS, shape.gap);
      if (shape.kind === "window") {
        line(L.OPENINGS, ...shape.glass);
        continue;
      }
      line(L.OPENINGS, shape.hinge, shape.leaf);
      const { arc } = shape;
      // DXF angles are in degrees, with y up, and an ARC always turns counterclockwise.
      const angle = (p: Point) =>
        (Math.atan2(-(p.y - arc.center.y), p.x - arc.center.x) * 180) / Math.PI;
      // Sweep 1 turns to larger plan angles, which is clockwise with y up.
      const [start, end] = arc.sweep === 1 ? [arc.to, arc.from] : [arc.from, arc.to];
      pair(0, "ARC");
      pair(8, L.OPENINGS);
      xy(arc.center);
      pair(40, arc.radius);
      pair(50, angle(start));
      pair(51, angle(end));
    }
    for (const dimension of plan.dimensions) {
      const shape = dimensionShape(dimension);
      for (const [a, b] of [shape.line, ...shape.extensions, ...shape.ticks]) {
        line(L.DIMENSIONS, a, b);
      }
      const at = {
        x: shape.textAt.x + shape.normal.x * 0.15,
        y: shape.textAt.y + shape.normal.y * 0.15,
      };
      text(L.DIMENSIONS, at, shape.text, 0.15, shape.angle);
    }
    for (const stair of plan.stairs) {
      const shape = stairDrawing(stair, riseOf(plan, stair, extras));
      polygon(L.STAIRS, shape.outline);
      for (const step of shape.steps) polygon(L.STAIRS, step);
      for (let i = 1; i < shape.arrow.length; i++) {
        line(L.STAIRS, shape.arrow[i - 1], shape.arrow[i]);
      }
      for (const [a, b] of shape.head) line(L.STAIRS, a, b);
    }
    for (const chimney of [...(extras.through ?? []), ...plan.chimneys]) {
      const symbol = chimneySymbol(chimney);
      polygon(L.CHIMNEYS, symbol.outline);
      for (const [a, b] of symbol.diagonals) line(L.CHIMNEYS, a, b);
    }
  }
  pair(0, "ENDSEC");
  pair(0, "EOF");
  return out.join("\n") + "\n";
}
