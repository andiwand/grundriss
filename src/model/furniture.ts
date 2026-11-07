// Furniture: the generic catalog, the transform from the local frame of a piece to the plan,
// and the 2D symbols and 3D blocks of the generic pieces. The functions are pure, so the editor,
// the 3D view, and the exports share them.
//
// The local frame of a piece: the origin is the center of its box, x goes along the width, and
// y goes along the depth. The back is at -y and the front is at +y. z goes up from the floor.

import { add, distance, perpendicular, scale, sub } from "./geometry";
import { newId, wallEnds } from "./plan";
import type { Furniture, FurnitureSource, Model, Plan, Point } from "./types";

export type Category =
  | "living"
  | "dining"
  | "kitchen"
  | "sleeping"
  | "bath"
  | "work"
  | "storage"
  | "lighting"
  | "decor"
  | "other";

export interface GenericType {
  type: string;
  name: string;
  category: Category;
  width: number;
  depth: number;
  height: number;
  /** The usual height above the floor, for example for a wall cabinet. */
  elevation?: number;
}

/** The generic catalog. The sizes are usual sizes in meters. */
export const GENERIC_TYPES: GenericType[] = [
  { type: "sofa", name: "Sofa", category: "living", width: 2.2, depth: 0.9, height: 0.85 },
  {
    type: "armchair",
    name: "Armchair",
    category: "living",
    width: 0.85,
    depth: 0.85,
    height: 0.85,
  },
  {
    type: "coffee-table",
    name: "Coffee table",
    category: "living",
    width: 1.1,
    depth: 0.6,
    height: 0.45,
  },
  {
    type: "sideboard",
    name: "Sideboard",
    category: "storage",
    width: 1.6,
    depth: 0.45,
    height: 0.75,
  },
  { type: "shelf", name: "Shelf", category: "storage", width: 0.8, depth: 0.35, height: 1.8 },
  // The height of a bed is the top of its headboard.
  {
    type: "bed-single",
    name: "Single bed",
    category: "sleeping",
    width: 0.9,
    depth: 2.0,
    height: 0.9,
  },
  {
    type: "bed-double",
    name: "Double bed",
    category: "sleeping",
    width: 1.8,
    depth: 2.0,
    height: 0.9,
  },
  {
    type: "nightstand",
    name: "Nightstand",
    category: "sleeping",
    width: 0.45,
    depth: 0.4,
    height: 0.5,
  },
  { type: "wardrobe", name: "Wardrobe", category: "sleeping", width: 1.5, depth: 0.6, height: 2.1 },
  { type: "table", name: "Table", category: "dining", width: 1.6, depth: 0.9, height: 0.75 },
  {
    type: "table-round",
    name: "Round table",
    category: "dining",
    width: 1.1,
    depth: 1.1,
    height: 0.75,
  },
  { type: "chair", name: "Chair", category: "dining", width: 0.45, depth: 0.5, height: 0.9 },
  {
    type: "counter",
    name: "Kitchen counter",
    category: "kitchen",
    width: 1.8,
    depth: 0.6,
    height: 0.9,
  },
  {
    type: "kitchen-sink",
    name: "Kitchen sink",
    category: "kitchen",
    width: 0.8,
    depth: 0.6,
    height: 0.9,
  },
  { type: "hob", name: "Stove", category: "kitchen", width: 0.6, depth: 0.6, height: 0.9 },
  { type: "fridge", name: "Fridge", category: "kitchen", width: 0.6, depth: 0.65, height: 1.8 },
  {
    type: "wall-cabinet",
    name: "Wall cabinet",
    category: "kitchen",
    width: 0.8,
    depth: 0.35,
    height: 0.7,
    elevation: 1.45,
  },
  { type: "toilet", name: "Toilet", category: "bath", width: 0.38, depth: 0.7, height: 0.8 },
  { type: "washbasin", name: "Washbasin", category: "bath", width: 0.6, depth: 0.45, height: 0.85 },
  { type: "bathtub", name: "Bathtub", category: "bath", width: 0.75, depth: 1.7, height: 0.6 },
  { type: "shower", name: "Shower", category: "bath", width: 0.9, depth: 0.9, height: 2.0 },
  {
    type: "washer",
    name: "Washing machine",
    category: "bath",
    width: 0.6,
    depth: 0.6,
    height: 0.85,
  },
  { type: "desk", name: "Desk", category: "work", width: 1.4, depth: 0.7, height: 0.75 },
  {
    type: "office-chair",
    name: "Office chair",
    category: "work",
    width: 0.6,
    depth: 0.6,
    height: 1.0,
  },
  { type: "box", name: "Box", category: "other", width: 1.0, depth: 1.0, height: 1.0 },
];

