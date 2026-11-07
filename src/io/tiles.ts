// The map under the 2D plan: tiles of a web map in the Web Mercator projection (EPSG:3857). The
// location of the building (`Location`) puts a point of the plan at a latitude and a longitude,
// and `Building.north` turns the map. The browser loads the tiles only when the user turns the
// map on, because each request sends the place to the server of the map.
//
// Near the building, the projection is a plane: one pixel of a tile has the same size in meters
// in all directions. The error is less than 1 cm over 100 m.

import type { Point } from "../model/types";

export type MapSourceId = "osm" | "basemap-ortho";

export interface MapSource {
  id: MapSourceId;
  name: string;
  /** The URL of the tile at the zoom z, the column x, and the row y. */
  url: (z: number, x: number, y: number) => string;
  /** The highest zoom with tiles. */
  maxZoom: number;
  /** The credit that the map must show, and the link of the credit. */
  credit: string;
  creditUrl: string;
}

export const MAP_SOURCES: Record<MapSourceId, MapSource> = {
  // The tile usage policy of OpenStreetMap allows this light use with the credit.
  osm: {
    id: "osm",
    name: "Map (OpenStreetMap)",
    url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    maxZoom: 19,
    credit: "© OpenStreetMap contributors",
    creditUrl: "https://www.openstreetmap.org/copyright",
  },
  // The aerial photos of basemap.at (CC BY 4.0) cover only Austria.
  "basemap-ortho": {
    id: "basemap-ortho",
    name: "Aerial photo (Austria, basemap.at)",
    url: (z, x, y) =>
      `https://mapsneu.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/${z}/${y}/${x}.jpeg`,
    maxZoom: 19,
    credit: "Datenquelle: basemap.at",
    creditUrl: "https://basemap.at/",
  },
};

/** The size of a tile in pixels. */
export const TILE_SIZE = 256;
/** The length of the equator in meters, divided by the tile size: meters per pixel at zoom 0. */
const METERS_PER_PIXEL_0 = 40075016.686 / TILE_SIZE;
/** The most tiles that the map loads at a time. */
export const MAX_TILES = 64;

/** The position of the place in pixels of the whole world at the zoom z. */
export function worldPixel(latitude: number, longitude: number, z: number): Point {
  const size = TILE_SIZE * 2 ** z;
  const phi = (Math.max(-85.0511, Math.min(85.0511, latitude)) * Math.PI) / 180;
  return {
    x: ((longitude + 180) / 360) * size,
    y: ((1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2) * size,
  };
}

/** The size of a pixel of a tile on the ground, in meters, at the latitude and the zoom z. */
export const metersPerPixel = (latitude: number, z: number): number =>
  (METERS_PER_PIXEL_0 * Math.cos((latitude * Math.PI) / 180)) / 2 ** z;

/** A tile and its position in the map frame: meters from the place, x east and y south. */
export interface PlacedTile {
  url: string;
  key: string;
  x: number;
  y: number;
  size: number;
}

export interface MapPlacement {
  latitude: number;
  longitude: number;
  /** The point of the plan at the place, and the direction of north (see `Building.north`). */
  anchor: Point;
  north: number;
}

/**
 * A point of the plan in the map frame: meters from the place, x to the east and y to the
 * south. The map frame is the plan turned by `north`, so the 2D view draws it with
 * `translate(anchor) rotate(north)`.
 */
export function toMapFrame(placement: MapPlacement, p: Point): Point {
  const a = (placement.north * Math.PI) / 180;
  const dx = p.x - placement.anchor.x;
  const dy = p.y - placement.anchor.y;
  return { x: dx * Math.cos(a) + dy * Math.sin(a), y: -dx * Math.sin(a) + dy * Math.cos(a) };
}

/**
 * The tiles that cover the polygon of the plan (for example the visible part of the view), at
 * a zoom where one pixel of a tile is about one pixel of the screen. `pixelsPerMeter` is the
 * scale of the screen. If the polygon needs more than MAX_TILES tiles, the zoom goes down.
 */
export function tilesFor(
  source: MapSource,
  placement: MapPlacement,
  polygon: Point[],
  pixelsPerMeter: number,
): { zoom: number; tiles: PlacedTile[] } {
  const { latitude, longitude } = placement;
  const frame = polygon.map((p) => toMapFrame(placement, p));
  const minX = Math.min(...frame.map((p) => p.x));
  const maxX = Math.max(...frame.map((p) => p.x));
  const minY = Math.min(...frame.map((p) => p.y));
  const maxY = Math.max(...frame.map((p) => p.y));
  // The zoom where a pixel of a tile is not larger than a pixel of the screen.
  let zoom = Math.ceil(Math.log2(metersPerPixel(latitude, 0) * Math.max(pixelsPerMeter, 1e-9)));
  zoom = Math.max(0, Math.min(source.maxZoom, zoom));
  for (; ; zoom--) {
    const m = metersPerPixel(latitude, zoom);
    const center = worldPixel(latitude, longitude, zoom);
    const count = 2 ** zoom;
    const x0 = Math.floor((center.x + minX / m) / TILE_SIZE);
    const x1 = Math.floor((center.x + maxX / m) / TILE_SIZE);
    const y0 = Math.max(0, Math.floor((center.y + minY / m) / TILE_SIZE));
    const y1 = Math.min(count - 1, Math.floor((center.y + maxY / m) / TILE_SIZE));
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_TILES && zoom > 0) continue;
    const tiles: PlacedTile[] = [];
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        // A column outside the world wraps around the date line.
        const wrapped = ((tx % count) + count) % count;
        tiles.push({
          url: source.url(zoom, wrapped, ty),
          key: `${zoom}/${tx}/${ty}`,
          x: (tx * TILE_SIZE - center.x) * m,
          y: (ty * TILE_SIZE - center.y) * m,
          size: TILE_SIZE * m,
        });
      }
    }
    return { zoom, tiles };
  }
}
