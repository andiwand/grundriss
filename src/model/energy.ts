// The heat loss of the rooms: a simple steady-state estimate in the spirit of EN 12831. It is not
// a calculation by the standard. The thermal bridges are one extra U-value on all areas. It
// ignores the heat flow between rooms of different temperatures, and the details of the ground. Use it to compare variants and to size
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
//
// An unheated story (`Story.heated`) loses no heat. A heated room above or below an unheated room
// loses heat through the slab between them (`Envelope.ceiling`). The unheated room is warmer than
// the outside, so a temperature factor reduces this loss. The part of an outer wall of a heated
// cellar that is in the ground loses less, by GROUND_FACTOR.

import {
  ceilingArea,
  ceilingVolume,
  dormerAreas,
  roofGlass,
  roomCeiling,
  stripArea,
} from "./attic";
import { findStory, storyAbove, storyBelow } from "./building";
import { intersectionArea } from "./geometry";
import { material } from "./insulation";
import { roofGeometries } from "./roof";
import { findRooms, netRoomArea, pointInPolygon, type Room } from "./rooms";
import type { Building, Envelope, Id, Layer, Point, Story, Wall } from "./types";

export { netRoomArea };

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
/**
 * The temperature factors of a slab to an unheated story (OIB RL 6): a cold cellar below, and a
 * cold attic above.
 */
export const CELLAR_FACTOR = 0.7;
export const ATTIC_FACTOR = 0.9;
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

/**
 * A window: its area in m², the azimuth of its outside (0 is north), and its tilt in degrees
 * (90 for a window in a wall, less for a roof window).
 */
export interface Glazing {
  area: number;
  azimuth: number;
  tilt: number;
}

/** The air change per hour of the leaks of a building with the airtightness n50 (EN 12831). */
export const LEAK_FACTOR = 0.07;

/**
 * The air change per hour that loses heat. Without a ventilation system, the windows give the
 * air, and the leaks count only if they give more. With a system, the system takes back a part
 * of the heat of its air, and the leaks add to it.
 */
