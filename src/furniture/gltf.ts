// Shared glTF helpers for the furniture sources: load a model, measure it, and write it as one
// GLB file. glTF uses y up. The plan uses x across, y deep, and z up, so the size maps the model
// y to the plan z and the model z to the plan y.

import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/** The largest size of a texture in a stored model, so that plan files stay small. */
export const MAX_TEXTURE_SIZE = 1024;

/** Loads a glTF or GLB file from bytes, or from a URL with an optional loading manager. */
export async function loadGltf(
  source: ArrayBuffer | string,
  manager?: THREE.LoadingManager,
): Promise<THREE.Object3D> {
  const loader = new GLTFLoader(manager);
  const gltf =
    typeof source === "string"
      ? await loader.loadAsync(source)
      : await loader.parseAsync(source, "");
  return gltf.scene;
}

/** The size of the model in its own units: x across, y deep, z up. */
export function measure(object: THREE.Object3D): { x: number; y: number; z: number } {
  object.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  return { x: size.x, y: size.z, z: size.y };
}

/** Writes the object as one GLB file. Textures keep their format and are at most 1024 px. */
export async function writeGlb(object: THREE.Object3D): Promise<Uint8Array> {
  const result = await new GLTFExporter().parseAsync(object, {
    binary: true,
    maxTextureSize: MAX_TEXTURE_SIZE,
  });
  if (!(result instanceof ArrayBuffer)) throw new Error("The model cannot be written as GLB.");
  return new Uint8Array(result);
}
