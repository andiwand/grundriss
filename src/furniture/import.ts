// The import of the user's own models. The app accepts a GLB file, or a glTF file that has its
// buffers and images inside as data URIs. The plan file stores the model as GLB.

import { newId } from "../model/plan";
import type { Model } from "../model/types";
import { loadGltf, measure, writeGlb } from "./gltf";
import { glbDataUrl, guessUnitFactor, nameFromFile, roundSize } from "./names";

/** True if a glTF JSON refers to a file outside itself, which the app cannot load. */
export function hasExternalFiles(gltf: {
  buffers?: { uri?: string }[];
  images?: { uri?: string }[];
}): boolean {
  const uris = [...(gltf.buffers ?? []), ...(gltf.images ?? [])]
    .map((item) => item.uri)
    .filter((uri): uri is string => typeof uri === "string");
  return uris.some((uri) => !uri.startsWith("data:"));
}

/**
 * Reads a model file. It throws an Error with a message for the user. The default size of the
 * model is in meters: a model in centimeters or millimeters gets a smaller size.
 */
export async function importModelFile(file: File): Promise<Model> {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".glb") && !name.endsWith(".gltf")) {
    throw new Error("Choose a .glb or a .gltf file.");
  }
  const bytes = await file.arrayBuffer();
  if (name.endsWith(".gltf")) {
    let json: { buffers?: { uri?: string }[]; images?: { uri?: string }[] };
    try {
      json = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new Error("The .gltf file is not valid JSON.");
    }
    if (hasExternalFiles(json)) {
      throw new Error(
        "This .gltf file uses separate files (.bin or textures). Export the model as one .glb file and import that.",
      );
    }
  }

  let scene;
  try {
    scene = await loadGltf(bytes);
  } catch (error) {
    const detail = error instanceof Error ? ` (${error.message})` : "";
    throw new Error(`The app cannot read this model${detail}.`);
  }
  const raw = measure(scene);
  if (!(raw.x > 0 || raw.y > 0 || raw.z > 0)) throw new Error("The model has no geometry.");
  const factor = guessUnitFactor(raw);
  // A GLB keeps its bytes. A .gltf with data URIs becomes a GLB, which is smaller.
  const glb = name.endsWith(".glb") ? new Uint8Array(bytes) : await writeGlb(scene);
  return {
    id: newId("m"),
    name: nameFromFile(file.name),
    origin: "import",
    ref: file.name,
    data: glbDataUrl(glb),
    size: roundSize({ x: raw.x * factor, y: raw.y * factor, z: raw.z * factor }),
    license: "",
    credit: "",
  };
}
