// The lengths of a wall, or of a line of walls: walls in one straight line that join end to end,
// for example a wall that is split where other walls meet it.
//
// - The length on each side: along the face, from the wall at one end to the wall at the other
//   end. This is the length that a user measures in a room. The face goes on through a straight
//   join to the next wall in the same line, if that wall has the same thickness and no other
//   wall meets the vertex on this side.
// - The length of each part of the line, from vertex to vertex.
//
// A pinned vertex (`Vertex.pinned`) stays in its place when a length changes: the other end
// moves. If both ends are pinned, the length cannot change.

import { cross, direction as unit, distance as span, dot, perpendicular } from "./geometry";
import { getVertex, splitWall, wallEnds } from "./plan";
import { isCurved, wallCurve, wallTangent } from "./wallcurve";
import { findRooms, pointInPolygon } from "./rooms";
import type { Dimension, Id, Plan, Point, Wall } from "./types";
import { MAX_MITER, meet, STRAIGHT } from "./walljoin";

/** A join of two walls at most 10° from a straight line is a small kink. */
const NEAR_STRAIGHT = Math.cos((10 * Math.PI) / 180);

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

/**
 * The walls as one line, or null if they are not in one straight line, or do not join end to
 * end. A curved wall is not part of a line. The line goes in the direction of the first wall of
 * the list, from its `a` to its `b`.
 */
