// The example house: a family house with a ground floor, an attic under a gable roof with a
// dormer, furniture, services, a heat pump, and PV. The app loads it from the start card, and
// the website tells its story. It uses only the functions of the model, so all its drawings and
// numbers come from the real engine.

import { addStoryOnTop, emptyBuilding } from "./building";
import { newFurniture } from "./furniture";
import { distance } from "./geometry";
import { addOpening, addStair, addVertex, addWall, wallEnds } from "./plan";
import { faceInfo } from "./pv";
import { newRoof } from "./roof";
import { editRoomInfo, findRooms, pointInPolygon } from "./rooms";
import { newFixture, newRun } from "./services";
import type { Building, OpeningKind, Plan, Point, Story } from "./types";

type Segment = [Point, Point, number];

const OUTER = 0.3;
const INNER = 0.12;

/**
 * Adds the walls of the segments. A segment that has the end of another segment on it splits
 * there, so that the walls meet at vertices and the rooms close.
 */
function walls(plan: Plan, segments: Segment[], height: number): void {
  const vertices = new Map<string, string>();
  const vertex = (p: Point) => {
    const key = `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
    let id = vertices.get(key);
    if (!id) {
      id = addVertex(plan, p).id;
      vertices.set(key, id);
    }
    return id;
  };
  const ends = segments.flatMap(([a, b]) => [a, b]);
  for (const [a, b, thickness] of segments) {
    const length = distance(a, b);
    const cuts = ends
      .map((p) => {
        const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (length * length);
        const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        return { p, t, off: distance(p, q) };
      })
      .filter((c) => c.off < 1e-6 && c.t > 1e-6 && c.t < 1 - 1e-6)
      .sort((c, d) => c.t - d.t)
      .map((c) => c.p);
    const points = [a, ...cuts, b];
    for (let i = 1; i < points.length; i++) {
      addWall(plan, vertex(points[i - 1]), vertex(points[i]), { thickness, height });
    }
  }
}

/** Adds a door or a window to the wall under the point. */
function opening(
  plan: Plan,
  kind: OpeningKind,
  at: Point,
  size: { width?: number; height?: number; sill?: number } = {},
): void {
  const wall = plan.walls.find((w) => {
    const [a, b] = wallEnds(plan, w);
    const length = distance(a, b);
    const t = ((at.x - a.x) * (b.x - a.x) + (at.y - a.y) * (b.y - a.y)) / (length * length);
    const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    return t > 0 && t < 1 && distance(q, at) < 1e-6;
  });
  if (!wall) throw new Error(`No wall at ${at.x}, ${at.y}`);
  const [a] = wallEnds(plan, wall);
  const o = addOpening(plan, wall.id, kind, distance(a, at));
  Object.assign(o, size);
}

function name(plan: Plan, at: Point, text: string): void {
  const room = findRooms(plan).find((r) => pointInPolygon(at, r.polygon));
  if (room) editRoomInfo(plan, room, (info) => (info.name = text));
}

function furniture(
  plan: Plan,
  type: string,
  at: Point,
  rotation = 0,
  size?: Partial<Record<"width" | "depth", number>>,
) {
  const piece = newFurniture({ kind: "generic", type }, at);
  piece.rotation = rotation;
  Object.assign(piece, size);
  plan.furniture.push(piece);
}

function fixture(plan: Plan, type: string, at: Point, rotation: number, ceiling = 2.5) {
  const f = newFixture(type, at, ceiling);
  f.rotation = rotation;
  plan.fixtures.push(f);
  return f;
}

const p = (x: number, y: number): Point => ({ x, y });

/** The ground floor: 12 m × 9 m, with the entrance in the north (the top of the plan). */
function groundFloor(story: Story): void {
  walls(
    story,
    [
      [p(0, 0), p(12, 0), OUTER],
      [p(12, 0), p(12, 9), OUTER],
      [p(12, 9), p(0, 9), OUTER],
      [p(0, 9), p(0, 0), OUTER],
      [p(7, 0), p(7, 9), INNER],
      [p(0, 4), p(7, 4), INNER],
      [p(4, 0), p(4, 4), INNER],
      [p(7, 5), p(12, 5), INNER],
      [p(9.5, 0), p(9.5, 5), INNER],
    ],
    2.5,
  );
  // Doors.
  opening(story, "door", p(5.6, 0), { width: 1.1, height: 2.2 });
  opening(story, "door", p(4, 2.6));
  opening(story, "door", p(5.6, 4), { width: 1.0 });
  opening(story, "door", p(7, 2.2));
  opening(story, "door", p(9.5, 3.8));
  opening(story, "door", p(7, 6.4));
  // Windows: large glass to the south garden, smaller ones elsewhere.
  opening(story, "window", p(2, 9), { width: 2.4, height: 2.2, sill: 0 });
  opening(story, "window", p(5.2, 9), { width: 1.6, height: 1.5, sill: 0.7 });
  opening(story, "window", p(9.5, 9), { width: 1.8 });
  opening(story, "window", p(0, 6.5), { width: 1.4 });
  opening(story, "window", p(0, 2), { width: 1.2 });
  opening(story, "window", p(2, 0), { width: 1.4 });
  opening(story, "window", p(10.75, 0), { width: 0.8, height: 0.9, sill: 1.3 });
  opening(story, "window", p(12, 7), { width: 1.4 });
  opening(story, "window", p(12, 2.5), { width: 1.0 });

  name(story, p(2, 2), "Kitchen");
  name(story, p(5.5, 2), "Hall");
  name(story, p(3.5, 6.5), "Living");
  name(story, p(8.2, 2.5), "Utility");
  name(story, p(10.7, 2.5), "Bath");
  name(story, p(9.5, 7), "Bedroom");

  const stair = addStair(story, p(4.55, 3.75), p(4.55, 1.25), 0.95);
  stair.kind = "l";
  stair.turn = 1;
  stair.run2 = 1.0;

  // Living and dining.
  furniture(story, "sofa", p(3.4, 7.2), 0);
  furniture(story, "coffee-table", p(3.4, 6.1));
  furniture(story, "armchair", p(1.2, 5.8), 90);
  furniture(story, "sideboard", p(3.4, 4.35), 0);
  furniture(story, "shelf", p(0.35, 7.6), 90);
  furniture(story, "table", p(5.6, 7.3), 90, { width: 1.6, depth: 0.9 });
  for (const [x, y, r] of [
    [5.15, 6.75, 90],
    [5.15, 7.85, 90],
    [6.05, 6.75, 270],
    [6.05, 7.85, 270],
  ]) {
    furniture(story, "chair", p(x, y), r);
  }
  // Kitchen.
  furniture(story, "counter", p(0.5, 1.3), 90, { width: 2.2 });
  furniture(story, "kitchen-sink", p(1.8, 0.47), 0);
  furniture(story, "hob", p(2.7, 0.47), 0);
  furniture(story, "fridge", p(3.55, 0.5), 0);
  furniture(story, "table-round", p(2.3, 2.7));
  furniture(story, "chair", p(2.3, 3.45), 180);
  furniture(story, "chair", p(1.6, 2.7), 270);
  // Bath and utility.
  furniture(story, "bathtub", p(11.45, 1.4), 90);
  furniture(story, "washbasin", p(10.6, 0.4), 0);
  furniture(story, "toilet", p(11.5, 4.3), 90);
  furniture(story, "shower", p(10.2, 4.35), 180);
  furniture(story, "washer", p(7.5, 0.5), 0);
  furniture(story, "shelf", p(9.1, 1.5), 270, { width: 1.2 });
  // Bedroom.
  furniture(story, "bed-double", p(9.6, 6.25), 0);
  furniture(story, "nightstand", p(8.45, 5.45), 0);
  furniture(story, "nightstand", p(10.75, 5.45), 0);
  furniture(story, "wardrobe", p(11.55, 7.6), 90);

  // Electricity: sockets, switches, and lights.
  const board = fixture(story, "board", p(7.13, 1.2), 90);
  board.label = "Board";
  const s1 = fixture(story, "socket-double", p(0.2, 5.4), 90);
  const s2 = fixture(story, "socket", p(6.94, 8.5), 270);
  const s3 = fixture(story, "socket-double", p(1.4, 0.2), 0);
  fixture(story, "switch", p(5.0, 0.2), 0);
  fixture(story, "switch", p(5.0, 4.1), 0);
  fixture(story, "switch", p(7.12, 6.0), 90);
  for (const at of [p(3.4, 6.5), p(5.6, 7.3), p(2.2, 2), p(5.5, 2.3), p(9.6, 7), p(10.7, 2.5)]) {
    fixture(story, "light-ceiling", at, 0);
  }
  fixture(story, "smoke", p(5.5, 1.2), 0);
  const cable = (points: Point[], from = board.id, to: string | null = null) => {
    const run = newRun("cable", points);
    run.from = from;
    run.to = to;
    story.runs.push(run);
  };
  cable([p(7.13, 1.2), p(6.9, 1.2), p(6.9, 4.2), p(0.2, 4.2), p(0.2, 5.4)], board.id, s1.id);
  cable([p(7.13, 1.2), p(7.25, 1.2), p(7.25, 8.5), p(6.94, 8.5)], board.id, s2.id);
  cable([p(7.13, 1.2), p(6.9, 1.2), p(6.9, 0.2), p(1.4, 0.2)], board.id, s3.id);

  // Heating: a heat pump in the utility room, radiators under the windows.
  const pump = fixture(story, "heat-pump", p(8.3, 4.6), 180);
  const radiators = [
    fixture(story, "radiator", p(9.5, 8.75), 180),
    fixture(story, "radiator", p(0.25, 6.5), 90),
    fixture(story, "radiator", p(0.25, 2), 90),
    fixture(story, "radiator", p(5.2, 8.75), 180),
  ];
  for (const [kind, offset] of [
    ["flow", 0],
    ["return", 0.12],
  ] as const) {
    for (const radiator of radiators) {
      const y = 8.6 - offset;
      const points =
        radiator.x > 7
          ? [p(8.3, 4.6), p(8.3 + offset, 4.6), p(8.3 + offset, y), p(radiator.x, y)]
          : radiator.y > 8
            ? [p(8.3, 4.6), p(7.4 + offset, 4.6), p(7.4 + offset, y), p(radiator.x, y)]
            : [
                p(8.3, 4.6),
                p(7.4 + offset, 4.6),
                p(7.4 + offset, 4.3 + offset),
                p(0.5 + offset, 4.3 + offset),
                p(0.5 + offset, radiator.y),
              ];
      const run = newRun(kind, points);
      run.from = pump.id;
      run.to = radiator.id;
      story.runs.push(run);
    }
  }
}

/** The attic under the roof: two bedrooms, a bath, and a study by the stair. */
function attic(story: Story): void {
  walls(
    story,
    [
      [p(0, 0), p(12, 0), OUTER],
      [p(12, 0), p(12, 9), OUTER],
      [p(12, 9), p(0, 9), OUTER],
      [p(0, 9), p(0, 0), OUTER],
      [p(7, 0), p(7, 9), INNER],
      [p(7, 4.5), p(12, 4.5), INNER],
      [p(0, 4.8), p(7, 4.8), INNER],
    ],
    2.6,
  );
  // Under the slope, the doors and the windows go where the room is high enough for them.
  opening(story, "door", p(7, 3.4));
  opening(story, "door", p(7, 5.6));
  opening(story, "door", p(3, 4.8));
  opening(story, "window", p(0, 3.3), { width: 1.0, height: 1.2, sill: 0.9 });
  opening(story, "window", p(0, 5.9), { width: 1.0, height: 1.2, sill: 0.9 });
  opening(story, "window", p(12, 3.3), { width: 1.0, height: 1.2, sill: 0.9 });
  opening(story, "window", p(12, 5.9), { width: 1.0, height: 1.2, sill: 0.9 });
  name(story, p(3.5, 2.2), "Study");
  name(story, p(2, 7), "Kids");
  name(story, p(9.5, 2.2), "Bath");
  name(story, p(9.5, 7), "Bedroom");
  furniture(story, "desk", p(2.2, 2.6), 270);
  furniture(story, "office-chair", p(1.5, 2.6), 90);
  furniture(story, "bed-single", p(2, 7.4), 90);
  // The tall shelf stands at the high wall under the ridge, not under the slope.
  furniture(story, "shelf", p(5.2, 5.05), 0);
  furniture(story, "bed-double", p(9.6, 6.9), 90);
  furniture(story, "bathtub", p(10.4, 2.2), 90);
  furniture(story, "washbasin", p(8.2, 2.2), 90);
}

/** The whole house. */
export function makeHouse(): Building {
  const building = emptyBuilding();
  const ground = building.stories[0];
  ground.name = "Ground floor";
  groundFloor(ground);
  const top = addStoryOnTop(building);
  top.name = "Attic";
  attic(top);

  // A gable roof on the ground floor: its eaves sit on the floor of the attic.
  const roof = newRoof(building, ground, "gable")!;
  roof.name = "Main roof";
  for (const side of roof.sides) {
    side.pitch = 42;
    side.overhang = 0.5;
  }
  building.roofs.push(roof);
  const length = (i: number) =>
    distance(roof.outline[i], roof.outline[(i + 1) % roof.outline.length]);
  const eaves = roof.sides.flatMap((side, i) => (side.kind === "eave" ? [i] : []));
  // The eave on the south side (the largest y) takes the dormer, the north side a roof window.
  const southOf = (i: number) => roof.outline[i].y + roof.outline[(i + 1) % roof.outline.length].y;
  const south = eaves.reduce((a, b) => (southOf(a) > southOf(b) ? a : b));
  const north = eaves.find((i) => i !== south)!;
  roof.dormers.push({
    id: "dormer",
    side: south,
    // Near the gable, so that the panels make one block beside it.
    offset: 1.5,
    distance: 0.9,
    width: 2.2,
    height: 1.3,
    kind: "gable",
    pitch: 30,
  });
  roof.windows.push(
    { id: "w1", side: north, offset: length(north) * 0.3, distance: 1.6, width: 0.78, length: 1.4 },
    { id: "w2", side: north, offset: length(north) * 0.7, distance: 1.6, width: 0.78, length: 1.4 },
  );

  // PV on the face that looks most to the south.
  const face = faceInfo(building)
    .filter((f) => f.roofId === roof.id)
    .reduce((a, b) => (Math.abs(a.azimuth - 180) < Math.abs(b.azimuth - 180) ? a : b));
  building.pv.push({
    id: "pv",
    roofId: roof.id,
    face: face.index,
    panelWidth: 1.13,
    panelHeight: 1.72,
    panelPower: 430,
    portrait: true,
    margin: 0.35,
    gap: 0.03,
    limit: null,
  });
  return building;
}

/** A copy of the building with only some of its parts, for the steps of the story. */
export function partOf(
  building: Building,
  parts: { attic?: boolean; roof?: boolean; furniture?: boolean; services?: boolean; pv?: boolean },
): Building {
  const copy = structuredClone(building);
  if (!parts.attic) copy.stories = copy.stories.slice(0, 1);
  if (!parts.roof) copy.roofs = [];
  if (!parts.pv || !parts.roof) copy.pv = [];
  for (const story of copy.stories) {
    if (!parts.furniture) story.furniture = [];
    if (!parts.services) {
      story.fixtures = [];
      story.runs = [];
    }
  }
  return copy;
}
