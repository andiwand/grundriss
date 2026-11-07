import { describe, expect, it } from "vitest";
import {
  MAP_SOURCES,
  MAX_TILES,
  metersPerPixel,
  tilesFor,
  toMapFrame,
  worldPixel,
} from "../src/io/tiles";

describe("map tiles", () => {
  it("finds the tile of a place like other web maps", () => {
    // Himberg, Lower Austria: the aerial tile 19/286079/182064 of basemap.at shows this place.
    const p = worldPixel(48.08504, 16.43528, 19);
    expect(Math.floor(p.x / 256)).toBe(286079);
    expect(Math.floor(p.y / 256)).toBe(182064);
    // A pixel at zoom 19 on the equator is about 0.3 m, and half of that at 60° north.
    expect(metersPerPixel(0, 19)).toBeCloseTo(0.2986, 3);
    expect(metersPerPixel(60, 19)).toBeCloseTo(0.1493, 3);
  });

  it("turns the plan with north into the map frame", () => {
    const placement = { latitude: 48, longitude: 16, anchor: { x: 10, y: 5 }, north: 0 };
    expect(toMapFrame(placement, { x: 13, y: 1 })).toEqual({ x: 3, y: -4 });
    // North points to the right of the plan: a point right of the anchor is north of the place.
    const turned = toMapFrame({ ...placement, north: 90 }, { x: 13, y: 5 });
    expect(turned.x).toBeCloseTo(0);
    expect(turned.y).toBeCloseTo(-3);
  });

  it("covers the view with tiles at the zoom of the screen", () => {
    const placement = { latitude: 48.085, longitude: 16.435, anchor: { x: 0, y: 0 }, north: 0 };
    const view = [
      { x: -20, y: -10 },
      { x: 20, y: -10 },
      { x: 20, y: 10 },
      { x: -20, y: 10 },
    ];
    // 20 pixels per meter needs tiles with less than 0.05 m per pixel: more than zoom 19, so 19.
    const near = tilesFor(MAP_SOURCES.osm, placement, view, 20);
    expect(near.zoom).toBe(19);
    // The tiles cover the view, and the place is in the tile at (0, 0) of the frame.
    const minX = Math.min(...near.tiles.map((t) => t.x));
    const maxX = Math.max(...near.tiles.map((t) => t.x + t.size));
    expect(minX).toBeLessThanOrEqual(-20);
    expect(maxX).toBeGreaterThanOrEqual(20);
    expect(
      near.tiles.some((t) => t.x <= 0 && t.x + t.size > 0 && t.y <= 0 && t.y + t.size > 0),
    ).toBe(true);
    expect(near.tiles[0].url).toMatch(/^https:\/\/tile\.openstreetmap\.org\/19\/\d+\/\d+\.png$/);
    // A view of 20 km at a high zoom needs too many tiles, so the zoom goes down.
    const far = tilesFor(
      MAP_SOURCES.osm,
      placement,
      view.map((p) => ({ x: p.x * 500, y: p.y * 500 })),
      20,
    );
    expect(far.tiles.length).toBeLessThanOrEqual(MAX_TILES);
    expect(far.zoom).toBeLessThan(19);
  });

  it("gives the row before the column in the URL of basemap.at", () => {
    expect(MAP_SOURCES["basemap-ortho"].url(19, 286079, 182064)).toBe(
      "https://mapsneu.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/19/182064/286079.jpeg",
    );
  });
});
