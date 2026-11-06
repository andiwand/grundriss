// The file format: JSON with a format name and a version. A change that old versions of the app
// cannot read needs a new version and a migration in parsePlan.
//
// A new field that old versions can ignore needs no new version. parsePlan gives it a default
// value when a file does not have it. Examples: `hinge` and `swing` of an opening, and
// `dimensions`.
//
// Version 2 has stories, a roof, and the north direction. Version 1 had one floor plan at the
// top level. parseBuilding reads it as a building with one story.

import type {
  Background,
  Building,
  Chimney,
  Dimension,
  Opening,
  Plan,
  Point,
  Roof,
  RoomInfo,
  Stair,
  Story,
  Vertex,
  Wall,
} from "./types";

export const FILE_FORMAT = "grundriss";
export const FILE_VERSION = 2;

export function serializeBuilding(building: Building): string {
  return JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, ...building }, null, 2);
}

type Data = Record<string, unknown>;

const isObject = (value: unknown): value is Data =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function number(data: Data, key: string, where: string): number {
  const value = data[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`The file is damaged: ${where} has no valid "${key}".`);
  }
  return value;
}

function string(data: Data, key: string, where: string): string {
  const value = data[key];
  if (typeof value !== "string") {
    throw new Error(`The file is damaged: ${where} has no valid "${key}".`);
  }
  return value;
}

function list(data: Data, key: string): Data[] {
  const value = data[key] ?? [];
  if (!Array.isArray(value) || !value.every(isObject)) {
    throw new Error(`The file is damaged: "${key}" is not a list of objects.`);
  }
  return value;
}

/** Reads a building from the text of a file. It throws an Error with a message for the user. */
export function parseBuilding(text: string): Building {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("The file is not valid JSON.");
  }
  if (!isObject(data) || data.format !== FILE_FORMAT) {
    throw new Error("The file is not a Grundriss plan.");
  }
  if (data.version === 1) {
    const story: Story = {
      id: "st-ground",
      name: "Ground floor",
      elevation: 0,
      height: 2.75,
      ...parsePlanData(data, ""),
    };
    return { stories: [story], roof: null, north: 0 };
  }
  if (data.version !== FILE_VERSION) {
    throw new Error(
      `The file has version ${String(data.version)}. This app reads versions 1 to ${FILE_VERSION}.`,
    );
  }

  const stories: Story[] = list(data, "stories").map((s, i) => {
    const where = `story ${i}`;
    return {
      id: string(s, "id", where),
      name: string(s, "name", where),
      elevation: number(s, "elevation", where),
      height: number(s, "height", where),
      ...parsePlanData(s, `${where}, `),
    };
  });
  if (stories.length === 0) throw new Error("The file is damaged: it has no story.");
  stories.sort((a, b) => a.elevation - b.elevation);

  let roof: Roof | null = null;
  if (data.roof != null) {
    if (!isObject(data.roof)) throw new Error('The file is damaged: invalid "roof".');
    const r = data.roof;
    const kind = r.kind;
    if (kind !== "gable" && kind !== "hip" && kind !== "flat" && kind !== "shed") {
      throw new Error('The file is damaged: the roof has no valid "kind".');
    }
    roof = {
      kind,
      storyId: string(r, "storyId", "the roof"),
      pitch: number(r, "pitch", "the roof"),
      overhang: number(r, "overhang", "the roof"),
      ridge: r.ridge === "y" ? "y" : "x",
    };
    if (!stories.some((s) => s.id === roof!.storyId)) {
      throw new Error("The file is damaged: the roof refers to a story that does not exist.");
    }
  }
  const north = typeof data.north === "number" && Number.isFinite(data.north) ? data.north : 0;
  return { stories, roof, north };
}

