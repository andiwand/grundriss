// Exports the 3D model as a binary glTF file (GLB) with the exporter of Three.js.

import type * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

/** Writes the object and its children as GLB. The plan meters are the glTF meters. */
export function exportGlb(root: THREE.Object3D): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(
      root,
      (result) => {
        if (result instanceof ArrayBuffer) resolve(result);
        else reject(new Error("The glTF exporter did not give binary data."));
      },
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
      { binary: true },
    );
  });
}
