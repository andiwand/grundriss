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
  storyBelow,
  stairShape,
} from "../model/building";
import { genericBlocks, type Block, type Finish } from "../model/furniture";
import { wallSideColor } from "../model/colors";
import { distance, perpendicular } from "../model/geometry";
import { wallEnds } from "../model/plan";
import { pvPanels } from "../model/pv";
import { roofCeiling, roofGeometries, type Vec3 } from "../model/roof";
import { WINDOW_LIFT } from "../model/roofshape";
import { findRooms, pointInPolygon, type Room } from "../model/rooms";
import { wallFaces } from "../model/walljoin";
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

const GLASS_THICKNESS = 0.02;

/** The materials are shared by all meshes, so a new build makes no new materials. */
const materials = {
  wall: new THREE.MeshStandardMaterial({ color: 0xf2efe9, roughness: 0.9 }),
  edge: new THREE.LineBasicMaterial({ color: 0x9a958c }),
  floor: new THREE.MeshStandardMaterial({
    color: 0xc9a77c,
    roughness: 0.8,
    side: THREE.DoubleSide,
    // The floor faces down after its rotation. The sun sees its back, so the shadow leaves out its
    // front side: the floor does not shadow itself, and the slab under it casts the shadow.
    shadowSide: THREE.FrontSide,
    // The floor lies on the top of the slab. The offset draws the floor in front of the slab,
    // so that the two surfaces do not flicker when the camera is far away.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
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
    // With one story, a roof of the active story shows only if no story is above it. Else, for
    // example, the roof of a low wing hides the rooms of the story next to the higher part.
    const visibleIds = new Set(visible.map((s) => s.id));
    const roofs = building.roofs.filter(
      (roof) =>
        visibleIds.has(roof.storyId) &&
        (view.showAbove ||
          (roof.storyId === view.activeStoryId && !(active && storyAbove(building, active)))),
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
 * export does not depend on what the view shows. With `roofs` false, the roofs do not show, but
 * the walls under them still stop at them, for example the walls of an attic.
 */
export function buildModel(building: Building, options: { roofs?: boolean } = {}): THREE.Group {
  const roofs = options.roofs === false ? [] : building.roofs;
  return buildGroup(building, building.stories, roofs, ALL_LAYERS);
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
  holes: Point[][] = [],
): THREE.Mesh | null {
  if (top - bottom < 1e-4 || polygon.length < 3) return null;
  const shape = new THREE.Shape(polygon.map((p) => new THREE.Vector2(p.x, p.y)));
  for (const hole of holes)
    shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, p.y))));
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
  const rooms = findRooms(story);
  for (const wall of story.walls) {
    const height =
      wall.height >= floorAbove - SLAB - 1e-6 ? Math.max(wall.height, floorAbove) : wall.height;
    addWall(group, building, story, wall, base, height, ceiling, rooms);
  }
  // The stairs of the story below come up through the floor: the floor and the slab of a room
  // have a hole where such a stair is inside the room.
  const below = storyBelow(building, story);
  const stairHoles = below
    ? below.stairs.map((stair) => stairShape(stair, stairRise(building, below)).outline)
    : [];
  for (const room of rooms) {
    const holes = stairHoles.filter((hole) => hole.every((p) => pointInPolygon(p, room.polygon)));
    const shape = new THREE.Shape(room.polygon.map((p) => new THREE.Vector2(p.x, p.y)));
    for (const hole of holes) {
      shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, p.y))));
    }
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
      const mesh = prism(room.polygon, base - SLAB, base, materials.slab, false, holes);
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
/**
 * A wall under a pitched roof stops this much below the top of the roof: inside the slab of the
 * roof (ROOF_THICKNESS), so that the top of the wall and its lines do not show through the roof.
 */
const ROOF_INSET = 0.1;

/** The materials of the colors of walls and roofs, by the color. */
const colorMaterials = new Map<string, THREE.MeshStandardMaterial>();

