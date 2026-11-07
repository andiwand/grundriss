// The document model of a floor plan. All lengths are in meters. The plan uses screen axes:
// x points to the right and y points down. The 3D view maps the plan y to the world z.

export type Id = string;

export interface Point {
  x: number;
  y: number;
}

/** A corner: the point where walls meet. */
export interface Vertex extends Point {
  id: Id;
}

/** A straight wall between two vertices. The vertices are on the center line of the wall. */
export interface Wall {
  id: Id;
  a: Id;
  b: Id;
  thickness: number;
  height: number;
  /**
   * The layers of the wall from the inside to the outside, for the insulation. Null means the
   * layers of an outer wall of the building (`Envelope.wall`). Only outer walls lose heat.
   */
  layers: Layer[] | null;
}

export type OpeningKind = "door" | "window";

/** The end of a door where the hinge is: the end nearer to the vertex `a` or `b` of the wall. */
export type Hinge = "a" | "b";

/**
 * The side of the wall to which a door opens. 1 is the side of `perpendicular(b - a)`, which is
 * the right side when you look from `a` to `b`. -1 is the other side.
 */
export type Swing = 1 | -1;

/**
 * A door or a window in a wall. The opening belongs to the wall, so it moves with the wall.
 * The offset is the distance from the vertex `a` of the wall to the center of the opening.
 */
export interface Opening {
  id: Id;
  wallId: Id;
  kind: OpeningKind;
  offset: number;
  width: number;
  height: number;
  sill: number;
  /** Only for a door. */
  hinge: Hinge;
  /** Only for a door. */
  swing: Swing;
}

/**
 * A dimension line that the user puts on the plan. It measures the distance from `a` to `b`. The
 * line is at the distance `offset` from the points, on the side of `perpendicular(b - a)`.
 */
export interface Dimension {
  id: Id;
  a: Point;
  b: Point;
  offset: number;
}

/** The scanned or photographed plan under the drawing. */
export interface Background {
  /** The image as a data URL, so that the file contains everything. */
  image: string;
  /** The size of the image in pixels. */
  width: number;
  height: number;
  /** The position of the top left corner of the image in meters. */
  x: number;
  y: number;
  /** Meters per pixel. */
  scale: number;
  opacity: number;
}

/** A reference to one object of the plan, for example in a selection. */
export type ItemKind =
  | "vertex"
  | "wall"
  | "opening"
  | "dimension"
  | "stair"
  | "chimney"
  | "room"
  | "furniture"
  | "fixture"
  | "run"
  /** A roof of the building, and a corner of its outline: the id is "<roof id>:<index>". */
  | "roof"
  | "roof-corner";
export interface Item {
  kind: ItemKind;
  id: Id;
}

/** A copy of some objects of a plan, for copy and paste. */
export interface Clip {
  vertices: Vertex[];
  walls: Wall[];
  openings: Opening[];
  dimensions: Dimension[];
  stairs: Stair[];
  chimneys: Chimney[];
  furniture: Furniture[];
  fixtures: Fixture[];
  runs: Run[];
}

export type StairKind = "straight" | "l" | "u";

/**
 * A stair from its story up to the next story. The first flight goes from `a` to `b` on the
 * center line, and `width` goes across. A straight stair has only this flight.
 *
 * An L stair and a U stair have a landing after `b` and a second flight of the length `run2`.
 * The stair turns to the side `turn`: 1 is the side of `perpendicular(b - a)`, -1 is the other
 * side. The second flight of an L stair goes to that side. The second flight of a U stair goes
 * back, next to the first flight.
 */
export interface Stair {
  id: Id;
  a: Point;
  b: Point;
  width: number;
  kind: StairKind;
  turn: 1 | -1;
  run2: number;
}

/**
 * The data that the user gives to a room. Rooms come from the walls, so the data must find its
 * room again after each change. The room with the vertices `key` gets the data. If no room has
 * these vertices, for example after a wall splits the room, the room that contains `at` gets it.
 */
export interface RoomInfo {
  id: Id;
  key: string;
  at: Point;
  name: string;
  /** The clear height of the room. Null means the height of the story. */
  height: number | null;
  /** True if the room has floor heating. */
  floorHeating: boolean;
  /** The inside temperature in °C. Null means the inside temperature of the building. */
  temperature: number | null;
}

// ----- Building services -----

export type ServiceSystem = "electric" | "heating";

/**
 * A device of a building service on a story: a socket, a switch, a light, a radiator, or a heat
 * source. The types are in `src/model/services.ts`. The point (x, y) is its center on the plan.
 * A device on a wall has its back to the wall, like furniture: the local -y side.
 */