/** The names of the categories. The catalog shows the groups in this order. */
export const CATEGORY_NAMES: Record<Category, string> = {
  living: "Living",
  dining: "Dining",
  kitchen: "Kitchen",
  sleeping: "Sleeping",
  bath: "Bath",
  work: "Work",
  storage: "Storage",
  lighting: "Lighting",
  decor: "Decor",
  other: "Other",
};

export function genericType(type: string): GenericType {
  return GENERIC_TYPES.find((t) => t.type === type) ?? GENERIC_TYPES[GENERIC_TYPES.length - 1];
}

export const findFurniture = (plan: Plan, id: string): Furniture | undefined =>
  plan.furniture.find((f) => f.id === id);

/** A new piece with the usual size of its source, at the point. */
export function newFurniture(source: FurnitureSource, at: Point, model?: Model): Furniture {
  const base = { id: newId("f"), source, x: at.x, y: at.y, rotation: 0, elevation: 0 };
  if (source.kind === "generic") {
    const t = genericType(source.type);
    return {
      ...base,
      name: t.name,
      width: t.width,
      depth: t.depth,
      height: t.height,
      elevation: t.elevation ?? 0,
    };
  }
  const size = model?.size ?? { x: 1, y: 1, z: 1 };
  return { ...base, name: model?.name ?? "Model", width: size.x, depth: size.y, height: size.z };
}

// ----- The frame of a piece -----

/** The point of the plan for a local point of the piece. */
export function toPlan(f: Furniture, p: Point): Point {
  const angle = (f.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: f.x + p.x * cos - p.y * sin, y: f.y + p.x * sin + p.y * cos };
}

/** The local point of the piece for a point of the plan. */
export function toLocal(f: Furniture, p: Point): Point {
  const angle = (f.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const d = sub(p, f);
  return { x: d.x * cos + d.y * sin, y: -d.x * sin + d.y * cos };
}

/** The four corners of the box of the piece on the plan. */
export function furnitureOutline(f: Furniture): Point[] {
  const w = f.width / 2;
  const d = f.depth / 2;
  return [
    { x: -w, y: -d },
    { x: w, y: -d },
    { x: w, y: d },
    { x: -w, y: d },
  ].map((p) => toPlan(f, p));
}

export function insideFurniture(f: Furniture, p: Point): boolean {
  const local = toLocal(f, p);
  return Math.abs(local.x) <= f.width / 2 && Math.abs(local.y) <= f.depth / 2;
}

// ----- 2D symbols -----

/**
 * The symbol of a piece on the plan, as polygons and lines in plan coordinates. All curves are
 * polygons, so each export can draw them.
 */
export interface FurnitureSymbol {
  /** Closed outlines. The first one is the box of the piece. */
  shapes: Point[][];
  lines: [Point, Point][];
}

const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

function ellipse(cx: number, cy: number, rx: number, ry: number, segments = 24): Point[] {
  return Array.from({ length: segments }, (_, i) => {
    const a = (2 * Math.PI * i) / segments;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });
}

/** A rectangle with round corners of the radius r. */
function rounded(x0: number, y0: number, x1: number, y1: number, r: number): Point[] {
  const radius = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
  const corners: [number, number, number][] = [
    [x1 - radius, y0 + radius, -Math.PI / 2],
    [x1 - radius, y1 - radius, 0],
    [x0 + radius, y1 - radius, Math.PI / 2],
    [x0 + radius, y0 + radius, Math.PI],
  ];
  const points: Point[] = [];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= 4; i++) {
      const a = start + (i * Math.PI) / 8;
      points.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
    }
  }
  return points;
}