/** Reads the floor plan of one story. `where` names the story in the error messages. */
function parsePlanData(data: Data, prefix: string): Plan {
  const vertices: Vertex[] = list(data, "vertices").map((v, i) => ({
    id: string(v, "id", `${prefix}vertex ${i}`),
    x: number(v, "x", `${prefix}vertex ${i}`),
    y: number(v, "y", `${prefix}vertex ${i}`),
  }));
  const vertexIds = new Set(vertices.map((v) => v.id));

  const walls: Wall[] = list(data, "walls").map((w, i) => {
    const where = `${prefix}wall ${i}`;
    const wall = {
      id: string(w, "id", where),
      a: string(w, "a", where),
      b: string(w, "b", where),
      thickness: number(w, "thickness", where),
      height: number(w, "height", where),
    };
    if (!vertexIds.has(wall.a) || !vertexIds.has(wall.b)) {
      throw new Error(`The file is damaged: ${where} refers to a vertex that does not exist.`);
    }
    return wall;
  });
  const wallIds = new Set(walls.map((w) => w.id));

  const openings: Opening[] = list(data, "openings").map((o, i) => {
    const where = `${prefix}opening ${i}`;
    const kind = o.kind;
    if (kind !== "door" && kind !== "window") {
      throw new Error(`The file is damaged: ${where} has no valid "kind".`);
    }
    const opening = {
      id: string(o, "id", where),
      wallId: string(o, "wallId", where),
      kind,
      offset: number(o, "offset", where),
      width: number(o, "width", where),
      height: number(o, "height", where),
      sill: number(o, "sill", where),
      hinge: o.hinge === "b" ? "b" : "a",
      swing: o.swing === -1 ? -1 : 1,
    } satisfies Opening;
    if (!wallIds.has(opening.wallId)) {
      throw new Error(`The file is damaged: ${where} refers to a wall that does not exist.`);
    }
    return opening;
  });

  const point = (data: unknown, where: string): Point => {
    if (!isObject(data)) throw new Error(`The file is damaged: ${where} is not a point.`);
    return { x: number(data, "x", where), y: number(data, "y", where) };
  };
  const dimensions: Dimension[] = list(data, "dimensions").map((d, i) => {
    const where = `${prefix}dimension ${i}`;
    return {
      id: string(d, "id", where),
      a: point(d.a, `${where}, point a`),
      b: point(d.b, `${where}, point b`),
      offset: number(d, "offset", where),
    };
  });

  const stairs: Stair[] = list(data, "stairs").map((d, i) => {
    const where = `${prefix}stair ${i}`;
    return {
      id: string(d, "id", where),
      a: point(d.a, `${where}, point a`),
      b: point(d.b, `${where}, point b`),
      width: number(d, "width", where),
      kind: d.kind === "l" || d.kind === "u" ? d.kind : "straight",
      turn: d.turn === -1 ? -1 : 1,
      run2: typeof d.run2 === "number" && Number.isFinite(d.run2) ? d.run2 : 1,
    };
  });
  const rooms: RoomInfo[] = list(data, "rooms").map((d, i) => {
    const where = `${prefix}room ${i}`;
    return {
      id: string(d, "id", where),
      key: typeof d.key === "string" ? d.key : "",
      at: point(d.at, where),
      name: typeof d.name === "string" ? d.name : "",
      height: d.height == null ? null : number(d, "height", where),
    };
  });
  const chimneys: Chimney[] = list(data, "chimneys").map((d, i) => {
    const where = `${prefix}chimney ${i}`;
    return {
      id: string(d, "id", where),
      x: number(d, "x", where),
      y: number(d, "y", where),
      width: number(d, "width", where),
      depth: number(d, "depth", where),
      top: d.top == null ? null : number(d, "top", where),
    };
  });

  let background: Background | null = null;
  if (data.background != null) {
    if (!isObject(data.background)) throw new Error('The file is damaged: invalid "background".');
    const b = data.background;
    background = {
      image: string(b, "image", `${prefix}the background`),
      width: number(b, "width", `${prefix}the background`),
      height: number(b, "height", `${prefix}the background`),
      x: number(b, "x", `${prefix}the background`),
      y: number(b, "y", `${prefix}the background`),
      scale: number(b, "scale", `${prefix}the background`),
      opacity: number(b, "opacity", `${prefix}the background`),
    };
  }

  return { vertices, walls, openings, dimensions, stairs, chimneys, rooms, background };
}
