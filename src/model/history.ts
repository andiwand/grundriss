// The document holds the current building and the undo history.
//
// The history keeps snapshots, not commands. A transaction copies the building, and the edits
// change the copy. The old building goes on the undo stack without changes. A building has a
// few thousand objects at most, so a copy is cheap, and an undo can never be wrong.
//
// The copy shares the strings with the original. A string cannot change, so this is safe. The
// large data of a plan is in strings: the image of the background, the models, and the climate.
// So the snapshots of the history do not copy this data. The history keeps at most HISTORY_LIMIT
// entries.
//
// The 2D editor works on one story at a time: the active story. `plan` gives it, and `edit` and
// `update` change it. The choice of the active story is not part of the history.

import { emptyBuilding, findStory } from "./building";
import { normalize } from "./plan";
import type { Building, Id, Story } from "./types";

/** The most entries of the undo history. */
export const HISTORY_LIMIT = 200;

/**
 * A deep copy of plain data: objects and arrays are new, and the strings, the numbers, and the
 * other values stay the same. The copy shares each string with the original.
 */
export function copyTree<T>(value: T): T {
  if (Array.isArray(value)) return value.map(copyTree) as T;
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = copyTree(item);
    return result as T;
  }
  return value;
}

/** Compares plain data without encoding large images or ignoring parts of long strings. */
export function sameTree(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && sameTree(left[key], right[key]))
  );
}

export class PlanDocument {
  building: Building;
  private activeId: Id;
  private undoStack: Building[] = [];
  private redoStack: Building[] = [];
  private before: Building | null = null;
  private changed = false;
  /** True if `commit` compares the building with the one before, as at the end of a drag. */
  private compare = false;
  private saved: Building;
  /** Changes when another document replaces this one. Async work belongs to one generation. */
  generation = 0;
  private listeners = new Set<() => void>();

  constructor(building: Building = emptyBuilding()) {
    this.building = building;
    this.saved = building;
    this.activeId = building.stories[0].id;
  }

  /** Calls `listener` after each change. It gives a function that stops the calls. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The active story. If an undo removed it, the story nearest to the ground becomes active. */
  get plan(): Story {
    const story = findStory(this.building, this.activeId);
    if (story) return story;
    const ground = this.building.stories.reduce((best, s) =>
      Math.abs(s.elevation) < Math.abs(best.elevation) ? s : best,
    );
    this.activeId = ground.id;
    return ground;
  }

  get activeStoryId(): Id {
    return this.plan.id;
  }

  /** A guard for async work that must still belong to the same document, story, and variant. */
  captureTarget(): () => boolean {
    const generation = this.generation;
    const story = this.activeStoryId;
    const variant = this.building.variant;
    return () =>
      this.generation === generation &&
      this.activeStoryId === story &&
      this.building.variant === variant;
  }

  /** Makes another story active. The views update. */
  setActiveStory(id: Id): void {
    if (!findStory(this.building, id) || id === this.activeId) return;
    this.cancel();
    this.activeId = id;
    this.emit();
  }

  get dirty(): boolean {
    return this.building !== this.saved;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0 || this.before !== null;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get inTransaction(): boolean {
    return this.before !== null;
  }

  /** Starts a transaction, for example at the start of a drag. */
  begin(): void {
    if (this.before !== null) return;
    this.before = this.building;
    this.building = copyTree(this.building);
    this.changed = false;
    this.compare = true;
  }

  /** Changes the active story inside the open transaction. The views update at once. */
  update(edit: (plan: Story) => void): void {
    this.updateBuilding(() => edit(this.plan));
  }

  /** Changes the building inside the open transaction. */
  updateBuilding(edit: (building: Building) => void): void {
    if (this.before === null) throw new Error("update() needs an open transaction");
    edit(this.building);
    this.changed = true;
    this.emit();
  }

  /** Ends the transaction. A transaction without changes leaves no entry in the history. */
  commit(): void {
    if (this.before === null) return;
    if (this.changed) for (const story of this.building.stories) normalize(story);
    // A drag can end where it started. Then the building is the same, and it needs no entry.
    if (this.changed && this.compare && sameTree(this.before, this.building)) {
      this.changed = false;
    }
    if (this.changed) {
      this.undoStack.push(this.before);
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
      this.redoStack = [];
    } else {
      this.building = this.before;
    }
    this.before = null;
    this.changed = false;
    this.emit();
  }

  /** Ends the transaction and drops its changes. */
  cancel(): void {
    if (this.before === null) return;
    this.building = this.before;
    this.before = null;
    this.changed = false;
    this.emit();
  }

  /** Makes one change of the active story as one entry of the history. */
  edit(edit: (plan: Story) => void): void {
    this.editBuilding(() => edit(this.plan));
  }

  /** Makes one change of the building as one entry of the history. */
  editBuilding(edit: (building: Building) => void): void {
    this.begin();
    // One edit always changes something, so the comparison of a drag is not necessary.
    this.compare = false;
    try {
      this.updateBuilding(edit);
      this.commit();
    } catch (error) {
      this.cancel();
      throw error;
    }
  }

  /**
   * Makes one change of the active story, but only if `edit` gives true. If it gives false, the
   * document drops the copy, so the history gets no entry. It gives the result of `edit`.
   */
  editIf(edit: (plan: Story) => boolean): boolean {
    return this.editBuildingIf(() => edit(this.plan));
  }

  /** Makes one change of the building, but only if `edit` gives true. See `editIf`. */
  editBuildingIf(edit: (building: Building) => boolean): boolean {
    this.begin();
    this.compare = false;
    try {
      const changed = edit(this.building);
      if (changed) this.changed = true;
      // A transaction without changes puts back the building from before the copy.
      this.commit();
      return changed;
    } catch (error) {
      this.cancel();
      throw error;
    }
  }

  undo(): void {
    this.cancel();
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(this.building);
    this.building = previous;
    this.emit();
  }

  redo(): void {
    this.cancel();
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.building);
    this.building = next;
    this.emit();
  }

  /** Puts a new building in the document, for example from a file. It clears the history. */
  replace(building: Building): void {
    this.generation++;
    this.building = building;
    this.saved = building;
    this.before = null;
    this.undoStack = [];
    this.redoStack = [];
    const ground = building.stories.find((s) => s.elevation >= -1e-6) ?? building.stories[0];
    this.activeId = ground.id;
    this.emit();
  }

  /** Marks the snapshot that the file writer saved, which can precede the latest edit. */
  markSaved(building = this.building): void {
    this.saved = building;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
