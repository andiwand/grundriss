// The Kenney Furniture Kit (CC0, kenney.nl). The app bundles its models in public/models/kenney/
// with a catalog. scripts/convert-kenney.mjs made them from the OBJ files of the kit: GLB files in
// meters, with the origin at the center of the bottom and the front at +z. A plan stores only the
// file name of a bundled model, because the app has the file. If the catalog is missing or
// damaged, loadKenneyCatalog gives an empty list. The category comes from the name, with the same
// rules as for the other sources.

import type { Category } from "../model/furniture";
import { guessCategory } from "./names";
import { newId } from "../model/plan";
import type { Model } from "../model/types";

export const KENNEY_FOLDER = "./models/kenney/";

export interface KenneyItem {
  file: string;
  name: string;
  category: Category;
  /** The size in meters: x across, y deep, z up. */
  size: { x: number; y: number; z: number };
  thumbnail?: string;
}

let catalog: Promise<KenneyItem[]> | null = null;

/** The catalog of the bundled kit, or an empty list if the app has no bundled kit. */
export function loadKenneyCatalog(): Promise<KenneyItem[]> {
  catalog ??= fetch(`${KENNEY_FOLDER}catalog.json`)
    .then((response) => (response.ok ? response.json() : []))
    .then((items: unknown) =>
      Array.isArray(items)
        ? (items as Omit<KenneyItem, "category">[]).map((item) => ({
            ...item,
            category: guessCategory(item.name),
          }))
        : [],
    )
    .catch(() => []);
  return catalog;
}

/** The URL of a bundled file. */
export const kenneyUrl = (file: string) => `${KENNEY_FOLDER}${file}`;

export function kenneyModel(item: KenneyItem): Model {
  return {
    id: newId("m"),
    name: item.name,
    origin: "kenney",
    ref: item.file,
    data: null,
    size: { ...item.size },
    license: "CC0 1.0",
    credit: "Kenney (kenney.nl)",
  };
}
