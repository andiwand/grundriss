// The heat loss of the rooms: a simple steady-state estimate in the spirit of EN 12831. It is not
// a calculation by the standard. It ignores thermal bridges, the heat flow between rooms of
// different temperatures, and the details of the ground. Use it to compare variants and to size
// radiators roughly, not for a permit.
//
// The loss of a room is the sum of its parts, each in watts:
//
//   transmission = A × U × (θ_room − θ_outside)   for outer walls, windows, doors, roof, floor
//   ventilation  = 0.34 × n × V × (θ_room − θ_outside)   with an air change rate n of 0.5 per hour
//
// 0.34 Wh/(m³·K) is the heat capacity of air.
//
// Under a roof, the areas and the volume come from the ceiling of the room (`roomCeiling` in
// attic.ts): the roof area is the sloped area of the roof over the room, a wall goes up to the
// roof (knee walls and gable triangles), and the volume is the volume under the roof.

import { ceilingArea, ceilingVolume, dormerAreas, roomCeiling, stripArea } from "./attic";
import { findStory } from "./building";
import { material } from "./insulation";
import { roofGeometries } from "./roof";
import { findRooms, pointInPolygon, type Room } from "./rooms";
import type { Building, Id, Layer, Story, Wall } from "./types";

/** The surface resistances in m²K/W: inside and outside. */
export const SURFACE_RESISTANCE = {
  wall: { inside: 0.13, outside: 0.04 },
  roof: { inside: 0.1, outside: 0.04 },
  floor: { inside: 0.17, outside: 0 },
} as const;

/** The air change rate per hour for the ventilation loss. */
export const AIR_CHANGE = 0.5;
/** The heat capacity of air in Wh/(m³·K). */
export const AIR_HEAT = 0.34;
/** A floor on the ground loses less than a floor to the outside air. This factor reduces it. */
export const GROUND_FACTOR = 0.6;
/** An estimate of the heat output of floor heating, in W/m². */
export const FLOOR_HEATING_POWER = 70;
/** The usual distance between the pipes of floor heating, in meters. */
export const FLOOR_HEATING_SPACING = 0.15;

/** The U-value of the layers in W/(m²K): 1 / (Rsi + Σ d/λ + Rse). */
export function uValue(layers: Layer[], kind: "wall" | "roof" | "floor"): number {
  const surface = SURFACE_RESISTANCE[kind];
  const resistance = layers.reduce(
    (sum, layer) => sum + layer.thickness / material(layer.material).lambda,
    surface.inside + surface.outside,
  );
  return 1 / resistance;
}

const edgeKey = (a: Id, b: Id) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** The number of rooms of the story that each wall borders, by the id of the wall. */
function roomsPerWall(story: Story, rooms: Room[] = findRooms(story)): Map<Id, number> {
  const byEdge = new Map<string, Id>();
  for (const wall of story.walls) byEdge.set(edgeKey(wall.a, wall.b), wall.id);
  const count = new Map<Id, number>(story.walls.map((w) => [w.id, 0]));
  for (const room of rooms) {
    const ids = room.vertexIds;
    for (let i = 0; i < ids.length; i++) {
      const wallId = byEdge.get(edgeKey(ids[i], ids[(i + 1) % ids.length]));
      if (wallId) count.set(wallId, (count.get(wallId) ?? 0) + 1);
    }
  }
  return count;
}

/**
 * True if the wall is an outer wall: it borders one room of its story, or no room. A wall
 * between two rooms is an inner wall and loses no heat in this estimate.
 */
export function isOuterWall(story: Story, wall: Wall): boolean {
  return (roomsPerWall(story).get(wall.id) ?? 0) <= 1;
}

/** The layers of a wall for the insulation: its own layers, or those of the envelope. */
export function wallLayers(building: Building, wall: Wall): Layer[] {
  return wall.layers ?? building.envelope.wall;
}

export interface RoomLoss {
  /**
   * The floor area in m², the clear height in m, and the volume in m³. The height is the height
   * of the room without the roof. The volume is the volume under the ceiling, also under a roof.
   */
  area: number;
  height: number;
  volume: number;
  /** The area of the outer walls without their openings, and the area of the roof, in m². */
  wallArea: number;
  roofArea: number;
  /** The inside temperature in °C. */
  temperature: number;
  /** The parts of the heat loss in W. */
  walls: number;
  windows: number;
  doors: number;
  roof: number;
  floor: number;
  ventilation: number;
  /** The sum of the parts in W. */
  total: number;
  /** The heat output of the heating devices in the room, in W. */
  heating: number;
  /** The estimate of the floor heating, or null if the room has none. */
  floorHeating: { power: number; pipe: number } | null;
}

/**
 * True if a roof is over the room. A roof covers its own story. A pitched roof also covers the
 * stories above its story up to its top, for example an attic: its eaves are on the floor of the
 * story above. A story on a flat roof is not under that roof. The roof is over the room if it
 * covers the label point of the room and no room of a higher story is at that point. For a
 * pitched roof, only the higher stories that it covers count. A building without roofs has its
 * roof over the top story.
 */
