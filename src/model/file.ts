// The file format: JSON with a format name and a version. A change that old versions of the app
// cannot read needs a new version and a migration in parseBuilding.
//
// A new field that old versions can ignore needs no new version. parsePlan gives it a default
// value when a file does not have it. Examples: `hinge`, `swing`, `style`, and `leaves` of an
// opening, and `dimensions`.
//
// `location` and `climate` are such fields: a file without them gets null for both.
//
// Version 3 has values that version 2 does not know: the systems "water" and "comms", the roof
// side "half-hip", and unheated stories. An app of version 2 would read them wrong without a
// message, so these files have a new version. A file of version 2 is a file of version 3 with
// the defaults. Version 2 has stories, a roof, and the north direction. Version 1 had one floor
// plan at the top level. parseBuilding reads it as a building with one story.

import type {
  Background,
  Building,
  Chimney,
  Climate,
  Dimension,
  Dormer,
  Envelope,
  HeatingKind,
  HeatingSystem,
  Finance,
  HotWater,
  Household,
  Fixture,
  Furniture,
  Layer,
  Location,
  Model,
  Note,
  Opening,
  Plan,
  Point,
  PvArray,
  PvRack,
  Roof,
  RoofSide,
  RoofWindow,
  RoomInfo,
  Run,
  Stair,
  Story,
  Vertex,
  Wall,
  Variant,
  Layout,
  Ventilation,
} from "./types";

import { decodeSeries, SERIES_NAMES } from "./climate";
import { defaultHeating, HEATING_KINDS } from "./heating";
import { copyTree } from "./history";
import { DEFAULT_COLORS, isColor } from "./colors";
import { defaultEnvelope, defaultFinance, defaultHousehold } from "./insulation";
import { storyBox } from "./roof";
import { roomSide, WIDE_WINDOW } from "./openings";
import { findRooms } from "./rooms";
import { FIXTURE_TYPES, RUN_KINDS, serviceSystem } from "./services";
import { switchVariant, syncBackgrounds } from "./variants";

export const FILE_FORMAT = "grundriss";
export const FILE_VERSION = 3;

/**
 * The JSON of the building. While a variant is open, the file has the plan in the building and
 * the open state in its variant, so that an app without open variants reads the plan. `variant`
 * gives the open variant.
 */
