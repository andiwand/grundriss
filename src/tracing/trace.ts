// Assisted tracing with OpenCV: perspective correction of a photo, clean-up of a scan, and wall
// suggestions. The functions run in the browser, because they use a canvas. They block the main
// thread for some hundred milliseconds on a large image.
//
// All points and lengths are in the pixels of the input image.

import type { Mat } from "@techstark/opencv-js";
import type { Point } from "../model/types";
import { loadOpenCV, type CV } from "./opencv";
import { joinCorners, mergeSegments, orderCorners, type WallSegment } from "./segments";

export type { WallSegment } from "./segments";

export type ImageSource = HTMLImageElement | ImageBitmap | HTMLCanvasElement;

/** A new image for the background. */
export interface TracedImage {
  dataUrl: string;
  width: number;
  height: number;
}

/** The largest side in pixels of the output of `rectify` and `cleanUp`. */
const MAX_OUTPUT_SIDE = 4096;
/** A photo with more pixels than this becomes a JPEG with quality 0.92, else a PNG. */
const JPEG_LIMIT = 1_000_000;

interface Deletable {
  delete(): void;
}

/** Runs `work` and then deletes all the Mats that it registered with `track`. */
async function withMats<T>(
  work: (cv: CV, track: <M extends Deletable>(mat: M) => M) => T,
): Promise<T> {
  const cv = await loadOpenCV();
  const mats: Deletable[] = [];
  try {
    return work(cv, (mat) => {
      mats.push(mat);
      return mat;
    });
  } finally {
    for (const mat of mats) mat.delete();
  }
}

function sourceSize(source: ImageSource): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

/**
 * Reads the image into an RGBA Mat. The long side gets at most `maxSide` pixels. `factor` is the
 * size of a pixel of the Mat divided by the size of a pixel of the source.
 */
function readRgba(cv: CV, source: ImageSource, maxSide: number): { mat: Mat; factor: number } {
  const { width, height } = sourceSize(source);
  if (width === 0 || height === 0) throw new Error("The image is empty.");
  const factor = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * factor));
  canvas.height = Math.max(1, Math.round(height * factor));
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  return { mat: cv.matFromImageData(data), factor: canvas.width / width };
}

function readGray(
  cv: CV,
  source: ImageSource,
  maxSide: number,
  track: <M extends Deletable>(mat: M) => M,
): { gray: Mat; factor: number } {
  const { mat, factor } = readRgba(cv, source, maxSide);
  track(mat);
  const gray = track(new cv.Mat());
  cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
  return { gray, factor };
}

function encode(cv: CV, mat: Mat, photo: boolean): TracedImage {
  const canvas = document.createElement("canvas");
  cv.imshow(canvas, mat);
  const jpeg = photo && mat.cols * mat.rows > JPEG_LIMIT;
  return {
    dataUrl: jpeg ? canvas.toDataURL("image/jpeg", 0.92) : canvas.toDataURL("image/png"),
    width: mat.cols,
    height: mat.rows,
  };
}

const odd = (n: number) => Math.max(3, Math.round(n) | 1);

/**
 * Removes uneven light from a gray image. The dilation removes the dark lines, so the result is
 * the light of the paper. The division by that light makes the paper an even white.
 */
function flatten(cv: CV, gray: Mat, track: <M extends Deletable>(mat: M) => M): Mat {
  const size = odd(Math.max(gray.cols, gray.rows) / 30);
  const kernel = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(size, size)));
  const light = track(new cv.Mat());
  cv.dilate(gray, light, kernel);
  cv.GaussianBlur(light, light, new cv.Size(size, size), 0);
  const flat = track(new cv.Mat());
  cv.divide(gray, light, flat, 255);
  return flat;
}

