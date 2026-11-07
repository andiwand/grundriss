// Converts the Kenney Furniture Pack (CC0, kenney.nl) to the bundled models of the app.
//
// Run it once by hand. It is not part of the build:
//   node scripts/convert-kenney.mjs <folder of the unzipped kit>            converts the kit
//   node scripts/convert-kenney.mjs <folder of the unzipped kit> --inspect  prints sizes only
//
// The script reads the OBJ and MTL files of the kit as text. It runs nothing from the kit. The
// MTL files give only colors: the script removes each texture line before it parses a file.
//
// The output in public/models/kenney/: one GLB file per model in meters, with the origin at the
// center of the bottom of its box and the front at +z. Also thumbs/<name>.png, catalog.json,
// and License.txt.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

const kit = process.argv[2];
const inspect = process.argv.includes("--inspect");
if (!kit || !existsSync(join(kit, "Models"))) {
  console.error("Give the folder of the unzipped kit. It must contain the folder Models.");
  process.exit(1);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "models", "kenney");

// The OBJ files have "usemap" lines, which the loader ignores with a warning for each line.
const warn = console.warn;
console.warn = (...args) => {
  if (!String(args[0]).includes('"usemap"')) warn(...args);
};

// GLTFExporter reads blobs with FileReader, which Node does not have.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`;
      this.onloadend?.();
    });
  }
};

/** Loads one model with the colors of its MTL file. */
function load(name) {
  const models = join(kit, "Models");
  const objLoader = new OBJLoader();
  const mtlPath = join(models, `${name}.mtl`);
  if (existsSync(mtlPath)) {
    // A texture line would make the loader fetch an image. The colors are enough.
    const mtl = readFileSync(mtlPath, "utf8")
      .split(/\r?\n/)
      .filter((line) => !/^\s*(map_|bump|disp|decal|refl)/i.test(line))
      .join("\n");
    const materials = new MTLLoader().parse(mtl, "");
    materials.preload();
    objLoader.setMaterials(materials);
  }
  const group = objLoader.parse(readFileSync(join(models, `${name}.obj`), "utf8"));
  // The MTL loader makes Phong materials. glTF stores standard materials, so the colors go to
  // standard materials first.
  const standard = (m) =>
    new THREE.MeshStandardMaterial({
      name: m.name,
      color: m.color,
      opacity: m.opacity,
      transparent: m.transparent,
      roughness: 0.8,
      metalness: 0,
    });
  group.traverse((object) => {
    if (!object.isMesh) return;
    object.material = Array.isArray(object.material)
      ? object.material.map(standard)
      : standard(object.material);
  });
  return group;
}

/**
 * Parts of a building, not furniture: walls, floors, doorways, and paneling. The app draws its
 * own walls and floors, so the script skips these parts.
 */
const PARTS = /^(wall|floor|doorway|paneling)/i;

const names = readdirSync(join(kit, "Models"))
  .filter((file) => file.endsWith(".obj"))
  .map((file) => file.slice(0, -4))
  .filter((name) => !PARTS.test(name))
  .sort();

if (inspect) {
  // The centroid of the vertices in the top third shows the side of a backrest or a headboard.
  for (const name of names.filter((n) =>
    /^(bed|lounge|chair|toilet|bathtub|desk|bench)/i.test(n),
  )) {
    const group = load(name);
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const top = box.min.y + size.y * 0.66;
    let sx = 0;
    let sz = 0;
    let n = 0;
    group.traverse((object) => {
      if (!object.isMesh) return;
      const p = object.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) > top) {
          sx += p.getX(i);
          sz += p.getZ(i);
          n++;
        }
      }
    });
    const offset = n
      ? `x ${(sx / n - center.x).toFixed(2)} z ${(sz / n - center.z).toFixed(2)}`
      : "-";
    const dims = [size.x, size.y, size.z].map((v) => v.toFixed(2)).join(" x ");
    console.log(`${name.padEnd(28)} ${dims.padEnd(20)} high part: ${offset}`);
  }
  process.exit(0);
}

// ----- The conversion -----

/**
 * The kit uses its own unit. The factor turns it into meters. The check with --inspect gives
 * about 0.18 m per unit: a bed is 11.25 units long (2.03 m), and a chair is 4.7 units high.
 */
const UNIT = Number(process.env.KENNEY_UNIT ?? "0");
/**
 * The turn about the vertical axis, in degrees, that puts the front of each model at +z. The
 * kit has the backs of beds, sofas, chairs, and toilets at +z, so the turn is 180.
 */
const TURN = Number(process.env.KENNEY_TURN ?? "0");
if (!(UNIT > 0)) {
  console.error("Set KENNEY_UNIT (meters per unit of the kit). Run with --inspect first.");
  process.exit(1);
}

/** "bedDouble" gives "Bed double". */
function readable(name) {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
  return words[0].toUpperCase() + words.slice(1);
}

mkdirSync(join(out, "thumbs"), { recursive: true });
const catalog = [];
let bytes = 0;
for (const name of names) {
  const group = load(name);
  // Turn, scale to meters, and put the origin at the center of the bottom of the box.
  group.rotation.y = (TURN * Math.PI) / 180;
  group.scale.setScalar(UNIT);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  const wrapper = new THREE.Group();
  group.position.set(-center.x, -box.min.y, -center.z);
  wrapper.add(group);
  wrapper.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(wrapper).getSize(new THREE.Vector3());

  const glb = await new GLTFExporter().parseAsync(wrapper, { binary: true });
  const file = `${name}.glb`;
  writeFileSync(join(out, file), Buffer.from(glb));
  bytes += glb.byteLength;

  // The isometric preview from the south-east shows the front of most pieces.
  let thumbnail;
  for (const side of ["SE", "SW", "NE", "NW"]) {
    const png = join(kit, "Isometric", `${name}_${side}.png`);
    if (existsSync(png)) {
      thumbnail = `thumbs/${name}.png`;
      copyFileSync(png, join(out, thumbnail));
      break;
    }
  }
  const round = (v) => Math.round(v * 1000) / 1000;
  catalog.push({
    file,
    name: readable(name),
    // glTF has y up. The catalog uses the plan: x across, y deep, z up.
    size: { x: round(size.x), y: round(size.z), z: round(size.y) },
    ...(thumbnail ? { thumbnail } : {}),
  });
}
writeFileSync(join(out, "catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
copyFileSync(join(kit, "License.txt"), join(out, "License.txt"));
console.log(`${catalog.length} models, ${(bytes / 1024).toFixed(0)} KB of GLB files in ${out}`);