export function serializeBuilding(building: Building): string {
  const plain = copyTree(building);
  syncBackgrounds(plain);
  if (building.variant !== null) {
    switchVariant(plain, null);
  }
  const { base, ...rest } = plain;
  void base;
  return JSON.stringify(
    { format: FILE_FORMAT, version: FILE_VERSION, ...rest, variant: building.variant },
    null,
    2,
  );
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

/** The value if it is a finite number, else the fallback. */
const finite = <T>(value: unknown, fallback: T): number | T =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

function list(data: Data, key: string): Data[] {
  const value = data[key] ?? [];
  if (!Array.isArray(value) || !value.every(isObject)) {
    throw new Error(`The file is damaged: "${key}" is not a list of objects.`);
  }
  const ids = new Set<string>();
  for (const entry of value) {
    if (typeof entry.id !== "string") continue;
    if (ids.has(entry.id))
      throw new Error(`The file is damaged: "${key}" has duplicate id "${entry.id}".`);
    ids.add(entry.id);
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
      heated: true,
      ...parsePlanData(data, ""),
    };
    return {
      stories: [story],
      roofs: [],
      north: 0,
      facade: DEFAULT_COLORS.facade,
      models: [],
      envelope: defaultEnvelope(),
      household: defaultHousehold(),
      finance: defaultFinance(),
      variants: [],
      variant: null,
      base: null,
      pv: [],
      location: null,
      climate: null,
    };
  }
  if (data.version !== 2 && data.version !== FILE_VERSION) {
    throw new Error(
      `The file has version ${String(data.version)}. This app reads versions 1 to ${FILE_VERSION}.`,
    );
  }

  const { stories, roofs } = parseLayout(data, "");
  const north = finite(data.north, 0);
  const models: Model[] = list(data, "models").map((m, i) => {
    const where = `model ${i}`;
    const origin = m.origin;
    if (origin !== "import" && origin !== "kenney" && origin !== "polyhaven") {
      throw new Error(`The file is damaged: ${where} has no valid "origin".`);
    }
    if (!isObject(m.size)) throw new Error(`The file is damaged: ${where} has no valid "size".`);
    return {
      id: string(m, "id", where),
      name: string(m, "name", where),
      origin,
      ref: typeof m.ref === "string" ? m.ref : "",
      data: m.data == null ? null : string(m, "data", where),
      size: {
        x: number(m.size, "x", where),
        y: number(m.size, "y", where),
        z: number(m.size, "z", where),
      },
      license: typeof m.license === "string" ? m.license : "",
      credit: typeof m.credit === "string" ? m.credit : "",
    };
  });
  const modelIds = new Set(models.map((m) => m.id));
  const layouts: Data[] = list(data, "variants")
    .map((v) => v.layout)
    .filter((l): l is Data => isObject(l));
  const variantLayouts = layouts.map((l, i) => parseLayout(l, `the floor plan of variant ${i}, `));
  for (const story of [stories, ...variantLayouts.map((l) => l.stories)].flat()) {
    for (const piece of story.furniture) {
      if (piece.source.kind === "model" && !modelIds.has(piece.source.modelId)) {
        throw new Error(
          `The file is damaged: furniture "${piece.name}" refers to a model that does not exist.`,
        );
      }
    }
  }
  const envelope = parseEnvelope(data.envelope);
  const parsePv = (d: Data, where: string): PvArray => {
    return {
      id: string(d, "id", where),
      // A field of a file before the roofs is on the only roof.
      roofId: typeof d.roofId === "string" ? d.roofId : (roofs[0]?.id ?? ""),
      face: count(d, "face", where),
      panelWidth: bounded(d, "panelWidth", where, 0.01, Infinity),
      panelHeight: bounded(d, "panelHeight", where, 0.01, Infinity),
      panelPower: bounded(d, "panelPower", where, 0, Infinity),
      portrait: d.portrait !== false,
      margin: bounded(d, "margin", where, 0, Infinity),
      gap: bounded(d, "gap", where, 0, Infinity),
      limit: d.limit == null ? null : count(d, "limit", where),
      rack: parseRack(d.rack),
    };
  };
  const pv = list(data, "pv").map((d, i) => parsePv(d, `PV field ${i}`));
  const household = parseHousehold(data.household, envelope);
  let layoutIndex = 0;
  const variants: Variant[] = list(data, "variants").map((v, i) => {
    const where = `variant ${i}`;
    const layout = isObject(v.layout) ? variantLayouts[layoutIndex++] : null;
    const storyIds = new Set((layout ?? { stories }).stories.map((s) => s.id));
    return {
      id: string(v, "id", where),
      name: string(v, "name", where),
      envelope: parseEnvelope(v.envelope),
      unheated: Array.isArray(v.unheated)
        ? v.unheated.filter((id): id is string => typeof id === "string" && storyIds.has(id))
        : [],
      // A variant before the renovation has the household and the PV of the plan.
      // A copy, so that the variant does not share the objects of the plan.
      household: v.household == null ? copyTree(household) : parseHousehold(v.household, envelope),
      pv:
        v.pv == null
          ? copyTree(pv)
          : list(v, "pv").map((d, j) => parsePv(d, `${where}, PV field ${j}`)),
      layout,
      cost: v.cost == null ? null : Math.max(0, number(v, "cost", where)),
      itemCosts: parseItemCosts(v.itemCosts),
      subsidy: Math.max(0, finite(v.subsidy, 0)),
    };
  });
  const location = parseLocation(data.location);
  const climate = parseClimate(data.climate);
  const facade = isColor(data.facade) ? data.facade : DEFAULT_COLORS.facade;
  const building: Building = {
    stories,
    roofs,
    north,
    facade,
    models,
    envelope,
    household,
    finance: parseFinance(data.finance),
    variants,
    variant: null,
    base: null,
    pv,
    location,
    climate,
  };
  // The file has the plan in the building. The open variant opens again.
  if (typeof data.variant === "string") switchVariant(building, data.variant);
  return building;
}

