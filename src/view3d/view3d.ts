// The 3D view: it builds meshes from the building after each change. The view only reads the
// building.
//
// The plan uses x and y, and the 3D world uses x, height, and z. The world z is the plan y. The
// height of a story is its elevation.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  chimneyExtent,
  chimneyOutline,
  findStory,
  SLAB,
  stairRise,
  storyAbove,
  stairShape,
} from "../model/building";
import { genericBlocks, type Block, type Finish } from "../model/furniture";
import { distance } from "../model/geometry";
import { wallEnds, wallExtents } from "../model/plan";
import { pvPanels } from "../model/pv";
import { roofCeiling, roofGeometries, type Vec3 } from "../model/roof";
import { WINDOW_LIFT } from "../model/roofshape";
import { findRooms } from "../model/rooms";
import { runKind } from "../model/services";
import type {
  Building,
  Fixture,
  Furniture,
  Id,
  Point,
  Roof,
  Run,
  Story,
  Wall,
} from "../model/types";
import { loadedModel, loadModel } from "./models";

/** A part of a wall: from s0 to s1 along the wall, and from y0 to y1 in height. */
type Piece = [s0: number, s1: number, y0: number, y1: number];

const GLASS_THICKNESS = 0.02;

/** The materials are shared by all meshes, so a new build makes no new materials. */
const materials = {
  wall: new THREE.MeshStandardMaterial({ color: 0xf2efe9, roughness: 0.9 }),
  edge: new THREE.LineBasicMaterial({ color: 0x9a958c }),
  floor: new THREE.MeshStandardMaterial({
    color: 0xc9a77c,
    roughness: 0.8,
    side: THREE.DoubleSide,
  }),
  slab: new THREE.MeshStandardMaterial({ color: 0xd9d5cc, roughness: 0.9 }),
  ceiling: new THREE.MeshStandardMaterial({
    color: 0xf4f1ea,
    roughness: 0.9,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
  glass: new THREE.MeshStandardMaterial({
    color: 0x9cc8e6,
    transparent: true,
    opacity: 0.35,
    roughness: 0.1,
  }),
  stair: new THREE.MeshStandardMaterial({ color: 0xb98b5e, roughness: 0.75 }),
  chimney: new THREE.MeshStandardMaterial({ color: 0xa0523d, roughness: 0.95 }),
  roofWindow: new THREE.MeshStandardMaterial({
    color: 0x2b3a4a,
    roughness: 0.2,
    metalness: 0.3,
    side: THREE.DoubleSide,
  }),
  roof: new THREE.MeshStandardMaterial({
    color: 0xb5523b,
    roughness: 0.85,
    side: THREE.DoubleSide,
  }),
  gable: new THREE.MeshStandardMaterial({
    color: 0xf2efe9,
    roughness: 0.9,
    side: THREE.DoubleSide,
  }),
  north: new THREE.MeshBasicMaterial({ color: 0xd94b3b, side: THREE.DoubleSide }),
  /** The building services. */
  plate: new THREE.MeshStandardMaterial({ color: 0xeceae6, roughness: 0.6 }),
  accent: new THREE.MeshStandardMaterial({ color: 0xe8590c, roughness: 0.6 }),
  lamp: new THREE.MeshStandardMaterial({
    color: 0xfff4d6,
    emissive: 0xffe8a3,
    emissiveIntensity: 0.4,
    roughness: 0.5,
  }),
  radiator: new THREE.MeshStandardMaterial({ color: 0xfafaf8, roughness: 0.4 }),
  device: new THREE.MeshStandardMaterial({ color: 0xd8dde3, roughness: 0.5 }),
  pv: new THREE.MeshStandardMaterial({
    color: 0x1b2a4a,
    roughness: 0.25,
    metalness: 0.3,
    side: THREE.DoubleSide,
  }),
  pvFrame: new THREE.LineBasicMaterial({ color: 0xc8ccd2 }),
  /** The box of a piece whose model did not load yet, or failed to load. */
  pending: new THREE.MeshStandardMaterial({
    color: 0xb8c4d6,
    roughness: 0.9,
    transparent: true,
    opacity: 0.5,
  }),
};

/** The materials of the generic furniture, one for each finish. */
const finishes: Record<Finish, THREE.Material> = {
  wood: new THREE.MeshStandardMaterial({ color: 0xb08a62, roughness: 0.7 }),
  fabric: new THREE.MeshStandardMaterial({ color: 0x7d8a99, roughness: 1 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf5f5f2, roughness: 0.5 }),
  metal: new THREE.MeshStandardMaterial({ color: 0xa9adb3, roughness: 0.35, metalness: 0.6 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.6 }),
  glass: new THREE.MeshStandardMaterial({
    color: 0xbfdcef,
    roughness: 0.05,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  }),
};

/** A function that the build calls when a model that it waited for has loaded. */
type OnLoad = () => void;

export interface ViewOptions {
  /** The story that the 2D editor shows. */
  activeStoryId: Id;
  /** True shows all stories and the roof. False shows the active story and the stories below. */
  showAbove: boolean;
  /** The layers of the building services. A missing value shows all layers. */
  layers?: ServiceLayers;
}

/** The layers of the building services that the view shows. */
export interface ServiceLayers {
  electric: boolean;
  heating: boolean;
  pv: boolean;
}

const ALL_LAYERS: ServiceLayers = { electric: true, heating: true, pv: true };

export class View3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
  private controls: OrbitControls;
  private content = new THREE.Group();
  private north: THREE.Group;
  private frame = 0;
  private last: { building: Building; view: ViewOptions } | null = null;
  private rebuild = 0;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    // A phone can have a pixel ratio of 3. Twice the pixels of a normal screen look as sharp, and
    // the graphics card draws less than half the pixels.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.append(this.renderer.domElement);

    // The scene has no background color, so the CSS gradient of the pane shows through.
    this.renderer.setClearColor(0x000000, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(6, 12, 8);
    this.scene.add(sun);
    const grid = new THREE.GridHelper(60, 60, 0x8a93a3, 0x8a93a3);
    grid.position.y = -0.002;
    // A transparent grid shows on the light and on the dark theme.
    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.25;
    this.scene.add(grid);
    this.scene.add(this.content);
    this.north = northArrow();
    this.scene.add(this.north);

    this.camera.position.set(8, 10, 12);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener("change", () => this.requestRender());
    // The wheel zooms to the point under the cursor, and a right drag pans in the screen plane.
    this.controls.zoomToCursor = true;
    this.controls.screenSpacePanning = true;
    this.setupPivotRotation();
    new ResizeObserver(() => this.resize()).observe(container);
  }

  /**
   * A left drag with the mouse turns the view around the point of the building under the
   * cursor, not around the target of the controls. Without a building under the cursor, the
   * pivot is the point on the ground, and else the target. The camera and the target turn
   * together around the pivot, so the view does not jump. Touch keeps the rotation of the
   * controls, because they also read two fingers for zoom and pan.
   */
  private setupPivotRotation(): void {
    const element = this.renderer.domElement;
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x2f6bff, depthTest: false, transparent: true }),
    );
    marker.renderOrder = 10;
    marker.visible = false;
    this.scene.add(marker);
    const raycaster = new THREE.Raycaster();
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const up = new THREE.Vector3(0, 1, 0);

    const pivotAt = (e: PointerEvent): THREE.Vector3 => {
      const rect = element.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, this.camera);
      const hit = raycaster
        .intersectObject(this.content, true)
        .find((h) => h.object instanceof THREE.Mesh && h.object.visible);
      if (hit) return hit.point.clone();
      const onGround = raycaster.ray.intersectPlane(ground, new THREE.Vector3());
      return onGround && onGround.distanceTo(this.camera.position) < 200
        ? onGround
        : this.controls.target.clone();
    };

    let drag: { pivot: THREE.Vector3; x: number; y: number; id: number } | null = null;
    // The capture phase runs before the listener of the controls, so the controls do not start
    // their own rotation.
    element.addEventListener(
      "pointerdown",
      (e) => {
        if (e.pointerType === "touch" || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey)
          return;
        e.stopImmediatePropagation();
        element.setPointerCapture(e.pointerId);
        const pivot = pivotAt(e);
        drag = { pivot, x: e.clientX, y: e.clientY, id: e.pointerId };
        // The marker keeps the same size on the screen.
        marker.scale.setScalar(pivot.distanceTo(this.camera.position) * 0.006);
        marker.position.copy(pivot);
        marker.visible = true;
        this.requestRender();
      },
      { capture: true },
    );
    element.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const height = element.clientHeight || 1;
      const yaw = (-2 * Math.PI * (e.clientX - drag.x)) / height;
      const pitch = (-2 * Math.PI * (e.clientY - drag.y)) / height;
      drag.x = e.clientX;
      drag.y = e.clientY;
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
      const turn = new THREE.Quaternion().setFromAxisAngle(up, yaw);
      const tilt = new THREE.Quaternion().setFromAxisAngle(right.applyQuaternion(turn), pitch);
      const rotation = tilt.multiply(turn);
      const rotate = (p: THREE.Vector3) =>
        p.sub(drag!.pivot).applyQuaternion(rotation).add(drag!.pivot);
      // The view must not go over the top or under the bottom, where it would flip.
      const offset = rotate(this.camera.position.clone()).sub(rotate(this.controls.target.clone()));
      const polar = offset.angleTo(up);
      if (polar < 0.02 || polar > Math.PI - 0.02) {
        rotation.copy(turn);
      }
      rotate(this.camera.position);
      rotate(this.controls.target);
      this.controls.update();
      this.requestRender();
    });
    const end = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      marker.visible = false;
      this.requestRender();
    };
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", end);
  }

  /** The meshes of the visible building, without the grid, the lights, and the north arrow. */
  get model(): THREE.Object3D {
    return this.content;
  }

  update(building: Building, view: ViewOptions): void {
    this.last = { building, view };
    disposeTree(this.content);
    this.content.clear();
    const active = findStory(building, view.activeStoryId);
    const visible = building.stories.filter(
      (s) => view.showAbove || !active || s.elevation <= active.elevation + 1e-6,
    );
    // A roof shows if its story shows, and if all stories show or its story is the active one.
    const visibleIds = new Set(visible.map((s) => s.id));
    const roofs = building.roofs.filter(
      (roof) =>
        visibleIds.has(roof.storyId) && (view.showAbove || roof.storyId === view.activeStoryId),
    );
    const layers = view.layers ?? ALL_LAYERS;
    this.content.add(buildGroup(building, visible, roofs, layers, () => this.modelLoaded()));
    this.placeNorth(building);
    this.requestRender();
  }

  /**
   * A model finished its load. The view builds again with the same building, so that the model
   * replaces its box. Many loads in one frame give one build.
   */
  private modelLoaded(): void {
    if (this.rebuild) return;
    this.rebuild = requestAnimationFrame(() => {
      this.rebuild = 0;
      if (this.last) this.update(this.last.building, this.last.view);
    });
  }

  /** Points the camera at all visible content. */
  fit(building: Building): void {
    const box = new THREE.Box3().setFromObject(this.content);
    if (box.isEmpty()) {
      this.controls.target.set(0, 0, 0);
      this.camera.position.set(8, 10, 12);
    } else {
      // The sphere around the content must fit in the smaller of the two view angles. A narrow
      // pane has a small horizontal angle, so the camera goes farther away.
      const center = box.getCenter(new THREE.Vector3());
      const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 2);
      const vertical = (this.camera.fov * Math.PI) / 180;
      const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * this.camera.aspect);
      const distance = (1.05 * radius) / Math.sin(Math.min(vertical, horizontal) / 2);
      const direction = new THREE.Vector3(0.6, 0.75, 1.1).normalize();
      this.controls.target.copy(center);
      this.camera.position.copy(center).addScaledVector(direction, distance);
    }
    this.placeNorth(building);
    this.controls.update();
    this.requestRender();
  }

  requestRender(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.renderer.render(this.scene, this.camera);
    });
  }

  /** Puts the north arrow on the ground, next to the corner of the building. */
  private placeNorth(building: Building): void {
    const box = new THREE.Box3().setFromObject(this.content);
    const x = box.isEmpty() ? 2 : box.max.x + 1.5;
    const z = box.isEmpty() ? -2 : box.min.z - 1.5;
    this.north.position.set(x, 0.01, z);
    // `north` goes clockwise from the plan -y axis, seen from above. A turn about the world y
    // axis by -north does that.
    this.north.rotation.y = (-building.north * Math.PI) / 180;
  }

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }
}

