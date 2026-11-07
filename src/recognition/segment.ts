// The segmentation of a floor plan: the class of each pixel, with the model of the contract.
//
// The function scales the image so that its long side is LONG_SIDE pixels, because the model
// learned plans at that scale. It runs the model on overlapping tiles and blends the scores, so
// that the size of the image has no limit and the edges of the tiles leave no seams.

import { CLASSES, INPUT_NAME, LONG_SIDE, OUTPUT_NAME, OVERLAP, TILE } from "./contract";
import { loadModel } from "./runtime";
import { argmax, blendTile, padTo32, tileStarts } from "./tiles";

export type ImageSource = HTMLImageElement | ImageBitmap | HTMLCanvasElement;

export interface Segmentation {
  /** The size of the class map in pixels: the image scaled to LONG_SIDE, without the padding. */
  width: number;
  height: number;
  /** The index in CLASSES of each pixel, row by row. */
  classes: Uint8Array;
  /** Pixels of the class map for one pixel of the source image. */
  scale: number;
}

function sourceSize(source: ImageSource): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

/**
 * Reads the image as gray values at the scale of the contract: 1 is white and 0 is black. The
 * array has the padded size, and the padding is white paper.
 */
function readInput(source: ImageSource): {
  input: Float32Array;
  width: number;
  height: number;
  padW: number;
  padH: number;
  scale: number;
} {
  const size = sourceSize(source);
  if (size.width === 0 || size.height === 0) throw new Error("The image is empty.");
  const scale = LONG_SIDE / Math.max(size.width, size.height);
  const width = Math.max(1, Math.round(size.width * scale));
  const height = Math.max(1, Math.round(size.height * scale));
  const padW = padTo32(width);
  const padH = padTo32(height);
  const canvas = document.createElement("canvas");
  canvas.width = padW;
  canvas.height = padH;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, padW, padH);
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
  const rgba = context.getImageData(0, 0, padW, padH).data;
  const input = new Float32Array(padW * padH);
  for (let p = 0; p < input.length; p++) {
    const r = rgba[p * 4];
    const g = rgba[p * 4 + 1];
    const b = rgba[p * 4 + 2];
    input[p] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
  return { input, width, height, padW, padH, scale: width / size.width };
}

/** Lets the browser draw, so that the progress shows between two tiles. */
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * The class of each pixel of the plan. `onProgress` gets the number of the tiles that are done
 * and the number of all tiles.
 */
export async function segmentPlan(
  image: ImageSource,
  onProgress?: (done: number, total: number) => void,
): Promise<Segmentation> {
  const { ort, session } = await loadModel();
  const { input, width, height, padW, padH, scale } = readInput(image);
  const classes = CLASSES.length;
  const tw = Math.min(TILE, padW);
  const th = Math.min(TILE, padH);
  const xs = tileStarts(padW, tw, OVERLAP);
  const ys = tileStarts(padH, th, OVERLAP);
  const total = xs.length * ys.length;
  const sum = new Float32Array(classes * padW * padH);
  const tile = new Float32Array(tw * th);
  let done = 0;
  onProgress?.(0, total);
  for (const y0 of ys) {
    for (const x0 of xs) {
      for (let y = 0; y < th; y++) {
        tile.set(input.subarray((y0 + y) * padW + x0, (y0 + y) * padW + x0 + tw), y * tw);
      }
      const feeds = { [INPUT_NAME]: new ort.Tensor("float32", tile.slice(), [1, 1, th, tw]) };
      const results = await session.run(feeds);
      const output = results[OUTPUT_NAME];
      if (!output) throw new Error(`The recognition model has no output "${OUTPUT_NAME}".`);
      const logits = output.data as Float32Array;
      if (logits.length !== classes * tw * th) {
        throw new Error("The output of the recognition model has the wrong size.");
      }
      blendTile(sum, padW, padH, logits, classes, x0, y0, tw, th, OVERLAP / 2);
      output.dispose();
      done++;
      onProgress?.(done, total);
      await pause();
    }
  }
  const padded = argmax(sum, classes, padW, padH);
  const map = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) map.set(padded.subarray(y * padW, y * padW + width), y * width);
  return { width, height, classes: map, scale };
}