/** A number in the interval [low, high], or an error. */
function bounded(data: Data, key: string, where: string, low: number, high: number): number {
  const value = number(data, key, where);
  if (value < low || value > high) {
    throw new Error(`The file is damaged: ${where} has no valid "${key}".`);
  }
  return value;
}

/** A nonnegative integer, for a count or an index. */
function count(data: Data, key: string, where: string): number {
  const value = bounded(data, key, where, 0, Number.MAX_SAFE_INTEGER);
  if (!Number.isInteger(value))
    throw new Error(`The file is damaged: ${where} has no valid "${key}".`);
  return value;
}

/** Reads the location of the building. A file without it gets null. */
function parseLocation(data: unknown): Location | null {
  if (data == null) return null;
  if (!isObject(data)) throw new Error('The file is damaged: invalid "location".');
  const where = "the location";
  return {
    name: typeof data.name === "string" ? data.name : "",
    latitude: bounded(data, "latitude", where, -90, 90),
    longitude: bounded(data, "longitude", where, -180, 180),
    // Older files have no point of the plan: the place is at the origin.
    x: finite(data.x, 0),
    y: finite(data.y, 0),
  };
}

/** Reads the stored climate. Each series must decode to a whole year. */
function parseClimate(data: unknown): Climate | null {
  if (data == null) return null;
  if (!isObject(data)) throw new Error('The file is damaged: invalid "climate".');
  const where = "the climate";
  const climate: Climate = {
    source: typeof data.source === "string" ? data.source : "",
    latitude: bounded(data, "latitude", where, -90, 90),
    longitude: bounded(data, "longitude", where, -180, 180),
    firstYear: number(data, "firstYear", where),
    lastYear: number(data, "lastYear", where),
    downloaded: typeof data.downloaded === "string" ? data.downloaded : "",
    degreeDays: number(data, "degreeDays", where),
    designTemperature: number(data, "designTemperature", where),
    ghi: string(data, "ghi", where),
    dni: string(data, "dni", where),
    dhi: string(data, "dhi", where),
    temperature: string(data, "temperature", where),
  };
  for (const name of SERIES_NAMES) {
    try {
      decodeSeries(name, climate[name]);
    } catch {
      throw new Error(`The file is damaged: ${where} has no valid "${name}".`);
    }
  }
  return climate;
}

function pointOf(data: unknown, where: string): Point {
  if (!isObject(data)) throw new Error(`The file is damaged: ${where} is not a point.`);
  return { x: number(data, "x", where), y: number(data, "y", where) };
}

/** Reads a roof: its outline, one side for each side of the outline, dormers, and windows. */
function parseRoof(r: Data, where: string): Roof {
  if (!Array.isArray(r.outline) || r.outline.length < 3) {
    throw new Error(`The file is damaged: ${where} has no valid outline.`);
  }
  const outline = r.outline.map((p, i) => pointOf(p, `${where}, point ${i}`));
  const sides: RoofSide[] = list(r, "sides").map((side, i) => {
    const at = `${where}, side ${i}`;
    const kind = side.kind === "gable" || side.kind === "half-hip" ? side.kind : "eave";
    const result: RoofSide = {
      kind,
      pitch: number(side, "pitch", at),
      overhang: number(side, "overhang", at),
    };
    if (kind === "half-hip") result.gableHeight = Math.max(0, number(side, "gableHeight", at));
    return result;
  });
  if (sides.length !== outline.length) {
    throw new Error(`The file is damaged: ${where} needs one side for each side of its outline.`);
  }
  const dormers: Dormer[] = list(r, "dormers").map((d, i) => {
    const at = `${where}, dormer ${i}`;
    const kind = d.kind === "shed" || d.kind === "flat" ? d.kind : "gable";
    return {
      id: string(d, "id", at),
      side: number(d, "side", at),
      offset: number(d, "offset", at),
      distance: number(d, "distance", at),
      width: number(d, "width", at),
      height: number(d, "height", at),
      kind,
      pitch: number(d, "pitch", at),
    };
  });
  const windows: RoofWindow[] = list(r, "windows").map((w, i) => {
    const at = `${where}, window ${i}`;
    return {
      id: string(w, "id", at),
      side: number(w, "side", at),
      offset: number(w, "offset", at),
      distance: number(w, "distance", at),
      width: number(w, "width", at),
      length: number(w, "length", at),
    };
  });
  return {
    id: string(r, "id", where),
    name: typeof r.name === "string" ? r.name : "Roof",
    storyId: string(r, "storyId", where),
    outline,
    sides,
    base: r.base == null ? null : number(r, "base", where),
    flat: r.flat === true,
    dormers,
    windows,
    color: isColor(r.color) ? r.color : DEFAULT_COLORS.roof,
    underside: isColor(r.underside) ? r.underside : DEFAULT_COLORS.underside,
  };
}