export interface Fixture {
  id: Id;
  system: ServiceSystem;
  type: string;
  x: number;
  y: number;
  /** Clockwise on the plan, in degrees. */
  rotation: number;
  /** The height of its center above the floor. */
  elevation: number;
  /** The width along the wall, for example of a radiator. */
  width: number;
  /** The power in watts: the heat output of a radiator or a heat source, or null. */
  power: number | null;
  label: string;
}

/**
 * A line of a building service on a story: a cable, or a pipe of a heating. The points are on
 * the plan. `kind` is a kind of `src/model/services.ts`, for example "cable" or "flow".
 */
export interface Run {
  id: Id;
  system: ServiceSystem;
  kind: string;
  points: Point[];
  /** The height of the line above the floor, for the 3D view and the length. */
  elevation: number;
  /** The ids of the fixtures at the start and the end, if the line connects to them. */
  from: Id | null;
  to: Id | null;
}

/** A layer of a construction: a material of `src/model/insulation.ts` and its thickness. */
export interface Layer {
  material: string;
  thickness: number;
}

/**
 * The thermal envelope of the building: the default layers of the outer walls, the roof, and the
 * lowest floor, the U-values of windows and doors, and the design temperatures.
 */
export interface Envelope {
  wall: Layer[];
  roof: Layer[];
  floor: Layer[];
  /** U-values in W/(m²K). */
  windowU: number;
  doorU: number;
  /** The design temperature outside and the usual temperature inside, in °C. */
  outside: number;
  inside: number;
}

/**
 * A field of photovoltaic panels on a face of a roof. The field fills the face with as many
 * panels as fit inside the margin, in rows and columns. `face` is the index of the face in
 * `roofGeometry(...).faces` of the roof `roofId`.
 */
export interface PvArray {
  id: Id;
  roofId: Id;
  face: number;
  /** The size of one panel in meters, and its peak power in watts. */
  panelWidth: number;
  panelHeight: number;
  panelPower: number;
  /** True if the long side of the panels goes up the slope. */
  portrait: boolean;
  /** The free distance to the edges of the face, and between the panels. */
  margin: number;
  gap: number;
  /** The most panels to use, or null for as many as fit. */
  limit: number | null;
}

/**
 * A chimney with a rectangular section. It starts on the floor of its story and goes up through
 * the stories above. `top` is the height of its top above the ground (elevation 0). Null means
 * 0.8 m above the highest point of the roof, or above the top story if there is no roof.
 */
export interface Chimney {
  id: Id;
  x: number;
  y: number;
  width: number;
  depth: number;
  top: number | null;
}

/**
 * The source of a piece of furniture: a generic shape that the app makes, or a 3D model of the
 * building (see `Model`).
 */
export type FurnitureSource = { kind: "generic"; type: string } | { kind: "model"; modelId: Id };

/**
 * A piece of furniture on a story. The point (x, y) is the center of its box on the plan. The
 * box has the width along the local x axis and the depth along the local y axis. The back of the
 * piece is at the local -y side, so a piece at a wall has its back to the wall. `rotation` turns
 * the piece clockwise on the plan, in degrees. `elevation` lifts it above the floor, for example
 * for a wall cabinet.
 */
export interface Furniture {
  id: Id;
  source: FurnitureSource;
  name: string;
  x: number;
  y: number;
  rotation: number;
  width: number;
  depth: number;
  height: number;
  elevation: number;
}

/**
 * A 3D model that furniture can use. A model from the bundled Kenney kit has a `ref` (its file)
 * and no data, because the app has the file. An imported model and a model from Poly Haven have
 * their GLB file as a data URL, so the plan file contains everything.
 */
export interface Model {
  id: Id;
  name: string;
  origin: "import" | "kenney" | "polyhaven";
  /** The file name in the Kenney kit, or the asset id at Poly Haven. */
  ref: string;
  /** The GLB file as a data URL, or null for a bundled model. */
  data: string | null;
  /** The size of the model in meters: x across, y deep, z up. */
  size: { x: number; y: number; z: number };
  license: string;
  /** The author or the source, for the credits. */
  credit: string;
}

/** The floor plan of one story. The functions in plan.ts change it. */
export interface Plan {
  vertices: Vertex[];
  walls: Wall[];
  openings: Opening[];
  dimensions: Dimension[];
  stairs: Stair[];
  chimneys: Chimney[];
  rooms: RoomInfo[];
  furniture: Furniture[];
  fixtures: Fixture[];
  runs: Run[];
  background: Background | null;
}