/** Makes a binary image: 255 for ink, 0 for paper. */
function binarize(cv: CV, gray: Mat, track: <M extends Deletable>(mat: M) => M): Mat {
  const flat = flatten(cv, gray, track);
  cv.GaussianBlur(flat, flat, new cv.Size(3, 3), 0);
  const ink = track(new cv.Mat());
  cv.threshold(flat, ink, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
  return ink;
}

/**
 * Corrects the perspective of a photo of a plan. The corners are the four corners of the plan
 * (or of the paper) in the pixels of the image, in any order. The output is a straight image. Its
 * size comes from the lengths of the edges, so its pixels have about the same size as before.
 */
export function rectify(
  image: ImageSource,
  corners: [Point, Point, Point, Point],
): Promise<TracedImage> {
  return withMats((cv, track) => {
    const { mat: rgba, factor } = readRgba(cv, image, MAX_OUTPUT_SIDE);
    track(rgba);
    const [tl, tr, br, bl] = orderCorners(corners).map((p) => ({
      x: p.x * factor,
      y: p.y * factor,
    }));
    const edge = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);
    let width = Math.max(edge(tl, tr), edge(bl, br));
    let height = Math.max(edge(tl, bl), edge(tr, br));
    if (width < 2 || height < 2) throw new Error("The four corners are too near to each other.");
    const shrink = Math.min(1, MAX_OUTPUT_SIDE / Math.max(width, height));
    width = Math.round(width * shrink);
    height = Math.round(height * shrink);

    const from = track(
      cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]),
    );
    const to = track(
      cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width, 0, width, height, 0, height]),
    );
    const transform = track(cv.getPerspectiveTransform(from, to));
    const output = track(new cv.Mat());
    cv.warpPerspective(
      rgba,
      output,
      transform,
      new cv.Size(width, height),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(255, 255, 255, 255),
    );
    return encode(cv, output, true);
  });
}

export interface CleanUpOptions {
  /** From 0 to 1. A larger value removes larger specks, and at 1 also small text. */
  strength: number;
}

/**
 * Makes a clean black on white image from a scan or a photo: it removes uneven light, noise, and
 * small specks. The output has the same aspect ratio. Its long side has at most 4096 pixels.
 */
export function cleanUp(image: ImageSource, options: CleanUpOptions): Promise<TracedImage> {
  return withMats((cv, track) => {
    const strength = Math.min(1, Math.max(0, options.strength));
    const { gray } = readGray(cv, image, MAX_OUTPUT_SIDE, track);
    const ink = binarize(cv, gray, track);

    // Remove each group of ink pixels that is smaller than the minimum area.
    const minArea = Math.round(4 + strength * 0.00005 * gray.cols * gray.rows);
    const labels = track(new cv.Mat());
    const stats = track(new cv.Mat());
    const centroids = track(new cv.Mat());
    const count = cv.connectedComponentsWithStats(ink, labels, stats, centroids, 8, cv.CV_32S);
    const keep = new Uint8Array(count);
    for (let i = 1; i < count; i++) {
      keep[i] = stats.data32S[i * 5 + cv.CC_STAT_AREA] >= minArea ? 1 : 0;
    }
    const output = track(new cv.Mat(gray.rows, gray.cols, cv.CV_8UC1));
    const label = labels.data32S;
    const out = output.data;
    for (let i = 0; i < out.length; i++) out[i] = keep[label[i]] ? 0 : 255;
    return encode(cv, output, false);
  });
}

export interface SuggestOptions {
  /** The long side of the image in the analysis. A larger value is slower and finds more. */
  maxSide?: number;
  /** The shortest wall, as a part of the long side of the image. */
  minLength?: number;
  /** The thickness of the walls in pixels of the input image. Without it, the function finds it. */
  thickness?: number;
  /**
   * True if the image is a clean mask of the walls, for example from the recognition network.
   * Then the function keeps thin walls: it does not remove the lines that are thinner than the
   * usual wall, and the shortest wall does not depend on the thickness.
   */
  mask?: boolean;
}