/**
 * Converts the single roof of an older file: { kind, storyId, pitch, overhang, ridge }. The new
 * roof has the outline of the box around the walls of the story, and the kind and the ridge
 * decide its sides. The sides of the box go: 0 along x at the small y, 1 along y at the large x,
 * 2 along x at the large y, 3 along y at the small x.
 */
function oldRoof(r: Data, stories: Story[]): Roof | null {
  const kind = r.kind;
  if (kind !== "gable" && kind !== "hip" && kind !== "flat" && kind !== "shed") {
    throw new Error('The file is damaged: the roof has no valid "kind".');
  }
  const storyId = string(r, "storyId", "the roof");
  const story = stories.find((s) => s.id === storyId);
  if (!story) {
    throw new Error("The file is damaged: the roof refers to a story that does not exist.");
  }
  const outline = storyBox(story);
  if (!outline) return null;
  const pitch = number(r, "pitch", "the roof");
  const overhang = number(r, "overhang", "the roof");
  const alongX = r.ridge !== "y";
  const eaves: number[] =
    kind === "hip" || kind === "flat"
      ? [0, 1, 2, 3]
      : kind === "gable"
        ? alongX
          ? [0, 2]
          : [1, 3]
        : // The old shed roof was high at the small side across the ridge, so its eave is at the
          // large side.
          alongX
          ? [2]
          : [1];
  return {
    id: "roof-1",
    name: "Roof 1",
    storyId,
    outline,
    sides: outline.map((_, i) => ({
      kind: eaves.includes(i) ? "eave" : "gable",
      pitch: kind === "flat" ? 0 : pitch,
      overhang,
    })),
    base: null,
    flat: kind === "flat",
    dormers: [],
    windows: [],
    color: DEFAULT_COLORS.roof,
    underside: DEFAULT_COLORS.underside,
  };
}

/** Reads a list of layers. */
function layers(data: Data, key: string, where: string): Layer[] {
  return list(data, key).map((l, i) => ({
    material: string(l, "material", `${where}, layer ${i}`),
    thickness: number(l, "thickness", `${where}, layer ${i}`),
  }));
}

/** Reads the envelope. A file without it gets the default envelope. */
function parseEnvelope(data: unknown): Envelope {
  const defaults = defaultEnvelope();
  if (!isObject(data)) return defaults;
  return {
    wall: data.wall == null ? defaults.wall : layers(data, "wall", "the outer walls"),
    roof: data.roof == null ? defaults.roof : layers(data, "roof", "the roof"),
    floor: data.floor == null ? defaults.floor : layers(data, "floor", "the floor"),
    ceiling: data.ceiling == null ? defaults.ceiling : layers(data, "ceiling", "the ceiling"),
    windowU: finite(data.windowU, defaults.windowU),
    doorU: finite(data.doorU, defaults.doorU),
    thermalBridge: Math.max(0, finite(data.thermalBridge, defaults.thermalBridge)),
    ventilation: parseVentilation(data.ventilation),
    outside: finite(data.outside, defaults.outside),
    inside: finite(data.inside, defaults.inside),
    heating: parseHeating(data.heating),
    hotWater: parseHotWater(data.hotWater),
  };
}

