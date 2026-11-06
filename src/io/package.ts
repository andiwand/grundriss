// The package format ".grundriss": a ZIP file with the plan, the background image as its own
// file, and optional exports. The image is binary in the package, so the package is smaller than
// the JSON file with a data URL. This module has no DOM, so the tests can run in Node.
//
// The layout of a package:
//   plan.json          The plan. `background.image` is the path of the image in the package.
//   background.<ext>   The background image, if the plan has one.
//   exports/...        Exports for other programs, for example plan.pdf or model.glb.

import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { parsePlan, serializePlan } from "../model/file";
import type { Plan } from "../model/types";

export const PACKAGE_EXTENSION = ".grundriss";
export const PLAN_ENTRY = "plan.json";
export const EXPORTS_FOLDER = "exports/";

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/avif": "avif",
};

/** True if the bytes start with the signature of a ZIP file. */
export function isPackage(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4
  );
}

function toBase64(bytes: Uint8Array): string {
  // Small chunks keep the arguments of String.fromCharCode below the limit of the engine.
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Splits a data URL into its MIME type and its bytes. */
export function decodeDataUrl(url: string): { mime: string; bytes: Uint8Array } {
  const match = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(url);
  if (!match) throw new Error("The background image is not a valid data URL.");
  const mime = match[1] || "text/plain";
  const base64 = match[2].split(";").includes("base64");
  const bytes = base64 ? fromBase64(match[3]) : strToU8(decodeURIComponent(match[3]));
  return { mime, bytes };
}

export function encodeDataUrl(mime: string, bytes: Uint8Array): string {
  return `data:${mime};base64,${toBase64(bytes)}`;
}

/**
 * Writes the plan and the exports as a package. The keys of `exports` are file names in the
 * folder "exports/". A string value goes into the package as UTF-8.
 */
export function writePackage(
  plan: Plan,
  exports: Record<string, Uint8Array | string> = {},
): Uint8Array {
  const files: Zippable = {};
  let stored = plan;
  if (plan.background) {
    const { mime, bytes } = decodeDataUrl(plan.background.image);
    const name = `background.${EXTENSIONS[mime] ?? "bin"}`;
    // Images are compressed already, so the package stores them without compression.
    files[name] = [bytes, { level: 0 }];
    stored = { ...plan, background: { ...plan.background, image: name } };
  }
  files[PLAN_ENTRY] = strToU8(serializePlan(stored));
  for (const [name, content] of Object.entries(exports)) {
    files[EXPORTS_FOLDER + name] = typeof content === "string" ? strToU8(content) : content;
  }
  return zipSync(files, { level: 6 });
}

/** Reads a plan from a package. It throws an Error with a message for the user. */
export function readPackage(bytes: Uint8Array): Plan {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("The package is damaged: it is not a valid ZIP file.");
  }
  const entry = files[PLAN_ENTRY];
  if (!entry) throw new Error(`The package is damaged: it has no "${PLAN_ENTRY}".`);
  const plan = parsePlan(strFromU8(entry));
  if (plan.background) {
    const name = plan.background.image;
    const image = files[name];
    if (!image) {
      throw new Error(`The package is damaged: the background image "${name}" is missing.`);
    }
    const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
    const mime =
      Object.entries(EXTENSIONS).find(([, value]) => value === extension)?.[0] ??
      (extension === "jpeg" ? "image/jpeg" : "application/octet-stream");
    plan.background.image = encodeDataUrl(mime, image);
  }
  return plan;
}

/** Reads a plan from the bytes of a package or of a JSON file. */
export function readPlanFile(bytes: Uint8Array): Plan {
  return isPackage(bytes) ? readPackage(bytes) : parsePlan(strFromU8(bytes));
}

/** The format of a plan file by its name: a package, or else JSON. */
export const isPackageName = (name: string): boolean =>
  name.toLowerCase().endsWith(PACKAGE_EXTENSION);