/**
 * A shared material of the color, for the faces of walls and roofs. Both sides show. A roof
 * material draws in front of other surfaces and lines in its plane: the top edge of a wall under
 * the eaves lies exactly in the surface of the roof, and it must not show through.
 */
function colorMaterial(color: string, roof = false): THREE.MeshStandardMaterial {
  const key = `${roof ? "roof" : "wall"}:${color}`;
  let material = colorMaterials.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      // The faces of a body point outward, so one side is enough. The underside of a roof shows
      // from below, because it is a face of the slab.
      side: THREE.FrontSide,
      shadowSide: THREE.BackSide,
      polygonOffset: roof,
      polygonOffsetFactor: roof ? -1 : 0,
      polygonOffsetUnits: roof ? -4 : 0,
    });
    colorMaterials.set(key, material);
  }
  return material;
}

/**
 * Collects the triangles and the edge lines of one body. The triangles go into groups by
 * material, so that one mesh has all faces of a wall.
 */
class BodyBuilder {
  private readonly positions: number[][];
  private readonly lines: number[] = [];

  constructor(private readonly materials: THREE.Material[]) {
    this.positions = materials.map(() => []);
  }

  /** Adds a convex polygon of world points (x, y up, z) with the material `index`. */
  polygon(index: number, points: THREE.Vector3[], outward: THREE.Vector3): void {
    // The triangles turn so that their normal points outward: then the material shows one side,
    // and the shadow uses the side away from the light, without self-shadowing (acne).
    const normal = new THREE.Vector3();
    for (let i = 1; i < points.length - 1 && normal.lengthSq() < 1e-12; i++) {
      normal.crossVectors(
        new THREE.Vector3().subVectors(points[i], points[0]),
        new THREE.Vector3().subVectors(points[i + 1], points[0]),
      );
    }
    if (normal.dot(outward) < 0) points = [...points].reverse();
    for (let i = 1; i < points.length - 1; i++) {
      for (const p of [points[0], points[i], points[i + 1]])
        this.positions[index].push(p.x, p.y, p.z);
    }
  }

  /** Adds an edge line through the points. */
  line(points: THREE.Vector3[]): void {
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1];
      const q = points[i];
      this.lines.push(p.x, p.y, p.z, q.x, q.y, q.z);
    }
  }

  /** The mesh with its edge lines, or null if it has no triangles. */
  build(): THREE.Mesh | null {
    const all: number[] = [];
    const geometry = new THREE.BufferGeometry();
    this.positions.forEach((list, index) => {
      if (list.length === 0) return;
      geometry.addGroup(all.length / 3, list.length / 3, index);
      for (const value of list) all.push(value);
    });
    if (all.length === 0) return null;
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(all, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, this.materials);
    if (this.lines.length > 0) {
      const edges = new THREE.BufferGeometry();
      edges.setAttribute("position", new THREE.Float32BufferAttribute(this.lines, 3));
      mesh.add(new THREE.LineSegments(edges, materials.edge));
    }
    return mesh;
  }
}

/** The material indices of a wall body: the right face, the left face, and the rest. */
const RIGHT = 0;
const LEFT = 1;
const REST = 2;
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Builds a wall as one body: its two faces with the colors of their sides, its top, the reveals
 * of its openings, and its free ends. The faces end at the joins with other walls (see
 * `wallFaces`): flush where a wall goes on straight, in a miter at a corner, and at the face of
 * the other wall at a T. Edge lines show only at real edges, not at the joints of the faces.
 *
 * `ceiling` gives the height of a roof over a point of the plan. A wall under a roof, for example
 * a wall of an attic, stops at the roof: its top follows the lower of its two faces.
 */
