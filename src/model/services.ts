// Building services: the types of the devices, the kinds of the lines, their plan symbols, and
// the functions that change them. The functions are pure.
//
// A device uses the local frame of furniture (src/model/furniture.ts): the origin at its center,
// x along the wall, the back at -y against the wall, and the front at +y in the room.

import { add, distance, scale } from "./geometry";
import { newId } from "./plan";
import type { Fixture, Plan, Point, Run, ServiceSystem } from "./types";

export interface FixtureType {
  type: string;
  system: ServiceSystem;
  name: string;
  /** The usual height of the center above the floor. "ceiling" means at the ceiling. */
  elevation: number | "ceiling";
  /** The usual width along the wall, and the usual power in watts, or null. */
  width: number;
  power: number | null;
  /** True if the device goes on a wall, so that it snaps to walls. */
  onWall: boolean;
}

export const FIXTURE_TYPES: FixtureType[] = [
  {
    type: "socket",
    system: "electric",
    name: "Socket",
    elevation: 0.3,
    width: 0.08,
    power: null,
    onWall: true,
  },
  {
    type: "socket-double",
    system: "electric",
    name: "Double socket",
    elevation: 0.3,
    width: 0.16,
    power: null,
    onWall: true,
  },
  {
    type: "switch",
    system: "electric",
    name: "Switch",
    elevation: 1.05,
    width: 0.08,
    power: null,
    onWall: true,
  },
  {
    type: "switch-2way",
    system: "electric",
    name: "Two-way switch",
    elevation: 1.05,
    width: 0.08,
    power: null,
    onWall: true,
  },
  {
    type: "light-ceiling",
    system: "electric",
    name: "Ceiling light",
    elevation: "ceiling",
    width: 0.3,
    power: null,
    onWall: false,
  },
  {
    type: "light-wall",
    system: "electric",
    name: "Wall light",
    elevation: 2.0,
    width: 0.2,
    power: null,
    onWall: true,
  },
  {
    type: "data",
    system: "electric",
    name: "Network socket",
    elevation: 0.3,
    width: 0.08,
    power: null,
    onWall: true,
  },
  {
    type: "junction",
    system: "electric",
    name: "Junction box",
    elevation: 2.2,
    width: 0.08,
    power: null,
    onWall: true,
  },
  {
    type: "smoke",
    system: "electric",
    name: "Smoke detector",
    elevation: "ceiling",
    width: 0.12,
    power: null,
    onWall: false,
  },
  {
    type: "board",
    system: "electric",
    name: "Distribution board",
    elevation: 1.4,
    width: 0.6,
    power: null,
    onWall: true,
  },
  {
    type: "radiator",
    system: "heating",
    name: "Radiator",
    elevation: 0.45,
    width: 1.0,
    power: 1000,
    onWall: true,
  },
  {
    type: "towel-radiator",
    system: "heating",
    name: "Towel radiator",
    elevation: 0.9,
    width: 0.5,
    power: 500,
    onWall: true,
  },
  {
    type: "boiler",
    system: "heating",
    name: "Boiler",
    elevation: 1.2,
    width: 0.45,
    power: 15000,
    onWall: true,
  },
  {
    type: "heat-pump",
    system: "heating",
    name: "Heat pump",
    elevation: 0.5,
    width: 1.0,
    power: 9000,
    onWall: true,
  },
  {
    type: "manifold",
    system: "heating",
    name: "Floor heating manifold",
    elevation: 0.6,
    width: 0.6,
    power: null,
    onWall: true,
  },
];

export interface RunKind {
  kind: string;
  system: ServiceSystem;
  name: string;
  /** The usual height above the floor: cables in the wall, pipes near the floor. */
  elevation: number;
  /** The color of the line in the views and the exports, as a CSS hex color. */
  color: string;
  dashed: boolean;
}