/** The symbol in the local frame. The box comes first. */
function localSymbol(type: string, w: number, d: number): FurnitureSymbol {
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -d / 2;
  const y1 = d / 2;
  const box = rect(x0, y0, x1, y1);
  const shapes: Point[][] = [box];
  const lines: [Point, Point][] = [];
  const line = (ax: number, ay: number, bx: number, by: number) =>
    lines.push([
      { x: ax, y: ay },
      { x: bx, y: by },
    ]);
  const m = Math.min(w, d);
  switch (type) {
    case "sofa":
    case "armchair": {
      const arm = Math.min(0.18, w / 5);
      const back = Math.min(0.22, d / 3);
      shapes.push(rect(x0, y0, x1, y0 + back));
      shapes.push(rect(x0, y0 + back, x0 + arm, y1));
      shapes.push(rect(x1 - arm, y0 + back, x1, y1));
      // The seat cushions of a sofa.
      const seats = type === "sofa" ? Math.max(1, Math.round((w - 2 * arm) / 0.65)) : 1;
      for (let i = 1; i < seats; i++) {
        const x = x0 + arm + ((w - 2 * arm) * i) / seats;
        line(x, y0 + back, x, y1);
      }
      break;
    }
    case "bed-single":
    case "bed-double": {
      // The head of the bed is at the back. The pillows and the fold of the blanket show it.
      const pillows = type === "bed-double" ? 2 : 1;
      const gap = 0.08;
      const pw = (w - gap * (pillows + 1)) / pillows;
      for (let i = 0; i < pillows; i++) {
        const px = x0 + gap + i * (pw + gap);
        shapes.push(rounded(px, y0 + 0.08, px + pw, y0 + 0.08 + Math.min(0.4, d / 5), 0.06));
      }
      const fold = y0 + Math.min(0.6, d * 0.3);
      line(x0, fold, x1, fold);
      line(x0, fold, x0 + w * 0.25, fold + 0.25);
      break;
    }
    case "nightstand":
    case "sideboard":
    case "shelf":
    case "counter":
    case "wall-cabinet":
      // The front line shows which side opens.
      line(x0, y1 - Math.min(0.05, d / 6), x1, y1 - Math.min(0.05, d / 6));
      if (type === "wall-cabinet") lines.push([box[0], box[2]], [box[1], box[3]]);
      break;
    case "wardrobe": {
      const doors = Math.max(1, Math.round(w / 0.5));
      for (let i = 1; i < doors; i++)
        line(x0 + (w * i) / doors, y1 - 0.06, x0 + (w * i) / doors, y1);
      line(x0, y1 - 0.06, x1, y1 - 0.06);
      // The hanger rail along the middle.
      line(x0 + 0.05, 0, x1 - 0.05, 0);
      break;
    }
    case "table":
    case "desk":
    case "coffee-table":
      break;
    case "table-round":
      shapes[0] = ellipse(0, 0, w / 2, d / 2, 32);
      break;
    case "chair":
    case "office-chair":
      shapes.push(rect(x0, y0, x1, y0 + Math.min(0.08, d / 5)));
      if (type === "office-chair") shapes.push(ellipse(0, 0.04, w * 0.38, d * 0.38));
      break;
    case "kitchen-sink":
      line(x0, y1 - 0.04, x1, y1 - 0.04);
      shapes.push(rounded(x0 + 0.1, y0 + 0.08, x1 - 0.1, y1 - 0.1, 0.06));
      shapes.push(ellipse(0, y0 + 0.05, 0.025, 0.025, 12));
      break;
    case "hob": {
      const r = m * 0.16;
      for (const [cx, cy] of [
        [-w / 4, -d / 4],
        [w / 4, -d / 4],
        [-w / 4, d / 4],
        [w / 4, d / 4],
      ]) {
        shapes.push(ellipse(cx, cy, r, r, 20));
      }
      break;
    }
    case "fridge":
    case "washer":
      line(x0, y1 - 0.04, x1, y1 - 0.04);
      if (type === "washer") shapes.push(ellipse(0, 0, m * 0.32, m * 0.32, 28));
      else lines.push([box[0], box[2]]);
      break;
    case "toilet": {
      const tank = Math.min(0.2, d * 0.3);
      shapes[0] = rect(x0, y0, x1, y0 + tank);
      shapes.push(ellipse(0, y0 + tank + (d - tank) / 2, w / 2, (d - tank) / 2, 28));
      break;
    }
    case "washbasin":
      shapes.push(ellipse(0, 0.03, w * 0.38, d * 0.32, 28));
      shapes.push(ellipse(0, y0 + 0.06, 0.02, 0.02, 10));
      break;
    case "bathtub":
      shapes.push(rounded(x0 + 0.07, y0 + 0.07, x1 - 0.07, y1 - 0.07, Math.min(0.25, w / 3)));
      shapes.push(ellipse(0, y0 + 0.2, 0.025, 0.025, 10));
      break;
    case "shower":
      lines.push([box[0], box[2]], [box[1], box[3]]);
      shapes.push(ellipse(0, 0, 0.04, 0.04, 12));
      break;
    default:
      lines.push([box[0], box[2]], [box[1], box[3]]);
  }
  return { shapes, lines };
}

