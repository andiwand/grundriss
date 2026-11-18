// The outdoor parts of a story: areas (terraces, balconies, roof terraces, paths, driveways,
// lawns, pools, the plot, and neighbor buildings), fences and hedges, and trees.
//
// An area has an outline and a slab: its top is `level` above the floor of its story, and the
// slab goes `thickness` down from it. A pool is a basin: `thickness` is its depth. A neighbor
// building is a box: `thickness` is its height above the ground. The plot is only a boundary.
//
// The WoFlV counts a terrace, a balcony, and a roof terrace (a "Dachgarten") with a quarter of
// its area, at most a half (§ 4 Nr. 4). The app counts a quarter.

import { centroid, distance, signedArea } from "./geometry";
import { newId } from "./plan";
import type { Area, AreaKind, Fence, FenceKind, Plan, Point, Tree } from "./types";

export interface AreaType {
  kind: AreaKind;
  /** The English name; the UI translates it. */
  name: string;
  /** The defaults of a new area. */
  level: number;
  thickness: number;
  /** The color of the plan and of the 3D view. */
  color: string;
  /** The part of the area that counts as living area (WoFlV), or 0. */
  living: number;
  /** A new area gets a railing on all sides. */
  railing: boolean;
}

export const AREA_TYPES: AreaType[] = [
  {
    kind: "terrace",
    name: "Terrace",
    level: 0,
    thickness: 0.2,
    color: "#d8ccb8",
    living: 0.25,
    railing: false,
  },
  {
    kind: "balcony",
    name: "Balcony",
    level: 0,
    thickness: 0.2,
    color: "#cfc7bb",
    living: 0.25,
    railing: true,
  },
  {
    kind: "roof-terrace",
    name: "Roof terrace",
    level: 0,
    thickness: 0.1,
    color: "#d5c3a5",
    living: 0.25,
    railing: true,
  },
  {
    kind: "path",
    name: "Path",
    level: 0,
    thickness: 0.05,
    color: "#cbc6bd",
    living: 0,
    railing: false,
  },
  {
    kind: "driveway",
    name: "Driveway",
    level: 0,
    thickness: 0.1,
    color: "#b4afa7",
    living: 0,
    railing: false,
  },
  {
    kind: "lawn",
    name: "Lawn",
    level: 0,
    thickness: 0.03,
    color: "#a4c784",
    living: 0,
    railing: false,
  },
  {
    kind: "pool",
    name: "Pool",
    level: 0,
    thickness: 1.5,
    color: "#7cc0e6",
    living: 0,
    railing: false,
  },
  {
    kind: "plot",
    name: "Plot",
    level: 0,
    thickness: 0,
    color: "#6f8f3a",
    living: 0,
    railing: false,
  },
  {
    kind: "neighbor",
    name: "Neighbor building",
    level: 0,
    thickness: 6,
    color: "#b9bcc4",
    living: 0,
    railing: false,
  },
];

export const areaType = (kind: AreaKind): AreaType =>
  AREA_TYPES.find((t) => t.kind === kind) ?? AREA_TYPES[0];

export const isAreaKind = (value: unknown): value is AreaKind =>
  AREA_TYPES.some((t) => t.kind === value);

export interface FenceType {
  kind: FenceKind;
  name: string;
  height: number;
  /** The thickness in the plan and in 3D. */
  thickness: number;
  color: string;
}

export const FENCE_TYPES: FenceType[] = [
  { kind: "fence", name: "Fence", height: 1.2, thickness: 0.05, color: "#8a6a4a" },
  { kind: "hedge", name: "Hedge", height: 1.6, thickness: 0.6, color: "#5d8a3c" },
  { kind: "wall", name: "Garden wall", height: 1, thickness: 0.2, color: "#a7a39b" },
];

export const fenceType = (kind: FenceKind): FenceType =>
  FENCE_TYPES.find((t) => t.kind === kind) ?? FENCE_TYPES[0];

export const isFenceKind = (value: unknown): value is FenceKind =>
  FENCE_TYPES.some((t) => t.kind === value);

/** The height of a railing above the top of its area, in meters. */
export const RAILING_HEIGHT = 1;

/** The sides of an outline with `sides` corners that a list names, each once and in order. */
export function cleanRailings(railings: unknown, sides: number): number[] {
  if (!Array.isArray(railings)) return [];
  const valid = railings.filter(
    (side): side is number => Number.isInteger(side) && side >= 0 && side < sides,
  );
  return [...new Set(valid)].sort((a, b) => a - b);
}

/** The two ends of each side of an area with a railing. */
export function railingSides(area: Area): [Point, Point][] {
  const n = area.points.length;
  return area.railings
    .filter((side) => side < n)
    .map((side) => [area.points[side], area.points[(side + 1) % n]]);
}

/** The defaults of a new tree: a crown of 5 m and a height of 8 m. */
export const TREE_DEFAULTS = { crown: 5, height: 8 };

/** A new area of the kind on the outline, with the defaults of the kind. */
export function newArea(kind: AreaKind, points: Point[]): Area {
  const type = areaType(kind);
  return {
    id: newId("a"),
    kind,
    name: "",
    points: points.map((p) => ({ x: p.x, y: p.y })),
    level: type.level,
    thickness: type.thickness,
    railings: type.railing ? points.map((_, i) => i) : [],
  };
}

export function newFence(kind: FenceKind, points: Point[]): Fence {
  return {
    id: newId("g"),
    kind,
    points: points.map((p) => ({ x: p.x, y: p.y })),
    height: fenceType(kind).height,
  };
}

export function newTree(at: Point): Tree {
  return { id: newId("t"), x: at.x, y: at.y, ...TREE_DEFAULTS, deciduous: true };
}

export const findArea = (plan: Plan, id: string): Area | undefined =>
  plan.areas.find((a) => a.id === id);
export const findFence = (plan: Plan, id: string): Fence | undefined =>
  plan.fences.find((f) => f.id === id);
export const findTree = (plan: Plan, id: string): Tree | undefined =>
  plan.trees.find((t) => t.id === id);

/** The area of the outline, in m². */
export const areaSize = (area: Area): number => Math.abs(signedArea(area.points));

/** The length of a fence, in m. */
export const fenceLength = (fence: Fence): number =>
  fence.points.slice(1).reduce((sum, p, i) => sum + distance(fence.points[i], p), 0);

/** The part of the areas of a story that counts as living area by the WoFlV, in m². */
export function outdoorLivingArea(plan: Plan): number {
  return plan.areas.reduce((sum, area) => sum + areaSize(area) * areaType(area.kind).living, 0);
}

/** The point in the middle of an outline, for its label. */
export const areaCenter = (points: Point[]): Point => centroid(points);

/**
 * The areas in the order of the drawing, from the lowest to the highest: the plot, the lawn, the
 * paths, then the slabs and the neighbor buildings.
 */
export function outdoorOrder(areas: Area[]): Area[] {
  const order: AreaKind[] = [
    "plot",
    "lawn",
    "driveway",
    "path",
    "pool",
    "terrace",
    "roof-terrace",
    "balcony",
  ];
  const rank = (a: Area) => (order.includes(a.kind) ? order.indexOf(a.kind) : order.length);
  return [...areas].sort((a, b) => rank(a) - rank(b));
}
