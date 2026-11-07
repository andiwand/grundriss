// The 3D stage of the website: the house of the story, built by the 3D builder of the app. Each
// chapter shows a part of the house and lets the next part grow from the bottom up: a clipping
// plane rises with the scroll. The camera and the light follow the chapter.

import * as THREE from "three";
import { buildModel } from "../../src/view3d/view3d";
import type { Building } from "../../src/model/types";

export interface Shot {
  /**
   * The part that is complete, and the part that grows. The growing part shows all of itself
   * below the height of the progress, so a base is only necessary for parts that the growing
   * part does not have, for example the walls of a story without its furniture.
   */
  base: string | null;
  grow: string | null;
  /** The height range of the growth in meters, from the scroll progress 0 to 1. */
  from: number;
  to: number;
  /** The camera: the angle around the house and above the ground in degrees, and the distance. */
  azimuth: number;
  elevation: number;
  distance: number;
  /** The point that the camera looks at, in plan coordinates and a height. */
  target: [number, number, number];
  mood: Mood;
}

export interface Mood {
  sun: number;
  sunColor: string;
  sky: string;
  ground: string;
  /** The direction of the sun: the angle around the house in degrees. */
  sunAzimuth: number;
}

const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class Stage3D {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.5, 400);
  private sun = new THREE.DirectionalLight(0xffffff, 2.4);
  private hemi = new THREE.HemisphereLight(0xffffff, 0xb0a48f, 1.4);
  private parts = new Map<string, THREE.Group>();
  private plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  private shot: Shot | null = null;
  private progress = 0;
  private spin = 0;
  private spinning = false;
  private last = 0;
  private sunColor = new THREE.Color();
  private skyColor = new THREE.Color();
  private groundColor = new THREE.Color();
  private frame = 0;
  private visible = true;
  // The camera moves to its goal with a little delay, so a jump of the scroll looks smooth.
  private view = { azimuth: 0, elevation: 30, distance: 30, tx: 6, ty: 2, tz: 4.5 };

  constructor(container: HTMLElement, parts: Record<string, Building>) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;
    this.canvas = this.renderer.domElement;
    container.append(this.canvas);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    const box = this.sun.shadow.camera;
    box.left = box.bottom = -16;
    box.right = box.top = 16;
    box.near = 1;
    box.far = 80;
    this.sun.target.position.set(6, 0, 4.5);
    this.scene.add(this.sun, this.sun.target, this.hemi);

    // A disc of ground that fades out at its edge, and a layer that only takes the shadows.
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(30, 96),
      new THREE.MeshBasicMaterial({ map: groundTexture(), transparent: true, depthWrite: false }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(6, -0.02, 4.5);
    ground.renderOrder = -1;
    ground.name = "ground";
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.ShadowMaterial({ opacity: 0.22 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(6, -0.01, 4.5);
    shadow.receiveShadow = true;
    shadow.name = "ground";
    this.scene.add(ground, shadow);

    for (const [name, building] of Object.entries(parts)) {
      const group = buildModel(building);
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      group.visible = false;
      this.parts.set(name, group);
      this.scene.add(group);
    }

    new ResizeObserver(() => this.resize()).observe(container);
    new IntersectionObserver(([entry]) => (this.visible = entry.isIntersecting)).observe(container);
    this.resize();
    const tick = (time: number) => {
      this.frame = requestAnimationFrame(tick);
      if (this.visible) this.render(time);
    };
    this.frame = requestAnimationFrame(tick);
  }

  /** Sets the shot and the progress inside it. `spin` turns the house slowly, as in the hero. */
  set(shot: Shot, progress: number, spin = false): void {
    // The camera and the light move to the new shot over the next frames.
    this.shot = shot;
    this.progress = progress;
    this.spinning = spin;
  }

  private render(time: number): void {
    const shot = this.shot;
    if (!shot) return;
    const dt = Math.min(0.1, (time - (this.last || time)) / 1000);
    this.last = time;
    if (this.spinning) this.spin += dt * 4;
    else this.spin *= 0.96;

    // The camera follows its goal with a time constant of about 0.25 s.
    const k = 1 - Math.exp(-dt * 4);
    const v = this.view;
    v.azimuth = lerp(v.azimuth, shot.azimuth, k);
    v.elevation = lerp(v.elevation, shot.elevation, k);
    v.distance = lerp(v.distance, shot.distance, k);
    v.tx = lerp(v.tx, shot.target[0], k);
    v.ty = lerp(v.ty, shot.target[2], k);
    v.tz = lerp(v.tz, shot.target[1], k);
    const azimuth = ((v.azimuth + this.spin) * Math.PI) / 180;
    const elevation = (v.elevation * Math.PI) / 180;
    this.camera.position.set(
      v.tx + v.distance * Math.cos(elevation) * Math.sin(azimuth),
      v.ty + v.distance * Math.sin(elevation),
      v.tz + v.distance * Math.cos(elevation) * Math.cos(azimuth),
    );
    this.camera.lookAt(v.tx, v.ty, v.tz);

    const m = shot.mood;
    this.sunColor.lerp(new THREE.Color(m.sunColor), k);
    this.skyColor.lerp(new THREE.Color(m.sky), k);
    this.groundColor.lerp(new THREE.Color(m.ground), k);
    this.sun.color.copy(this.sunColor);
    this.sun.intensity = lerp(this.sun.intensity, m.sun, k);
    this.hemi.color.copy(this.skyColor);
    this.hemi.groundColor.copy(this.groundColor);
    const sunAngle = (m.sunAzimuth * Math.PI) / 180;
    this.sun.position.set(6 + 22 * Math.sin(sunAngle), 26, 4.5 + 22 * Math.cos(sunAngle));

    const show = (name: string | null) => {
      for (const [key, group] of this.parts) group.visible = key === name;
    };
    const ground = this.scene.children.filter((c) => c.name === "ground");
    this.renderer.clear();
    // The first pass: the ground and the complete part.
    this.renderer.clippingPlanes = [];
    show(shot.base);
    this.renderer.render(this.scene, this.camera);
    // The second pass: the part that grows, cut above the height of the progress.
    if (shot.grow) {
      for (const g of ground) g.visible = false;
      this.plane.constant = lerp(shot.from, shot.to, ease(this.progress));
      this.renderer.clippingPlanes = [this.plane];
      show(shot.grow);
      this.renderer.render(this.scene, this.camera);
      for (const g of ground) g.visible = true;
    }
  }

  private resize(): void {
    const parent = this.canvas.parentElement!;
    const { clientWidth: w, clientHeight: h } = parent;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // A narrow screen needs a wider view, so that the house still fits.
    this.camera.fov = w / h < 1 ? 48 : 32;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.renderer.dispose();
  }
}

/** A soft round patch of ground: light in the middle, and transparent at the edge. */
function groundTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const g = canvas.getContext("2d")!;
  const gradient = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255,255,255,0.75)");
  gradient.addColorStop(0.55, "rgba(255,255,255,0.35)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gradient;
  g.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
