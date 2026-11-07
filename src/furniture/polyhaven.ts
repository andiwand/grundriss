// Poly Haven: realistic CC0 models, loaded on demand from the public API. The API and the file
// hosts send "Access-Control-Allow-Origin: *", so the browser can call them directly.
//
// Endpoints:
// - https://api.polyhaven.com/assets?type=models&categories=furniture: the list of the models.
//   Its "dimensions" are in millimeters.
// - https://api.polyhaven.com/files/<id>: the files. gltf.<resolution>.gltf has the URL of the
//   .gltf file and "include": a map from the relative paths in the .gltf (the .bin and the
//   textures) to their URLs.

import * as THREE from "three";
import type { Category } from "../model/furniture";
import { newId } from "../model/plan";
import type { Model } from "../model/types";
import { loadGltf, measure, writeGlb } from "./gltf";
import { glbDataUrl, guessCategory, roundSize } from "./names";

const API = "https://api.polyhaven.com";

export interface PolyHavenItem {
  id: string;
  name: string;
  categories: string[];
  category: Category;
  thumbnail: string;
  authors: string[];
  /** The size in meters from the API: x across, y deep, z up. */
  size: { x: number; y: number; z: number };
}

interface AssetData {
  name?: string;
  categories?: string[];
  tags?: string[];
  authors?: Record<string, string>;
  dimensions?: number[];
  thumbnail_url?: string;
  download_count?: number;
}

/**
 * The items from the answer of the assets endpoint, the most downloaded first. The API gives
 * the dimensions in millimeters as [x, y, z] with z up.
 */
export function itemsFromAssets(assets: Record<string, AssetData>): PolyHavenItem[] {
  return Object.entries(assets)
    .sort(([, a], [, b]) => (b.download_count ?? 0) - (a.download_count ?? 0))
    .map(([id, data]) => {
      const [x = 1000, y = 1000, z = 1000] = data.dimensions ?? [];
      return {
        id,
        name: data.name ?? id,
        categories: data.categories ?? [],
        category: guessCategory(data.name ?? id, [
          ...(data.tags ?? []),
          ...(data.categories ?? []),
        ]),
        thumbnail:
          data.thumbnail_url ??
          `https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=256&height=256`,
        authors: Object.keys(data.authors ?? {}),
        size: roundSize({ x: x / 1000, y: y / 1000, z: z / 1000 }),
      };
    });
}

async function getJson<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error("The app cannot reach Poly Haven. Check the network connection.");
  }
  if (!response.ok) throw new Error(`Poly Haven answered with the error ${response.status}.`);
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error("Poly Haven sent an answer that the app cannot read. Try again later.");
  }
}

let list: Promise<PolyHavenItem[]> | null = null;

/** The furniture models of Poly Haven. The list loads once per session. */
export function listFurniture(): Promise<PolyHavenItem[]> {
  list ??= getJson<Record<string, AssetData>>(`${API}/assets?type=models&categories=furniture`)
    .then(itemsFromAssets)
    .catch((error: unknown) => {
      list = null;
      throw error;
    });
  return list;
}

interface FileEntry {
  url: string;
  size: number;
}

interface FilesData {
  gltf?: Record<string, { gltf?: FileEntry & { include?: Record<string, FileEntry> } }>;
}

/**
 * Downloads a model at a texture resolution ("1k", "2k", …) and stores it as one GLB. The GLB of
 * a model at 1k is about 0.5 MB to 3 MB.
 */
export async function downloadModel(item: PolyHavenItem, resolution = "1k"): Promise<Model> {
  const files = await getJson<FilesData>(`${API}/files/${encodeURIComponent(item.id)}`);
  const entry = files.gltf?.[resolution]?.gltf ?? files.gltf?.["1k"]?.gltf;
  if (typeof entry?.url !== "string")
    throw new Error(`Poly Haven has no glTF file of "${item.name}".`);
  const include = entry.include ?? {};

  // The .gltf file refers to its .bin and its textures with relative paths. The manager gives
  // the loader the URL of each file on the file host instead.
  const base = entry.url.slice(0, entry.url.lastIndexOf("/") + 1);
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    const relative = url.startsWith(base) ? url.slice(base.length) : url;
    return include[decodeURIComponent(relative)]?.url ?? url;
  });

  let scene;
  try {
    scene = await loadGltf(entry.url, manager);
  } catch {
    throw new Error(`The app cannot load "${item.name}" from Poly Haven. Try again later.`);
  }
  const glb = await writeGlb(scene);
  return {
    id: newId("m"),
    name: item.name,
    origin: "polyhaven",
    ref: item.id,
    data: glbDataUrl(glb),
    size: roundSize(measure(scene)),
    license: "CC0 1.0",
    credit: `Poly Haven: ${item.authors.join(", ") || "unknown author"}`,
  };
}
