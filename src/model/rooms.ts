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

/**
 * Finds the faces of the planar wall graph. The algorithm walks each directed edge once. At each
 * vertex it takes the next edge in clockwise order from the edge it came on. Each inner face then
 * has a positive signed area, and the outer face has a negative signed area. The walls must meet
 * only at vertices. The editor makes sure of that, because it splits a wall where a new wall
 * starts or ends on it.
 */
export function findRooms(plan: Plan): Room[] {
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
  const rooms: Room[] = [];
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
      const area = signedArea(polygon);
      if (area > 1e-6) {
        const key = [...cycle].sort().join("|");
        const info =
          plan.rooms?.find((r) => r.key === key) ??
          plan.rooms?.find((r) => pointInPolygon(r.at, polygon)) ??
          null;
        rooms.push({ key, vertexIds: cycle, polygon, area, labelAt: interiorPoint(polygon), info });
      }
    }
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