function addWall(
  group: THREE.Group,
  building: Building,
  story: Story,
  wall: Wall,
  base: number,
  height: number,
  ceiling: (p: Point) => number | null,
  rooms: Room[],
): void {
  const [a, b] = wallEnds(story, wall);
  const length = distance(a, b);
  if (length < 1e-6) return;
  const d = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  const n = perpendicular(d);
  const half = wall.thickness / 2;
  const faces = wallFaces(story, wall);
  const start = Math.min(faces.right[0], faces.left[0]);
  const end = Math.max(faces.right[1], faces.left[1]);
  /** The world point at s along the wall, at o across it (+ is the right side), at height y. */
  const at = (s: number, o: number, y: number) =>
    new THREE.Vector3(a.x + d.x * s + n.x * o, base + y, a.y + d.y * s + n.y * o);

  // The highest top of the wall at s: the wall height, or the roof over one of the faces.
  const limit = (s: number): number => {
    let top = height;
    for (const o of [-half, half]) {
      const z = ceiling({ x: a.x + d.x * s + n.x * o, y: a.y + d.y * s + n.y * o });
      if (z !== null) top = Math.min(top, z - base - ROOF_INSET);
    }
    return top;
  };
  const coarse = Array.from({ length: 9 }, (_, i) => limit(start + ((end - start) * i) / 8));
  const underRoof = coarse.some((top) => top < height - 1e-6) || limit(start) < height;

  const openings = story.openings
    .filter((o) => o.wallId === wall.id)
    .map((o) => ({
      kind: o.kind,
      s0: Math.max(start, o.offset - o.width / 2),
      s1: Math.min(end, o.offset + o.width / 2),
      sill: Math.max(0, Math.min(o.sill, height)),
      head: Math.min(o.sill + o.height, height),
    }))
    .filter((o) => o.s1 - o.s0 > 1e-4 && o.head - o.sill > 1e-4)
    .sort((p, q) => p.s0 - q.s0);

  // The positions along the wall where the shape changes: the ends, the edges of the openings,
  // and, under a roof, a step of ROOF_STEP so that the top follows the roof.
  const cuts = new Set<number>([start, end, ...faces.right, ...faces.left]);
  for (const o of openings) cuts.add(o.s0).add(o.s1);
  if (underRoof) {
    const steps = Math.max(1, Math.ceil((end - start) / ROOF_STEP));
    for (let i = 1; i < steps; i++) cuts.add(start + ((end - start) * i) / steps);
  }
  const grid = [...cuts]
    .sort((p, q) => p - q)
    .filter((s, i, all) => i === 0 || s - all[i - 1] > 1e-6);
  const tops = new Map(grid.map((s) => [s, Math.max(0, limit(s))]));
  const top = (s: number) => tops.get(s) ?? Math.max(0, limit(s));
  /** The opening over the interval from s0 to s1, if one covers it. */
  const openingOver = (s0: number, s1: number) =>
    openings.find((o) => o.s0 <= s0 + 1e-6 && o.s1 >= s1 - 1e-6);

  const side = (s: 1 | -1) => wallSideColor(building, story, wall, s, rooms);
  const body = new BodyBuilder([colorMaterial(side(1)), colorMaterial(side(-1)), materials.wall]);

  // The two faces: columns between the cuts, with the openings left out.
  for (const sideSign of [1, -1] as const) {
    const [f0, f1] = sideSign === 1 ? faces.right : faces.left;
    const o = sideSign * half;
    const index = sideSign === 1 ? RIGHT : LEFT;
    for (let i = 1; i < grid.length; i++) {
      const s0 = grid[i - 1];
      const s1 = grid[i];
      if (s0 < f0 - 1e-6 || s1 > f1 + 1e-6) continue;
      const t0 = top(s0);
      const t1 = top(s1);
      if (t0 <= 1e-4 && t1 <= 1e-4) continue;
      const hole = openingOver(s0, s1);
      const spans: [number, number | null][] = hole
        ? [
            [0, hole.sill],
            [hole.head, null],
          ]
        : [[0, null]];
      for (const [y0, y1] of spans) {
        // y1 null means up to the top of the wall, which can slope under a roof.
        const u0 = y1 ?? t0;
        const u1 = y1 ?? t1;
        if (Math.max(u0, u1) <= y0 + 1e-4) continue;
        const points =
          u0 > y0 && u1 > y0
            ? [
                at(s0, o, y0),
                at(s1, o, y0),
                at(s1, o, Math.min(u1, t1)),
                at(s0, o, Math.min(u0, t0)),
              ]
            : u0 > y0
              ? [at(s0, o, y0), at(s0 + ((s1 - s0) * (u0 - y0)) / (u0 - u1), o, y0), at(s0, o, u0)]
              : [at(s1, o, y0), at(s1, o, u1), at(s1 - ((s1 - s0) * (u1 - y0)) / (u1 - u0), o, y0)];
        body.polygon(index, points, new THREE.Vector3(n.x * sideSign, 0, n.y * sideSign));
      }
    }
    // The edge lines of the face: the top, and the ends that are corners or free ends.
    const topLine: THREE.Vector3[] = [];
    const flush = () => {
      if (topLine.length > 1) body.line(topLine);
      topLine.length = 0;
    };
    for (const s of grid) {
      if (s < f0 - 1e-6 || s > f1 + 1e-6) continue;
      const covered = openings.some(
        (h) => h.s0 < s - 1e-6 && h.s1 > s + 1e-6 && h.head >= top(s) - 1e-4,
      );
      if (covered || top(s) <= 1e-4) flush();
      else topLine.push(at(s, o, top(s)));
    }
    flush();
    for (const [e, join] of [
      [f0, faces.joins[0]],
      [f1, faces.joins[1]],
    ] as const) {
      if (join !== "straight" && top(e) > 1e-4) body.line([at(e, o, 0), at(e, o, top(e))]);
    }
    for (const h of openings) {
      const head = Math.min(h.head, top(h.s0), top(h.s1));
      const box = [at(h.s0, o, h.sill), at(h.s0, o, head), at(h.s1, o, head), at(h.s1, o, h.sill)];
      body.line(h.sill > 1e-4 ? [...box, box[0]] : box);
    }
  }

  // The top: strips across the wall between the cuts, cut to the miters of the faces.
  const footprint = (s0: number, s1: number) => {
    // The polygon of the wall between s0 and s1 in (s, o): the faces can end at other places.
    const clip = (f: [number, number]) => [Math.max(s0, f[0]), Math.min(s1, f[1])] as const;
    const [r0, r1] = clip(faces.right);
    const [l0, l1] = clip(faces.left);
    if (r1 - r0 < 1e-6 && l1 - l0 < 1e-6) return null;
    return [
      { s: r0, o: half },
      { s: r1, o: half },
      { s: l1, o: -half },
      { s: l0, o: -half },
    ];
  };
  for (let i = 1; i < grid.length; i++) {
    const s0 = grid[i - 1];
    const s1 = grid[i];
    const hole = openingOver(s0, s1);
    if (hole && hole.head >= Math.min(top(s0), top(s1)) - 1e-4) continue;
    const shape = footprint(s0, s1);
    if (!shape) continue;
    const y = (s: number) => top(Math.abs(s - s0) < Math.abs(s - s1) ? s0 : s1);
    const points = shape.map((p) => at(p.s, p.o, y(p.s)));
    if (points.every((p) => p.y <= base + 1e-4)) continue;
    body.polygon(REST, points, UP);
  }

  // The reveals of the openings: the sill, the head, and the two jambs, across the wall.
  for (const h of openings) {
    const head = Math.min(h.head, top(h.s0), top(h.s1));
    if (h.sill > 1e-4) {
      body.polygon(
        REST,
        [
          at(h.s0, half, h.sill),
          at(h.s1, half, h.sill),
          at(h.s1, -half, h.sill),
          at(h.s0, -half, h.sill),
        ],
        UP,
      );
    }
    if (head < Math.min(top(h.s0), top(h.s1)) - 1e-4) {
      body.polygon(
        REST,
        [at(h.s0, half, head), at(h.s1, half, head), at(h.s1, -half, head), at(h.s0, -half, head)],
        DOWN,
      );
    }
    // A jamb faces into the opening: the jamb at the start along the wall, the other back.
    for (const [s, sign] of [
      [h.s0, 1],
      [h.s1, -1],
    ] as const) {
      body.polygon(
        REST,
        [at(s, half, h.sill), at(s, half, head), at(s, -half, head), at(s, -half, h.sill)],
        new THREE.Vector3(d.x * sign, 0, d.y * sign),
      );
    }
  }

  // A free end shows its end face and the line across its top.
  for (const [e, join] of [
    [start, faces.joins[0]],
    [end, faces.joins[1]],
  ] as const) {
    if (join !== "free" || top(e) <= 1e-4) continue;
    // The end at the start of the wall faces back along the wall, the other end forward.
    const sign = e === start ? -1 : 1;
    body.polygon(
      REST,
      [at(e, half, 0), at(e, half, top(e)), at(e, -half, top(e)), at(e, -half, 0)],
      new THREE.Vector3(d.x * sign, 0, d.y * sign),
    );
    body.line([at(e, half, top(e)), at(e, -half, top(e))]);
  }

  const mesh = body.build();
  if (mesh) group.add(mesh);

  // The glass of the windows, in the middle of the wall.
  for (const h of openings) {
    if (h.kind !== "window") continue;
    const head = Math.min(h.head, top(h.s0), top(h.s1));
    if (head - h.sill < 1e-4) continue;
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(h.s1 - h.s0, head - h.sill, GLASS_THICKNESS),
      materials.glass,
    );
    const middle = (h.s0 + h.s1) / 2;
    glass.position.set(a.x + d.x * middle, base + (h.sill + head) / 2, a.y + d.y * middle);
    glass.rotation.y = -Math.atan2(d.y, d.x);
    group.add(glass);
  }
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