/**
 * Builds the full building with all stories and the roof. The glTF export uses it, so that the
 * export does not depend on what the view shows.
 */
export function buildModel(building: Building): THREE.Group {
  return buildGroup(building, building.stories, building.roofs, ALL_LAYERS);
}

/**
 * Builds the full building after all its models have loaded, so that the export contains the
 * models and not their boxes. A model that fails to load stays a box.
 */
export async function buildModelAsync(building: Building): Promise<THREE.Group> {
  const results = await Promise.allSettled(building.models.map((model) => loadModel(model)));
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.warn(`The model "${building.models[i].name}" did not load.`, result.reason);
    }
  });
  return buildModel(building);
}

function buildGroup(
  building: Building,
  stories: Story[],
  roofs: Roof[],
  layers: ServiceLayers,
  onLoad?: OnLoad,
): THREE.Group {
  const group = new THREE.Group();
  const lowest = building.stories[0];
  for (const story of stories) {
    const storyGroup = new THREE.Group();
    storyGroup.name = story.name;
    addStory(storyGroup, building, story, story !== lowest);
    for (const piece of story.furniture) {
      storyGroup.add(furnitureObject(building, story, piece, onLoad));
    }
    addServices(storyGroup, story, layers);
    group.add(storyGroup);
  }
  if (roofs.length > 0) {
    addRoofs(group, building, roofs);
    if (layers.pv) addPv(group, building, new Set(roofs.map((r) => r.id)));
  }
  return group;
}