/**
 * Reads the household. A file without it gets the default household. Its price of electricity is
 * the price of an electric heating, if the file has one.
 */
function parseHousehold(data: unknown, envelope: Envelope): Household {
  const defaults = defaultHousehold();
  const electric = HEATING_KINDS[envelope.heating.kind].energy === "electricity";
  const price = electric ? envelope.heating.price : defaults.price;
  if (!isObject(data)) return { ...defaults, price };
  return {
    electricity: Math.max(0, finite(data.electricity, defaults.electricity)),
    battery: Math.max(0, finite(data.battery, defaults.battery)),
    price: Math.max(0, finite(data.price, price)),
    feedIn: Math.max(0, finite(data.feedIn, defaults.feedIn)),
  };
}

/** Reads the rack of a PV field. A file without it, or a damaged rack, has no rack. */
function parseRack(data: unknown): PvRack | null {
  if (!isObject(data)) return null;
  const tilt = finite(data.tilt, NaN);
  const azimuth = finite(data.azimuth, NaN);
  if (!Number.isFinite(tilt) || !Number.isFinite(azimuth)) return null;
  return {
    tilt: Math.min(60, Math.max(0, tilt)),
    azimuth: ((azimuth % 360) + 360) % 360,
    eastWest: data.eastWest === true,
  };
}

/** Reads the hot water. A file without it gets the default hot water. */
function parseHotWater(data: unknown): HotWater {
  const defaults = defaultEnvelope().hotWater;
  if (!isObject(data)) return defaults;
  return {
    people: Math.max(0, finite(data.people, defaults.people)),
    liters: Math.max(0, finite(data.liters, defaults.liters)),
    heater: data.heater === "electric" ? "electric" : "heating",
  };
}

/** Reads the heating. A file without it, or with an unknown kind, gets the default heating. */
function parseHeating(data: unknown): HeatingSystem {
  if (
    !isObject(data) ||
    typeof data.kind !== "string" ||
    !Object.hasOwn(HEATING_KINDS, data.kind)
  ) {
    return defaultEnvelope().heating;
  }
  const defaults = defaultHeating(data.kind as HeatingKind);
  const efficiency = finite(data.efficiency, defaults.efficiency);
  const price = finite(data.price, defaults.price);
  const flow = finite(data.flow, null);
  // A heat pump of a file before the calculated performance keeps a factor that the user typed.
  const fixed =
    typeof data.fixedEfficiency === "boolean"
      ? data.fixedEfficiency
      : Math.abs(efficiency - defaults.efficiency) > 1e-9;
  return {
    kind: defaults.kind,
    efficiency: efficiency > 0 ? efficiency : defaults.efficiency,
    price: Math.max(0, price),
    source: data.source === "ground" ? "ground" : "air",
    flow: flow === null ? null : Math.min(80, Math.max(25, flow)),
    fixedEfficiency: fixed,
  };
}

/** Reads the ventilation. A file without it gets the default ventilation. */
function parseVentilation(data: unknown): Ventilation {
  const defaults = defaultEnvelope().ventilation;
  if (!isObject(data)) return defaults;
  return {
    airChange: Math.max(0, finite(data.airChange, defaults.airChange)),
    heatRecovery: Math.min(0.95, Math.max(0, finite(data.heatRecovery, defaults.heatRecovery))),
    n50: Math.max(0, finite(data.n50, defaults.n50)),
  };
}

/** Reads the economy. A file without it gets the default economy. */
function parseFinance(data: unknown): Finance {
  const defaults = defaultFinance();
  if (!isObject(data)) return defaults;
  return {
    region: data.region === "DE" ? "DE" : "AT",
    interest: Math.min(0.5, Math.max(-0.1, finite(data.interest, defaults.interest))),
    priceIncrease: Math.min(
      0.5,
      Math.max(-0.5, finite(data.priceIncrease, defaults.priceIncrease)),
    ),
  };
}

/** Reads the own prices of the items of a variant: names with numbers of 0 or more. */
function parseItemCosts(data: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  if (!isObject(data)) return result;
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) result[key] = value;
  }
  return result;
}