export const RUN_KINDS: RunKind[] = [
  {
    kind: "cable",
    system: "electric",
    name: "Power cable",
    elevation: 0.3,
    color: "#e8590c",
    dashed: false,
  },
  {
    kind: "light-cable",
    system: "electric",
    name: "Light cable",
    elevation: 2.3,
    color: "#f59f00",
    dashed: false,
  },
  {
    kind: "data-cable",
    system: "electric",
    name: "Data cable",
    elevation: 0.3,
    color: "#1098ad",
    dashed: true,
  },
  {
    kind: "flow",
    system: "heating",
    name: "Flow pipe",
    elevation: 0.1,
    color: "#e03131",
    dashed: false,
  },
  {
    kind: "return",
    system: "heating",
    name: "Return pipe",
    elevation: 0.1,
    color: "#1c7ed6",
    dashed: true,
  },
];

export const fixtureType = (type: string): FixtureType =>
  FIXTURE_TYPES.find((t) => t.type === type) ?? FIXTURE_TYPES[0];

export const runKind = (kind: string): RunKind =>
  RUN_KINDS.find((k) => k.kind === kind) ?? RUN_KINDS[0];

export const findFixture = (plan: Plan, id: string): Fixture | undefined =>
  plan.fixtures.find((f) => f.id === id);
export const findRun = (plan: Plan, id: string): Run | undefined =>
  plan.runs.find((r) => r.id === id);

/**
 * A new device of the type at the point. `ceiling` is the height of the ceiling of the room, for
 * the devices at the ceiling.
 */
export function newFixture(type: string, at: Point, ceiling: number): Fixture {
  const t = fixtureType(type);
  return {
    id: newId("x"),
    system: t.system,
    type: t.type,
    x: at.x,
    y: at.y,
    rotation: 0,
    elevation: t.elevation === "ceiling" ? ceiling : t.elevation,
    width: t.width,
    power: t.power,
    label: "",
  };
}

export function newRun(kind: string, points: Point[]): Run {
  const k = runKind(kind);
  return {
    id: newId("n"),
    system: k.system,
    kind: k.kind,
    points: points.map((p) => ({ ...p })),
    elevation: k.elevation,
    from: null,
    to: null,
  };
}

/** The length of a line on the plan. */
export function runLength(run: Run): number {
  let length = 0;
  for (let i = 1; i < run.points.length; i++) length += distance(run.points[i - 1], run.points[i]);
  return length;
}

// ----- Plan symbols -----

const toPlan = (f: Fixture, p: Point): Point => {
  const angle = (f.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: f.x + p.x * cos - p.y * sin, y: f.y + p.x * sin + p.y * cos };
};

function arc(cx: number, cy: number, r: number, from: number, to: number, segments = 12): Point[] {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / segments;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}

const circle = (cx: number, cy: number, r: number) =>
  arc(cx, cy, r, 0, 2 * Math.PI, 20).slice(0, -1);

export interface FixtureSymbol {
  /** Closed outlines. */
  shapes: Point[][];
  /** Open polylines. */
  lines: Point[][];
  /** Shapes with a fill in the color of the line, for example a filled dot. */
  filled: Point[][];
}

/**
 * The plan symbol of a device, in plan coordinates. The symbols follow the usual electrical and
 * heating plan symbols in a simple form. Their size does not depend on the zoom: a socket symbol
 * is about 0.25 m wide, so that it stays readable at 1:50 and 1:100.
 */
