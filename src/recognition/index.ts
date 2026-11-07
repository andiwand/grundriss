// Automatic recognition of a floor plan: the model gives the class of each pixel, OpenCV finds
// the walls in the wall pixels, and the door and window pixels become openings on these walls.
// All results are in the pixels of the source image.

import { loadOpenCV } from "../tracing/opencv";
import { suggestWallsInGray, type WallSegment } from "../tracing/trace";
import { CLASSES } from "./contract";
import { findOpenings, withoutEdgeLines, type RecognizedOpening } from "./openings";
import { segmentPlan, type ImageSource, type Segmentation } from "./segment";

export type { RecognizedOpening } from "./openings";
export type { Segmentation } from "./segment";

const WALL = CLASSES.indexOf("wall");
const DOOR = CLASSES.indexOf("door");
const WINDOW = CLASSES.indexOf("window");

export interface Recognition {
  walls: WallSegment[];
  openings: RecognizedOpening[];
  /** The class map, for example to show it over the plan. */
  segmentation: Segmentation;
}

/**
 * Recognizes the walls, the doors, and the windows of a plan image. `onProgress` gets the number
 * of the tiles of the model that are done and the number of all tiles.
 */
export async function recognize(
  image: ImageSource,
  onProgress?: (done: number, total: number) => void,
): Promise<Recognition> {
  const segmentation = await segmentPlan(image, onProgress);
  const { width, height, classes, scale } = segmentation;

  // The mask of the walls includes the doors and the windows, so that a wall stays one line
  // through its openings. Ink is black (0) on white paper (255), as in a scan.
  const mask = new Uint8Array(width * height);
  for (let p = 0; p < mask.length; p++) {
    const c = classes[p];
    mask[p] = c === WALL || c === DOOR || c === WINDOW ? 0 : 255;
  }

  const cv = await loadOpenCV();
  const gray = cv.matFromArray(height, width, cv.CV_8UC1, mask);
  let walls: WallSegment[];
  try {
    // `scale` is the number of pixels of the class map for one pixel of the source, so the
    // walls come back in the pixels of the source.
    walls = suggestWallsInGray(cv, gray, scale, { mask: true });
  } finally {
    gray.delete();
  }
  walls = withoutEdgeLines(walls, width / scale, height / scale);

  // The openings need the walls in the pixels of the class map.
  const inMap = walls.map((w) => ({
    a: { x: w.a.x * scale, y: w.a.y * scale },
    b: { x: w.b.x * scale, y: w.b.y * scale },
    thickness: w.thickness * scale,
  }));
  const minArea = Math.max(12, Math.round((width * height) / 200_000));
  const openings = findOpenings(classes, width, height, inMap, {
    door: DOOR,
    window: WINDOW,
    minArea,
  }).map((o) => ({
    ...o,
    center: { x: o.center.x / scale, y: o.center.y / scale },
    width: o.width / scale,
  }));
  return { walls, openings, segmentation };
}