/**
 * The rectangles of the doors and the windows on both faces of all walls, in plan coordinates
 * with the height above the ground as z. A gable in the plane of a face gets them as holes.
 */
function openingRects(building: Building): Vec3[][] {
  const rects: Vec3[][] = [];
  for (const story of building.stories) {
    for (const opening of story.openings) {
      const wall = story.walls.find((w) => w.id === opening.wallId);
      if (!wall) continue;
      const [a, b] = wallEnds(story, wall);
      const length = distance(a, b);
      if (length < 1e-6) continue;
      const d = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
      const n = perpendicular(d);
      const z0 = story.elevation + opening.sill;
      const z1 = z0 + opening.height;
      const s0 = opening.offset - opening.width / 2;
      const s1 = opening.offset + opening.width / 2;
      for (const o of [wall.thickness / 2, -wall.thickness / 2]) {
        const at = (s: number, z: number) => ({
          x: a.x + d.x * s + n.x * o,
          y: a.y + d.y * s + n.y * o,
          z,
        });
        rects.push([at(s0, z0), at(s1, z0), at(s1, z1), at(s0, z1)]);
      }
    }
  }
  return rects;
}

/** True if all points of `inner` are inside the flat polygon `outer`, in the plane of `outer`. */
function insidePolygon(inner: Vec3[], outer: Vec3[]): boolean {
  const n = newell(outer);
  const [ax, ay, az] = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
  const flat = (p: Vec3) =>
    az >= ax && az >= ay ? { x: p.x, y: p.y } : ay >= ax ? { x: p.z, y: p.x } : { x: p.y, y: p.z };
  const polygon = outer.map(flat);
  return inner.every((p) => pointInPolygon(flat(p), polygon));
}