/**
 * The symbol of a piece in plan coordinates. A piece with a model shows its box with a cross,
 * because the model has no plan symbol.
 */
export function furnitureSymbol(f: Furniture): FurnitureSymbol {
  const type = f.source.kind === "generic" ? f.source.type : "model";
  const local = localSymbol(type, f.width, f.depth);
  return {
    shapes: local.shapes.map((shape) => shape.map((p) => toPlan(f, p))),
    lines: local.lines.map(([a, b]) => [toPlan(f, a), toPlan(f, b)]),
  };
}

// ----- 3D blocks -----

export type Finish = "wood" | "fabric" | "white" | "metal" | "dark" | "glass";

/**
 * A block of a generic piece in the local frame: a box, or a cylinder that fills the box with
 * an elliptic section. z0 and z1 are the heights above the bottom of the piece.
 */
export interface Block {
  shape: "box" | "cylinder";
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  finish: Finish;
}

/** The 3D blocks of a generic piece. The 3D view and the glTF export build them. */
export function genericBlocks(type: string, w: number, d: number, h: number): Block[] {
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -d / 2;
  const y1 = d / 2;
  const blocks: Block[] = [];
  const box = (
    bx0: number,
    by0: number,
    bz0: number,
    bx1: number,
    by1: number,
    bz1: number,
    finish: Finish,
    shape: Block["shape"] = "box",
  ) => blocks.push({ shape, x0: bx0, y0: by0, z0: bz0, x1: bx1, y1: by1, z1: bz1, finish });
  /** Four legs and a top: a table, a desk, or a nightstand without drawers. */
  const table = (top: number, finish: Finish) => {
    const leg = Math.min(0.06, w / 8, d / 8);
    for (const [lx, ly] of [
      [x0, y0],
      [x1 - leg, y0],
      [x0, y1 - leg],
      [x1 - leg, y1 - leg],
    ]) {
      box(lx, ly, 0, lx + leg, ly + leg, h - top, finish);
    }
    box(x0, y0, h - top, x1, y1, h, finish);
  };
  switch (type) {
    case "sofa":
    case "armchair": {
      const arm = Math.min(0.18, w / 5);
      const back = Math.min(0.22, d / 3);
      const seat = h * 0.5;
      box(x0, y0, 0, x1, y1, seat * 0.6, "fabric");
      box(x0 + arm, y0 + back, seat * 0.6, x1 - arm, y1, seat, "fabric");
      box(x0, y0, 0, x1, y0 + back, h, "fabric");
      box(x0, y0, 0, x0 + arm, y1, h * 0.72, "fabric");
      box(x1 - arm, y0, 0, x1, y1, h * 0.72, "fabric");
      break;
    }
    case "bed-single":
    case "bed-double": {
      // The headboard goes up to the full height. The mattress and the pillows stay below it.
      const mattress = Math.min(0.5, h * 0.6);
      const pillow = Math.min(mattress + 0.1, h);
      box(x0, y0, 0, x1, y1, mattress * 0.55, "wood");
      box(x0 + 0.03, y0 + 0.06, mattress * 0.55, x1 - 0.03, y1 - 0.03, mattress, "white");
      box(x0, y0, 0, x1, y0 + 0.06, h, "wood");
      const pillows = type === "bed-double" ? 2 : 1;
      const pw = (w - 0.08 * (pillows + 1)) / pillows;
      for (let i = 0; i < pillows; i++) {
        const px = x0 + 0.08 + i * (pw + 0.08);
        box(px, y0 + 0.1, mattress, px + pw, y0 + 0.1 + Math.min(0.4, d / 5), pillow, "white");
      }
      break;
    }
    case "table":
    case "desk":
    case "coffee-table":
      table(0.04, "wood");
      break;
    case "table-round":
      box(-0.05, -0.05, 0, 0.05, 0.05, h - 0.04, "metal", "cylinder");
      box(-w * 0.25, -d * 0.25, 0, w * 0.25, d * 0.25, 0.03, "metal", "cylinder");
      box(x0, y0, h - 0.04, x1, y1, h, "wood", "cylinder");
      break;
    case "chair": {
      const seat = Math.min(0.46, h * 0.5);
      const leg = 0.04;
      for (const [lx, ly] of [
        [x0, y0],
        [x1 - leg, y0],
        [x0, y1 - leg],
        [x1 - leg, y1 - leg],
      ]) {
        box(lx, ly, 0, lx + leg, ly + leg, seat, "wood");
      }
      box(x0, y0, seat, x1, y1, seat + 0.04, "wood");
      box(x0, y0, seat, x1, y0 + 0.04, h, "wood");
      break;
    }
    case "office-chair": {
      const seat = Math.min(0.48, h * 0.48);
      box(-0.03, -0.03, 0.05, 0.03, 0.03, seat, "metal", "cylinder");
      box(x0 + 0.05, y0 + 0.05, 0, x1 - 0.05, y1 - 0.05, 0.05, "dark", "cylinder");
      box(x0 + 0.05, y0 + 0.08, seat, x1 - 0.05, y1 - 0.05, seat + 0.08, "dark");
      box(x0 + 0.08, y0 + 0.04, seat + 0.08, x1 - 0.08, y0 + 0.12, h, "dark");
      break;
    }
    case "wardrobe":
    case "shelf":
    case "sideboard":
    case "nightstand":
    case "wall-cabinet":
      if (type !== "shelf") {
        box(x0, y0, 0, x1, y1, h, "white");
      } else {
        // The shelf is open at the front: five boards in a frame.
        box(x0, y0, 0, x0 + 0.02, y1, h, "wood");
        box(x1 - 0.02, y0, 0, x1, y1, h, "wood");
        box(x0, y0, 0, x1, y0 + 0.01, h, "wood");
        for (let i = 0; i <= 4; i++) {
          const z = (i * (h - 0.02)) / 4;
          box(x0, y0, z, x1, y1, z + 0.02, "wood");
        }
      }
      break;
    case "counter":
    case "kitchen-sink":
    case "hob":
      // The sink and the glass of the stove sit in the top of the worktop, inside the box.
      box(x0, y0, 0, x1, y1 - 0.02, h - 0.04, "white");
      box(x0, y0, h - 0.04, x1, y1, h - 0.003, "dark");
      if (type === "kitchen-sink") {
        box(x0 + 0.1, y0 + 0.08, h - 0.003, x1 - 0.1, y1 - 0.1, h, "metal");
      }
      if (type === "hob") box(x0 + 0.03, y0 + 0.03, h - 0.003, x1 - 0.03, y1 - 0.03, h, "glass");
      break;
    case "fridge":
    case "washer":
      // The door of the washing machine is at the front, inside the box.
      box(x0, y0, 0, x1, type === "washer" ? y1 - 0.02 : y1, h, "white");
      if (type === "washer") {
        box(-w * 0.3, y1 - 0.02, h * 0.2, w * 0.3, y1, h * 0.75, "glass", "cylinder");
      }
      break;
    case "toilet": {
      const tank = Math.min(0.2, d * 0.3);
      box(x0, y0, 0.35, x1, y0 + tank, h, "white");
      box(x0, y0 + tank * 0.5, 0, x1, y1, 0.42, "white", "cylinder");
      break;
    }
    case "washbasin":
      box(x0, y0, h - 0.15, x1, y1, h, "white");
      box(-0.08, y0, 0, 0.08, y0 + 0.15, h - 0.15, "white");
      break;
    case "bathtub":
      box(x0, y0, 0, x1, y1, h, "white");
      break;
    case "shower":
      box(x0, y0, 0, x1, y1, 0.04, "white");
      box(x0, y1 - 0.01, 0.04, x1, y1, h, "glass");
      box(x1 - 0.01, y0, 0.04, x1, y1, h, "glass");
      break;
    default:
      box(x0, y0, 0, x1, y1, h, "wood");
  }
  return blocks;
}