export function effectiveAirChange(envelope: Envelope): number {
  const { airChange, heatRecovery, n50 } = envelope.ventilation;
  const leaks = n50 * LEAK_FACTOR;
  return heatRecovery > 0 ? airChange * (1 - heatRecovery) + leaks : Math.max(airChange, leaks);
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
  /** The area inside the faces of the walls, and the gross floor area with the outer walls, in m². */
  netArea: number;
  grossArea: number;
  /** The inside temperature in °C. */
  temperature: number;
  /** The parts of the heat loss in W. */
  walls: number;
  windows: number;
  doors: number;
  roof: number;
  floor: number;
  /** The loss through the slab to an unheated story above. */
  ceiling: number;
  /** The loss of the thermal bridges. */
  bridges: number;
  ventilation: number;
  /** The heat transfer coefficient of the ventilation alone, in W/K. */
  ventilationTransfer: number;
  /** The net area of the outer walls for each set of layers. */
  wallParts: WallPart[];
  /**
   * The area of the floor on the ground, and the area of the slabs that lose heat: to unheated
   * rooms below or above, and to the outside air under the room, in m².
   */
  groundArea: number;
  slabArea: number;
  /** The sum of the parts in W. */
  total: number;
  /** The heat transfer coefficient in W/K: the loss for 1 K between inside and outside. */
  transfer: number;
  /** The windows in the outer walls, for the solar gains. */
  glazing: Glazing[];
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
  // A roof over an unheated story is not over a heated room under that story.
  if (roomAt(storyAbove(building, story), room.labelAt)?.heated === false) return false;
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

/**
 * The azimuth of a direction on the plan, in degrees from north, clockwise (0 to 360). The plan
 * y points down, and north is `north` degrees clockwise from the top of the plan.
 */
export function azimuthOf(direction: { x: number; y: number }, north: number): number {
  const plan = (Math.atan2(direction.x, -direction.y) * 180) / Math.PI;
  return (((plan - north) % 360) + 360) % 360;
}

/** The net area of the outer walls with one set of layers: the envelope's, or a wall's own. */
export interface WallPart {
  layers: Layer[];
  own: boolean;
  area: number;
}

/** The area of the polygon that the rooms of the story cover, in m². */
function covered(story: Story | undefined, polygon: Point[]): number {
  if (!story) return 0;
  return findRooms(story).reduce((sum, r) => sum + intersectionArea(polygon, r.polygon), 0);
}

/** The story if one of its rooms contains the point, or null. */
function roomAt(story: Story | undefined, p: { x: number; y: number }): Story | null {
  if (!story) return null;
  return findRooms(story).some((r) => pointInPolygon(p, r.polygon)) ? story : null;
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

  // The part of the height of a cellar wall that is in the ground loses less.
  const buried =
    story.elevation < 0 ? Math.min(1, -story.elevation / Math.max(story.height, 1e-6)) : 0;
  const inGround = 1 - buried * (1 - GROUND_FACTOR);

  // Each outer wall on the edge of the room loses heat through its area without its openings.
  // A wall borders one room at most, so all its openings belong to this room. Under a roof, the
  // wall goes up to the roof on its center line.
  let walls = 0;
  let windows = 0;
  let doors = 0;
  let wallArea = 0;
  /** The area of the outer walls with their openings, for the thermal bridges. */
  let envelopeArea = 0;
  /** The area of half of the outer walls on the plan, for the gross floor area. */
  let outerStrip = 0;
  /** The net area of the outer walls for each set of layers: the envelope, or a wall's own. */
  const wallParts: WallPart[] = [];
  const addWallPart = (layers: Layer[], own: boolean, wallPart: number) => {
    const part = wallParts.find((w) => w.layers === layers);
    if (part) part.area += wallPart;
    else wallParts.push({ layers, own, area: wallPart });
  };
  const glazing: Glazing[] = [];
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
    // The direction of the outside of the wall: away from the room.
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    let normal = { x: (b.y - a.y) / length, y: -(b.x - a.x) / length };
    const middle = { x: (a.x + b.x) / 2 + normal.x * 0.01, y: (a.y + b.y) / 2 + normal.y * 0.01 };
    if (pointInPolygon(middle, room.polygon)) normal = { x: -normal.x, y: -normal.y };
    const facing = azimuthOf(normal, building.north);
    let openingArea = 0;
    for (const opening of story.openings) {
      if (opening.wallId !== wall.id) continue;
      const half = opening.width / 2;
      const one = strip(opening.offset - half, opening.offset + half, opening.sill, opening.height);
      openingArea += one;
      if (opening.kind === "window") {
        windows += one * envelope.windowU;
        glazing.push({ area: one, azimuth: facing, tilt: 90 });
      } else doors += one * envelope.doorU;
    }
    const gross = strip(0, length);
    const net = Math.max(0, gross - openingArea);
    wallArea += net;
    envelopeArea += gross * inGround;
    outerStrip += (length * wall.thickness) / 2;
    const layers = wallLayers(building, wall);
    walls += net * uValue(layers, "wall") * inGround;
    addWallPart(layers, wall.layers != null, net);
  }

  // The roof loss goes to the highest room under the roof. The walls and the windows of the
  // dormers over the room belong to it too. A roof window is a window, not a part of the roof.
  let roofArea = 0;
  if (underRoof(building, story, room)) {
    roofArea = ceilingArea(ceiling);
    const dormers = dormerAreas(building, story, room);
    wallArea += dormers.walls;
    envelopeArea += dormers.walls + dormers.windows;
    walls += dormers.walls * uValue(envelope.wall, "wall");
    addWallPart(envelope.wall, false, dormers.walls);
    for (const glass of roofGlass(building, story, room)) {
      const tilt = (Math.acos(Math.min(1, Math.max(-1, glass.normal.z))) * 180) / Math.PI;
      const azimuth = azimuthOf(glass.normal, building.north);
      windows += glass.area * envelope.windowU;
      glazing.push({ area: glass.area, azimuth, tilt });
      // The area of a roof window was a part of the roof. A dormer window was not. The thermal
      // bridges count the roof window, because it is a part of the envelope.
      if (tilt < 80) {
        roofArea = Math.max(0, roofArea - glass.area);
        envelopeArea += glass.area;
      }
    }
    envelopeArea += roofArea;
  }
  const roof = roofArea * uValue(envelope.roof, "roof");
  // The floor is on the ground if no story is below. Else each part of the floor counts by what
  // is under it: a heated room (no loss), an unheated room (the slab with CELLAR_FACTOR), or
  // nothing, for example under a part that sticks out (the slab to the outside air).
  const below = storyBelow(building, story);
  const under = covered(below, room.polygon);
  const open = below ? Math.max(0, area - under) : 0;
  const cold = below && !below.heated ? under : 0;
  const floorU = uValue(envelope.ceiling, "floor");
  const floor = !below
    ? area * uValue(envelope.floor, "floor") * GROUND_FACTOR
    : cold * floorU * CELLAR_FACTOR + open * floorU;
  // The slab to the unheated rooms above. The heat flows up, as through a roof.
  const above = roofArea === 0 ? storyAbove(building, story) : undefined;
  const coldAbove = above && !above.heated ? covered(above, room.polygon) : 0;
  const slab = coldAbove * uValue(envelope.ceiling, "roof") * ATTIC_FACTOR;
  envelopeArea += below ? cold * CELLAR_FACTOR + open : area * GROUND_FACTOR;
  envelopeArea += coldAbove * ATTIC_FACTOR;
  const bridges = envelopeArea * envelope.thermalBridge;
  const ventilation = AIR_HEAT * effectiveAirChange(envelope) * volume;

  const heating = story.fixtures
    .filter((f) => f.system === "heating" && f.power != null && pointInPolygon(f, room.polygon))
    .reduce((sum, f) => sum + (f.power ?? 0), 0);
  const floorHeating = room.info?.floorHeating
    ? { power: FLOOR_HEATING_POWER * area, pipe: area / FLOOR_HEATING_SPACING }
    : null;

  // The parts above are in W/K. The loss in W is the part times the difference of temperature.
  const transfer = walls + windows + doors + roof + floor + slab + bridges + ventilation;
  return {
    area,
    height,
    volume,
    wallArea,
    roofArea,
    netArea: netRoomArea(story, room),
    grossArea: area + outerStrip,
    temperature,
    walls: walls * delta,
    windows: windows * delta,
    doors: doors * delta,
    roof: roof * delta,
    floor: floor * delta,
    ceiling: slab * delta,
    bridges: bridges * delta,
    ventilation: ventilation * delta,
    ventilationTransfer: ventilation,
    wallParts,
    groundArea: below ? 0 : area,
    slabArea: below ? cold + open + coldAbove : coldAbove,
    total: transfer * delta,
    transfer,
    glazing,
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
  /**
   * The gross floor area of the heated stories with the outer walls (BGF), and the net floor
   * area inside the walls, in m². The energy per m² uses the gross floor area, like the OIB.
   */
  grossArea: number;
  netArea: number;
}

/** The heat loss of all rooms of the heated stories. */
export function buildingHeatLoss(building: Building): BuildingLoss {
  const rooms: BuildingLoss["rooms"] = [];
  for (const story of building.stories) {
    if (!story.heated) continue;
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
  const grossArea = rooms.reduce((sum, r) => sum + r.grossArea, 0);
  const netArea = rooms.reduce((sum, r) => sum + r.netArea, 0);
  return { rooms, total, area, perArea: area > 0 ? total / area : 0, grossArea, netArea };
}