/**
 * True if all points of `polygon` (3 or more) are in the plane of `plane`, within 5 cm. The glass
 * of a dormer is a little in front of its wall.
 */
function inPlane(polygon: Vec3[], plane: Vec3[]): boolean {
  if (polygon.length < 3 || plane.length < 3) return false;
  const n = newell(plane);
  const length = Math.hypot(n.x, n.y, n.z);
  if (length < 1e-12) return false;
  const o = plane[0];
  return polygon.every(
    (p) => Math.abs((n.x * (p.x - o.x) + n.y * (p.y - o.y) + n.z * (p.z - o.z)) / length) < 0.05,
  );
}

/**
 * The triangles of a flat polygon with holes in the same plane, for example a wall with a
 * window. The triangles go the same way as the polygon, so that their normal points out.
 */
function withHoles(polygon: Vec3[], holes: Vec3[][]): Vec3[][] {
  if (holes.length === 0) return triangles(polygon);
  const n = newell(polygon);
  const [ax, ay, az] = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
  const flat = (p: Vec3) =>
    az >= ax && az >= ay
      ? new THREE.Vector2(p.x, p.y)
      : ay >= ax
        ? new THREE.Vector2(p.z, p.x)
        : new THREE.Vector2(p.y, p.z);
  const points = [...polygon, ...holes.flat()];
  const shape = THREE.ShapeUtils.triangulateShape(
    polygon.map(flat),
    holes.map((hole) => hole.map(flat)),
  );
  return shape.map(([a, b, c]) => {
    const t = newell([points[a], points[b], points[c]]);
    const same = t.x * n.x + t.y * n.y + t.z * n.z >= 0;
    return same ? [points[a], points[b], points[c]] : [points[a], points[c], points[b]];
  });
}

