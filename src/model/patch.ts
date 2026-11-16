// The changes between two versions of a building, as data. Many people can edit a plan of a
// server at the same time: each tab sends the changes of its user as a patch, and the server
// applies the patches in the order that they come, and sends each one to the other tabs.
//
// A patch names the objects by their id, not by their place in a list. So a patch still applies
// after the changes of another person: a wall that one person moves and a door that another
// person adds both stay. If two people change the same field, the later patch wins. A patch for
// an object that another person removed does nothing. `repairBuilding` then removes what refers
// to a removed object, for example a wall on a removed corner.
//
// The same functions make the undo of each person: an undo applies the patch back to the state
// before the change, so it does not undo the changes of the others.

import { normalize } from "./plan";
import type { Building, Layout } from "./types";
import { copyTree, sameTree } from "./history";

/**
 * A change of a value. `set` replaces it. `keys` changes the fields of an object. `items`
 * changes a list of objects with an id: the objects that changed, the new ones, the removed ones,
 * and the new order if it changed.
 */
export type Patch =
  | { t: "set"; v: unknown }
  | { t: "keys"; keys: Record<string, Patch>; drop?: string[] }
  | {
      t: "items";
      items: Record<string, Patch>;
      add?: { id: string }[];
      drop?: string[];
      order?: string[];
    };

type Data = Record<string, unknown>;

const isObject = (value: unknown): value is Data =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** True if the list has only objects with an id, each id once. An empty list is one too. */
function isKeyed(list: unknown[]): list is { id: string }[] {
  const ids = new Set<string>();
  for (const item of list) {
    if (!isObject(item) || typeof item.id !== "string" || ids.has(item.id)) return false;
    ids.add(item.id);
  }
  return true;
}

/** The change from `from` to `to`, or undefined if they are the same. */
export function diffTree(from: unknown, to: unknown): Patch | undefined {
  if (from === to) return undefined;
  if (isObject(from) && isObject(to)) {
    const keys: Record<string, Patch> = {};
    const drop: string[] = [];
    for (const [key, value] of Object.entries(to)) {
      if (value === undefined) continue;
      const change =
        from[key] === undefined ? { t: "set" as const, v: value } : diffTree(from[key], value);
      if (change) keys[key] = change;
    }
    for (const [key, value] of Object.entries(from)) {
      if (value !== undefined && to[key] === undefined) drop.push(key);
    }
    if (Object.keys(keys).length === 0 && drop.length === 0) return undefined;
    return drop.length ? { t: "keys", keys, drop } : { t: "keys", keys };
  }
  if (Array.isArray(from) && Array.isArray(to) && isKeyed(from) && isKeyed(to)) {
    const before = new Map(from.map((item) => [item.id, item]));
    const after = new Set(to.map((item) => item.id));
    const items: Record<string, Patch> = {};
    const add: { id: string }[] = [];
    for (const item of to) {
      const old = before.get(item.id);
      if (!old) add.push(item);
      else {
        const change = diffTree(old, item);
        if (change) items[item.id] = change;
      }
    }
    const drop = from.filter((item) => !after.has(item.id)).map((item) => item.id);
    // The order that the patch gives without `order`: the old order, then the new objects.
    const expected = [
      ...from.filter((item) => after.has(item.id)).map((item) => item.id),
      ...add.map((item) => item.id),
    ];
    const order = to.map((item) => item.id);
    const moved = order.some((id, i) => id !== expected[i]);
    if (Object.keys(items).length === 0 && !add.length && !drop.length && !moved) return undefined;
    return {
      t: "items",
      items,
      ...(add.length ? { add } : {}),
      ...(drop.length ? { drop } : {}),
      ...(moved ? { order } : {}),
    };
  }
  if (sameTree(from, to)) return undefined;
  return { t: "set", v: to };
}

/**
 * The value with the patch. The value does not change: the result is new where the patch
 * changes it, and shares the rest with the value. A change of an object or of a list that is not
 * there any more does nothing.
 */
export function applyPatch<T>(value: T, patch: Patch | undefined): T {
  if (!patch) return value;
  if (patch.t === "set") return copyTree(patch.v) as T;
  if (patch.t === "keys") {
    if (!isObject(value)) return value;
    const result: Data = { ...value };
    for (const key of patch.drop ?? []) delete result[key];
    for (const [key, change] of Object.entries(patch.keys)) {
      const next = applyPatch(result[key], change);
      if (next === undefined) delete result[key];
      else result[key] = next;
    }
    return result as T;
  }
  if (!Array.isArray(value) || !isKeyed(value)) return value;
  const drop = new Set(patch.drop ?? []);
  const added = new Map((patch.add ?? []).map((item) => [item.id, item]));
  const list: { id: string }[] = [];
  for (const item of value) {
    if (drop.has(item.id) || added.has(item.id)) continue;
    list.push(applyPatch(item, patch.items[item.id]));
  }
  for (const item of added.values()) list.push(copyTree(item));
  if (!patch.order) return list as T;
  const rank = new Map(patch.order.map((id, i) => [id, i]));
  // The objects in `order` take its order. The others, new from other people, follow.
  const known = list.filter((item) => rank.has(item.id));
  known.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return [...known, ...list.filter((item) => !rank.has(item.id))] as T;
}

/** The change of a building, without the header of the revision, which belongs to a file. */
export function diffBuildings(from: Building, to: Building): Patch | undefined {
  const { revision: _a, ...left } = from;
  const { revision: _b, ...right } = to;
  return diffTree(left, right);
}

/**
 * The building after the patch, as a new copy that the caller may change, with the references to
 * removed objects repaired.
 */
export function patchBuilding(building: Building, patch: Patch | undefined): Building {
  const result = copyTree(applyPatch(building, patch));
  repairBuilding(result);
  return result;
}

/**
 * Moves the changes from `base` to `local` onto `next`: the building that has the changes of the
 * others since `base`. The changes of `local` win where both changed the same field.
 */
export function rebase(base: Building, local: Building, next: Building): Building {
  if (local === base) return next;
  return patchBuilding(next, diffBuildings(base, local));
}

/**
 * Removes the objects that refer to an object that is not there, after the patches of two
 * people: a wall on a removed corner, a door in a removed wall, and a roof of a removed story.
 */
export function repairBuilding(building: Building): void {
  repairLayout(building);
  for (const variant of building.variants) if (variant.layout) repairLayout(variant.layout);
}

function repairLayout(layout: Layout): void {
  for (const story of layout.stories) {
    const vertices = new Set(story.vertices.map((v) => v.id));
    story.walls = story.walls.filter((w) => w.a !== w.b && vertices.has(w.a) && vertices.has(w.b));
    const fixtures = new Set(story.fixtures.map((f) => f.id));
    for (const run of story.runs) {
      if (run.from !== null && !fixtures.has(run.from)) run.from = null;
      if (run.to !== null && !fixtures.has(run.to)) run.to = null;
    }
    normalize(story);
  }
  layout.stories.sort((a, b) => a.elevation - b.elevation);
  const stories = new Set(layout.stories.map((s) => s.id));
  layout.roofs = layout.roofs.filter((roof) => stories.has(roof.storyId));
  for (const roof of layout.roofs) {
    // Two people can change the outline and the sides: each side of the outline needs one.
    while (roof.sides.length > roof.outline.length) roof.sides.pop();
    while (roof.sides.length < roof.outline.length && roof.sides.length > 0) {
      roof.sides.push(copyTree(roof.sides[roof.sides.length - 1]));
    }
  }
}