/** Reads the stories and the roofs of a building, or of the floor plan of a variant. */
function parseLayout(data: Data, prefix: string): Layout {
  const stories: Story[] = list(data, "stories").map((s, i) => {
    const where = `${prefix}story ${i}`;
    return {
      id: string(s, "id", where),
      name: string(s, "name", where),
      elevation: number(s, "elevation", where),
      height: number(s, "height", where),
      // A file before the unheated stories has only heated stories.
      heated: s.heated !== false,
      ...parsePlanData(s, `${where}, `),
    };
  });
  if (stories.length === 0) {
    throw new Error(`The file is damaged: ${prefix || "it has "}no story.`);
  }
  stories.sort((a, b) => a.elevation - b.elevation);

  const roofs: Roof[] = list(data, "roofs").map((r, i) => parseRoof(r, `${prefix}roof ${i}`));
  // Files before the roofs had one roof on the box around the walls of its story.
  if (data.roof != null) {
    if (!isObject(data.roof)) throw new Error('The file is damaged: invalid "roof".');
    const old = oldRoof(data.roof, stories);
    if (old) roofs.push(old);
  }
  for (const roof of roofs) {
    if (!stories.some((s) => s.id === roof.storyId)) {
      throw new Error(`The file is damaged: ${roof.name} refers to a story that does not exist.`);
    }
  }
  return { stories, roofs };
}