/** A mesh of flat polygons, convex or not. */
function polygonMesh(
  polygons: Vec3[][],
  material: THREE.Material,
  edges = true,
): THREE.Mesh | null {
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
  if (edges) {
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 1), materials.edge));
  }
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
    const add = (polygons: Vec3[][], material: THREE.Material, edges = true) => {
      const mesh = polygonMesh(polygons, material, edges);
      if (mesh) object.add(mesh);
    };
    if (roof.flat) {
      add(
        geometry.faces.map((f) => f.polygon),
        colorMaterial(roof.color),
      );
    } else {
      // The main faces have a hole under each dormer, so that the window of the dormer shows the
      // room behind it and not the roof. A roof window has a hole too, so that its glass is
      // see-through.
      const faces = geometry.faces.map((face) => ({
        ...face,
        holes: geometry.holes
          .map((h) => h.polygon)
          .filter((hole) => inPlane(hole, face.polygon) && insidePolygon(hole, face.polygon)),
      }));
      const slab = roofSlab(faces, geometry.edges, roof, ROOF_THICKNESS);
      if (slab) object.add(slab);
    }
    // A gable of a pitched roof is in the plane of the outer face of the walls under it, for
    // example of an attic. It moves out a bit, so that the two surfaces do not flicker.
    // A gable has no lines: its top is in the plane of the roof, so its line would show on it.
    // It has a hole for each window or door of a wall in its plane, for example of an attic.
    const openings = openingRects(building);
    add(
      (roof.flat ? geometry.gables : geometry.gables.map(moveOut)).flatMap((gable) =>
        withHoles(
          gable,
          openings.filter((rect) => inPlane(rect, gable) && insidePolygon(rect, gable)),
        ),
      ),
      materials.gable,
      roof.flat,
    );
    // The roof of each dormer is a thinner slab of the same colors.
    for (const dormer of geometry.dormers) {
      const faces = dormerRoofFaces(dormer.faces, dormer.walls);
      const slab = roofSlab(faces, null, roof, DORMER_ROOF_THICKNESS);
      if (slab) object.add(slab);
    }
    // The wall of a dormer with the window has a hole for it, so that the glass is see-through.
    add(
      geometry.dormers.flatMap((d) =>
        d.walls.flatMap((wall) => (inPlane(d.window, wall) ? withHoles(wall, [d.window]) : [wall])),
      ),
      materials.gable,
    );
    add(
      geometry.dormers.map((d) => d.window).filter((w) => w.length >= 3),
      materials.glass,
    );
    // A roof window: the glass in the plane of its frame, and the frame, which goes down through
    // the roof to its underside, so that it lines the hole in the roof.
    add(
      geometry.windows.map((w) => w.quad),
      materials.glass,
      false,
    );
    add(
      geometry.windows.flatMap(({ quad }) => {
        const n = upNormal(quad);
        const depth = WINDOW_LIFT + ROOF_THICKNESS + 0.01;
        const down = (v: Vec3) => ({
          x: v.x - n.x * depth,
          y: v.y - n.y * depth,
          z: v.z - n.z * depth,
        });
        return quad.map((p, k) => {
          const q = quad[(k + 1) % quad.length];
          return [q, p, down(p), down(q)];
        });
      }),
      materials.roofWindow,
    );
    group.add(object);
  }
}