function underRoof(building: Building, story: Story, room: Room): boolean {
  const roofs = roofGeometries(building);
  if (roofs.length === 0) return story.id === building.stories[building.stories.length - 1]?.id;
  const p = room.labelAt;
  return roofs.some(({ roof, geometry }) => {
    const own = findStory(building, roof.storyId)!;
    const covers = (s: Story) =>
      s.id === own.id || (!roof.flat && s.elevation > own.elevation && s.elevation < geometry.top);
    if (!covers(story) || !pointInPolygon(p, roof.outline)) return false;
    return !building.stories.some(
      (s) =>
        s.elevation > story.elevation + 1e-6 &&
        (roof.flat || covers(s)) &&
        findRooms(s).some((r) => pointInPolygon(p, r.polygon)),
    );
  });
}

/** The heat loss of one room of a story. */
export function roomHeatLoss(building: Building, story: Story, room: Room): RoomLoss {
  return lossOf(building, story, room, roomsPerWall(story));
}

function lossOf(building: Building, story: Story, room: Room, perWall: Map<Id, number>): RoomLoss {
  const envelope = building.envelope;
  const ceiling = roomCeiling(building, story, room);
  const height = ceiling.flat;
  const temperature = room.info?.temperature ?? envelope.inside;
  const delta = temperature - envelope.outside;
  const area = room.area;
  const volume = ceilingVolume(ceiling);

  // Each outer wall on the edge of the room loses heat through its area without its openings.
  // A wall borders one room at most, so all its openings belong to this room. Under a roof, the
  // wall goes up to the roof on its center line.
  let walls = 0;
  let windows = 0;
  let doors = 0;
  let wallArea = 0;
  const ids = room.vertexIds;
  const position = new Map(story.vertices.map((v) => [v.id, v]));
  for (let i = 0; i < ids.length; i++) {
    const wall = story.walls.find(
      (w) => edgeKey(w.a, w.b) === edgeKey(ids[i], ids[(i + 1) % ids.length]),
    );
    if (!wall || (perWall.get(wall.id) ?? 0) > 1) continue;
    const a = position.get(wall.a)!;
    const b = position.get(wall.b)!;
    const strip = (from: number, to: number, sill?: number, top?: number) =>
      stripArea(ceiling, a, b, from, to, sill, top);
    let openingArea = 0;
    for (const opening of story.openings) {
      if (opening.wallId !== wall.id) continue;
      const half = opening.width / 2;
      const one = strip(opening.offset - half, opening.offset + half, opening.sill, opening.height);
      openingArea += one;
      if (opening.kind === "window") windows += one * envelope.windowU * delta;
      else doors += one * envelope.doorU * delta;
    }
    const net = Math.max(0, strip(0, Math.hypot(b.x - a.x, b.y - a.y)) - openingArea);
    wallArea += net;
    walls += net * uValue(wallLayers(building, wall), "wall") * delta;
  }

  // The roof loss goes to the highest room under the roof. The walls and the windows of the
  // dormers over the room belong to it too.
  let roofArea = 0;
  if (underRoof(building, story, room)) {
    roofArea = ceilingArea(ceiling);
    const dormers = dormerAreas(building, story, room);
    wallArea += dormers.walls;
    walls += dormers.walls * uValue(envelope.wall, "wall") * delta;
    windows += dormers.windows * envelope.windowU * delta;
  }
  const roof = roofArea * uValue(envelope.roof, "roof") * delta;
  const lowest = building.stories[0];
  const floor =
    lowest && story.id === lowest.id
      ? area * uValue(envelope.floor, "floor") * GROUND_FACTOR * delta
      : 0;
  const ventilation = AIR_HEAT * AIR_CHANGE * volume * delta;

  const heating = story.fixtures
    .filter((f) => f.system === "heating" && f.power != null && pointInPolygon(f, room.polygon))
    .reduce((sum, f) => sum + (f.power ?? 0), 0);
  const floorHeating = room.info?.floorHeating
    ? { power: FLOOR_HEATING_POWER * area, pipe: area / FLOOR_HEATING_SPACING }
    : null;

  return {
    area,
    height,
    volume,
    wallArea,
    roofArea,
    temperature,
    walls,
    windows,
    doors,
    roof,
    floor,
    ventilation,
    total: walls + windows + doors + roof + floor + ventilation,
    heating,
    floorHeating,
  };
}

export interface BuildingLoss {
  rooms: (RoomLoss & { storyId: Id; key: string; name: string })[];
  /** The total heat loss in W. */
  total: number;
  /** The heated floor area in m², and the loss per area in W/m². */
  area: number;
  perArea: number;
}

/** The heat loss of all rooms of all stories. */
export function buildingHeatLoss(building: Building): BuildingLoss {
  const rooms: BuildingLoss["rooms"] = [];
  for (const story of building.stories) {
    const found = findRooms(story);
    const perWall = roomsPerWall(story, found);
    for (const room of found) {
      rooms.push({
        ...lossOf(building, story, room, perWall),
        storyId: story.id,
        key: room.key,
        name: room.info?.name ?? "",
      });
    }
  }
  const total = rooms.reduce((sum, r) => sum + r.total, 0);
  const area = rooms.reduce((sum, r) => sum + r.area, 0);
  return { rooms, total, area, perArea: area > 0 ? total / area : 0 };
}
