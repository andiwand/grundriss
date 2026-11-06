// Loads OpenCV.js only when the user needs it. OpenCV is about 10 MB, so the app starts without
// it.
//
// The loader adds the original opencv.js file as a script, and does not use `import()`. The
// package exports a Promise through CommonJS. A bundler then gives a module namespace with a
// `then` export, and `await import()` fails on that namespace. A script tag also keeps the large
// file out of the bundle: Vite copies it as an asset.

import openCvUrl from "@techstark/opencv-js/dist/opencv.js?url";

export type CV = typeof import("@techstark/opencv-js");

let loading: Promise<CV> | null = null;

/** Gives OpenCV after its WASM runtime is ready. The first call starts the download. */
export function loadOpenCV(): Promise<CV> {
  loading ??= load().catch((error: unknown) => {
    // A failed download can work at the next attempt, so do not keep the failure.
    loading = null;
    throw error;
  });
  return loading;
}

function addScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error("The browser cannot load OpenCV. Check the network connection."));
    };
    document.head.append(script);
  });
}

async function load(): Promise<CV> {
  const global = window as unknown as { cv?: unknown };
  if (!global.cv) await addScript(openCvUrl);
  return resolveOpenCV(global.cv);
}

/**
 * Waits for the runtime that the opencv.js file gives. This package gives a Promise of the
 * runtime, or the runtime itself. A runtime without `Mat` is not ready yet, and calls
 * `onRuntimeInitialized` when it is ready. Tests in Node use this function too.
 */
export async function resolveOpenCV(value: unknown): Promise<CV> {
  if (!value) throw new Error("OpenCV did not load.");
  if (value instanceof Promise) return (await value) as CV;
  const cv = value as CV & { onRuntimeInitialized?: () => void };
  if (cv.Mat) return cv;
  await new Promise<void>((resolve) => {
    cv.onRuntimeInitialized = () => resolve();
  });
  return cv;
}
