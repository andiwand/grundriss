// The lengths of a wall, or of a line of walls: walls in one straight line that join end to end,
// for example a wall that is split where other walls meet it.
//
// - The length on the center line, from the first vertex of the line to the last one.
// - The length on each side: along the face, from the wall at one end to the wall at the other
//   end. This is the length that a user measures in a room. The face goes on through a straight
//   join to the next wall in the same line, if that wall has the same thickness and no other
//   wall meets the vertex on this side.
// - The length of each part of the line.
//
// A pinned vertex (`Vertex.pinned`) stays in its place when a length changes: the other end
// moves. If both ends are pinned, the length cannot change.

import { perpendicular } from "./geometry";
import { getVertex, splitWall, wallEnds } from "./plan";
import { findRooms, pointInPolygon } from "./rooms";
import type { Dimension, Id, Plan, Point, Wall } from "./types";
import { MAX_MITER, meet, STRAIGHT } from "./walljoin";

/** A side of a wall: +1 is the side of `perpendicular(b - a)`, −1 the other side. */
export type Side = 1 | -1;

/** Walls in one straight line that join end to end. */
export interface WallLine {
  /** The walls from the first vertex to the last one. */
  walls: Wall[];
  /** The vertices from the first to the last: one more than the walls. */
  vertices: Id[];
}

export interface SideRun {
  /** The length of the face, in meters. */
  length: number;
  /** The ends of the face: the end before the first vertex of the line, and after the last. */
  from: Point;
  to: Point;
  /** The vertices where the walls of the face stop, before the line and after it. */
  start: Id;
  end: Id;
}

/** The vertices that move for a change of a length, and the direction: +1 along the line. */
interface Move {
  ids: Id[];
  sign: 1 | -1;
}

const unit = (p: Point, q: Point): Point => {
  const length = Math.hypot(q.x - p.x, q.y - p.y);
  return length > 1e-12 ? { x: (q.x - p.x) / length, y: (q.y - p.y) / length } : { x: 0, y: 0 };
};
const dot = (p: Point, q: Point) => p.x * q.x + p.y * q.y;
const cross = (p: Point, q: Point) => p.x * q.y - p.y * q.x;
const span = (p: Point, q: Point) => Math.hypot(q.x - p.x, q.y - p.y);

/**
 * The walls as one line, or null if they are not in one straight line, or do not join end to
 * end. The line goes in the direction of the first wall of the list, from its `a` to its `b`.
 */
export function wallLine(plan: Plan, wallIds: Id[]): WallLine | null {
  const found = wallIds.map((id) => plan.walls.find((w) => w.id === id));
  if (found.length === 0 || found.some((w) => !w)) return null;
  const list = found as Wall[];
  const count = new Map<Id, number>();
  for (const w of list) for (const v of [w.a, w.b]) count.set(v, (count.get(v) ?? 0) + 1);
  const ends = [...count].filter(([, n]) => n === 1).map(([v]) => v);
  if (ends.length !== 2 || [...count.values()].some((n) => n > 2)) return null;
  let at = ends[0];
  let vertices = [at];
  let walls: Wall[] = [];
  const left = new Set(list);
  while (left.size > 0) {
    const next = [...left].find((w) => w.a === at || w.b === at);
    if (!next) return null;
    left.delete(next);
    walls.push(next);
    at = next.a === at ? next.b : next.a;
    vertices.push(at);
  }
  // The first wall of the list goes from `a` to `b` along the line.
  const index = walls.indexOf(list[0]);
  if (vertices[index] !== list[0].a) {
    vertices = vertices.reverse();
    walls = walls.reverse();
  }
  // Each vertex is on the straight line from the first to the last, and further along it.
  const first = getVertex(plan, vertices[0]);
  const last = getVertex(plan, vertices[vertices.length - 1]);
  if (span(first, last) < 1e-9) return null;
  const d = unit(first, last);
  let position = -1e-9;
  for (const id of vertices) {
    const v = getVertex(plan, id);
    const offset = { x: v.x - first.x, y: v.y - first.y };
    if (Math.abs(cross(d, offset)) > 1e-4) return null;
    const along = dot(d, offset);
    if (along <= position) return null;
    position = along;
  }
  return { walls, vertices };
}

