// The building: its stories, the stairs between them, the chimneys through them, and the roof.
// The functions here are pure, so the 2D editor, the 3D view, and the exports share them.

import { add, distance, perpendicular, scale, sub } from "./geometry";
import { DEFAULT_COLORS } from "./colors";
import { defaultEnvelope, defaultHousehold } from "./insulation";
import { emptyPlan, newId } from "./plan";
import { roofGeometries } from "./roof";
import type { Building, Chimney, Id, Point, Stair, Story } from "./types";

/** The thickness of the floor slab between two stories. */
export const SLAB = 0.25;
export const STORY_DEFAULTS = { height: 2.75, cellarHeight: 2.5, atticHeight: 1.25 };
/** The best height of one step of a stair. The real height divides the rise in equal steps. */
export const STEP_HEIGHT = 0.18;
/** A chimney without a given top ends this much above the roof. */
export const CHIMNEY_ABOVE_ROOF = 0.8;

export function newStory(name: string, elevation: number, height: number, heated = true): Story {
  return { id: newId("st"), name, elevation, height, heated, ...emptyPlan() };
}

export function emptyBuilding(): Building {
  return {
    stories: [newStory("Ground floor", 0, STORY_DEFAULTS.height)],
    roofs: [],
    north: 0,
    facade: DEFAULT_COLORS.facade,
    models: [],
    envelope: defaultEnvelope(),
    household: defaultHousehold(),
    variants: [],
    pv: [],
    location: null,
    climate: null,
  };
}

export const findStory = (building: Building, id: Id): Story | undefined =>
  building.stories.find((s) => s.id === id);

/** Keeps the stories in order from the bottom to the top. */
export function sortStories(building: Building): void {
  building.stories.sort((a, b) => a.elevation - b.elevation);
}

export function storyAbove(building: Building, story: Story): Story | undefined {
  return building.stories.find((s) => s.elevation > story.elevation + 1e-6);
}

export function storyBelow(building: Building, story: Story): Story | undefined {
  return [...building.stories].reverse().find((s) => s.elevation < story.elevation - 1e-6);
}

/** Adds a story on top of the highest story. An attic has low knee walls. */
export function addStoryOnTop(building: Building, attic = false): Story {
  const top = building.stories[building.stories.length - 1];
  const elevation = top ? top.elevation + top.height : 0;
  const count = building.stories.filter((s) => s.elevation >= 0).length;
  const name = attic ? "Attic" : count === 0 ? "Ground floor" : ordinal(count);
  const height = attic ? STORY_DEFAULTS.atticHeight : STORY_DEFAULTS.height;
  const story = newStory(name, elevation, height);
  building.stories.push(story);
  sortStories(building);
  return story;
}

/** Adds a cellar under the lowest story. A new cellar is unheated. */
export function addCellar(building: Building): Story {
  const bottom = building.stories[0];
  const height = STORY_DEFAULTS.cellarHeight;
  const elevation = (bottom ? bottom.elevation : 0) - height;
  const cellars = building.stories.filter((s) => s.elevation < 0).length;
  const name = cellars === 0 ? "Cellar" : `Cellar ${cellars + 1}`;
  const story = newStory(name, elevation, height, false);
  building.stories.unshift(story);
  sortStories(building);
  return story;
}

function ordinal(n: number): string {
  const words = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth"];
  return `${words[n - 1] ?? `${n}th`} floor`;
}

/** The height of a new wall on the story: up to the slab of the story above. */
export function defaultWallHeight(story: Story): number {
  return Math.max(0.3, Math.round((story.height - SLAB) * 100) / 100);
}

/** The height of the top of the walls of the story above the ground. */
export function wallTop(story: Story): number {
  const highest = story.walls.reduce((max, wall) => Math.max(max, wall.height), 0);
  return story.elevation + (highest > 0 ? highest : story.height);
}

// ----- Stairs -----

/** The height that a stair on the story climbs: up to the floor of the next story. */
export function stairRise(building: Building, story: Story): number {
  const above = storyAbove(building, story);
  return above ? above.elevation - story.elevation : story.height;
}

export interface StairShape {
  /** The number of steps, with the landing. The last step ends on the floor of the next story. */
  count: number;
  /** The height of one step. */
  stepHeight: number;
  /** The depth of one step of the first flight along the walking line. */
  stepDepth: number;
  /** The outline of each step on the plan, from the bottom step to the top step. */
  steps: Point[][];
  /** The index of the landing in `steps`, or -1 for a straight stair. */
  landing: number;
  /** The outline of the whole stair. */
  outline: Point[];
  /** The walking line from the bottom to the top. It has a point at each turn. */
  arrow: Point[];
}

/** The gap between the two flights of a U stair. */
export const STAIR_EYE = 0.1;

/**
 * The steps of a stair. The function works in a frame of the stair: `u` goes along the first
 * flight from `a`, and `v` goes across to the side of the turn. The landing counts as one step,
 * so the 3D view and the exports need no special case for it.
 */
