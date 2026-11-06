// The file format: JSON with a format name and a version. A change that old versions of the app
// cannot read needs a new version and a migration in parsePlan.

import type { Background, Opening, Plan, Vertex, Wall } from "./types";

export const FILE_FORMAT = "grundriss";
export const FILE_VERSION = 1;

export function serializePlan(plan: Plan): string {
  return JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, ...plan }, null, 2);
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

/** Reads a plan from the text of a file. It throws an Error with a message for the user. */
export function parsePlan(text: string): Plan {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("The file is not valid JSON.");
  }
  if (!isObject(data) || data.format !== FILE_FORMAT) {
    throw new Error("The file is not a Grundriss plan.");
  }
  if (data.version !== FILE_VERSION) {
    throw new Error(
      `The file has version ${String(data.version)}. This app reads version ${FILE_VERSION}.`,
    );
  }

  const vertices: Vertex[] = list(data, "vertices").map((v, i) => ({
    id: string(v, "id", `vertex ${i}`),
    x: number(v, "x", `vertex ${i}`),
    y: number(v, "y", `vertex ${i}`),
  }));
  const vertexIds = new Set(vertices.map((v) => v.id));

  const walls: Wall[] = list(data, "walls").map((w, i) => {
    const where = `wall ${i}`;
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
    const where = `opening ${i}`;
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
    } satisfies Opening;
    if (!wallIds.has(opening.wallId)) {
      throw new Error(`The file is damaged: ${where} refers to a wall that does not exist.`);
    }
    return opening;
  });

  let background: Background | null = null;
  if (data.background != null) {
    if (!isObject(data.background)) throw new Error('The file is damaged: invalid "background".');
    const b = data.background;
    background = {
      image: string(b, "image", "the background"),
      width: number(b, "width", "the background"),
      height: number(b, "height", "the background"),
      x: number(b, "x", "the background"),
      y: number(b, "y", "the background"),
      scale: number(b, "scale", "the background"),
      opacity: number(b, "opacity", "the background"),
    };
  }

  return { vertices, walls, openings, background };
}