/**
 * Estimates the thickness of the walls from the distance transform of the ink. The centers of
 * lines are the local maxima of the transform, and their values are half the thickness. Thin
 * lines and text have small values. The result is the median of the larger values, with the
 * value as a weight, because a thick line has more ink.
 */
function estimateThickness(
  cv: CV,
  ink: Mat,
  track: <M extends Deletable>(mat: M) => M,
  quantile = 0.5,
): number {
  const dist = track(new cv.Mat());
  cv.distanceTransform(ink, dist, cv.DIST_L2, 3);
  const d = dist.data32F;
  const w = dist.cols;
  const h = dist.rows;
  const values: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = d[i];
      if (v < 2) continue;
      if (v >= d[i - 1] && v >= d[i + 1] && v >= d[i - w] && v >= d[i + w]) values.push(v);
    }
  }
  if (values.length === 0) return 4;
  values.sort((p, q) => p - q);
  const total = values.reduce((sum, v) => sum + v, 0);
  let sum = 0;
  for (const v of values) {
    sum += v;
    if (sum >= total * quantile) return 2 * v;
  }
  return 2 * values[values.length - 1];
}

/** The wall segments in a mask with only horizontal (or only vertical) bars. */
function barSegments(
  cv: CV,
  mask: Mat,
  vertical: boolean,
  minLength: number,
  thickness: number,
  track: <M extends Deletable>(mat: M) => M,
): WallSegment[] {
  const labels = track(new cv.Mat());
  const stats = track(new cv.Mat());
  const centroids = track(new cv.Mat());
  const count = cv.connectedComponentsWithStats(mask, labels, stats, centroids, 8, cv.CV_32S);
  const s = stats.data32S;
  const c = centroids.data64F;
  const result: WallSegment[] = [];
  // The centroid is in pixel indices. The center of pixel i is at i + 0.5, and the box goes from
  // the edge of its first pixel to the edge of its last pixel.
  for (let i = 1; i < count; i++) {
    const left = s[i * 5 + cv.CC_STAT_LEFT];
    const top = s[i * 5 + cv.CC_STAT_TOP];
    const width = s[i * 5 + cv.CC_STAT_WIDTH];
    const height = s[i * 5 + cv.CC_STAT_HEIGHT];
    const area = s[i * 5 + cv.CC_STAT_AREA];
    const length = vertical ? height : width;
    if (length < minLength) continue;
    const across = area / length;
    // A large filled area is not a wall.
    if (across > 2.5 * thickness) continue;
    if (vertical) {
      const x = c[i * 2] + 0.5;
      result.push({ a: { x, y: top }, b: { x, y: top + height }, thickness: across });
    } else {
      const y = c[i * 2 + 1] + 0.5;
      result.push({ a: { x: left, y }, b: { x: left + width, y }, thickness: across });
    }
  }
  return result;
}

/**
 * Suggests walls in a plan image. Walls are thick dark lines: an opening removes the thin lines
 * and the text, long horizontal and vertical kernels find the straight walls, and a Hough
 * transform finds the walls at other angles. The result is a joined wall graph in the pixels of
 * the input image. A door gap stays a gap.
 */
export function suggestWalls(
  image: ImageSource,
  options: SuggestOptions = {},
): Promise<WallSegment[]> {
  return withMats((cv, track) => {
    const { gray, factor } = readGray(cv, image, options.maxSide ?? 2000, track);
    return suggestWallsInGray(cv, gray, factor, options);
  });
}

/**
 * The work of `suggestWalls` on a gray Mat. It does not need a DOM, so a test can run it in Node.
 * `factor` is the size of a pixel of `gray` divided by the size of a pixel of the input image.
 * The function does not delete `gray`.
 */