/**
 * Frees the geometries of a build. A clone of a loaded model shares its geometry with the cache
 * of the models, so the function does not free it.
 */
function disposeTree(root: THREE.Object3D): void {
  const visit = (object: THREE.Object3D) => {
    if (object.userData.shared) return;
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose();
    }
    for (const child of object.children) visit(child);
  };
  visit(root);
}

// ----- Furniture -----

/**
 * A piece of furniture in the world. The group has the position and the rotation of the piece.
 * In the group, x goes along the width, y goes up, and z goes along the depth to the front.
 */
function furnitureObject(
  building: Building,
  story: Story,
  piece: Furniture,
  onLoad?: OnLoad,
): THREE.Object3D {
  const group = new THREE.Group();
  group.name = piece.name;
  group.position.set(piece.x, story.elevation + piece.elevation, piece.y);
  // The rotation of the piece goes clockwise on the plan. The plan y is the world z, so a turn
  // by -rotation about the world y axis gives the same direction.
  group.rotation.y = (-piece.rotation * Math.PI) / 180;

  if (piece.source.kind === "generic") {
    for (const block of genericBlocks(piece.source.type, piece.width, piece.depth, piece.height)) {
      const mesh = blockMesh(block);
      if (mesh) group.add(mesh);
    }
    return group;
  }

  const { modelId } = piece.source;
  const model = building.models.find((m) => m.id === modelId);
  const object = loadedModel(modelId);
  if (object) {
    const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
    const clone = object.clone();
    clone.userData.shared = true;
    clone.scale.set(
      piece.width / Math.max(size.x, 1e-3),
      piece.height / Math.max(size.y, 1e-3),
      piece.depth / Math.max(size.z, 1e-3),
    );
    group.add(clone);
    return group;
  }
  // The model did not load yet. A box of the size of the piece shows its place until it loads.
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(piece.width, piece.height, piece.depth),
    materials.pending,
  );
  box.position.y = piece.height / 2;
  group.add(box);
  if (model) {
    loadModel(model)
      .then(() => onLoad?.())
      .catch((error: unknown) => console.warn(`The model "${model.name}" did not load.`, error));
  }
  return group;
}

