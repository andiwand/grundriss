// The 3D view: it builds meshes from the plan after each change. The view only reads the plan.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { distance } from "../model/geometry";
import { wallEnds, wallExtents } from "../model/plan";
import { findRooms } from "../model/rooms";
import type { Plan, Wall } from "../model/types";

/** A part of a wall: from s0 to s1 along the wall, and from y0 to y1 in height. */
type Piece = [s0: number, s1: number, y0: number, y1: number];

const GLASS_THICKNESS = 0.02;

export class View3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
  private controls: OrbitControls;
  private content = new THREE.Group();
  private frame = 0;
  private materials = {
    wall: new THREE.MeshStandardMaterial({ color: 0xf2efe9, roughness: 0.9 }),
    edge: new THREE.LineBasicMaterial({ color: 0x9a958c }),
    floor: new THREE.MeshStandardMaterial({
      color: 0xc9a77c,
      roughness: 0.8,
      side: THREE.DoubleSide,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x9cc8e6,
      transparent: true,
      opacity: 0.35,
      roughness: 0.1,
    }),
  };

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

    this.camera.position.set(8, 10, 12);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener("change", () => this.requestRender());
    new ResizeObserver(() => this.resize()).observe(container);
  }

  /** The meshes of the plan, without the grid and the lights. The glTF export uses it. */
  get model(): THREE.Object3D {
    return this.content;
  }

  update(plan: Plan): void {
    this.content.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose();
      }
    });
    this.content.clear();
    for (const wall of plan.walls) this.addWall(plan, wall);
    for (const room of findRooms(plan)) {
      const shape = new THREE.Shape(room.polygon.map((p) => new THREE.Vector2(p.x, p.y)));
      const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), this.materials.floor);
      // The rotation maps the plane of the shape (x, y) to the floor (x, z).
      floor.rotation.x = Math.PI / 2;
      floor.position.y = 0.001;
      this.content.add(floor);
    }
    this.requestRender();
  }

  /** Points the camera at the whole plan. */
  fit(plan: Plan): void {
    if (plan.vertices.length === 0) {
      this.controls.target.set(0, 0, 0);
      this.camera.position.set(8, 10, 12);
    } else {
      const xs = plan.vertices.map((v) => v.x);
      const zs = plan.vertices.map((v) => v.y);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
      const size = Math.max(
        Math.max(...xs) - Math.min(...xs),
        Math.max(...zs) - Math.min(...zs),
        4,
      );
      this.controls.target.set(cx, 0, cz);
      this.camera.position.set(cx + 0.6 * size, 0.9 * size, cz + 1.1 * size);
    }
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

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  /**
   * Builds a wall as boxes around its openings, so no CSG is necessary. Each opening leaves a
   * hole: a part below the sill and a part above the head stay.
   */
  private addWall(plan: Plan, wall: Wall): void {
    const [a, b] = wallEnds(plan, wall);
    const length = distance(a, b);
    if (length < 1e-6) return;
    const dx = (b.x - a.x) / length;
    const dy = (b.y - a.y) / length;
    const { start, end } = wallExtents(plan, wall);
    const height = wall.height;

    const pieces: Piece[] = [];
    const glass: Piece[] = [];
    let cursor = start;
    const openings = plan.openings
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
      mesh.position.set(a.x + dx * s, (y0 + y1) / 2, a.y + dy * s);
      // A rotation by -angle about y turns the x axis of the box along the wall in (x, z).
      mesh.rotation.y = -Math.atan2(dy, dx);
      this.content.add(mesh);
      if (edges)
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), this.materials.edge));
    };
    for (const piece of pieces) place(piece, wall.thickness, this.materials.wall, true);
    for (const piece of glass) place(piece, GLASS_THICKNESS, this.materials.glass, false);
  }
}
