// The quantities of the building for a tender or a request for offers: the rooms with their
// areas, the doors and the windows by size, the areas of the envelope, and the materials of its
// layers. The building services have their own quantities in quantities.ts.
//
// The areas of the envelope come from the heat loss (energy.ts) of the heated rooms: the outer
// walls without their openings, the roof, the floor on the ground, and the slabs to unheated
// stories. A material of a layer gets the area of its part times its thickness as its volume.

import { livingArea } from "./attic";
import { defaultWallHeight } from "./building";
import { buildingHeatLoss, type WallPart } from "./energy";
import { material } from "./insulation";
import { buildingQuantities } from "./quantities";
import { findRooms, netRoomArea } from "./rooms";
import type { Building, Layer, OpeningKind } from "./types";

export interface RoomTakeoff {
  story: string;
  name: string;
  /** The net area inside the walls, the living area by the WoFlV, and the area on the center lines, in m². */
  netArea: number;
  livingArea: number;
  area: number;
  /** The clear height in m, and the perimeter on the center lines in m. */
  height: number;
  perimeter: number;
  heated: boolean;
}

export interface OpeningTakeoff {
  kind: OpeningKind;
  /** The width, the height, and the sill height in m. */
  width: number;
  height: number;
  sill: number;
  count: number;
  /** The stories of the openings of this size. */
  stories: string[];
}

export interface MaterialTakeoff {
  /** The part of the envelope: "Outer walls", "Roof", and so on. */
  part: string;
  material: string;
  /** The thickness in m, the area in m², and the volume in m³. */
  thickness: number;
  area: number;
  volume: number;
}

export interface Takeoff {
  rooms: RoomTakeoff[];
  openings: OpeningTakeoff[];
  /** The areas of the envelope of the heated rooms, in m². */
  envelope: {
    walls: number;
    windows: number;
    roof: number;
    floor: number;
    slabs: number;
    grossFloor: number;
    netFloor: number;
    volume: number;
  };
  materials: MaterialTakeoff[];
  services: ReturnType<typeof buildingQuantities>;
}

/** The materials of the layers on an area. */
function layerMaterials(part: string, layers: Layer[], area: number): MaterialTakeoff[] {
  if (area <= 0.005) return [];
  return layers.map((layer) => ({
    part,
    material: material(layer.material).name,
    thickness: layer.thickness,
    area,
    volume: area * layer.thickness,
  }));
}

/**
 * The areas of the envelope of the heated rooms: the outer walls for each set of layers, the
 * windows, the roof, the floor on the ground, the slabs that lose heat, the gross and the net
 * floor area in m², and the heated volume in m³.
 */
export function envelopeAreas(building: Building) {
  const loss = buildingHeatLoss(building);
  const walls: WallPart[] = [];
  let windows = 0;
  let roof = 0;
  let floor = 0;
  let slabs = 0;
  let volume = 0;
  for (const room of loss.rooms) {
    for (const part of room.wallParts) {
      const same = walls.find((w) => w.layers === part.layers);
      if (same) same.area += part.area;
      else walls.push({ ...part });
    }
    windows += room.glazing.reduce((sum, g) => sum + g.area, 0);
    roof += room.roofArea;
    floor += room.groundArea;
    slabs += room.slabArea;
    volume += room.volume;
  }
  return {
    walls,
    windows,
    roof,
    floor,
    slabs,
    grossFloor: loss.grossArea,
    netFloor: loss.netArea,
    volume,
  };
}

/** The quantities of the building. */
export function buildingTakeoff(building: Building): Takeoff {
  const rooms: RoomTakeoff[] = [];
  for (const story of building.stories) {
    for (const room of findRooms(story)) {
      const perimeter = room.polygon.reduce((sum, p, i) => {
        const q = room.polygon[(i + 1) % room.polygon.length];
        return sum + Math.hypot(q.x - p.x, q.y - p.y);
      }, 0);
      rooms.push({
        story: story.name,
        name: room.info?.name ?? "",
        netArea: netRoomArea(story, room),
        livingArea: livingArea(building, story, room).living,
        area: room.area,
        height: room.info?.height ?? defaultWallHeight(story),
        perimeter,
        heated: story.heated,
      });
    }
  }

  // The openings by kind and size, rounded to 1 cm.
  const groups = new Map<string, OpeningTakeoff>();
  for (const story of building.stories) {
    for (const opening of story.openings) {
      const round = (v: number) => Math.round(v * 100) / 100;
      const key = `${opening.kind}:${round(opening.width)}:${round(opening.height)}:${round(opening.sill)}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          kind: opening.kind,
          width: round(opening.width),
          height: round(opening.height),
          sill: round(opening.sill),
          count: 0,
          stories: [],
        };
        groups.set(key, group);
      }
      group.count++;
      if (!group.stories.includes(story.name)) group.stories.push(story.name);
    }
  }
  const openings = [...groups.values()].sort(
    (a, b) => a.kind.localeCompare(b.kind) || b.width * b.height - a.width * a.height,
  );

  const areas = envelopeAreas(building);
  const envelope = building.envelope;
  const materials = [
    ...areas.walls.flatMap((part) =>
      layerMaterials(
        part.own ? "Outer walls with own layers" : "Outer walls",
        part.layers,
        part.area,
      ),
    ),
    ...layerMaterials("Roof", envelope.roof, areas.roof),
    ...layerMaterials("Floor on the ground", envelope.floor, areas.floor),
    ...layerMaterials("Slab to an unheated story", envelope.ceiling, areas.slabs),
  ];
  return {
    rooms,
    openings,
    envelope: {
      walls: areas.walls.reduce((sum, part) => sum + part.area, 0),
      windows: areas.windows,
      roof: areas.roof,
      floor: areas.floor,
      slabs: areas.slabs,
      grossFloor: areas.grossFloor,
      netFloor: areas.netFloor,
      volume: areas.volume,
    },
    materials,
    services: buildingQuantities(building),
  };
}