/** The mesh of a block of a generic piece, in the frame of the piece. */
function blockMesh(block: Block): THREE.Mesh | null {
  const width = block.x1 - block.x0;
  const depth = block.y1 - block.y0;
  const height = block.z1 - block.z0;
  if (width < 1e-4 || depth < 1e-4 || height < 1e-4) return null;
  // A cylinder of radius 0.5 and height 1 scales to an elliptic section that fills the block.
  const geometry =
    block.shape === "cylinder"
      ? new THREE.CylinderGeometry(0.5, 0.5, 1, 24)
      : new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.Mesh(geometry, finishes[block.finish]);
  mesh.scale.set(width, height, depth);
  // The local y of the block (the depth) is the world z, and its z (up) is the world y.
  mesh.position.set(
    (block.x0 + block.x1) / 2,
    (block.z0 + block.z1) / 2,
    (block.y0 + block.y1) / 2,
  );
  return mesh;
}

/**
 * A prism: the polygon of the plan, from the height `bottom` to the height `top`. The extrusion
 * goes along the local z axis. The rotation turns local z down, so the mesh hangs from `top`.
 */
function prism(
  polygon: Point[],
  bottom: number,
  top: number,
  material: THREE.Material,
  edges = false,
): THREE.Mesh | null {
  if (top - bottom < 1e-4 || polygon.length < 3) return null;
  const shape = new THREE.Shape(polygon.map((p) => new THREE.Vector2(p.x, p.y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: top - bottom, bevelEnabled: false });
  const mesh = new THREE.Mesh(geometry, material);
  // The rotation maps the plane of the shape (x, y) to the floor (x, z), and local z to -y.
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = top;
  if (edges) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), materials.edge));
  return mesh;
}

