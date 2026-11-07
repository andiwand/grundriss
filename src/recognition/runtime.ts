// Loads ONNX Runtime Web and the recognition model, only when the user needs them. The runtime
// is about 14 MB, so the app starts without it.
//
// The app has no server and must work offline. So the runtime file comes from a `?url` import:
// Vite copies it into the build as an asset, and the dev server serves it from node_modules.
// The runtime uses only WASM with one thread: the page is not cross-origin isolated, so it
// cannot share memory between threads.

import type { InferenceSession } from "onnxruntime-web";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import { CLASSES, CONTRACT_VERSION, MODEL_INFO_URL, MODEL_URL } from "./contract";

export type Ort = typeof import("onnxruntime-web");
export type Session = InferenceSession;

/** The metadata that the training writes next to the model. */
export interface ModelInfo {
  contract: number;
  classes: string[];
  /** Free text from the training, for example the date and the metrics. */
  [key: string]: unknown;
}

export interface LoadedModel {
  ort: Ort;
  session: Session;
  info: ModelInfo;
}

let runtime: Promise<Ort> | null = null;
let model: Promise<LoadedModel> | null = null;

/** Gives ONNX Runtime Web, ready for WASM. The first call starts the download. */
export function loadRuntime(): Promise<Ort> {
  runtime ??= (async () => {
    if (typeof WebAssembly !== "object") {
      throw new Error("This browser has no WebAssembly, so it cannot run the recognition.");
    }
    const ort = await import("onnxruntime-web/wasm");
    ort.env.wasm.wasmPaths = { wasm: wasmUrl };
    ort.env.wasm.numThreads = 1;
    return ort;
  })().catch((error: unknown) => {
    // A failed download can work at the next attempt, so do not keep the failure.
    runtime = null;
    throw error;
  });
  return runtime;
}

/**
 * Gives the session of the recognition model. It checks the metadata of the model against the
 * contract of this app, so that an old model or an old app gives a clear error.
 */
export function loadModel(): Promise<LoadedModel> {
  model ??= load().catch((error: unknown) => {
    model = null;
    throw error;
  });
  return model;
}

async function load(): Promise<LoadedModel> {
  const info = await fetchInfo();
  const ort = await loadRuntime();
  const response = await fetchOrFail(MODEL_URL);
  const bytes = new Uint8Array(await response.arrayBuffer());
  try {
    const session = await ort.InferenceSession.create(bytes, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
    return { ort, session, info };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`The recognition model does not load: ${reason}`);
  }
}

async function fetchInfo(): Promise<ModelInfo> {
  const response = await fetchOrFail(MODEL_INFO_URL);
  let info: ModelInfo;
  try {
    info = (await response.json()) as ModelInfo;
  } catch {
    throw new Error("The metadata of the recognition model is not valid JSON.");
  }
  checkInfo(info);
  return info;
}

/** Throws an Error for the user if the model does not follow the contract of this app. */
export function checkInfo(info: ModelInfo): void {
  if (info.contract !== CONTRACT_VERSION) {
    throw new Error(
      `The recognition model has contract ${String(info.contract)}, but this app needs ` +
        `contract ${CONTRACT_VERSION}. Install a matching model.`,
    );
  }
  const classes = Array.isArray(info.classes) ? info.classes : [];
  if (classes.join() !== CLASSES.join()) {
    throw new Error(
      `The recognition model has the classes ${classes.join(", ") || "(none)"}, ` +
        `but this app needs ${CLASSES.join(", ")}.`,
    );
  }
}

async function fetchOrFail(url: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error("The browser cannot load the recognition model. Check the connection.");
  }
  // The dev server answers a missing file with the page itself and status 200, so an HTML
  // answer also means that the file is missing.
  const html = response.headers.get("content-type")?.includes("text/html");
  if (response.status === 404 || (response.ok && html)) {
    throw new Error("The app has no recognition model yet. The model must be trained first.");
  }
  if (!response.ok) {
    throw new Error(`The recognition model does not load (HTTP ${response.status}).`);
  }
  return response;
}
