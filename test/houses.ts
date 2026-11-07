// Small buildings for the tests: a box of walls with a roof of a preset.

import { emptyBuilding } from "../src/model/building";
import { addVertex, addWall } from "../src/model/plan";
import { newRoof } from "../src/model/roof";
import type { Building, Point, RoofKind, Story } from "../src/model/types";

/** Walls around the polygon on the story, with a height of 2.5 m. */
export function wallsAround(story: Story, outline: Point[]): void {
  const vertices = outline.map((p) => addVertex(story, p));
  for (let i = 0; i < vertices.length; i++) {
    addWall(story, vertices[i].id, vertices[(i + 1) % vertices.length].id);
  }
}

/** A house of w × d m with one story and a roof of the preset, or no roof for null. */
export function boxHouse(w: number, d: number, preset: RoofKind | null, north = 0): Building {
  const building = emptyBuilding();
  const story = building.stories[0];
  wallsAround(story, [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: d },
    { x: 0, y: d },
  ]);
  if (preset) building.roofs.push({ ...newRoof(building, story, preset)!, id: "roof" });
  building.north = north;
  return building;
}
