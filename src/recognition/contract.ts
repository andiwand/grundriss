// The contract between the training (scripts/recognition/) and the app (src/recognition/). The
// training writes a model that follows it, and the app reads the model with it. A change here
// needs a new model.
//
// The model is a semantic segmentation network. For each pixel of a floor plan, it gives the
// score of each class.

/** The served path of the model, relative to the page. Vite serves `public/`. */
export const MODEL_URL = "./models/recognition/floorplan.onnx";
/** The metadata of the model: the version of the contract, the classes, and the metrics. */
export const MODEL_INFO_URL = "./models/recognition/model.json";

export const CONTRACT_VERSION = 1;

/**
 * The input "image": float32 with the shape [N, 1, H, W]. One gray channel: 1 is white paper and
 * 0 is black ink. H and W are multiples of 32, so that the network can halve them five times.
 */
export const INPUT_NAME = "image";

/** The output "logits": float32 with the shape [N, CLASSES.length, H, W]. No softmax. */
export const OUTPUT_NAME = "logits";

export const CLASSES = ["background", "wall", "door", "window"] as const;
export type RecognitionClass = (typeof CLASSES)[number];

/**
 * The scale of the input. The app scales the image so that its long side has this length in
 * pixels. The training renders its plans at about this scale: a building of 8 to 25 m on the
 * long side, so a wall of 0.1 to 0.4 m is about 4 to 40 pixels thick.
 */
export const LONG_SIDE = 1024;

/** The app cuts the scaled image into tiles of this size, with this overlap. */
export const TILE = 512;
export const OVERLAP = 64;