function addStory(group: THREE.Group, building: Building, story: Story, slab: boolean): void {
  const base = story.elevation;
  const ceiling = roofCeiling(building, story);
  // A wall that reaches the slab of the story above goes on up to the floor of that story, so
  // that the outer walls have no gap at the edge of the slab.
  const above = storyAbove(building, story);
  const floorAbove = above ? above.elevation - story.elevation : 0;
  for (const wall of story.walls) {
    const height =
      wall.height >= floorAbove - SLAB - 1e-6 ? Math.max(wall.height, floorAbove) : wall.height;
    addWall(group, story, wall, base, height, ceiling);
  }
  for (const room of findRooms(story)) {
    const shape = new THREE.Shape(room.polygon.map((p) => new THREE.Vector2(p.x, p.y)));
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), materials.floor);
    floor.rotation.x = Math.PI / 2;
    floor.position.y = base + 0.001;
    group.add(floor);
    // A room with its own height gets a ceiling at that height, for example a lowered ceiling
    // in a bathroom. The ceiling is transparent, so that the room stays visible from above.
    const height = room.info?.height;
    if (height != null) {
      const ceiling = new THREE.Mesh(new THREE.ShapeGeometry(shape), materials.ceiling);
      ceiling.rotation.x = Math.PI / 2;
      ceiling.position.y = base + height;
      group.add(ceiling);
    }
    // The slab under the floor of an upper story is the ceiling of the story below.
    if (slab) {
      const mesh = prism(room.polygon, base - SLAB, base, materials.slab);
      if (mesh) group.add(mesh);
    }
  }
  const rise = stairRise(building, story);
  for (const stair of story.stairs) {
    const shape = stairShape(stair, rise);
    shape.steps.forEach((step, i) => {
      const mesh = prism(step, base, base + (i + 1) * shape.stepHeight, materials.stair, true);
      if (mesh) group.add(mesh);
    });
  }
  for (const chimney of story.chimneys) {
    const { bottom, top } = chimneyExtent(building, story, chimney);
    const mesh = prism(chimneyOutline(chimney), bottom, top, materials.chimney, true);
    if (mesh) group.add(mesh);
  }
}

/** The distance between the points where a wall under a roof takes the height of the roof. */
const ROOF_STEP = 0.05;
/** A wall under a roof stops this much below it, so that the two surfaces do not flicker. */
const ROOF_GAP = 0.02;

/**
 * Builds a wall as boxes around its openings, so no CSG is necessary. Each opening leaves a
 * hole: a part below the sill and a part above the head stay.
 *
 * `ceiling` gives the height of a roof over a point of the plan. A wall under a roof, for example
 * a wall of an attic, stops at the roof: its top follows the lower of its two faces.
 */
function addWall(
  group: THREE.Group,
  story: Story,
  wall: Wall,
  base: number,
  height: number,
  ceiling: (p: Point) => number | null,
): void {
  const [a, b] = wallEnds(story, wall);
  const length = distance(a, b);
  if (length < 1e-6) return;
  const dx = (b.x - a.x) / length;
  const dy = (b.y - a.y) / length;
  const { start, end } = wallExtents(story, wall);

  // The highest top of the wall at the distance s from a: the wall height, or the roof.
  const half = wall.thickness / 2;
  const limit = (s: number): number => {
    let top = height;
    for (const side of [-half, half]) {
      const z = ceiling({ x: a.x + dx * s - dy * side, y: a.y + dy * s + dx * side });
      if (z !== null) top = Math.min(top, z - base - ROOF_GAP);
    }
    return top;
  };
  const steps = Math.max(1, Math.ceil((end - start) / ROOF_STEP));
  const profile = Array.from({ length: steps + 1 }, (_, i) => {
    const s = start + ((end - start) * i) / steps;
    return { s, top: limit(s) };
  });
  const underRoof = profile.some((p) => p.top < height - 1e-6);

  const pieces: Piece[] = [];
  const glass: Piece[] = [];
  let cursor = start;
  const openings = story.openings
    .filter((o) => o.wallId === wall.id)
    .sort((p, q) => p.offset - q.offset);
  for (const opening of openings) {
    const o0 = Math.max(cursor, opening.offset - opening.width / 2);
    const o1 = Math.min(end, opening.offset + opening.width / 2);
    if (o1 <= o0) continue;
    const sill = Math.min(opening.sill, height);
    const head = Math.min(opening.sill + opening.height, height);
    pieces.push([cursor, o0, 0, height]);
    pieces.push([o0, o1, 0, sill]);
    pieces.push([o0, o1, head, height]);
    if (opening.kind === "window") glass.push([o0, o1, sill, head]);
    cursor = o1;
  }
  pieces.push([cursor, end, 0, height]);

  const angle = -Math.atan2(dy, dx);
  const place = (piece: Piece, thickness: number, material: THREE.Material, edges: boolean) => {
    const [s0, s1, y0, y1] = piece;
    if (s1 - s0 < 1e-4 || y1 - y0 < 1e-4) return;
    let geometry: THREE.BufferGeometry;
    const mesh = new THREE.Mesh();
    const inside = underRoof ? profile.filter((p) => p.s > s0 && p.s < s1) : [];
    const tops = [{ s: s0, top: limit(s0) }, ...inside, { s: s1, top: limit(s1) }];
    if (tops.every((p) => p.top >= y1 - 1e-6)) {
      geometry = new THREE.BoxGeometry(s1 - s0, y1 - y0, thickness);
      mesh.position.set(
        a.x + dx * ((s0 + s1) / 2),
        base + (y0 + y1) / 2,
        a.y + dy * ((s0 + s1) / 2),
      );
    } else {
      // The roof cuts the piece: a prism of its side view, from the bottom up to the roof. Only
      // the parts where the roof is above the bottom of the piece stay. A part of zero height
      // would still show its flat faces above the roof, for example over a window under a slope.
      const shapes = roofRuns(tops, y0).map(
        (run) =>
          new THREE.Shape([
            new THREE.Vector2(run[run.length - 1].s, y0),
            ...[...run].reverse().map((p) => new THREE.Vector2(p.s, Math.min(y1, p.top))),
            new THREE.Vector2(run[0].s, y0),
          ]),
      );
      if (shapes.length === 0) return;
      geometry = new THREE.ExtrudeGeometry(shapes, {
        depth: thickness,
        bevelEnabled: false,
      });
      geometry.translate(0, 0, -thickness / 2);
      mesh.position.set(a.x, base, a.y);
    }
    mesh.geometry = geometry;
    mesh.material = material;
    // A rotation by -angle about y turns the x axis of the box along the wall in (x, z).
    mesh.rotation.y = angle;
    group.add(mesh);
    if (edges)
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 20), materials.edge));
  };
  for (const piece of pieces) place(piece, wall.thickness, materials.wall, true);
  for (const piece of glass) place(piece, GLASS_THICKNESS, materials.glass, false);
}

