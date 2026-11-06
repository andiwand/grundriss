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
export type ItemKind = "vertex" | "wall" | "opening" | "dimension";
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
}

export interface Plan {
  vertices: Vertex[];
  walls: Wall[];
  openings: Opening[];
  dimensions: Dimension[];
  background: Background | null;
}