/** Reads the floor plan of one story. `prefix` names the story in the error messages. */
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
      layers: w.layers == null ? null : layers(w, "layers", where),
      height: number(w, "height", where),
      colors: {
        right: isObject(w.colors) && isColor(w.colors.right) ? w.colors.right : null,
        left: isObject(w.colors) && isColor(w.colors.left) ? w.colors.left : null,
      },
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
      style: o.style === "sliding" || o.style === "fixed" ? o.style : "hinged",
      leaves: o.leaves === 2 ? 2 : 1,
      hinge: o.hinge === "b" ? "b" : "a",
      swing: o.swing === -1 ? -1 : 1,
    } satisfies Opening;
    if (!wallIds.has(opening.wallId)) {
      throw new Error(`The file is damaged: ${where} refers to a wall that does not exist.`);
    }
    return opening;
  });

  const dimensions: Dimension[] = list(data, "dimensions").map((d, i) => {
    const where = `${prefix}dimension ${i}`;
    return {
      id: string(d, "id", where),
      a: pointOf(d.a, `${where}, point a`),
      b: pointOf(d.b, `${where}, point b`),
      offset: number(d, "offset", where),
    };
  });

  const stairs: Stair[] = list(data, "stairs").map((d, i) => {
    const where = `${prefix}stair ${i}`;
    return {
      id: string(d, "id", where),
      a: pointOf(d.a, `${where}, point a`),
      b: pointOf(d.b, `${where}, point b`),
      width: number(d, "width", where),
      kind: d.kind === "l" || d.kind === "u" ? d.kind : "straight",
      turn: d.turn === -1 ? -1 : 1,
      run2: finite(d.run2, 1),
    };
  });
  const rooms: RoomInfo[] = list(data, "rooms").map((d, i) => {
    const where = `${prefix}room ${i}`;
    return {
      id: string(d, "id", where),
      key: typeof d.key === "string" ? d.key : "",
      at: pointOf(d.at, where),
      name: typeof d.name === "string" ? d.name : "",
      floorHeating: d.floorHeating === true,
      temperature: finite(d.temperature, null),
      height: d.height == null ? null : number(d, "height", where),
      wallColor: isColor(d.wallColor) ? d.wallColor : null,
    };
  });
  const furniture: Furniture[] = list(data, "furniture").map((d, i) => {
    const where = `${prefix}furniture ${i}`;
    const source = d.source;
    if (!isObject(source)) throw new Error(`The file is damaged: ${where} has no valid "source".`);
    return {
      id: string(d, "id", where),
      source:
        source.kind === "model"
          ? { kind: "model", modelId: string(source, "modelId", where) }
          : { kind: "generic", type: string(source, "type", where) },
      name: typeof d.name === "string" ? d.name : "",
      x: number(d, "x", where),
      y: number(d, "y", where),
      rotation: number(d, "rotation", where),
      width: number(d, "width", where),
      depth: number(d, "depth", where),
      height: number(d, "height", where),
      elevation: finite(d.elevation, 0),
    };
  });
  const fixtures: Fixture[] = list(data, "fixtures").map((d, i) => {
    const where = `${prefix}device ${i}`;
    return {
      id: string(d, "id", where),
      system: serviceSystem(
        d.system,
        FIXTURE_TYPES.find((t) => t.type === d.type),
      ),
      type: string(d, "type", where),
      x: number(d, "x", where),
      y: number(d, "y", where),
      rotation: number(d, "rotation", where),
      elevation: number(d, "elevation", where),
      width: number(d, "width", where),
      power: d.power == null ? null : number(d, "power", where),
      label: typeof d.label === "string" ? d.label : "",
    };
  });
  const fixtureIds = new Set(fixtures.map((f) => f.id));
  const runs: Run[] = list(data, "runs").map((d, i) => {
    const where = `${prefix}line ${i}`;
    if (!Array.isArray(d.points)) throw new Error(`The file is damaged: ${where} has no points.`);
    const link = (key: string) =>
      typeof d[key] === "string" && fixtureIds.has(d[key] as string) ? (d[key] as string) : null;
    return {
      id: string(d, "id", where),
      system: serviceSystem(
        d.system,
        RUN_KINDS.find((k) => k.kind === d.kind),
      ),
      kind: string(d, "kind", where),
      points: d.points.map((p, j) => pointOf(p, `${where}, point ${j}`)),
      elevation: number(d, "elevation", where),
      from: link("from"),
      to: link("to"),
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

  // The notes of the objects: each list keeps the order of the file, so the index finds them.
  const notes = <T extends { note?: Note }>(key: string, parsed: T[]) =>
    list(data, key).forEach((raw, i) => {
      const note = parseNote(raw.note);
      if (note && parsed[i]) parsed[i].note = note;
    });
  notes("walls", walls);
  notes("openings", openings);
  notes("stairs", stairs);
  notes("chimneys", chimneys);
  notes("rooms", rooms);
  notes("furniture", furniture);
  notes("fixtures", fixtures);
  notes("runs", runs);
  // The circuits of the devices and of the lines of electricity.
  const circuits = (key: string, parsed: { circuit?: string }[]) =>
    list(data, key).forEach((raw, i) => {
      if (typeof raw.circuit === "string" && raw.circuit.trim() && parsed[i]) {
        parsed[i].circuit = raw.circuit.trim();
      }
    });
  circuits("fixtures", fixtures);
  circuits("runs", runs);

  const plan: Plan = {
    vertices,
    walls,
    openings,
    dimensions,
    stairs,
    chimneys,
    rooms,
    furniture,
    fixtures,
    runs,
    background,
  };
  // A window of an old file has no style. It gets hinged leaves that open into the room, like
  // most windows: two leaves if it is wider than WIDE_WINDOW.
  const oldWindows = list(data, "openings")
    .map((raw, i) =>
      raw.style === undefined && openings[i]?.kind === "window" ? openings[i] : null,
    )
    .filter((o): o is Opening => o !== null);
  if (oldWindows.length > 0) {
    const found = findRooms(plan);
    for (const o of oldWindows) {
      o.swing = roomSide(plan, o, found) ?? o.swing;
      if (o.width > WIDE_WINDOW) o.leaves = 2;
    }
  }
  return plan;
}

/** Reads a note. A note without a text and without photos is no note. */
function parseNote(data: unknown): Note | undefined {
  if (!isObject(data)) return undefined;
  const text = typeof data.text === "string" ? data.text : "";
  const photos = Array.isArray(data.photos)
    ? data.photos.filter((p): p is string => typeof p === "string" && p.startsWith("data:image/"))
    : [];
  return text.trim() || photos.length > 0 ? { text, photos } : undefined;
}