/**
 * The runs of a wall profile where the top is above `bottom`. A run starts and ends where the
 * top crosses `bottom`, so each run is a part of the wall with a height above zero.
 */
function roofRuns(
  tops: { s: number; top: number }[],
  bottom: number,
): { s: number; top: number }[][] {
  const MIN = 1e-3;
  const runs: { s: number; top: number }[][] = [];
  let run: { s: number; top: number }[] = [];
  const crossing = (p: { s: number; top: number }, q: { s: number; top: number }) => ({
    s: p.s + ((q.s - p.s) * (bottom - p.top)) / (q.top - p.top),
    top: bottom,
  });
  tops.forEach((p, i) => {
    const above = p.top > bottom + MIN;
    const previous = tops[i - 1];
    if (previous && above !== previous.top > bottom + MIN) {
      run.push(crossing(previous, p));
      if (!above) {
        runs.push(run);
        run = [];
      }
    }
    if (above) run.push(p);
  });
  if (run.length > 0) runs.push(run);
  return runs.filter((r) => r.length >= 2 && r[r.length - 1].s - r[0].s > MIN);
}

/**
 * The triangles of a flat polygon, which can be non-convex: a face of a roof on an L-shaped
 * outline, for example. The polygon goes to 2D in its own plane: the function drops the axis
 * where its normal is largest. Then `ShapeUtils` cuts it into triangles.
 */
function triangles(polygon: Vec3[]): Vec3[][] {
  if (polygon.length < 3) return [];
  if (polygon.length === 3) return [polygon];
  const n = newell(polygon);
  const [ax, ay, az] = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
  const flat = polygon.map((p) =>
    az >= ax && az >= ay
      ? new THREE.Vector2(p.x, p.y)
      : ay >= ax
        ? new THREE.Vector2(p.z, p.x)
        : new THREE.Vector2(p.y, p.z),
  );
  return THREE.ShapeUtils.triangulateShape(flat, []).map(([a, b, c]) => {
    // ShapeUtils can turn the triangle around. It must go the same way as the polygon, so that
    // its normal points out.
    const t = newell([polygon[a], polygon[b], polygon[c]]);
    const same = t.x * n.x + t.y * n.y + t.z * n.z >= 0;
    return same ? [polygon[a], polygon[b], polygon[c]] : [polygon[a], polygon[c], polygon[b]];
  });
}

/** The normal of a polygon by Newell's method. Its length is twice the area of the polygon. */
function newell(polygon: Vec3[]): Vec3 {
  const n = { x: 0, y: 0, z: 0 };
  polygon.forEach((p, i) => {
    const q = polygon[(i + 1) % polygon.length];
    n.x += (p.y - q.y) * (p.z + q.z);
    n.y += (p.z - q.z) * (p.x + q.x);
    n.z += (p.x - q.x) * (p.y + q.y);
  });
  return n;
}

/** A mesh of flat polygons, convex or not. */
function polygonMesh(polygons: Vec3[][], material: THREE.Material): THREE.Mesh | null {
  const positions: number[] = [];
  for (const polygon of polygons) {
    for (const triangle of triangles(polygon)) {
      for (const p of triangle) positions.push(p.x, p.z, p.y);
    }
  }
  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 1), materials.edge));
  return mesh;
}

/** A gable moves out by this distance in the 3D view, in meters. */
const GABLE_OUT = 0.005;

