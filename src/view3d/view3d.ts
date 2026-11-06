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
  stairShape,
} from "../model/building";
import { distance } from "../model/geometry";
import { wallEnds, wallExtents } from "../model/plan";
import { roofSurfaces, type Vec3 } from "../model/roof";
import { findRooms } from "../model/rooms";
import type { Building, Id, Point, Story, Wall } from "../model/types";

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
};

export interface ViewOptions {
  /** The story that the 2D editor shows. */
  activeStoryId: Id;
  /** True shows all stories and the roof. False shows the active story and the stories below. */
  showAbove: boolean;
}

export class View3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
  private controls: OrbitControls;
  private content = new THREE.Group();
  private north: THREE.Group;
  private frame = 0;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
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
    new ResizeObserver(() => this.resize()).observe(container);
  }

  /** The meshes of the visible building, without the grid, the lights, and the north arrow. */
  get model(): THREE.Object3D {
    return this.content;
  }

  update(building: Building, view: ViewOptions): void {
    disposeTree(this.content);
    this.content.clear();
    const active = findStory(building, view.activeStoryId);
    const visible = building.stories.filter(
      (s) => view.showAbove || !active || s.elevation <= active.elevation + 1e-6,
    );
    const roofStory = building.roof ? findStory(building, building.roof.storyId) : undefined;
    const showRoof =
      !!roofStory &&
      visible.includes(roofStory) &&
      (view.showAbove || roofStory.id === view.activeStoryId);
    this.content.add(buildGroup(building, visible, showRoof));
    this.placeNorth(building);
    this.requestRender();
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
  return buildGroup(building, building.stories, true);
}

function buildGroup(building: Building, stories: Story[], showRoof: boolean): THREE.Group {
  const group = new THREE.Group();
  const lowest = building.stories[0];
  for (const story of stories) {
    const storyGroup = new THREE.Group();
    storyGroup.name = story.name;
    addStory(storyGroup, building, story, story !== lowest);
    group.add(storyGroup);
  }
  if (showRoof) addRoof(group, building);
  return group;
}

function disposeTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose();
    }
  });
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
  for (const wall of story.walls) addWall(group, story, wall, base);
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

/**
 * Builds a wall as boxes around its openings, so no CSG is necessary. Each opening leaves a
 * hole: a part below the sill and a part above the head stay.
 */
function addWall(group: THREE.Group, story: Story, wall: Wall, base: number): void {
  const [a, b] = wallEnds(story, wall);
  const length = distance(a, b);
  if (length < 1e-6) return;
  const dx = (b.x - a.x) / length;
  const dy = (b.y - a.y) / length;
  const { start, end } = wallExtents(story, wall);
  const height = wall.height;

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

  const place = (piece: Piece, thickness: number, material: THREE.Material, edges: boolean) => {
    const [s0, s1, y0, y1] = piece;
    if (s1 - s0 < 1e-4 || y1 - y0 < 1e-4) return;
    const geometry = new THREE.BoxGeometry(s1 - s0, y1 - y0, thickness);
    const mesh = new THREE.Mesh(geometry, material);
    const s = (s0 + s1) / 2;
    mesh.position.set(a.x + dx * s, base + (y0 + y1) / 2, a.y + dy * s);
    // A rotation by -angle about y turns the x axis of the box along the wall in (x, z).
    mesh.rotation.y = -Math.atan2(dy, dx);
    group.add(mesh);
    if (edges) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), materials.edge));
  };
  for (const piece of pieces) place(piece, wall.thickness, materials.wall, true);
  for (const piece of glass) place(piece, GLASS_THICKNESS, materials.glass, false);
}

/** A mesh of flat convex polygons. Each polygon becomes a fan of triangles. */
function polygonMesh(polygons: Vec3[][], material: THREE.Material): THREE.Mesh | null {
  const positions: number[] = [];
  for (const polygon of polygons) {
    for (let i = 1; i + 1 < polygon.length; i++) {
      for (const p of [polygon[0], polygon[i], polygon[i + 1]]) positions.push(p.x, p.z, p.y);
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

function addRoof(group: THREE.Group, building: Building): void {
  const surfaces = roofSurfaces(building);
  if (!surfaces) return;
  const roof = new THREE.Group();
  roof.name = "Roof";
  const faces = polygonMesh(surfaces.faces, materials.roof);
  const gables = polygonMesh(surfaces.gables, materials.gable);
  if (faces) roof.add(faces);
  if (gables) roof.add(gables);
  group.add(roof);
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
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }),
    );
    sprite.scale.set(0.6, 0.6, 1);
    sprite.position.set(0, 0.3, -1.3);
    group.add(sprite);
  }
  return group;
}