/**
 * A story: a floor plan at an elevation. A cellar has a negative elevation. An attic is a story
 * under the roof, with low knee walls.
 */
export interface Story extends Plan {
  id: Id;
  name: string;
  /** The height of the floor above the ground, in meters. */
  elevation: number;
  /** The height from this floor to the floor of the next story, in meters. */
  height: number;
}

/** The presets of a new roof. `presetSides` in roofshape.ts makes the sides from them. */
export type RoofKind = "gable" | "hip" | "flat" | "shed";

/**
 * One side of a roof outline: from point i to point i + 1. An eave side has a roof face that
 * rises inward with the pitch. A gable side has a vertical wall up to the roof faces of the
 * other sides, like the end of a gable roof or the high side of a shed roof.
 */
export interface RoofSide {
  kind: "eave" | "gable";
  /** The slope in degrees. A gable side ignores it. */
  pitch: number;
  /** The horizontal distance from the outline to the edge of the roof, outward. */
  overhang: number;
}

/**
 * A dormer on the face of the eave side `side`. `offset` is the distance of its center from the
 * start of the side, along the side. `distance` is the horizontal distance from the outline to
 * the front wall of the dormer. The front wall is `width` wide and `height` high. The dormer has
 * its own small roof of the kind `kind` with the pitch `pitch`, and it reaches back into the main
 * roof until its roof meets the main roof.
 */
export interface Dormer {
  id: Id;
  side: number;
  offset: number;
  distance: number;
  width: number;
  height: number;
  kind: "gable" | "shed" | "flat";
  pitch: number;
}

/** A window in the face of the eave side `side`, flat in the face. `length` goes up the slope. */
export interface RoofWindow {
  id: Id;
  side: number;
  offset: number;
  distance: number;
  width: number;
  length: number;
}

/**
 * A roof on a story. Its outline is a polygon on the plan at the wall line, without the overhang.
 * Each side of the outline has its own settings (see `RoofSide`), so one type covers gable, hip,
 * shed, and mixed roofs on any outline. `src/model/roofshape.ts` makes the faces.
 */
export interface Roof {
  id: Id;
  name: string;
  storyId: Id;
  outline: Point[];
  /** One for each side of the outline: from outline[i] to outline[i + 1]. */
  sides: RoofSide[];
  /**
   * The height of the eaves above the ground. Null means the top of the walls of the story, or
   * the floor of the story above if that is higher (`roofBase` in roof.ts).
   */
  base: number | null;
  /** A flat roof: a slab. It ignores the kind and the pitch of the sides. */
  flat: boolean;
  dormers: Dormer[];
  windows: RoofWindow[];
}

/**
 * The place of the building. The latitude and the longitude are in degrees, with north and east
 * positive. The point (x, y) of the plan is at this place, so that a map can lie under the plan.
 * The map turns with `Building.north`.
 */
export interface Location {
  name: string;
  latitude: number;
  longitude: number;
  x: number;
  y: number;
}

/**
 * The climate of the location: a typical year of hourly values that the app downloads once.
 * `src/model/climate.ts` encodes and decodes the series and calculates from them.
 */
export interface Climate {
  /** The name of the data source, for example "Open-Meteo historical weather API". */
  source: string;
  /** The point of the data. The sun positions use it too. */
  latitude: number;
  longitude: number;
  /** The first and the last year of the data. The typical year is the mean of these years. */
  firstYear: number;
  lastYear: number;
  /** The date of the download, "YYYY-MM-DD". */
  downloaded: string;
  /** The heating degree days G20/15 per year (K·d), the mean of the years. */
  degreeDays: number;
  /** The lowest mean of 48 hours in a row in the years, in °C. */
  designTemperature: number;
  /**
   * The hourly series of 8760 hours from 1 January 00:00 UTC, encoded (see `encodeSeries`).
   * Global horizontal, direct normal, and diffuse horizontal irradiance in W/m², and the air
   * temperature in °C. Each value is the mean of the hour that ends at its time.
   */
  ghi: string;
  dni: string;
  dhi: string;
  temperature: string;
}

/** The whole document: the stories from the bottom to the top, the roofs, and the orientation. */
export interface Building {
  stories: Story[];
  roofs: Roof[];
  /** The direction of north in degrees, clockwise from the top of the plan (the -y axis). */
  north: number;
  /** The 3D models that the furniture of all stories uses. */
  models: Model[];
  envelope: Envelope;
  pv: PvArray[];
  /** The place of the building, or null. */
  location: Location | null;
  /** The stored climate of the location, or null. Without it, pv.ts uses a general estimate. */
  climate: Climate | null;
}