/** The ends, the direction, and the length of the line on the center line. */
function lineEnds(plan: Plan, line: WallLine) {
  const first = getVertex(plan, line.vertices[0]);
  const last = getVertex(plan, line.vertices[line.vertices.length - 1]);
  return { first, last, d: unit(first, last), length: span(first, last) };
}

/** The face of the line on the side, from the wall at one end to the wall at the other end. */
export function lineSide(plan: Plan, line: WallLine, side: Side): SideRun | null {
  const { first, last, d, length } = lineEnds(plan, line);
  if (length < 1e-9) return null;
  const n = perpendicular(d);
  const face = { x: n.x * side, y: n.y * side };
  const own = line.walls.map((w) => w.id);

  /**
   * Follows the walls from the vertex in the direction `out`, away from the line. It gives the
   * vertex where the walls stop, the length of the walls after the line, the half thickness
   * there, and the position t of the end of the face: + back into the line, − beyond the vertex.
   */
  const follow = (vertexId: Id, out: Point, startHalf: number) => {
    const seen = new Set(own);
    let extra = 0;
    const half = startHalf;
    for (;;) {
      const vertex = getVertex(plan, vertexId);
      const u = { x: -out.x, y: -out.y };
      const others = plan.walls
        .filter((w) => !seen.has(w.id) && (w.a === vertexId || w.b === vertexId))
        .map((w) => {
          const to = getVertex(plan, w.a === vertexId ? w.b : w.a);
          return { wall: w, to, u: unit(vertex, to), half: w.thickness / 2 };
        });
      if (others.length === 0) return { vertexId, extra, half, t: 0 };
      // The next wall around the vertex from the line toward the face (as in `wallFaces`).
      const turn = Math.sign(cross(u, face));
      const angle = (o: Point) => {
        const value = Math.atan2(turn * cross(u, o), dot(u, o));
        return value > 0 ? value : value + 2 * Math.PI;
      };
      const next = others.reduce((p, q) => (angle(q.u) < angle(p.u) ? q : p));
      if (dot(next.u, u) < -STRAIGHT) {
        // No wall on this side: the face goes on into the next wall of the line.
        if (Math.abs(next.half - half) > 1e-9) return { vertexId, extra, half, t: 0 };
        seen.add(next.wall.id);
        extra += span(vertex, next.to);
        vertexId = next.to.id;
        continue;
      }
      const n2 = turn > 0 ? { x: next.u.y, y: -next.u.x } : { x: -next.u.y, y: next.u.x };
      const t = meet(face, half, u, n2, next.half, next.u);
      const limit = MAX_MITER * Math.max(half, next.half) * 2;
      return { vertexId, extra, half, t: t === null ? 0 : Math.max(-limit, Math.min(limit, t)) };
    }
  };

  const back = follow(first.id, { x: -d.x, y: -d.y }, line.walls[0].thickness / 2);
  const ahead = follow(last.id, d, line.walls[line.walls.length - 1].thickness / 2);
  const along = (p: Point, t: number, half: number): Point => ({
    x: p.x + d.x * t + face.x * half,
    y: p.y + d.y * t + face.y * half,
  });
  return {
    length: length + back.extra + ahead.extra - back.t - ahead.t,
    from: along(first, -back.extra + back.t, back.half),
    to: along(last, ahead.extra - ahead.t, ahead.half),
    start: back.vertexId,
    end: ahead.vertexId,
  };
}

/** The face of one wall on the side, from the wall at one end to the wall at the other end. */
export function sideRun(plan: Plan, wall: Wall, side: Side): SideRun | null {
  const line = wallLine(plan, [wall.id]);
  return line ? lineSide(plan, line, side) : null;
}

/** True if the vertex is pinned. */
export function isPinned(plan: Plan, id: Id): boolean {
  return plan.vertices.find((v) => v.id === id)?.pinned === true;
}

