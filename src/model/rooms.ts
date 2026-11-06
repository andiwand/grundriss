// Rooms are not stored. They come from the closed cycles of the wall graph.

import { signedArea } from "./geometry";
import type { Id, Plan, Point } from "./types";

export interface Room {
  vertexIds: Id[];
  /** The polygon on the center lines of the walls. */
  polygon: Point[];
  /** The area inside the center lines, in square meters. */
  area: number;
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
      if (area > 1e-6) rooms.push({ vertexIds: cycle, polygon, area });
    }
  }
  return rooms;
}
