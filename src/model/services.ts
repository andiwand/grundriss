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

/** The systems in the order of the user interface, with their names and plan colors. */
export const SERVICE_SYSTEMS: { system: ServiceSystem; name: string; color: string }[] = [
  { system: "water", name: "Water", color: "#1971c2" },
  { system: "heating", name: "Heating", color: "#c92a2a" },
  { system: "electric", name: "Electricity", color: "#d9480f" },
  { system: "comms", name: "Communication", color: "#7048e8" },
];

/** The color of the device symbols of a system in the plan and the exports. */
export const systemColor = (system: ServiceSystem): string =>
  SERVICE_SYSTEMS.find((s) => s.system === system)?.color ?? "#d9480f";

const device = (
  system: ServiceSystem,
  type: string,
  name: string,
  elevation: number | "ceiling",
  width: number,
  onWall = true,
  power: number | null = null,
): FixtureType => ({ type, system, name, elevation, width, power, onWall });

export const FIXTURE_TYPES: FixtureType[] = [
  device("water", "water-outlet", "Water outlet", 0.55, 0.08),
  device("water", "drain", "Waste connection", 0.45, 0.1),
  device("water", "floor-drain", "Floor drain", 0, 0.15, false),
  device("water", "outdoor-tap", "Outdoor tap", 0.6, 0.08),
  device("water", "water-meter", "Water meter", 1.0, 0.3),
  device("water", "hot-water-tank", "Hot water tank", 0.9, 0.6),
  device("heating", "radiator", "Radiator", 0.45, 1.0, true, 1000),
  device("heating", "towel-radiator", "Towel radiator", 0.9, 0.5, true, 500),
  device("heating", "manifold", "Floor heating manifold", 0.6, 0.6),
  device("heating", "boiler", "Boiler", 1.2, 0.45, true, 15000),
  device("heating", "heat-pump", "Heat pump", 0.5, 1.0, true, 9000),
  device("electric", "socket", "Socket", 0.3, 0.08),
  device("electric", "socket-double", "Double socket", 0.3, 0.16),
  device("electric", "switch", "Switch", 1.05, 0.08),
  device("electric", "switch-2way", "Two-way switch", 1.05, 0.08),
  device("electric", "light-ceiling", "Ceiling light", "ceiling", 0.3, false),
  device("electric", "light-wall", "Wall light", 2.0, 0.2),
  device("electric", "junction", "Junction box", 2.2, 0.08),
  device("electric", "smoke", "Smoke detector", "ceiling", 0.12, false),
  device("electric", "board", "Distribution board", 1.4, 0.6),
  device("electric", "inverter", "PV inverter", 1.4, 0.45),
  device("electric", "battery", "Battery storage", 0.6, 0.6),
  device("comms", "data", "Network socket", 0.3, 0.08),
  device("comms", "phone", "Phone socket", 0.3, 0.08),
  device("comms", "tv", "TV socket", 0.3, 0.08),
  device("comms", "sat", "SAT socket", 0.3, 0.08),
  device("comms", "router", "Router", 1.6, 0.3),
  device("comms", "patch-panel", "Network cabinet", 1.4, 0.6),
  device("comms", "multiswitch", "SAT multiswitch", 1.6, 0.3),
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
  /** The radius of the tube in the 3D view, in meters. */
  radius: number;
}

const line = (
  system: ServiceSystem,
  kind: string,
  name: string,
  elevation: number,
  color: string,
  dashed: boolean,
  radius: number,
): RunKind => ({ kind, system, name, elevation, color, dashed, radius });

export const RUN_KINDS: RunKind[] = [
  line("water", "cold-water", "Cold water pipe", 0.4, "#2f9e44", false, 0.012),
  line("water", "hot-water", "Hot water pipe", 0.45, "#e64980", false, 0.012),
  line("water", "circulation", "Circulation pipe", 0.5, "#e64980", true, 0.01),
  line("water", "waste-water", "Waste water pipe", 0.05, "#8d6e63", false, 0.025),
  line("heating", "flow", "Flow pipe", 0.1, "#e03131", false, 0.015),
  line("heating", "return", "Return pipe", 0.1, "#1c7ed6", true, 0.015),
  line("electric", "cable", "Power cable", 0.3, "#e8590c", false, 0.008),
  line("electric", "light-cable", "Light cable", 2.3, "#f59f00", false, 0.008),
  line("electric", "pv-cable", "PV cable", 2.3, "#66a80f", true, 0.008),
  line("comms", "data-cable", "Network cable", 0.3, "#7048e8", true, 0.006),
  line("comms", "phone-cable", "Phone cable", 0.3, "#ae3ec9", true, 0.006),
  line("comms", "tv-cable", "TV cable", 0.3, "#1098ad", true, 0.006),
  line("comms", "sat-cable", "SAT cable", 0.3, "#364fc7", true, 0.006),
];