export function wallLine(plan: Plan, wallIds: Id[]): WallLine | null {
  const found = wallIds.map((id) => plan.walls.find((w) => w.id === id));
  if (found.length === 0 || found.some((w) => !w || isCurved(w))) return null;
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
  const follow = (vertexId: Id, out: Point, half: number) => {
    const seen = new Set(own);
    let extra = 0;
    for (;;) {
      const vertex = getVertex(plan, vertexId);
      const u = { x: -out.x, y: -out.y };
      const others = plan.walls
        .filter((w) => !seen.has(w.id) && (w.a === vertexId || w.b === vertexId))
        .map((w) => {
          const to = getVertex(plan, w.a === vertexId ? w.b : w.a);
          // A curved wall leaves the vertex in the direction of its arc there.
          return { wall: w, to, u: wallTangent(plan, w, vertexId), half: w.thickness / 2 };
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
      // A wall that goes on almost straight, at a small kink: the faces meet far away if the
      // walls differ in thickness. The face then ends at the vertex.
      if (dot(next.u, u) < -NEAR_STRAIGHT) return { vertexId, extra, half, t: 0 };
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
function isPinned(plan: Plan, id: Id): boolean {
  return plan.vertices.find((v) => v.id === id)?.pinned === true;
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
  // The line goes along the first wall of the list, so that wall keeps its direction and its
  // colors. It can be anywhere on the line.
  const keep = line.walls.find((w) => w.id === wallIds[0])!;
  // The openings of each wall before the move, so that the kept wall does not move the openings
  // of the walls before it again.
  const own = line.walls.map((wall) => plan.openings.filter((o) => o.wallId === wall.id));
  line.walls.forEach((wall, i) => {
    const start = getVertex(plan, line.vertices[i]);
    const [a, b] = wallEnds(plan, wall);
    const forward = wall.a === start.id;
    const before = span(first, start);
    const length = span(a, b);
    for (const opening of own[i]) {
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
  keep.a = line.vertices[0];
  keep.b = line.vertices[line.vertices.length - 1];
  const gone = new Set(line.walls.filter((w) => w !== keep).map((w) => w.id));
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
  // The positions are along the center line: on the arc of a curved wall.
  const curve = wallCurve(plan, wall);
  const length = curve.length;
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
  const vertex = splitWall(plan, wallId, curve.at(at));
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
 * has twice in the same direction. The lines are not in the plan. `which` chooses the lines in
 * the rooms, the lines outside, or both. A curved wall gets no line.
 */
export function wallDimensions(
  plan: Plan,
  which: { inside: boolean; outside: boolean } = { inside: true, outside: true },
): Dimension[] {
  const rooms = findRooms(plan);
  const seen = new Set<string>();
  const dimensions: Dimension[] = [];
  const key = (p: Point) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
  for (const wall of plan.walls) {
    // A straight dimension line does not fit a curved wall.
    if (isCurved(wall)) continue;
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
      if (inside ? !which.inside : !which.outside) continue;
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
  return withoutOverlaps(dimensions);
}

/**
 * The dimension lines without the ones on top of a longer line: almost parallel, near it, and
 * along a good part of it. This happens at walls with a small kink. One length is enough there.
 */
function withoutOverlaps(dimensions: Dimension[]): Dimension[] {
  const lines = dimensions.map((dimension) => {
    const d = unit(dimension.a, dimension.b);
    const n = perpendicular(d);
    const shift = (p: Point) => ({
      x: p.x + n.x * dimension.offset,
      y: p.y + n.y * dimension.offset,
    });
    return { dimension, p: shift(dimension.a), q: shift(dimension.b), d };
  });
  lines.sort((x, y) => span(y.p, y.q) - span(x.p, x.q));
  const kept: typeof lines = [];
  for (const line of lines) {
    const length = span(line.p, line.q);
    const covered = kept.some((other) => {
      if (Math.abs(dot(line.d, other.d)) < NEAR_STRAIGHT) return false;
      const middle = { x: (line.p.x + line.q.x) / 2, y: (line.p.y + line.q.y) / 2 };
      const apart = Math.abs(cross(other.d, { x: middle.x - other.p.x, y: middle.y - other.p.y }));
      if (apart > 0.4) return false;
      // The part of this line along the other line.
      const along = (p: Point) => dot(other.d, { x: p.x - other.p.x, y: p.y - other.p.y });
      const [s, e] = [along(line.p), along(line.q)].sort((x, y) => x - y);
      const overlap = Math.min(e, span(other.p, other.q)) - Math.max(s, 0);
      return overlap > 0.2 * length;
    });
    if (!covered) kept.push(line);
  }
  return dimensions.filter((dimension) => kept.some((line) => line.dimension === dimension));
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

/**
 * The direction of the wall from `a` to `b` in degrees, as on a protractor: 0 to the right, 90
 * up on the screen. The plan y points down, so the angle uses −y. 0 ≤ angle < 360.
 */
export function wallAngle(plan: Plan, wall: Wall): number {
  const [a, b] = wallEnds(plan, wall);
  const degrees = (Math.atan2(-(b.y - a.y), b.x - a.x) * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}

/**
 * The vertices of the walls and the point that they turn around: the pinned vertex, or else the
 * middle of their box. Null if two or more of them are pinned, because then they cannot turn.
 */
function turnCenter(plan: Plan, wallIds: Id[]): { ids: Id[]; center: Point } | null {
  const walls = wallIds.map((id) => plan.walls.find((w) => w.id === id)).filter((w) => !!w);
  const ids = [...new Set((walls as Wall[]).flatMap((w) => [w.a, w.b]))];
  if (ids.length === 0) return null;
  const vertices = ids.map((id) => getVertex(plan, id));
  const pinned = vertices.filter((v) => v.pinned);
  if (pinned.length > 1) return null;
  if (pinned.length === 1) return { ids, center: { x: pinned[0].x, y: pinned[0].y } };
  const xs = vertices.map((v) => v.x);
  const ys = vertices.map((v) => v.y);
  return {
    ids,
    center: {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    },
  };
}

/** True if the walls can turn: at most one of their corners is pinned. */
export function canTurnWalls(plan: Plan, wallIds: Id[]): boolean {
  return turnCenter(plan, wallIds) !== null;
}

/**
 * Turns the walls together by `degrees` counterclockwise on the screen, around their pinned
 * corner or their middle. Their doors and windows go with them. It gives false if they cannot
 * turn, or if the turn is zero.
 */
function turnWalls(plan: Plan, wallIds: Id[], degrees: number): boolean {
  const turn = turnCenter(plan, wallIds);
  if (!turn || Math.abs(degrees) < 1e-9) return false;
  // On the screen the y axis points down, so a turn counterclockwise is a negative angle.
  const angle = (-degrees * Math.PI) / 180;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  for (const id of turn.ids) {
    const v = getVertex(plan, id);
    const [x, y] = [v.x - turn.center.x, v.y - turn.center.y];
    v.x = turn.center.x + x * cos - y * sin;
    v.y = turn.center.y + x * sin + y * cos;
  }
  return true;
}

/**
 * Turns the walls together, so that the first wall has the direction `degrees`. A wall has no
 * front, so 3° and 183° are the same direction: the walls take the smaller turn, at most 90°.
 */
export function setWallsAngle(plan: Plan, wallIds: Id[], degrees: number): boolean {
  const first = plan.walls.find((w) => w.id === wallIds[0]);
  if (!first) return false;
  const change = degrees - wallAngle(plan, first);
  // A turn of exactly 90° in either direction gives the same line: it turns counterclockwise.
  return turnWalls(plan, wallIds, change - Math.round(change / 180 - 1e-9) * 180);
}

/** True if the angle is 0, 90, 180, or 270 degrees, within a small tolerance. */
export function isStraight(degrees: number): boolean {
  return Math.abs(degrees - Math.round(degrees / 90) * 90) < 0.01;
}

/** Turns the walls together, so that the first wall goes to the nearest of 0, 90, 180, 270°. */
export function straightenWalls(plan: Plan, wallIds: Id[]): boolean {
  const first = plan.walls.find((w) => w.id === wallIds[0]);
  if (!first) return false;
  const angle = wallAngle(plan, first);
  return setWallsAngle(plan, wallIds, Math.round(angle / 90) * 90);
}