// ----- Placement at a wall -----

/**
 * The position and the rotation that put the back of the piece against the nearest wall, if a
 * wall is near the point. The piece keeps its size. `walls` are the faces of the walls: each a
 * segment on the side of the room, with the normal that points into the room.
 */
export function snapToWall(
  f: Furniture,
  at: Point,
  faces: { a: Point; b: Point; normal: Point }[],
  tolerance: number,
): { x: number; y: number; rotation: number } | null {
  let best: { x: number; y: number; rotation: number } | null = null;
  let bestDistance = tolerance + f.depth / 2;
  for (const face of faces) {
    const length = distance(face.a, face.b);
    if (length === 0) continue;
    const dir = scale(sub(face.b, face.a), 1 / length);
    const along = (at.x - face.a.x) * dir.x + (at.y - face.a.y) * dir.y;
    if (along < 0 || along > length) continue;
    const away = (at.x - face.a.x) * face.normal.x + (at.y - face.a.y) * face.normal.y;
    // Only the side of the room counts: a point behind the face does not snap to it.
    if (away < -0.05 || away > bestDistance) continue;
    bestDistance = away;
    // The local +y axis of the piece must point along the normal, into the room.
    const rotation = (Math.atan2(-face.normal.x, face.normal.y) * 180) / Math.PI;
    const center = add(add(face.a, scale(dir, along)), scale(face.normal, f.depth / 2));
    // The rotation stays from 0 to 360 degrees, as the rotation with the R key does.
    const turn = (((Math.round(rotation * 1000) / 1000) % 360) + 360) % 360;
    best = { x: center.x, y: center.y, rotation: turn };
  }
  return best;
}

/** The two faces of each wall: the segments at half the thickness, with outward normals. */
export function wallFaces(plan: Plan): { a: Point; b: Point; normal: Point }[] {
  const faces: { a: Point; b: Point; normal: Point }[] = [];
  for (const wall of plan.walls) {
    const [a, b] = wallEnds(plan, wall);
    const length = distance(a, b);
    if (length === 0) continue;
    const normal = perpendicular(scale(sub(b, a), 1 / length));
    for (const side of [1, -1]) {
      const n = scale(normal, side);
      const offset = scale(n, wall.thickness / 2);
      faces.push({ a: add(a, offset), b: add(b, offset), normal: n });
    }
  }
  return faces;
}
