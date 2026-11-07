// Rooms are not stored. They come from the closed cycles of the wall graph.

import { centroid, closestOnSegment, signedArea } from "./geometry";
import type { Id, Plan, Point, RoomInfo } from "./types";

export interface Room {
  /** An id from the vertices of the room. It stays the same while the walls move. */
  key: string;
  vertexIds: Id[];
  /** The polygon on the center lines of the walls. */
  polygon: Point[];
  /** The area inside the center lines, in square meters. */
  area: number;
  /** A point well inside the room, for the label. */
  labelAt: Point;
  /** The data that the user gave to the room, or null. */
  info: RoomInfo | null;
}

interface Face {
  cycle: Id[];
  polygon: Point[];
  area: number;
}

/**
 * Finds the faces of the planar wall graph. The algorithm walks each directed edge once. At each
 * vertex it takes the next edge in clockwise order from the edge it came on. Each inner face then
 * has a positive signed area, and the outer face has a negative signed area. The walls must meet
 * only at vertices. The editor makes sure of that, because it splits a wall where a new wall
 * starts or ends on it.
 */
function faces(plan: Plan): Face[] {
  const position = new Map(plan.vertices.map((v) => [v.id, v]));
  const neighbors = new Map<Id, Id[]>();
  for (const wall of plan.walls) {
    if (!position.has(wall.a) || !position.has(wall.b)) continue;
    neighbors.set(wall.a, [...(neighbors.get(wall.a) ?? []), wall.b]);
    neighbors.set(wall.b, [...(neighbors.get(wall.b) ?? []), wall.a]);
  }
  for (const [id, list] of neighbors) {
    const center = position.get(id)!;
    const angle = (n: Id) => {
      const p = position.get(n)!;
      return Math.atan2(p.y - center.y, p.x - center.x);
    };
    list.sort((p, q) => angle(p) - angle(q));
  }

  const visited = new Set<string>();
  const result: Face[] = [];
  const limit = 2 * plan.walls.length + 1;
  for (const wall of plan.walls) {
    if (!neighbors.has(wall.a) || !neighbors.has(wall.b)) continue;
    for (const [u, v] of [
      [wall.a, wall.b],
      [wall.b, wall.a],
    ]) {
      const cycle: Id[] = [];
      let from = u;
      let to = v;
      while (!visited.has(`${from}>${to}`) && cycle.length < limit) {
        visited.add(`${from}>${to}`);
        cycle.push(from);
        const list = neighbors.get(to)!;
        const next = list[(list.indexOf(from) - 1 + list.length) % list.length];
        from = to;
        to = next;
      }
      if (cycle.length < 3) continue;
      const polygon = cycle.map((id) => {
        const p = position.get(id)!;
        return { x: p.x, y: p.y };
      });
      result.push({ cycle, polygon, area: signedArea(polygon) });
    }
  }
  return result;
}

/** The rooms of the plan: the inner faces of the wall graph, with the data of the user. */
export function findRooms(plan: Plan): Room[] {
  const rooms: Room[] = faces(plan)
    .filter((face) => face.area > 1e-6)
    .map(({ cycle, polygon, area }) => ({
      key: [...cycle].sort().join("|"),
      vertexIds: cycle,
      polygon,
      area,
      labelAt: interiorPoint(polygon),
      info: null,
    }));
  // Each data goes to one room only. First the data finds its room by the key. Data with an old
  // key then goes to the room that contains its point. The smallest room comes first, so that a
  // room inside another room keeps its own data.
  const infos = plan.rooms ?? [];
  const taken = new Set<Id>();
  for (const room of rooms) {
    room.info = infos.find((r) => r.key === room.key && !taken.has(r.id)) ?? null;
    if (room.info) taken.add(room.info.id);
  }
  for (const room of [...rooms].sort((p, q) => p.area - q.area)) {
    if (room.info) continue;
    room.info = infos.find((r) => !taken.has(r.id) && pointInPolygon(r.at, room.polygon)) ?? null;
    if (room.info) taken.add(room.info.id);
  }
  return rooms;
}

