// Pure helpers for the furniture sources: names from file names, a guess of the category, and a
// guess of the unit of a model. They need no DOM and no Three.js, so the tests run in Node.

import type { Category } from "../model/furniture";

/** A readable name from a file name: "bedDouble.glb" gives "Bed double", "sofa_03" gives "Sofa 03". */
export function nameFromFile(file: string): string {
  const base = file.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
  const words = base
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : "Model";
}

/**
 * Words that decide the category. A word matches only at the start of a word of the name, so
 * "basket" does not match "oven", and "armchair" does not match "chair". The first category with
 * a matching word wins: "office chair" is work, not dining, and "cabinet bed" is sleeping, not
 * storage. A word with a space matches the two words in this order.
 */
const CATEGORY_WORDS: [Category, string[]][] = [
  ["bath", ["bath", "toilet", "shower", "washbasin", "basin", "washer", "dryer", "bidet"]],
  [
    "kitchen",
    [
      "kitchen",
      "fridge",
      "refrigerator",
      "stove",
      "oven",
      "hob",
      "microwave",
      "blender",
      "toaster",
    ],
  ],
  ["sleeping", ["bed", "nightstand", "night stand", "wardrobe", "dresser", "pillow", "crib"]],
  ["work", ["desk", "office", "computer", "laptop", "monitor", "printer", "keyboard", "mouse"]],
  ["lighting", ["lamp", "light", "chandelier", "lantern", "candle", "ceiling fan"]],
  [
    "living",
    [
      "sofa",
      "couch",
      "lounge",
      "armchair",
      "arm chair",
      "ottoman",
      "coffee table",
      "table coffee",
      "side table",
      "tv",
      "television",
      "radio",
      "speaker",
      "fireplace",
    ],
  ],
  [
    "storage",
    [
      "shelf",
      "shelves",
      "bookcase",
      "bookshelf",
      "cabinet",
      "cupboard",
      "sideboard",
      "commode",
      "chest",
      "drawer",
      "coat rack",
      "rack",
      "box",
      "crate",
      "basket",
      "trashcan",
      "bin",
    ],
  ],
  ["dining", ["dining", "chair", "stool", "bench", "table"]],
  [
    "decor",
    [
      "plant",
      "potted",
      "rug",
      "carpet",
      "vase",
      "painting",
      "picture",
      "frame",
      "mirror",
      "clock",
      "curtain",
      "book",
      "statue",
      "sculpture",
      "bear",
    ],
  ],
];

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One pattern for each category. A word matches at the start of a word of the text. */
const CATEGORY_PATTERNS: [Category, RegExp][] = CATEGORY_WORDS.map(([category, words]) => [
  category,
  new RegExp(`(^|[^a-z])(${words.map(escape).join("|")})`),
]);

/**
 * Guesses the category of a model. The name decides first. The tags decide only if the name
 * has no known word, because tags are often broad ("office" on an armchair).
 */
export function guessCategory(name: string, tags: string[] = []): Category {
  for (const words of [[name], tags]) {
    // "tableCoffee" and "table_coffee" become "table coffee".
    const text = words
      .join(" ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_\-.]+/g, " ")
      .toLowerCase();
    for (const [category, pattern] of CATEGORY_PATTERNS) {
      if (pattern.test(text)) return category;
    }
  }
  return "other";
}

/**
 * The factor that turns the size of a model into meters. Many files use centimeters or
 * millimeters. A piece of furniture is rarely larger than 30 m, so a larger model uses a smaller
 * unit.
 */
export function guessUnitFactor(size: { x: number; y: number; z: number }): number {
  const largest = Math.max(size.x, size.y, size.z);
  if (largest > 300) return 0.001;
  if (largest > 30) return 0.01;
  return 1;
}

/** Rounds a size in meters to millimeters. */
export function roundSize(size: { x: number; y: number; z: number }): {
  x: number;
  y: number;
  z: number;
} {
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { x: r(size.x), y: r(size.y), z: r(size.z) };
}

/** Base64 of bytes. `btoa` takes a string of bytes, so the bytes go in chunks. */
export function base64(bytes: Uint8Array): string {
  let text = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    text += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(text);
}

export const glbDataUrl = (bytes: Uint8Array) => `data:model/gltf-binary;base64,${base64(bytes)}`;