export function suggestWallsInGray(
  cv: CV,
  gray: Mat,
  factor: number,
  options: SuggestOptions = {},
): WallSegment[] {
  const mats: Deletable[] = [];
  const track = <M extends Deletable>(mat: M): M => {
    mats.push(mat);
    return mat;
  };
  try {
    const ink = binarize(cv, gray, track);
    const longSide = Math.max(gray.cols, gray.rows);
    // A mask has thin inner walls and thick outer walls. A high quantile gives the thickness of
    // the thickest walls, so that the check of the width below keeps all of them.
    const thickness = options.thickness
      ? options.thickness * factor
      : estimateThickness(cv, ink, track, options.mask ? 0.95 : 0.5);
    const shortest = (options.minLength ?? 0.02) * longSide;
    // A wall must be longer than the thickest wall. Else a thick wall gives a short bar across.
    const minLength = options.mask
      ? Math.max(shortest, 1.2 * thickness)
      : Math.max(shortest, 3 * thickness);

    // 1. Keep only the lines that are about as thick as the walls. A clean mask has no thin
    // lines of text or furniture, so its thin inner walls stay.
    const walls = track(new cv.Mat());
    if (options.mask) {
      ink.copyTo(walls);
    } else {
      const size = odd(thickness * 0.6);
      const square = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(size, size)));
      cv.morphologyEx(ink, walls, cv.MORPH_OPEN, square);
    }

    // 2. The horizontal and the vertical walls. The kernel length is odd, because an opening with
    // an even kernel moves the result by one pixel.
    const long = odd(minLength);
    const horizontal = track(new cv.Mat());
    const vertical = track(new cv.Mat());
    const hKernel = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(long, 1)));
    const vKernel = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, long)));
    cv.morphologyEx(walls, horizontal, cv.MORPH_OPEN, hKernel);
    cv.morphologyEx(walls, vertical, cv.MORPH_OPEN, vKernel);
    const segments = [
      ...barSegments(cv, horizontal, false, minLength, thickness, track),
      ...barSegments(cv, vertical, true, minLength, thickness, track),
    ];

    // 3. The walls at other angles: the rest of the wall mask, without the straight walls.
    const straight = track(new cv.Mat());
    cv.bitwise_or(horizontal, vertical, straight);
    const grow = odd(thickness * 1.5);
    const growKernel = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(grow, grow)));
    cv.dilate(straight, straight, growKernel);
    const rest = track(new cv.Mat());
    cv.subtract(walls, straight, rest);
    const lines = track(new cv.Mat());
    const votes = Math.max(1, Math.round(minLength / 2));
    cv.HoughLinesP(rest, lines, 1, Math.PI / 180, votes, minLength, thickness);
    const l = lines.data32S;
    const axisTolerance = (5 * Math.PI) / 180;
    for (let i = 0; i < Math.min(lines.rows, 5000); i++) {
      // The ends are pixel indices, so the centers of the pixels are 0.5 further.
      const [x1, y1, x2, y2] = [0, 1, 2, 3].map((k) => l[i * 4 + k] + 0.5);
      const angle = Math.abs(Math.atan2(y2 - y1, x2 - x1)) % (Math.PI / 2);
      if (angle < axisTolerance || angle > Math.PI / 2 - axisTolerance) continue;
      segments.push({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, thickness });
    }

    // 4. Back to the pixels of the input image, then merge and join.
    const back = (p: Point): Point => ({ x: p.x / factor, y: p.y / factor });
    const t = thickness / factor;
    const scaled = segments.map((s) => ({
      a: back(s.a),
      b: back(s.b),
      thickness: s.thickness / factor,
    }));
    const merged = mergeSegments(scaled, {
      angleTolerance: (2 * Math.PI) / 180,
      distance: 0.75 * t,
      gap: 2 * t,
      minLength: minLength / factor,
    });
    // The rest mask of step 3 loses about 1.75 thicknesses near the straight walls, so the
    // tolerance of the join must be larger than that.
    return joinCorners(merged, 2.5 * t);
  } finally {
    for (const mat of mats) mat.delete();
  }
}