/** The thickness of a pitched roof in the 3D view, at a right angle to its faces, in meters. */
const ROOF_THICKNESS = 0.2;
/** The thickness of the roof of a dormer: a dormer has a lighter roof. */
const DORMER_ROOF_THICKNESS = 0.12;
/** The roof of a dormer reaches this far out over its walls, horizontally, in meters. */
const DORMER_OVERHANG = 0.15;

/**
 * The faces of the roof of a dormer, with an overhang: each edge of a face on the plane of a wall
 * of the dormer moves out in the plane of the face, so that the roof reaches DORMER_OVERHANG past
 * the wall. Without it, the edge of the slab would be in the plane of the wall and flicker.
 */
function dormerRoofFaces(faces: Vec3[][], walls: Vec3[][]): { polygon: Vec3[]; normal: Vec3 }[] {
  const planes = walls
    .filter((wall) => wall.length >= 3)
    .map((wall) => {
      const n = newell(wall);
      const length = Math.hypot(n.x, n.y, n.z) || 1;
      const normal = { x: n.x / length, y: n.y / length, z: n.z / length };
      return { normal, offset: normal.x * wall[0].x + normal.y * wall[0].y + normal.z * wall[0].z };
    });
  const onWall = (p: Vec3) =>
    planes.some(
      ({ normal: n, offset }) => Math.abs(n.x * p.x + n.y * p.y + n.z * p.z - offset) < 1e-3,
    );
  return faces
    .filter((polygon) => polygon.length >= 3)
    .map((polygon) => {
      const normal = upNormal(polygon);
      const center = polygon.reduce(
        (sum, p) => ({
          x: sum.x + p.x / polygon.length,
          y: sum.y + p.y / polygon.length,
          z: sum.z + p.z / polygon.length,
        }),
        { x: 0, y: 0, z: 0 },
      );
      const moves = polygon.map(() => ({ x: 0, y: 0, z: 0 }));
      polygon.forEach((p, i) => {
        const j = (i + 1) % polygon.length;
        const q = polygon[j];
        if (!onWall(p) || !onWall(q)) return;
        // The direction in the plane of the face, at a right angle to the edge, away from the face.
        const e = { x: q.x - p.x, y: q.y - p.y, z: q.z - p.z };
        let d = {
          x: e.y * normal.z - e.z * normal.y,
          y: e.z * normal.x - e.x * normal.z,
          z: e.x * normal.y - e.y * normal.x,
        };
        const middle = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: (p.z + q.z) / 2 };
        const away =
          (middle.x - center.x) * d.x + (middle.y - center.y) * d.y + (middle.z - center.z) * d.z;
        if (away < 0) d = { x: -d.x, y: -d.y, z: -d.z };
        const horizontal = Math.hypot(d.x, d.y);
        if (horizontal < 1e-9) return;
        const k = DORMER_OVERHANG / horizontal;
        for (const index of [i, j]) {
          moves[index].x += d.x * k;
          moves[index].y += d.y * k;
          moves[index].z += d.z * k;
        }
      });
      return {
        polygon: polygon.map((p, i) => ({
          x: p.x + moves[i].x,
          y: p.y + moves[i].y,
          z: p.z + moves[i].z,
        })),
        normal,
      };
    });
}