export function stairShape(stair: Stair, rise: number): StairShape {
  const run1 = distance(stair.a, stair.b);
  const dir = run1 === 0 ? { x: 1, y: 0 } : scale(sub(stair.b, stair.a), 1 / run1);
  const across = scale(perpendicular(dir), stair.turn);
  const at = (u: number, v: number) => add(add(stair.a, scale(dir, u)), scale(across, v));
  const rect = (u0: number, u1: number, v0: number, v1: number) => [
    at(u0, v0),
    at(u1, v0),
    at(u1, v1),
    at(u0, v1),
  ];
  const w = stair.width;
  const h = w / 2;
  const count = Math.max(2, Math.round(rise / STEP_HEIGHT));
  const stepHeight = rise / count;

  if (stair.kind === "straight") {
    const depth = run1 / count;
    return {
      count,
      stepHeight,
      stepDepth: depth,
      steps: Array.from({ length: count }, (_, i) => rect(i * depth, (i + 1) * depth, -h, h)),
      landing: -1,
      outline: rect(0, run1, -h, h),
      arrow: [at(depth / 2, 0), at(Math.max(depth / 2, run1 - depth / 2), 0)],
    };
  }

  // The steps without the landing go to the two flights in the ratio of their lengths.
  const run2 = Math.max(0, stair.run2);
  const flights = count - 1;
  const n1 = Math.max(1, Math.min(flights - 1, Math.round((flights * run1) / (run1 + run2 || 1))));
  const n2 = flights - n1;
  const d1 = run1 / n1;
  const d2 = run2 / Math.max(1, n2);
  const steps: Point[][] = [];
  for (let i = 0; i < n1; i++) steps.push(rect(i * d1, (i + 1) * d1, -h, h));

  if (stair.kind === "l") {
    // The landing is a square after the first flight. The second flight goes to the side.
    steps.push(rect(run1, run1 + w, -h, h));
    for (let i = 0; i < n2; i++) steps.push(rect(run1, run1 + w, h + i * d2, h + (i + 1) * d2));
    return {
      count,
      stepHeight,
      stepDepth: d1,
      steps,
      landing: n1,
      outline: [
        at(0, -h),
        at(run1 + w, -h),
        at(run1 + w, h + run2),
        at(run1, h + run2),
        at(run1, h),
        at(0, h),
      ],
      arrow: [at(d1 / 2, 0), at(run1 + h, 0), at(run1 + h, h + run2 - d2 / 2)],
    };
  }

  // A U stair: the landing goes across both flights, and the second flight comes back.
  const v2 = w + STAIR_EYE;
  steps.push(rect(run1, run1 + w, -h, v2 + h));
  for (let i = 0; i < n2; i++) steps.push(rect(run1 - (i + 1) * d2, run1 - i * d2, v2 - h, v2 + h));
  const end = run1 - run2;
  return {
    count,
    stepHeight,
    stepDepth: d1,
    steps,
    landing: n1,
    outline: [
      at(0, -h),
      at(run1 + w, -h),
      at(run1 + w, v2 + h),
      at(end, v2 + h),
      at(end, v2 - h),
      at(run1, v2 - h),
      at(run1, h),
      at(0, h),
    ],
    arrow: [at(d1 / 2, 0), at(run1 + h, 0), at(run1 + h, v2), at(end + d2 / 2, v2)],
  };
}

// ----- Chimneys -----

/** The height of the top of the building: the roof, or else the top of the highest story. */
export function buildingTop(building: Building): number {
  const roofs = roofGeometries(building);
  if (roofs.length > 0) return Math.max(...roofs.map((r) => r.geometry.top));
  const top = building.stories[building.stories.length - 1];
  return top ? wallTop(top) : 0;
}

/** The bottom and the top of a chimney above the ground. */
export function chimneyExtent(
  building: Building,
  story: Story,
  chimney: Chimney,
): { bottom: number; top: number } {
  const bottom = story.elevation;
  const top = chimney.top ?? buildingTop(building) + CHIMNEY_ABOVE_ROOF;
  return { bottom, top: Math.max(top, bottom + 0.5) };
}

export function chimneyOutline(chimney: Chimney): Point[] {
  const w = chimney.width / 2;
  const d = chimney.depth / 2;
  return [
    { x: chimney.x - w, y: chimney.y - d },
    { x: chimney.x + w, y: chimney.y - d },
    { x: chimney.x + w, y: chimney.y + d },
    { x: chimney.x - w, y: chimney.y + d },
  ];
}

/**
 * The chimneys of the stories below that go up through the story. The 2D editor shows them, so
 * that the user sees where a chimney passes.
 */
export function chimneysThrough(
  building: Building,
  story: Story,
): { chimney: Chimney; story: Story }[] {
  const result: { chimney: Chimney; story: Story }[] = [];
  for (const lower of building.stories) {
    if (lower.elevation >= story.elevation - 1e-6) continue;
    for (const chimney of lower.chimneys) {
      if (chimneyExtent(building, lower, chimney).top > story.elevation + 0.01) {
        result.push({ chimney, story: lower });
      }
    }
  }
  return result;
}