/**
 * The polygon moved by GABLE_OUT along its normal. A gable goes counterclockwise when you look at
 * it from outside, so its normal in the world (x, z, y) points out.
 */
function moveOut(polygon: Vec3[]): Vec3[] {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    // World coordinates: (x, height, plan y).
    nx += (p.z - q.z) * (p.y + q.y);
    ny += (p.y - q.y) * (p.x + q.x);
    nz += (p.x - q.x) * (p.z + q.z);
  }
  const size = Math.hypot(nx, ny, nz);
  if (size < 1e-12) return polygon;
  const k = GABLE_OUT / size;
  return polygon.map((p) => ({ x: p.x + nx * k, y: p.y + nz * k, z: p.z + ny * k }));
}

/** The roofs: faces, gable walls, dormers with their windows, and roof windows. */
function addRoofs(group: THREE.Group, building: Building, roofs: Roof[]): void {
  const shown = new Set(roofs.map((r) => r.id));
  for (const { roof, geometry } of roofGeometries(building)) {
    if (!shown.has(roof.id)) continue;
    const object = new THREE.Group();
    object.name = roof.name;
    const add = (polygons: Vec3[][], material: THREE.Material) => {
      const mesh = polygonMesh(polygons, material);
      if (mesh) object.add(mesh);
    };
    add(
      geometry.faces.map((f) => f.polygon),
      materials.roof,
    );
    // A gable of a pitched roof is in the plane of the outer face of the walls under it, for
    // example of an attic. It moves out a bit, so that the two surfaces do not flicker.
    add(roof.flat ? geometry.gables : geometry.gables.map(moveOut), materials.gable);
    add(
      geometry.dormers.flatMap((d) => d.faces),
      materials.roof,
    );
    add(
      geometry.dormers.flatMap((d) => d.walls),
      materials.gable,
    );
    add(
      geometry.dormers.map((d) => d.window).filter((w) => w.length >= 3),
      materials.glass,
    );
    add(
      geometry.windows.map((w) => w.quad),
      materials.roofWindow,
    );
    // The sides of each roof window go down to the face, so that the window sits on the roof.
    add(
      geometry.windows.flatMap(({ quad }) =>
        quad.map((p, k) => {
          const q = quad[(k + 1) % quad.length];
          const down = (v: Vec3) => ({ ...v, z: v.z - WINDOW_LIFT - 0.01 });
          return [q, p, down(p), down(q)];
        }),
      ),
      materials.roofWindow,
    );
    group.add(object);
  }
}

// ----- Building services -----

/** The devices and the lines of a story, for the systems that the layers show. */
function addServices(group: THREE.Group, story: Story, layers: ServiceLayers): void {
  const shown = (system: Fixture["system"]) =>
    system === "electric" ? layers.electric : layers.heating;
  for (const fixture of story.fixtures) {
    if (shown(fixture.system)) group.add(fixtureObject(story, fixture));
  }
  for (const run of story.runs) {
    if (!shown(run.system)) continue;
    const object = runObject(story, run);
    if (object) group.add(object);
  }
}

/**
 * A device in the world. As for furniture, the group has the position and the rotation of the
 * device: x goes along the wall, y goes up, and z goes to the front, away from the wall. The
 * origin of the group is at the center of the device, on the face of the wall.
 */
function fixtureObject(story: Story, fixture: Fixture): THREE.Group {
  const group = new THREE.Group();
  group.name = fixture.label || fixture.type;
  group.position.set(fixture.x, story.elevation + fixture.elevation, fixture.y);
  group.rotation.y = (-fixture.rotation * Math.PI) / 180;
  const box = (
    width: number,
    height: number,
    depth: number,
    material: THREE.Material,
    z = depth / 2,
    y = 0,
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(0, y, z);
    group.add(mesh);
    return mesh;
  };
  const disc = (radius: number, thickness: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, thickness, 24),
      material,
    );
    mesh.position.y = -thickness / 2;
    group.add(mesh);
    return mesh;
  };
  switch (fixture.type) {
    case "socket":
    case "socket-double":
    case "data":
    case "switch":
    case "switch-2way":
    case "junction": {
      // A flat plate on the wall, with a small colored mark for the kind of device.
      const width = fixture.type === "socket-double" ? 0.16 : 0.08;
      box(width, 0.08, 0.012, materials.plate);
      const accent = fixture.type === "data" ? materials.device : materials.accent;
      box(width * 0.4, 0.02, 0.004, accent, 0.014);
      break;
    }
    case "light-ceiling":
    case "smoke":
      // A disc that hangs from the ceiling: the elevation is the height of the ceiling.
      disc(
        fixture.type === "smoke" ? 0.06 : 0.15,
        0.04,
        fixture.type === "smoke" ? materials.plate : materials.lamp,
      );
      break;
    case "light-wall":
      box(0.2, 0.1, 0.08, materials.lamp);
      break;
    case "board":
      box(fixture.width, 0.6, 0.12, materials.device);
      break;
    case "radiator":
    case "towel-radiator": {
      const height = fixture.type === "towel-radiator" ? 1.2 : 0.6;
      box(fixture.width, height, 0.1, materials.radiator, 0.07);
      break;
    }
    case "manifold":
      box(fixture.width, 0.4, 0.1, materials.device);
      break;
    case "boiler":
      box(fixture.width, 0.75, 0.4, materials.radiator);
      break;
    case "heat-pump":
      box(fixture.width, 1.0, 0.5, materials.device);
      break;
    default:
      box(0.1, 0.1, 0.05, materials.device);
  }
  return group;
}

