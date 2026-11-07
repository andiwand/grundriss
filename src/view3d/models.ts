// The 3D models of the furniture: load them, measure them, and draw them from above for the 2D
// editor. The functions cache their results by the id of the model, because a building uses the
// same model for many pieces.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Model } from "../model/types";

/**
 * A turn about the up axis, in degrees, for the models of an origin whose front is not at +z.
 * glTF models face +z by convention, and the local front of a piece (+y on the plan) is +z in
 * the world, so all origins need no turn now. Change a value here if a model set faces another
 * direction.
 */
const ORIGIN_TURN: Record<Model["origin"], number> = { import: 0, kenney: 0, polyhaven: 0 };

const loading = new Map<string, Promise<THREE.Object3D>>();
const loaded = new Map<string, THREE.Object3D>();
const topViews = new Map<string, Promise<string>>();

/** The URL of the GLB file of the model. A bundled Kenney model has no data, so the app has it. */
export function modelUrl(model: Model): string {
  if (model.data) return model.data;
  return `./models/kenney/${model.ref}`;
}

/**
 * Loads the model once. The result has its center on the x and z axes and its bottom at y = 0,
 * so that a piece can scale it to its box. The caller must clone the result before it adds it to
 * a scene.
 */
export function loadModel(model: Model): Promise<THREE.Object3D> {
  let promise = loading.get(model.id);
  if (!promise) {
    promise = new GLTFLoader()
      .loadAsync(modelUrl(model))
      .then((gltf) => {
        const object = normalize(gltf.scene, ORIGIN_TURN[model.origin]);
        loaded.set(model.id, object);
        return object;
      })
      .catch((error: unknown) => {
        // A failed load can work at the next attempt, so do not keep the failure.
        loading.delete(model.id);
        throw error;
      });
    loading.set(model.id, promise);
  }
  return promise;
}

/** The loaded model, or undefined if it did not load yet. */
export function loadedModel(id: string): THREE.Object3D | undefined {
  return loaded.get(id);
}

/** Puts the scene in a group with its center on the x and z axes and its bottom at y = 0. */
function normalize(scene: THREE.Object3D, turn: number): THREE.Object3D {
  scene.rotation.y = (turn * Math.PI) / 180;
  const group = new THREE.Group();
  group.add(scene);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  if (!box.isEmpty()) {
    const center = box.getCenter(new THREE.Vector3());
    scene.position.x -= center.x;
    scene.position.z -= center.z;
    scene.position.y -= box.min.y;
  }
  group.updateMatrixWorld(true);
  return group;
}

/**
 * The size of the object in meters: x across, y deep (the world z), and z up (the world y). The
 * sizes have a minimum of 1 mm, so that a flat model does not give a division by zero.
 */
export function modelSize(object: THREE.Object3D): { x: number; y: number; z: number } {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return { x: 1, y: 1, z: 1 };
  const size = box.getSize(new THREE.Vector3());
  const min = 0.001;
  return { x: Math.max(size.x, min), y: Math.max(size.z, min), z: Math.max(size.y, min) };
}

let renderer: THREE.WebGLRenderer | null = null;

/**
 * A PNG data URL of the model seen from above. The back of the model is at the top of the image
 * and its front is at the bottom, as in the 2D editor at the rotation 0. The image has the
 * proportions of the model, with `pixels` on its longer side, so that it fills the box of a
 * piece.
 */
export function topView(model: Model, pixels = 256): Promise<string> {
  let promise = topViews.get(model.id);
  if (!promise) {
    promise = loadModel(model).then((object) => drawTopView(object, pixels));
    promise.catch(() => topViews.delete(model.id));
    topViews.set(model.id, promise);
  }
  return promise;
}

function drawTopView(object: THREE.Object3D, pixels: number): string {
  const size = modelSize(object);
  const longer = Math.max(size.x, size.y);
  const width = Math.max(1, Math.round((pixels * size.x) / longer));
  const height = Math.max(1, Math.round((pixels * size.y) / longer));

  renderer ??= new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(2, 10, 4);
  scene.add(sun);
  scene.add(object.clone());

  // The camera looks down. Its up vector is the world -z, which is the plan -y: the back.
  const camera = new THREE.OrthographicCamera(
    -size.x / 2,
    size.x / 2,
    size.y / 2,
    -size.y / 2,
    0.01,
    size.z + 20,
  );
  camera.position.set(0, size.z + 10, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL("image/png");
}
