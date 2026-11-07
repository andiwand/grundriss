// The pure parts of the segmentation: where the tiles go, how much each pixel of a tile counts,
// and the class of each pixel. No DOM and no runtime, so tests run them in Node.

/** Rounds up to a multiple of 32, because the network halves the size five times. */
export const padTo32 = (n: number) => Math.max(32, Math.ceil(n / 32) * 32);

/**
 * The start positions of the tiles along one axis of the length `size`. The tiles have the
 * length `tile` and overlap by at least `overlap`. The last tile ends at the end of the axis. If
 * the axis is shorter than one tile, one tile covers it.
 */
export function tileStarts(size: number, tile: number, overlap: number): number[] {
  if (size <= tile) return [0];
  const step = tile - overlap;
  const starts: number[] = [];
  for (let start = 0; start + tile < size; start += step) starts.push(start);
  starts.push(size - tile);
  return starts;
}

/**
 * The weight of a pixel at `i` in a tile of the length `length`. The weight falls to near 0 at an
 * edge of the tile that is inside the image, over the length `ramp`, because the network sees
 * less context near the edge of its input. At an edge of the image, the weight stays 1.
 */
export function edgeWeight(
  i: number,
  length: number,
  ramp: number,
  atStart: boolean,
  atEnd: boolean,
): number {
  let w = 1;
  if (!atStart && ramp > 0) w = Math.min(w, (i + 0.5) / ramp);
  if (!atEnd && ramp > 0) w = Math.min(w, (length - i - 0.5) / ramp);
  return Math.max(1e-3, Math.min(1, w));
}

/**
 * The class with the highest score at each pixel. `scores` holds `classes` planes of
 * `width × height` values, one plane after the other.
 */
export function argmax(
  scores: Float32Array,
  classes: number,
  width: number,
  height: number,
): Uint8Array {
  const plane = width * height;
  const result = new Uint8Array(plane);
  for (let p = 0; p < plane; p++) {
    let best = 0;
    let bestScore = scores[p];
    for (let c = 1; c < classes; c++) {
      const score = scores[c * plane + p];
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    result[p] = best;
  }
  return result;
}

/**
 * Adds the logits of one tile to the sum of the image, with the weights of `edgeWeight`. `logits`
 * has the shape [classes, th, tw], and `sum` has the shape [classes, height, width]. All weights
 * are positive, so the argmax of the sum is the argmax of the weighted mean.
 */
export function blendTile(
  sum: Float32Array,
  width: number,
  height: number,
  logits: Float32Array,
  classes: number,
  x0: number,
  y0: number,
  tw: number,
  th: number,
  ramp: number,
): void {
  const plane = width * height;
  const tilePlane = tw * th;
  for (let y = 0; y < th; y++) {
    const wy = edgeWeight(y, th, ramp, y0 === 0, y0 + th >= height);
    for (let x = 0; x < tw; x++) {
      const w = wy * edgeWeight(x, tw, ramp, x0 === 0, x0 + tw >= width);
      const p = (y0 + y) * width + (x0 + x);
      const t = y * tw + x;
      for (let c = 0; c < classes; c++) sum[c * plane + p] += w * logits[c * tilePlane + t];
    }
  }
}
