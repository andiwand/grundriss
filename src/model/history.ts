// The document holds the current plan and the undo history.
//
// The history keeps snapshots, not commands. A transaction copies the plan, and the edits change
// the copy. The old plan goes on the undo stack without changes. A plan has a few hundred objects
// at most, so a copy is cheap, and an undo can never be wrong.

import { emptyPlan, normalize } from "./plan";
import type { Plan } from "./types";

export class PlanDocument {
  plan: Plan;
  private undoStack: Plan[] = [];
  private redoStack: Plan[] = [];
  private before: Plan | null = null;
  private changed = false;
  private saved: Plan;
  private listeners = new Set<() => void>();

  constructor(plan: Plan = emptyPlan()) {
    this.plan = plan;
    this.saved = plan;
  }

  /** Calls `listener` after each change. It gives a function that stops the calls. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get dirty(): boolean {
    return this.plan !== this.saved;
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
    this.before = this.plan;
    this.plan = structuredClone(this.plan);
    this.changed = false;
  }

  /** Changes the plan inside the open transaction. The views update at once. */
  update(edit: (plan: Plan) => void): void {
    if (this.before === null) throw new Error("update() needs an open transaction");
    edit(this.plan);
    this.changed = true;
    this.emit();
  }

  /** Ends the transaction. A transaction without changes leaves no entry in the history. */
  commit(): void {
    if (this.before === null) return;
    if (this.changed) {
      normalize(this.plan);
      this.undoStack.push(this.before);
      this.redoStack = [];
    } else {
      this.plan = this.before;
    }
    this.before = null;
    this.changed = false;
    this.emit();
  }

  /** Ends the transaction and drops its changes. */
  cancel(): void {
    if (this.before === null) return;
    this.plan = this.before;
    this.before = null;
    this.changed = false;
    this.emit();
  }

  /** Makes one change as one entry of the history. */
  edit(edit: (plan: Plan) => void): void {
    this.begin();
    this.update(edit);
    this.commit();
  }

  undo(): void {
    this.cancel();
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(this.plan);
    this.plan = previous;
    this.emit();
  }

  redo(): void {
    this.cancel();
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.plan);
    this.plan = next;
    this.emit();
  }

  /** Puts a new plan in the document, for example from a file. It clears the history. */
  replace(plan: Plan): void {
    this.plan = plan;
    this.saved = plan;
    this.before = null;
    this.undoStack = [];
    this.redoStack = [];
    this.emit();
  }

  markSaved(): void {
    this.saved = this.plan;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
