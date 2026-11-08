// The changes of the floor plan of a variant against the plan, for the cost of the renovation:
// the walls to remove, the new walls, the new openings in walls that stay, and the new doors.
//
// The comparison is by geometry, not by id, because a split of a wall gives new ids. A wall
// stays where a wall of the other floor plan lies on the same line. A door or a window stays
// where the other floor plan has one of the same kind and size at the same place.

import { isOuterWall } from "./energy";
import { distance, dot, scale, sub } from "./geometry";
import { wallEnds } from "./plan";
import type { Building, Opening, Point, Story, Wall } from "./types";

export interface LayoutChanges {
  /** The area of the walls to remove, and of the new walls, in m². */
  removed: number;
  added: number;
  /** The new openings in walls that stay, which need a cut and a lintel. */
  cuts: number;
  /** The new doors, and the area of the new windows in m². */
  doors: number;
  windows: number;
  /** The area of the openings to close, in m². */
  closed: number;
  /**
   * True if a removed wall can carry a load: an outer wall, a wall under a wall of the story
   * above, or a thick wall.
   */
  bearing: boolean;
}

/** Two lines are the same within these tolerances: the distance in m and the angle as a sine. */
const ON_LINE = 0.03;
const PARALLEL = 0.02;
/** Shorter parts than this, in m, do not count. */
const MIN_PART = 0.05;
/** A wall at least this thick, in m, can carry a load. */
const BEARING_THICKNESS = 0.24;

interface Segment {
  a: Point;
  b: Point;
  length: number;
  dir: Point;
}

function segmentOf(story: Story, wall: Wall): Segment | null {
  const [a, b] = wallEnds(story, wall);
  const length = distance(a, b);
  return length < 1e-6 ? null : { a, b, length, dir: scale(sub(b, a), 1 / length) };
}

/** The length of the segment that the walls of the story cover on the same line. */
function covered(segment: Segment, story: Story | undefined): number {
  if (!story) return 0;
  const parts: [number, number][] = [];
  for (const wall of story.walls) {
    const other = segmentOf(story, wall);
    if (!other) continue;
    const cross = segment.dir.x * other.dir.y - segment.dir.y * other.dir.x;
    if (Math.abs(cross) > PARALLEL) continue;
    const off = (p: Point) => {
      const d = sub(p, segment.a);
      return Math.abs(d.x * segment.dir.y - d.y * segment.dir.x);
    };
    if (off(other.a) > ON_LINE || off(other.b) > ON_LINE) continue;
    const t0 = dot(sub(other.a, segment.a), segment.dir);
    const t1 = dot(sub(other.b, segment.a), segment.dir);
    const lo = Math.max(0, Math.min(t0, t1));
    const hi = Math.min(segment.length, Math.max(t0, t1));
    if (hi > lo) parts.push([lo, hi]);
  }
  parts.sort((p, q) => p[0] - q[0]);
  let sum = 0;
  let end = 0;
  for (const [lo, hi] of parts) {
    if (hi <= end) continue;
    sum += hi - Math.max(lo, end);
    end = hi;
  }
  return sum;
}

/** The center of an opening on the plan. */
function centerOf(story: Story, opening: Opening): Point | null {
  const wall = story.walls.find((w) => w.id === opening.wallId);
  const segment = wall && segmentOf(story, wall);
  return segment
    ? {
        x: segment.a.x + segment.dir.x * opening.offset,
        y: segment.a.y + segment.dir.y * opening.offset,
      }
    : null;
}

/** True if the other story has an opening of the same kind and size at the same place. */
export function hasOpening(story: Story, opening: Opening, other: Story | undefined): boolean {
  const at = centerOf(story, opening);
  if (!other || !at) return false;
  return other.openings.some((o) => {
    const p = centerOf(other, o);
    return (
      o.kind === opening.kind &&
      !!p &&
      distance(p, at) < 0.05 &&
      Math.abs(o.width - opening.width) < 0.05 &&
      Math.abs(o.height - opening.height) < 0.05
    );
  });
}

/** The changes of the floor plan from the building `plan` to the building `variant`. */
export function layoutChanges(plan: Building, variant: Building): LayoutChanges {
  const result: LayoutChanges = {
    removed: 0,
    added: 0,
    cuts: 0,
    doors: 0,
    windows: 0,
    closed: 0,
    bearing: false,
  };
  const above = (building: Building, story: Story) =>
    building.stories.find((s) => s.elevation > story.elevation + 1e-6);
  for (const story of plan.stories) {
    const other = variant.stories.find((s) => s.id === story.id);
    for (const wall of story.walls) {
      const segment = segmentOf(story, wall);
      if (!segment) continue;
      const gone = segment.length - covered(segment, other);
      if (gone < MIN_PART) continue;
      result.removed += gone * wall.height;
      if (
        isOuterWall(story, wall) ||
        wall.thickness >= BEARING_THICKNESS ||
        covered(segment, above(plan, story)) > MIN_PART
      ) {
        result.bearing = true;
      }
    }
    // An opening of the plan in a wall that stays, but not in the variant, gets closed.
    for (const opening of story.openings) {
      const wall = story.walls.find((w) => w.id === opening.wallId);
      const segment = wall && segmentOf(story, wall);
      if (!segment || hasOpening(story, opening, other)) continue;
      if (covered(segment, other) > segment.length / 2)
        result.closed += opening.width * opening.height;
    }
  }
  for (const story of variant.stories) {
    const other = plan.stories.find((s) => s.id === story.id);
    const kept = new Map<string, boolean>();
    for (const wall of story.walls) {
      const segment = segmentOf(story, wall);
      if (!segment) continue;
      const old = covered(segment, other);
      kept.set(wall.id, old > segment.length / 2);
      const added = segment.length - old;
      if (added >= MIN_PART) result.added += added * wall.height;
    }
    for (const opening of story.openings) {
      if (hasOpening(story, opening, other)) continue;
      if (opening.kind === "door") result.doors++;
      else result.windows += opening.width * opening.height;
      if (kept.get(opening.wallId)) result.cuts++;
    }
  }
  return result;
}

/** True if the floor plan has no change. */
export const noLayoutChange = (c: LayoutChanges) =>
  c.removed < 0.01 &&
  c.added < 0.01 &&
  c.cuts === 0 &&
  c.doors === 0 &&
  c.windows < 0.01 &&
  c.closed < 0.01;