export function fixtureSymbol(f: Fixture): FixtureSymbol {
  const shapes: Point[][] = [];
  const lines: Point[][] = [];
  const filled: Point[][] = [];
  const r = 0.12;
  const line = (...points: [number, number][]) => lines.push(points.map(([x, y]) => ({ x, y })));
  switch (f.type) {
    case "socket":
    case "data":
      // A half circle that opens to the room, and a short line to the wall.
      lines.push(arc(0, r, r, Math.PI, 2 * Math.PI));
      line([-r, r], [r, r]);
      line([0, 0], [0, -0.05]);
      if (f.type === "data") filled.push(circle(0, r * 0.55, 0.03));
      break;
    case "socket-double":
      lines.push(arc(0, r, r, Math.PI, 2 * Math.PI));
      lines.push(arc(0, r + 0.05, r, Math.PI, 2 * Math.PI));
      line([-r, r + 0.05], [r, r + 0.05]);
      line([0, 0], [0, -0.05]);
      break;
    case "switch":
    case "switch-2way":
      shapes.push(circle(0, 0.06, 0.05));
      line([0.035, 0.025], [0.14, 0.2]);
      if (f.type === "switch-2way") line([-0.035, 0.025], [-0.14, 0.2]);
      break;
    case "light-ceiling":
    case "light-wall":
    case "smoke": {
      const cy = f.type === "light-wall" ? r : 0;
      shapes.push(circle(0, cy, r));
      if (f.type === "smoke") {
        filled.push(circle(0, cy, 0.035));
      } else {
        const d = r * Math.SQRT1_2;
        line([-d, cy - d], [d, cy + d]);
        line([-d, cy + d], [d, cy - d]);
      }
      if (f.type === "light-wall") line([-r, 0], [r, 0]);
      break;
    }
    case "junction":
      filled.push(circle(0, 0.05, 0.05));
      break;
    case "board": {
      const w = f.width / 2;
      shapes.push([
        { x: -w, y: -0.05 },
        { x: w, y: -0.05 },
        { x: w, y: 0.15 },
        { x: -w, y: 0.15 },
      ]);
      filled.push([
        { x: -w, y: -0.05 },
        { x: w, y: -0.05 },
        { x: -w, y: 0.15 },
      ]);
      break;
    }
    case "radiator":
    case "towel-radiator":
    case "manifold": {
      // A flat box at the wall with the ribs of the radiator.
      const w = f.width / 2;
      const depth = f.type === "manifold" ? 0.12 : 0.1;
      shapes.push([
        { x: -w, y: 0 },
        { x: w, y: 0 },
        { x: w, y: depth },
        { x: -w, y: depth },
      ]);
      const ribs = Math.max(2, Math.round(f.width / 0.1));
      for (let i = 1; i < ribs; i++) {
        const x = -w + (f.width * i) / ribs;
        line([x, 0], [x, depth]);
      }
      break;
    }
    case "boiler":
    case "heat-pump": {
      const w = f.width / 2;
      const depth = f.type === "boiler" ? 0.4 : 0.5;
      shapes.push([
        { x: -w, y: 0 },
        { x: w, y: 0 },
        { x: w, y: depth },
        { x: -w, y: depth },
      ]);
      if (f.type === "heat-pump") shapes.push(circle(0, depth / 2, Math.min(w, depth / 2) * 0.7));
      else
        filled.push([
          { x: -0.08, y: depth * 0.75 },
          { x: 0.08, y: depth * 0.75 },
          { x: 0, y: depth * 0.3 },
        ]);
      break;
    }
    default:
      shapes.push(circle(0, 0, 0.08));
  }
  const map = (list: Point[][]) => list.map((points) => points.map((p) => toPlan(f, p)));
  return { shapes: map(shapes), lines: map(lines), filled: map(filled) };
}

/** The point where a line connects to a device: at the device, a bit in front of the wall. */
export function fixtureAnchor(f: Fixture): Point {
  return toPlan(f, { x: 0, y: 0.02 });
}

/** The middle of a line, for its label. */
export function runMiddle(run: Run): Point {
  const total = runLength(run);
  let walked = 0;
  for (let i = 1; i < run.points.length; i++) {
    const step = distance(run.points[i - 1], run.points[i]);
    if (walked + step >= total / 2 && step > 0) {
      const t = (total / 2 - walked) / step;
      return add(
        run.points[i - 1],
        scale(
          { x: run.points[i].x - run.points[i - 1].x, y: run.points[i].y - run.points[i - 1].y },
          t,
        ),
      );
    }
    walked += step;
  }
  return run.points[0] ?? { x: 0, y: 0 };
}
