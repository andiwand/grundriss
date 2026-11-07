// The colors of the walls and the roofs in the 3D view. A wall has two sides. The color of a
// side comes, in this order, from:
//
// 1. the own color of that side of the wall (`Wall.colors`),
// 2. the wall color of the room on that side (`RoomInfo.wallColor`), or the default color of a
//    room,
// 3. the facade color of the building (`Building.facade`), if no room is on that side.
//
// A roof has the color of its top and the color of its underside (`Roof.color`, `Roof.underside`).

import { distance, perpendicular } from "./geometry";
import { wallEnds } from "./plan";
import { findRooms, pointInPolygon, type Room } from "./rooms";
import type { Building, Story, Wall } from "./types";

export const DEFAULT_COLORS = {
  /** The outside of the outer walls. */
  facade: "#f2efe9",
  /** The walls inside a room without its own wall color. */
  room: "#f7f5f0",
  roof: "#b5523b",
  underside: "#d9c4a0",
} as const;

/** True if the value is a color "#rrggbb". */
export const isColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

/** The side of a wall: 1 is the side of `perpendicular(b - a)` ("right"), -1 the other. */
export type WallSide = 1 | -1;

/**
 * The room on the side of the wall, or null if the side is outside. The function tests a point
 * just beyond the face of the wall, at the middle of the wall.
 */
export function roomOnSide(
  story: Story,
  wall: Wall,
  side: WallSide,
  rooms: Room[] = findRooms(story),
): Room | null {
  const [a, b] = wallEnds(story, wall);
  const length = distance(a, b);
  if (length < 1e-9) return null;
  const n = perpendicular({ x: (b.x - a.x) / length, y: (b.y - a.y) / length });
  const d = side * (wall.thickness / 2 + 0.05);
  const p = { x: (a.x + b.x) / 2 + n.x * d, y: (a.y + b.y) / 2 + n.y * d };
  // The smallest room that contains the point: a room inside another room is nearer.
  return (
    rooms
      .filter((room) => pointInPolygon(p, room.polygon))
      .sort((r, q) => Math.abs(r.area) - Math.abs(q.area))[0] ?? null
  );
}

/** The color of a side of the wall in the 3D view. */
export function wallSideColor(
  building: Building,
  story: Story,
  wall: Wall,
  side: WallSide,
  rooms?: Room[],
): string {
  const own = side === 1 ? wall.colors.right : wall.colors.left;
  if (own) return own;
  const room = roomOnSide(story, wall, side, rooms);
  if (room) return room.info?.wallColor ?? DEFAULT_COLORS.room;
  return building.facade;
}