// An unknown type is a socket, and an unknown kind is a power cable, as in the first versions.
export const fixtureType = (type: string): FixtureType =>
  FIXTURE_TYPES.find((t) => t.type === type) ?? FIXTURE_TYPES.find((t) => t.type === "socket")!;

export const runKind = (kind: string): RunKind =>
  RUN_KINDS.find((k) => k.kind === kind) ?? RUN_KINDS.find((k) => k.kind === "cable")!;

const SYSTEM_IDS = SERVICE_SYSTEMS.map((s) => s.system);

/**
 * The system of a device type or a line kind of a file. A known type or kind gives its own
 * system, so that an old file with a network socket in "electric" moves it to "comms". An unknown
 * one keeps a valid stored system, or else becomes "electric".
 */
export function serviceSystem(
  stored: unknown,
  known: { system: ServiceSystem } | undefined,
): ServiceSystem {
  if (known) return known.system;
  return SYSTEM_IDS.includes(stored as ServiceSystem) ? (stored as ServiceSystem) : "electric";
}

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
  const box = (w: number, from: number, to: number) =>
    shapes.push([
      { x: -w, y: from },
      { x: w, y: from },
      { x: w, y: to },
      { x: -w, y: to },
    ]);
  switch (f.type) {
    case "socket":
    case "data":
    case "phone":
    case "tv":
    case "sat":
      // A half circle that opens to the room, and a short line to the wall. The mark inside
      // tells the kind of the outlet.
      lines.push(arc(0, r, r, Math.PI, 2 * Math.PI));
      line([-r, r], [r, r]);
      line([0, 0], [0, -0.05]);
      if (f.type === "data") filled.push(circle(0, r * 0.55, 0.03));
      if (f.type === "phone") line([-0.05, r * 0.55], [0.05, r * 0.55]);
      if (f.type === "tv") shapes.push(circle(0, r * 0.55, 0.035));
      if (f.type === "sat") {
        shapes.push(circle(0, r * 0.55, 0.035));
        filled.push(circle(0, r * 0.55, 0.015));
      }
      break;
    case "water-outlet":
    case "outdoor-tap":
      // A circle in front of the wall, with the line of the tap to the wall.
      line([0, 0], [0, 0.04]);
      shapes.push(circle(0, 0.1, 0.06));
      line([-0.06, 0.1], [0.06, 0.1]);
      if (f.type === "outdoor-tap") filled.push(circle(0, 0.1, 0.025));
      break;
    case "drain":
      shapes.push(circle(0, 0.08, 0.06));
      filled.push(circle(0, 0.08, 0.03));
      break;
    case "floor-drain": {
      const w = f.width / 2;
      box(w, -w, w);
      shapes.push(circle(0, 0, w * 0.55));
      break;
    }
    case "water-meter":
      shapes.push(circle(0, 0.11, 0.1));
      line([-0.07, 0.18], [0.07, 0.04]);
      break;
    case "hot-water-tank": {
      const rt = f.width / 2;
      shapes.push(circle(0, rt, rt));
      line([-rt, rt], [rt, rt]);
      break;
    }
    case "inverter": {
      const w = f.width / 2;
      box(w, 0, 0.15);
      line([-w, 0.15], [w, 0]);
      break;
    }
    case "battery": {
      const w = f.width / 2;
      box(w, 0, 0.2);
      line([-w * 0.4, 0.06], [-w * 0.4, 0.14]);
      line([w * 0.4, 0.04], [w * 0.4, 0.16]);
      break;
    }
    case "router":
      box(f.width / 2, 0, 0.1);
      line([-0.08, 0.1], [-0.12, 0.2]);
      line([0.08, 0.1], [0.12, 0.2]);
      break;
    case "patch-panel": {
      const w = f.width / 2;
      box(w, 0, 0.15);
      for (const x of [-w / 2, 0, w / 2]) line([x, 0], [x, 0.15]);
      break;
    }
    case "multiswitch": {
      const w = f.width / 2;
      box(w, 0, 0.12);
      line([-w, 0], [w, 0.12]);
      line([-w, 0.12], [w, 0]);
      break;
    }
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
