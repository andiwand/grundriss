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

export interface Plan {
  vertices: Vertex[];
  walls: Wall[];
  openings: Opening[];
  background: Background | null;
}