/** The vertices that move for a change of the length on the center line, or null. */
function centerMove(plan: Plan, line: WallLine): Move | null {
  const first = line.vertices[0];
  const last = line.vertices[line.vertices.length - 1];
  if (!isPinned(plan, last)) return { ids: [last], sign: 1 };
  if (!isPinned(plan, first)) return { ids: [first], sign: -1 };
  return null;
}

/** The vertices that move for a change of the length of a side, or null. */
function sideMove(plan: Plan, line: WallLine, side: Side): Move | null {
  const run = lineSide(plan, line, side);
  if (!run) return null;
  if (!isPinned(plan, run.end)) return { ids: [run.end], sign: 1 };
  if (!isPinned(plan, run.start)) return { ids: [run.start], sign: -1 };
  return null;
}

/**
 * The vertices that move for a change of the length of the part `index`: the vertices after
 * it, so that the other parts keep their lengths. If one of them is pinned, the vertices before
 * it move.
 */
function partMove(plan: Plan, line: WallLine, index: number): Move | null {
  const after = line.vertices.slice(index + 1);
  const before = line.vertices.slice(0, index + 1);
  if (!after.some((id) => isPinned(plan, id))) return { ids: after, sign: 1 };
  if (!before.some((id) => isPinned(plan, id))) return { ids: before, sign: -1 };
  return null;
}

/** Which lengths of the line can change: not where pinned vertices hold both ends. */
export function lineCanChange(plan: Plan, line: WallLine) {
  return {
    center: centerMove(plan, line) !== null,
    side: (side: Side) => sideMove(plan, line, side) !== null,
    part: (index: number) => partMove(plan, line, index) !== null,
  };
}

/**
 * Changes a length to `length`: `measure` gives the length now, and `move` the vertices to
 * move. A join at an angle changes its miter when a vertex moves, so a few steps make the length
 * exact. It gives false if the length cannot change.
 */
function settle(
  plan: Plan,
  line: WallLine,
  length: number,
  measure: () => number | null,
  move: () => Move | null,
): boolean {
  if (!(length > 0)) return false;
  const { d } = lineEnds(plan, line);
  for (let step = 0; step < 8; step++) {
    const now = measure();
    if (now === null) return false;
    const change = length - now;
    if (Math.abs(change) < 1e-7) return true;
    const vertices = move();
    if (!vertices) return false;
    for (const id of vertices.ids) {
      const v = getVertex(plan, id);
      v.x += d.x * change * vertices.sign;
      v.y += d.y * change * vertices.sign;
    }
  }
  return true;
}

/** Changes the length of the walls on the center line. It gives false if it cannot. */
export function setLineLength(plan: Plan, wallIds: Id[], length: number): boolean {
  const line = wallLine(plan, wallIds);
  if (!line) return false;
  return settle(
    plan,
    line,
    length,
    () => lineEnds(plan, line).length,
    () => centerMove(plan, line),
  );
}

/** Changes the length of the walls on the side, from wall to wall. It gives false if it cannot. */
export function setSideLength(plan: Plan, wallIds: Id[], side: Side, length: number): boolean {
  const line = wallLine(plan, wallIds);
  if (!line) return false;
  return settle(
    plan,
    line,
    length,
    () => lineSide(plan, line, side)?.length ?? null,
    () => sideMove(plan, line, side),
  );
}

/** Changes the length of one part of the line. The other parts keep their lengths. */
export function setPartLength(plan: Plan, wallIds: Id[], index: number, length: number): boolean {
  const line = wallLine(plan, wallIds);
  if (!line || !line.walls[index]) return false;
  const part = () =>
    span(getVertex(plan, line.vertices[index]), getVertex(plan, line.vertices[index + 1]));
  return settle(plan, line, length, part, () => partMove(plan, line, index));
}

/**
 * Why the walls of the line cannot become one wall, or null if they can: another wall meets
 * the line between its ends ("branch"), the walls differ in thickness, height, layers, or
 * colors ("different"), or more than one wall has a note ("notes").
 */
export type MergeProblem = "branch" | "different" | "notes";