/**
 * A roof as a slab: the faces on top in the color of the roof, the same faces moved down by
 * `thickness` as the underside, and the edges of the slab (the fascia) at the outer sides of the
 * faces in the color of the underside. `normal` is the unit normal of a face, up and out. The
 * lines are `edges` (the ridges, hips, valleys, verges, and eaves), or the borders of the faces if
 * `edges` is null, not the triangles of the faces.
 */
function roofSlab(
  faces: { polygon: Vec3[]; normal: Vec3; holes?: Vec3[][] }[],
  edges: [Vec3, Vec3][] | null,
  roof: Roof,
  thickness: number,
): THREE.Mesh | null {
  const TOP = 0;
  const BOTTOM = 1;
  const body = new BodyBuilder([colorMaterial(roof.color, true), colorMaterial(roof.underside)]);
  const world = (p: Vec3) => new THREE.Vector3(p.x, p.z, p.y);
  const down = (p: Vec3, n: Vec3) => ({
    x: p.x - n.x * thickness,
    y: p.y - n.y * thickness,
    z: p.z - n.z * thickness,
  });
  // An edge that two faces share is inside the roof (a ridge, a hip, or a valley). The other
  // edges are on the outside of the slab and get a fascia.
  const key = (p: Vec3) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
  const count = new Map<string, number>();
  const edgeKey = (p: Vec3, q: Vec3) => [key(p), key(q)].sort().join("|");
  for (const face of faces) {
    face.polygon.forEach((p, i) => {
      const k = edgeKey(p, face.polygon[(i + 1) % face.polygon.length]);
      count.set(k, (count.get(k) ?? 0) + 1);
    });
  }
  for (const face of faces) {
    const polygon = face.polygon;
    if (polygon.length < 3) continue;
    const up = world(face.normal);
    const center = world({
      x: polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length,
      y: polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length,
      z: polygon.reduce((sum, p) => sum + p.z, 0) / polygon.length,
    });
    for (const triangle of withHoles(polygon, face.holes ?? [])) {
      body.polygon(TOP, triangle.map(world), up);
      body.polygon(
        BOTTOM,
        triangle.map((p) => world(down(p, face.normal))),
        up.clone().negate(),
      );
    }
    polygon.forEach((p, i) => {
      const q = polygon[(i + 1) % polygon.length];
      if (!edges) body.line([world(p), world(q)]);
      if ((count.get(edgeKey(p, q)) ?? 0) > 1) return;
      const fascia = [p, q, down(q, face.normal), down(p, face.normal)].map(world);
      // The fascia faces away from the middle of its face.
      const middle = new THREE.Vector3().addVectors(fascia[0], fascia[1]).multiplyScalar(0.5);
      body.polygon(BOTTOM, fascia, middle.sub(center));
      body.line([fascia[2], fascia[3]]);
    });
  }
  for (const [p, q] of edges ?? []) body.line([world(p), world(q)]);
  return body.build();
}

/** The unit normal of a roof face that points up, from its polygon. */
function upNormal(polygon: Vec3[]): Vec3 {
  const n = newell(polygon);
  const length = Math.hypot(n.x, n.y, n.z) || 1;
  const sign = n.z < 0 ? -1 : 1;
  return { x: (sign * n.x) / length, y: (sign * n.y) / length, z: (sign * n.z) / length };
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
