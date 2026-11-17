// The outdoor parts of a story in 3D: the areas as slabs (a pool as water, a neighbor as a box,
// and the plot as a line on the ground), the railings, the fences and hedges, and the trees.
//
// The plan point (x, y) is the world point (x, z), and the height is the world y.

import * as THREE from "three";
import { areaType, fenceType, RAILING_HEIGHT } from "../model/outdoor";
import type { Area, Fence, Point, Story, Tree } from "../model/types";

const materials = new Map<string, THREE.Material>();

/** A shared material of a color, so that many slabs use one. */
function material(color: string, opacity = 1): THREE.Material {
  const key = `${color}:${opacity}`;
  let found = materials.get(key);
  if (!found) {
    found = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 1,
    });
    found.userData.shared = true;
    materials.set(key, found);
  }
  return found;
}

const lineMaterials = new Map<string, THREE.LineBasicMaterial>();

function lineMaterial(color: string): THREE.LineBasicMaterial {
  let found = lineMaterials.get(color);
  if (!found) {
    found = new THREE.LineBasicMaterial({ color });
    lineMaterials.set(color, found);
  }
  return found;
}

/** A slab with the outline from `bottom` up to `top`, in world heights. */
function slab(points: Point[], bottom: number, top: number, mat: THREE.Material): THREE.Mesh {
  // The shape lies in x and −y; a turn of −90° about x puts it on the ground, and the extrusion
  // goes up.
  const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(p.x, -p.y)));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.005, top - bottom),
    bevelEnabled: false,
  });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = bottom;
  return mesh;
}

/** A box between two points of the plan, with a thickness, from `bottom` to `top`. */
function wallBox(
  p: Point,
  q: Point,
  thickness: number,
  bottom: number,
  top: number,
  mat: THREE.Material,
): THREE.Mesh | null {
  const length = Math.hypot(q.x - p.x, q.y - p.y);
  if (length < 1e-6 || top <= bottom) return null;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, top - bottom, thickness), mat);
  mesh.position.set((p.x + q.x) / 2, (bottom + top) / 2, (p.y + q.y) / 2);
  mesh.rotation.y = -Math.atan2(q.y - p.y, q.x - p.x);
  return mesh;
}

/** The surfaces from the lowest to the highest, where they lie on one height. */
const SURFACE_ORDER = ["lawn", "driveway", "path", "pool"];

function areaObject(area: Area, floor: number): THREE.Object3D | null {
  if (area.points.length < 3) return null;
  const type = areaType(area.kind);
  // Surfaces on one height do not flicker: the lower kinds sink by some millimeters, in the
  // order of the plan (a lawn under a path, a path under a terrace).
  const rank = SURFACE_ORDER.indexOf(area.kind);
  const top = floor + area.level + (rank >= 0 ? (rank - SURFACE_ORDER.length) * 0.004 : 0);
  const group = new THREE.Group();
  if (area.kind === "plot") {
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        area.points.map((p) => new THREE.Vector3(p.x, top + 0.02, p.y)),
      ),
      lineMaterial(type.color),
    );
    group.add(line);
    return group;
  }
  if (area.kind === "neighbor") {
    group.add(slab(area.points, top, top + area.thickness, material(type.color)));
  } else if (area.kind === "pool") {
    // The water a little under the edge.
    group.add(slab(area.points, top - 0.15, top - 0.1, material(type.color, 0.85)));
  } else {
    group.add(slab(area.points, top - area.thickness, top, material(type.color)));
  }
  // A railing: a panel of glass and a rail on top.
  const glass = material("#cfe0ea", 0.35);
  const rail = material("#6b7280");
  for (const side of area.railings) {
    const p = area.points[side];
    const q = area.points[(side + 1) % area.points.length];
    if (!p || !q) continue;
    const panel = wallBox(p, q, 0.02, top, top + RAILING_HEIGHT - 0.05, glass);
    const bar = wallBox(p, q, 0.05, top + RAILING_HEIGHT - 0.05, top + RAILING_HEIGHT, rail);
    if (panel) group.add(panel);
    if (bar) group.add(bar);
  }
  return group;
}

function fenceObject(fence: Fence, floor: number): THREE.Object3D {
  const type = fenceType(fence.kind);
  const group = new THREE.Group();
  const mat = material(type.color);
  fence.points.slice(1).forEach((q, i) => {
    const box = wallBox(fence.points[i], q, type.thickness, floor, floor + fence.height, mat);
    if (box) group.add(box);
  });
  return group;
}

function treeObject(tree: Tree, floor: number): THREE.Object3D {
  const group = new THREE.Group();
  const radius = tree.crown / 2;
  const trunkTop = Math.max(0.5, tree.height - (tree.deciduous ? 2 * radius : tree.height * 0.8));
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.1 + tree.crown * 0.01,
      0.14 + tree.crown * 0.015,
      trunkTop + 0.3,
      8,
    ),
    material("#7a5636"),
  );
  trunk.position.set(tree.x, floor + (trunkTop + 0.3) / 2, tree.y);
  group.add(trunk);
  if (tree.deciduous) {
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), material("#6aa84f"));
    // The crown is a sphere, a little flat, from the top of the trunk to the top of the tree.
    const height = Math.max(0.5, tree.height - trunkTop);
    crown.scale.set(radius, height / 2, radius);
    crown.position.set(tree.x, floor + trunkTop + height / 2, tree.y);
    group.add(crown);
  } else {
    const height = Math.max(0.5, tree.height - trunkTop);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 16), material("#2f6b45"));
    crown.position.set(tree.x, floor + trunkTop + height / 2, tree.y);
    group.add(crown);
  }
  return group;
}

/** Adds the outdoor parts of a story to its group. Each part names its item for a click. */
export function addOutdoor(group: THREE.Group, story: Story): void {
  const floor = story.elevation;
  const mark = (object: THREE.Object3D, item: { kind: string; id: string }) => {
    object.traverse((child) => (child.userData.item = item));
    group.add(object);
  };
  for (const area of story.areas) {
    const object = areaObject(area, floor);
    if (object) mark(object, { kind: "area", id: area.id });
  }
  for (const fence of story.fences)
    mark(fenceObject(fence, floor), { kind: "fence", id: fence.id });
  for (const tree of story.trees) mark(treeObject(tree, floor), { kind: "tree", id: tree.id });
}