export function mergeProblem(plan: Plan, line: WallLine): MergeProblem | null {
  if (line.walls.length < 2) return "branch";
  const inner = new Set(line.vertices.slice(1, -1));
  const own = new Set(line.walls.map((w) => w.id));
  if (plan.walls.some((w) => !own.has(w.id) && (inner.has(w.a) || inner.has(w.b)))) {
    return "branch";
  }
  const oriented = line.walls.map((w, i) => {
    const forward = w.a === line.vertices[i];
    return JSON.stringify({
      thickness: w.thickness,
      height: w.height,
      layers: w.layers,
      colors: forward ? [w.colors.right, w.colors.left] : [w.colors.left, w.colors.right],
    });
  });
  if (oriented.some((o) => o !== oriented[0])) return "different";
  if (line.walls.filter((w) => w.note).length > 1) return "notes";
  return null;
}

/**
 * Makes one wall of the walls of the line, if `mergeProblem` gives null. The doors and the
 * windows stay in their places. It gives the id of the wall, or null.
 */
export function mergeWalls(plan: Plan, wallIds: Id[]): Id | null {
  const line = wallLine(plan, wallIds);
  if (!line || mergeProblem(plan, line) !== null) return null;
  const first = getVertex(plan, line.vertices[0]);
  const keep = line.walls[0];
  line.walls.forEach((wall, i) => {
    const start = getVertex(plan, line.vertices[i]);
    const [a, b] = wallEnds(plan, wall);
    const forward = wall.a === start.id;
    const before = span(first, start);
    const length = span(a, b);
    for (const opening of plan.openings.filter((o) => o.wallId === wall.id)) {
      opening.wallId = keep.id;
      opening.offset = before + (forward ? opening.offset : length - opening.offset);
      if (!forward) {
        opening.hinge = opening.hinge === "a" ? "b" : "a";
        opening.swing = opening.swing === 1 ? -1 : 1;
      }
    }
  });
  const note = line.walls.find((w) => w.note)?.note;
  if (note) keep.note = note;
  // The line goes along the first wall, so that wall keeps its direction and its colors.
  keep.b = line.vertices[line.vertices.length - 1];
  const gone = new Set(line.walls.slice(1).map((w) => w.id));
  const inner = new Set(line.vertices.slice(1, -1));
  plan.walls = plan.walls.filter((w) => !gone.has(w.id));
  plan.vertices = plan.vertices.filter((v) => !inner.has(v.id));
  return keep.id;
}

/**
 * Splits the wall into two walls: in the middle, or else next to the door or the window that is
 * in the middle, so that no opening goes over the new vertex. It gives the ids of the two walls.
 */
export function splitInTwo(plan: Plan, wallId: Id): [Id, Id] | null {
  const wall = plan.walls.find((w) => w.id === wallId);
  if (!wall) return null;
  const [a, b] = wallEnds(plan, wall);
  const length = span(a, b);
  if (length < 0.02) return null;
  const covers = (at: number) =>
    plan.openings.find((o) => o.wallId === wallId && Math.abs(o.offset - at) < o.width / 2 + 0.005);
  let at = length / 2;
  // Each step goes to the nearer edge of the opening, a little beyond it.
  for (let step = 0; step < 10; step++) {
    const opening = covers(at);
    if (!opening) break;
    const before = opening.offset - opening.width / 2 - 0.01;
    const after = opening.offset + opening.width / 2 + 0.01;
    at =
      Math.abs(before - length / 2) <= Math.abs(after - length / 2) && before > 0.01
        ? before
        : after;
  }
  if (at <= 0.01 || at >= length - 0.01 || covers(at)) return null;
  const point = { x: a.x + ((b.x - a.x) * at) / length, y: a.y + ((b.y - a.y) * at) / length };
  const vertex = splitWall(plan, wallId, point);
  const first = plan.walls.find((w) => w.b === vertex.id && w.a === wall.a)!;
  const second = plan.walls.find((w) => w.a === vertex.id && w.b === wall.b)!;
  return [first.id, second.id];
}

/** The distance of a dimension line from the face of the wall: inside a room, and outside. */
export const INSIDE_OFFSET = 0.3;
export const OUTSIDE_OFFSET = 0.8;