export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * A point inside the polygon, far from its edges. The centroid is good for a convex room, but
 * it can be outside an L-shaped room. Then the function takes the best point of a grid.
 */
export function interiorPoint(polygon: Point[]): Point {
  const clearance = (p: Point) =>
    pointInPolygon(p, polygon)
      ? Math.min(
          ...polygon.map(
            (a, i) => closestOnSegment(p, a, polygon[(i + 1) % polygon.length]).distance,
          ),
        )
      : -1;
  const center = centroid(polygon);
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  const size = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  // A centroid with a good distance to the walls is the best place, because it looks centered.
  if (clearance(center) > size / 4) return center;
  let best = center;
  let bestClearance = clearance(center);
  const steps = 16;
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const dx = (Math.max(...xs) - x0) / steps;
  const dy = (Math.max(...ys) - y0) / steps;
  for (let i = 1; i < steps; i++) {
    for (let j = 1; j < steps; j++) {
      const p = { x: x0 + i * dx, y: y0 + j * dy };
      const c = clearance(p);
      if (c > bestClearance) {
        best = p;
        bestClearance = c;
      }
    }
  }
  return best;
}

/** The room with the key, or undefined. */
export function findRoom(plan: Plan, key: string): Room | undefined {
  return findRooms(plan).find((room) => room.key === key);
}

/**
 * Changes the data of a room. If the room has no data yet, the function adds it, with its point
 * at the label of the room.
 */
export function editRoomInfo(plan: Plan, room: Room, change: (info: RoomInfo) => void): void {
  let info = room.info ? plan.rooms.find((r) => r.id === room.info!.id) : undefined;
  if (!info) {
    info = {
      id: `r-${Math.random().toString(36).slice(2, 10)}`,
      key: room.key,
      at: room.labelAt,
      name: "",
      height: null,
      floorHeating: false,
      temperature: null,
    };
    plan.rooms.push(info);
  }
  change(info);
}

/**
 * Gives each room data the key and the label point of its room again, so that the data follows
 * the room when its walls move or split. Data without a room stays, so that it comes back if the room comes back.
 */
export function anchorRoomInfo(plan: Plan): void {
  for (const room of findRooms(plan)) {
    if (!room.info) continue;
    room.info.key = room.key;
    room.info.at = room.labelAt;
  }
}

/** The lines of the label of a room: the name if it has one, the area, and a custom height. */
export function roomLabel(room: Room): string[] {
  const lines: string[] = [];
  if (room.info?.name) lines.push(room.info.name);
  const area = `${room.area.toFixed(2)} m²`;
  lines.push(room.info?.height != null ? `${area} · h ${room.info.height.toFixed(2)} m` : area);
  return lines;
}

/**
 * The outer outline of the walls of a plan, on the center lines of the walls: the boundary of the
 * largest connected group of rooms. It gives null if the walls close no room. The roof of a story
 * uses it as its outline.
 */
export function planOutline(plan: Plan): Point[] | null {
  // The walk visits each outer face once, with a negative signed area. The largest outer face
  // is the outline of the building.
  let best: Face | null = null;
  for (const face of faces(plan)) {
    if (face.area < (best?.area ?? -1e-6)) best = face;
  }
  if (!best) return null;
  // A wall that sticks out (a dead end) appears twice in the walk: out to its free end and back.
  // It is not part of a roof, so the function removes each such spike.
  const ids = [...best.cycle];
  const polygon = [...best.polygon];
  for (let i = 0; ids.length >= 3 && i < ids.length;) {
    const n = ids.length;
    if (ids[(i + n - 1) % n] !== ids[(i + 1) % n]) {
      i++;
      continue;
    }
    // Remove the free end at `i` and the second copy of the vertex before it, at `i + 1`.
    for (const k of [Math.max(i, (i + 1) % n), Math.min(i, (i + 1) % n)]) {
      ids.splice(k, 1);
      polygon.splice(k, 1);
    }
    i = Math.max(0, i - 2);
  }
  return ids.length >= 3 ? polygon.reverse() : null;
}