/** One material for each color of a line, so that a new build makes no new materials. */
const runMaterials = new Map<string, THREE.Material>();
function runMaterial(color: string): THREE.Material {
  let material = runMaterials.get(color);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
    runMaterials.set(color, material);
  }
  return material;
}

/**
 * A line as thin tubes along its points, at its height above the floor. Where an end connects
 * to a device, a vertical tube goes to the height of that device.
 */
function runObject(story: Story, run: Run): THREE.Group | null {
  if (run.points.length < 2) return null;
  const kind = runKind(run.kind);
  const radius = run.system === "heating" ? 0.015 : 0.008;
  const material = runMaterial(kind.color);
  const group = new THREE.Group();
  group.name = kind.name;
  const height = story.elevation + run.elevation;
  const tube = (from: THREE.Vector3, to: THREE.Vector3) => {
    const length = from.distanceTo(to);
    if (length < 1e-4) return;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), material);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    // The cylinder of three.js goes along y. The quaternion turns y to the direction of the tube.
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      to.clone().sub(from).normalize(),
    );
    group.add(mesh);
  };
  const points = run.points.map((p) => new THREE.Vector3(p.x, height, p.y));
  for (let i = 1; i < points.length; i++) tube(points[i - 1], points[i]);
  const ends: [Id | null, THREE.Vector3][] = [
    [run.from, points[0]],
    [run.to, points[points.length - 1]],
  ];
  for (const [id, end] of ends) {
    const fixture = id ? story.fixtures.find((f) => f.id === id) : undefined;
    if (!fixture) continue;
    tube(end, new THREE.Vector3(end.x, story.elevation + fixture.elevation, end.z));
  }
  return group;
}

/** The PV panels on the roof: thin dark boxes on the corners that pv.ts gives. */
function addPv(group: THREE.Group, building: Building, roofIds: Set<string>): void {
  const arrays = new Set(building.pv.filter((a) => roofIds.has(a.roofId)).map((a) => a.id));
  const panels = pvPanels(building).filter((panel) => arrays.has(panel.array));
  if (panels.length === 0) return;
  const pv = new THREE.Group();
  pv.name = "PV";
  const thickness = 0.035;
  for (const panel of panels) {
    const [a, b, c, d] = panel.corners.map((p) => new THREE.Vector3(p.x, p.z, p.y));
    // The corners already lie a little above the face (PANEL_LIFT in pv.ts). The panel goes up
    // from them by its thickness, along the normal of the corners, which points out of the roof.
    const normal = new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(d, a))
      .normalize();
    if (normal.y < 0) normal.negate();
    const bottom = [a, b, c, d];
    const top = bottom.map((p) => p.clone().addScaledVector(normal, thickness));
    const positions: number[] = [];
    const quad = (p: THREE.Vector3[]) => {
      for (const i of [0, 1, 2, 0, 2, 3]) positions.push(p[i].x, p[i].y, p[i].z);
    };
    quad(top);
    quad(bottom.slice().reverse());
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      quad([bottom[i], bottom[j], top[j], top[i]]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, materials.pv);
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 1), materials.pvFrame));
    pv.add(mesh);
  }
  group.add(pv);
}

/** A flat red arrow on the ground that points north, with the letter N at its tip. */
function northArrow(): THREE.Group {
  const group = new THREE.Group();
  const shape = new THREE.Shape([
    new THREE.Vector2(0, 0.9),
    new THREE.Vector2(0.35, -0.5),
    new THREE.Vector2(0, -0.25),
    new THREE.Vector2(-0.35, -0.5),
  ]);
  const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), materials.north);
  // The rotation maps the shape +y to the world -z, which is the plan -y.
  arrow.rotation.x = -Math.PI / 2;
  group.add(arrow);

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#d94b3b";
    context.font = "bold 52px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("N", 32, 34);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }),
    );
    sprite.scale.set(0.6, 0.6, 1);
    sprite.position.set(0, 0.3, -1.3);
    group.add(sprite);
  }
  return group;
}
