import { t } from "../i18n";
import { planConflicts, type ConflictKind } from "../model/conflicts";
import type { Item } from "../model/types";
import { cached, doc, editor } from "./context";
import { button, heading } from "./panel";

/** The collisions of the active story. The 2D editor marks the same objects. */
const storyConflicts = () => cached("conflicts", () => planConflicts(doc.plan));

const KIND_TEXT: Record<ConflictKind, string> = {
  overlap: "Overlap",
  swing: "In the way of the leaf",
  corner: "Goes into the corner of the wall",
  "too-high": "Higher than the wall",
};

/** The name of an object of a collision, in the language of the app. */
function itemName(item: Item): string {
  const plan = doc.plan;
  switch (item.kind) {
    case "opening": {
      const opening = plan.openings.find((o) => o.id === item.id);
      return opening?.kind === "window" ? t("Window") : t("Door");
    }
    case "furniture": {
      const piece = plan.furniture.find((f) => f.id === item.id);
      return piece?.name ? t(piece.name) : t("Piece");
    }
    case "wall":
      return t("Wall");
    case "stair":
      return t("Stair");
    case "chimney":
      return t("Chimney");
    default:
      return item.kind;
  }
}

const same = (a: Item | null, b: Item) => !!a && a.kind === b.kind && a.id === b.id;

/**
 * The collisions of the story as buttons. With `only`, the collisions of that object, and a
 * click selects the other object. Without it, a click selects the first object.
 */
export function renderConflicts(only?: Item): void {
  const conflicts = storyConflicts().filter((c) => !only || same(c.a, only) || same(c.b, only));
  if (conflicts.length === 0) return;
  heading(t("Collisions"), "alert");
  for (const conflict of conflicts) {
    const target = only && same(conflict.a, only) ? (conflict.b ?? conflict.a) : conflict.a;
    const names = [conflict.a, conflict.b].filter((i): i is Item => i !== null).map(itemName);
    const element = button(names.join(" · "), () => editor.select(target), {
      icon: "alert",
      detail: t(KIND_TEXT[conflict.kind]),
      view: true,
    });
    element.classList.add("conflict");
  }
}