/**
 * The dimension lines of the walls for a drawing: on each face, from wall to wall. A face in a
 * room gets its line in the room, and a face outside gets its line outside. A face that more
 * walls share (a facade of walls in one line) gets one line, and so does a length that a room
 * has twice in the same direction. The lines are not in the plan.
 */
export function wallDimensions(plan: Plan): Dimension[] {
  const rooms = findRooms(plan);
  const seen = new Set<string>();
  const dimensions: Dimension[] = [];
  const key = (p: Point) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
  for (const wall of plan.walls) {
    for (const side of [1, -1] as const) {
      const run = sideRun(plan, wall, side);
      if (!run || run.length < 0.2) continue;
      const id = [key(run.from), key(run.to)].sort().join("|");
      if (seen.has(id)) continue;
      seen.add(id);
      const d = unit(run.from, run.to);
      const n = perpendicular(d);
      // A point just beyond the middle of the face: in a room, or outside.
      const probe = {
        x: (run.from.x + run.to.x) / 2 + n.x * side * 0.05,
        y: (run.from.y + run.to.y) / 2 + n.y * side * 0.05,
      };
      const room = rooms.find((r) => pointInPolygon(probe, r.polygon));
      const inside = room !== undefined;
      if (room) {
        // A room needs one line for each length in each direction: in a rectangular room the
        // opposite wall has the same length.
        const angle = ((Math.atan2(d.y, d.x) * 180) / Math.PI + 180) % 180;
        const same = `${room.key}|${Math.round(angle) % 180}|${run.length.toFixed(3)}`;
        if (seen.has(same)) continue;
        seen.add(same);
      }
      dimensions.push({
        id: `wall-${dimensions.length}`,
        a: run.from,
        b: run.to,
        offset: side * (inside ? INSIDE_OFFSET : OUTSIDE_OFFSET),
      });
    }
  }
  return dimensions;
}

/**
 * Turns the walls so that each one is parallel or at a right angle to the first wall: by the
 * smallest angle. Each wall keeps its length. It turns around its pinned corner, or else around
 * the corner that it shares with a wall that is already aligned, or else around its middle. A
 * wall with two pinned corners does not turn. It gives the ids of the walls that did not turn,
 * and the number of walls that turned.
 */
export function alignWalls(plan: Plan, wallIds: Id[]): { stuck: Id[]; turned: number } {
  const walls = wallIds.map((id) => plan.walls.find((w) => w.id === id)).filter((w) => !!w);
  if (walls.length < 2) return { stuck: [], turned: 0 };
  const [first, ...rest] = walls as Wall[];
  let turned = 0;
  const [a, b] = wallEnds(plan, first);
  const reference = Math.atan2(b.y - a.y, b.x - a.x);
  const aligned = new Set([first.a, first.b]);
  const stuck: Id[] = [];
  const turn = (p: Point, center: Point, angle: number) => {
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    const [x, y] = [p.x - center.x, p.y - center.y];
    p.x = center.x + x * cos - y * sin;
    p.y = center.y + x * sin + y * cos;
  };
  for (const wall of rest) {
    const [p, q] = wallEnds(plan, wall);
    const quarter = Math.PI / 2;
    const raw = reference - Math.atan2(q.y - p.y, q.x - p.x);
    const angle = raw - Math.round(raw / quarter) * quarter;
    // A turn smaller than this changes nothing that the user sees.
    if (Math.abs(angle) > 1e-9) {
      const [pinA, pinB] = [p.pinned === true, q.pinned === true];
      if (pinA && pinB) {
        stuck.push(wall.id);
        continue;
      }
      turned++;
      if (pinA || (!pinB && aligned.has(wall.a))) turn(q, p, angle);
      else if (pinB || aligned.has(wall.b)) turn(p, q, angle);
      else {
        const middle = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        turn(p, middle, angle);
        turn(q, middle, angle);
      }
    }
    aligned.add(wall.a);
    aligned.add(wall.b);
  }
  return { stuck, turned };
}
