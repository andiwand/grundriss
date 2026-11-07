// The package format ".grundriss": a ZIP file with the plan, the background image as its own
// file, and optional exports. The image is binary in the package, so the package is smaller than
// the JSON file with a data URL. This module has no DOM, so the tests can run in Node.
//
// The layout of a package:
//   plan.json                      The building. The `background.image` of each story is the
//                                  path of the image in the package.
//   backgrounds/<storyId>.<ext>    The background image of each story that has one.
//   models/<modelId>.glb           The 3D model of each imported or downloaded model. A bundled
//                                  model (data null) has no file, because the app has it.
//   exports/...                    Exports for other programs, for example plan.pdf.
//   exports/CREDITS.txt            The license and the author of each model, if there are models.
//
// Old packages (version 1) had one plan with the image at "background.<ext>". readPackage reads
// them too.

import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { base64 } from "../furniture/names";
import { parseBuilding, serializeBuilding } from "../model/file";
import type { Building } from "../model/types";

export const PACKAGE_EXTENSION = ".grundriss";
export const PLAN_ENTRY = "plan.json";
export const EXPORTS_FOLDER = "exports/";
export const BACKGROUNDS_FOLDER = "backgrounds/";
export const MODELS_FOLDER = "models/";
export const MODEL_MIME = "model/gltf-binary";

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

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Splits a data URL into its MIME type and its bytes. */
export function decodeDataUrl(url: string): { mime: string; bytes: Uint8Array } {
  const match = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(url);
  if (!match) throw new Error("An image or a model of the plan is not a valid data URL.");
  const mime = match[1] || "text/plain";
  const base64 = match[2].split(";").includes("base64");
  const bytes = base64 ? fromBase64(match[3]) : strToU8(decodeURIComponent(match[3]));
  return { mime, bytes };
}

export function encodeDataUrl(mime: string, bytes: Uint8Array): string {
  return `data:${mime};base64,${base64(bytes)}`;
}

/**
 * Writes the building and the exports as a package. The keys of `exports` are file names in the
 * folder "exports/". A string value goes into the package as UTF-8.
 */
export function writePackage(
  building: Building,
  exports: Record<string, Uint8Array | string> = {},
): Uint8Array {
  const files: Zippable = {};
  const stories = building.stories.map((story) => {
    if (!story.background) return story;
    const { mime, bytes } = decodeDataUrl(story.background.image);
    const name = `${BACKGROUNDS_FOLDER}${story.id}.${extensionOf(mime)}`;
    // Images are compressed already, so the package stores them without compression.
    files[name] = [bytes, { level: 0 }];
    return { ...story, background: { ...story.background, image: name } };
  });
  const models = (building.models ?? []).map((model) => {
    if (model.data === null) return model;
    const name = `${MODELS_FOLDER}${model.id}.glb`;
    files[name] = decodeDataUrl(model.data).bytes;
    return { ...model, data: name };
  });
  files[PLAN_ENTRY] = strToU8(serializeBuilding({ ...building, stories, models }));
  const all = { ...exports };
  if (models.length > 0 && !("CREDITS.txt" in all)) all["CREDITS.txt"] = credits(building);
  for (const [name, content] of Object.entries(all)) {
    files[EXPORTS_FOLDER + name] = typeof content === "string" ? strToU8(content) : content;
  }
  return zipSync(files, { level: 6 });
}

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The extension of an image file by its MIME type. Another image type, for example
 * "image/tiff", gets its subtype as the extension, so that mimeOf can find the type again.
 */
function extensionOf(mime: string): string {
  return EXTENSIONS[mime] ?? /^image\/([a-z0-9+-]+)$/i.exec(mime)?.[1].toLowerCase() ?? "bin";
}

/** The MIME type of an image by the extension of its name. The reverse of extensionOf. */
function mimeOf(name: string): string {
  const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  const known = Object.entries(EXTENSIONS).find(([, value]) => value === extension)?.[0];
  if (known) return known;
  if (extension === "jpeg") return "image/jpeg";
  return extension === "bin" ? "application/octet-stream" : `image/${extension}`;
}

/** The file of the package with the name. A name like "constructor" is not a file. */
const fileOf = (files: Record<string, Uint8Array>, name: string): Uint8Array | undefined =>
  Object.hasOwn(files, name) ? files[name] : undefined;

/** Puts the image of the package back into the background as a data URL. */
function inlineImage(owner: Raw, files: Record<string, Uint8Array>): void {
  const background = owner.background;
  if (!isObject(background) || typeof background.image !== "string") return;
  const name = background.image;
  if (name.startsWith("data:")) return;
  const image = fileOf(files, name);
  if (!image) {
    throw new Error(`The package is damaged: the background image "${name}" is missing.`);
  }
  background.image = encodeDataUrl(mimeOf(name), image);
}

/** The credits of the models: one line per model with its name, origin, license, and author. */
export function credits(building: Building): string {
  const lines = (building.models ?? []).map((model) =>
    [
      model.name,
      model.origin,
      model.license || "unknown license",
      model.credit || "unknown author",
    ].join(" | "),
  );
  return ["Models in this plan (name | origin | license | credit)", "", ...lines, ""].join("\n");
}

/** Puts the file of a model back into the model as a data URL. */
function inlineModel(model: Raw, files: Record<string, Uint8Array>): void {
  if (typeof model.data !== "string" || model.data.startsWith("data:")) return;
  const bytes = fileOf(files, model.data);
  if (!bytes) {
    const name = typeof model.name === "string" ? model.name : "a model";
    throw new Error(`The package is damaged: the file "${model.data}" of ${name} is missing.`);
  }
  model.data = encodeDataUrl(MODEL_MIME, bytes);
}

/** Reads a building from a package. It throws an Error with a message for the user. */
export function readPackage(bytes: Uint8Array): Building {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("The package is damaged: it is not a valid ZIP file.");
  }
  const entry = files[PLAN_ENTRY];
  if (!entry) throw new Error(`The package is damaged: it has no "${PLAN_ENTRY}".`);
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(entry));
  } catch {
    throw new Error(`The package is damaged: "${PLAN_ENTRY}" is not valid JSON.`);
  }
  if (isObject(raw)) {
    // Version 1 has the background at the top level. Version 2 has one in each story.
    inlineImage(raw, files);
    if (Array.isArray(raw.stories)) {
      for (const story of raw.stories) if (isObject(story)) inlineImage(story, files);
    }
    if (Array.isArray(raw.models)) {
      for (const model of raw.models) if (isObject(model)) inlineModel(model, files);
    }
  }
  return parseBuilding(JSON.stringify(raw));
}

/** Reads a building from the bytes of a package or of a JSON file. */
export function readBuildingFile(bytes: Uint8Array): Building {
  return isPackage(bytes) ? readPackage(bytes) : parseBuilding(strFromU8(bytes));
}

/** The format of a plan file by its name: a package, or else JSON. */
export const isPackageName = (name: string): boolean =>
  name.toLowerCase().endsWith(PACKAGE_EXTENSION);
