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
export type ItemKind = "vertex" | "wall" | "opening" | "dimension" | "stair" | "chimney" | "room";
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

/** The floor plan of one story. The functions in plan.ts change it. */
export interface Plan {
  vertices: Vertex[];
  walls: Wall[];
  openings: Opening[];
  dimensions: Dimension[];
  stairs: Stair[];
  chimneys: Chimney[];
  rooms: RoomInfo[];
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

export type RoofKind = "gable" | "hip" | "flat" | "shed";

/**
 * The roof. It covers the box around the walls of its story, plus the overhang. Its eaves are
 * at the top of that story: `elevation + height`.
 */
export interface Roof {
  kind: RoofKind;
  storyId: Id;
  /** The slope in degrees. A flat roof ignores it. */
  pitch: number;
  overhang: number;
  /**
   * The direction of the ridge: along the x axis or the y axis of the plan. A shed roof rises
   * across this direction.
   */
  ridge: "x" | "y";
}

/** The whole document: the stories from the bottom to the top, the roof, and the orientation. */
export interface Building {
  stories: Story[];
  roof: Roof | null;
  /** The direction of north in degrees, clockwise from the top of the plan (the -y axis). */
  north: number;
}
