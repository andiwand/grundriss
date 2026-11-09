// The editing in the 3D view: a click selects an object (and makes its story active), the mouse
// highlights the object under it, and a drag moves a selected object. Furniture, devices,
// stairs, and chimneys move on the floor. A door or a window moves along its wall, and keeps out
// of the other openings (`freeOffset`).

import * as THREE from "three";
import { distance, dot, scale, sub } from "../model/geometry";
import { freeOffset } from "../model/openings";
import { findOpening, findWall, moveFromOrigin, moveOrigin, wallEnds } from "../model/plan";
import type { Item, ItemKind, Point } from "../model/types";
import type { Pick } from "../view3d/view3d";
import { app, doc, editor, view3d } from "./context";

/** The kinds that a drag in the 3D view moves. */
const MOVABLE = new Set<ItemKind>(["furniture", "fixture", "stair", "chimney", "opening"]);
/** The step of a move, like the grid of the 2D editor. Alt moves without the step. */
const STEP = 0.05;
/** A ray that meets the plane of the drag farther away than this, in m, is not used. */
const FAR = 200;

const same = (a: Item, b: Item) => a.kind === b.kind && a.id === b.id;
const snap = (v: number, free: boolean) => (free ? v : Math.round(v / STEP) * STEP);

type Drag =
  | {
      kind: "floor";
      plane: THREE.Plane;
      start: THREE.Vector3;
      origin: ReturnType<typeof moveOrigin>;
    }
  | {
      kind: "opening";
      id: string;
      a: Point;
      dir: Point;
      plane: THREE.Plane;
      along: number;
      offset: number;
    };

/** The distance along the line from `a` in the direction `dir` of the world point. */
const alongOf = (p: THREE.Vector3, a: Point, dir: Point) =>
  dot({ x: p.x - a.x, y: p.z - a.y }, dir);

export function setupEdit3d(): void {
  let drag: Drag | null = null;
  const element = document.querySelector<HTMLElement>("#plan-3d")!;

  view3d.edit = {
    click(pick, e) {
      if (!pick) {
        if (!e.shiftKey) editor.select(null);
        return;
      }
      if (pick.storyId !== doc.activeStoryId) {
        doc.setActiveStory(pick.storyId);
        // A change of the story clears the selection in the next frame, unless it knows the story.
        app.shownStoryId = doc.activeStoryId;
        editor.select(pick.item);
        return;
      }
      // Shift adds the object to the selection, or takes it out.
      if (e.shiftKey) {
        const items = editor.selection;
        editor.select(
          items.some((i) => same(i, pick.item))
            ? items.filter((i) => !same(i, pick.item))
            : [...items, pick.item],
        );
      } else {
        editor.select(pick.item);
      }
    },

    hover(pick) {
      const movable =
        !doc.readOnly &&
        pick &&
        pick.storyId === doc.activeStoryId &&
        MOVABLE.has(pick.item.kind) &&
        editor.selection.some((i) => same(i, pick.item));
      element.style.cursor = movable ? "move" : pick ? "pointer" : "";
    },

    press(pick: Pick) {
      if (doc.readOnly) return false;
      if (pick.storyId !== doc.activeStoryId || !MOVABLE.has(pick.item.kind)) return false;
      const items = editor.selection;
      if (!items.some((i) => same(i, pick.item))) return false;
      const plan = doc.plan;
      if (pick.item.kind === "opening") {
        const opening = findOpening(plan, pick.item.id);
        const wall = opening && findWall(plan, opening.wallId);
        if (!opening || !wall) return false;
        const [a, b] = wallEnds(plan, wall);
        const length = distance(a, b);
        if (length === 0) return false;
        const dir = scale(sub(b, a), 1 / length);
        // The plane of the wall: vertical, through the line of the wall.
        const normal = new THREE.Vector3(-dir.y, 0, dir.x);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
          normal,
          new THREE.Vector3(a.x, 0, a.y),
        );
        drag = {
          kind: "opening",
          id: opening.id,
          a,
          dir,
          plane,
          along: alongOf(pick.point, a, dir),
          offset: opening.offset,
        };
      } else {
        // The other objects move on the horizontal plane at the height of the grab.
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -pick.point.y);
        // The selection moves together, but only the objects that can move.
        const moving = items.filter((i) => MOVABLE.has(i.kind) && i.kind !== "opening");
        drag = {
          kind: "floor",
          plane,
          start: pick.point.clone(),
          origin: moveOrigin(plan, moving),
        };
      }
      doc.begin();
      return true;
    },

    drag(ray, e) {
      if (!drag) return;
      if (!doc.inTransaction) {
        drag = null;
        return;
      }
      const hit = ray.intersectPlane(drag.plane, new THREE.Vector3());
      if (!hit || hit.distanceTo(ray.origin) > FAR) return;
      if (drag.kind === "floor") {
        const origin = drag.origin;
        const delta = {
          x: snap(hit.x - drag.start.x, e.altKey),
          y: snap(hit.z - drag.start.z, e.altKey),
        };
        doc.update((plan) => moveFromOrigin(plan, origin, delta));
      } else {
        const { id, a, dir, along, offset } = drag;
        const wanted = snap(offset + alongOf(hit, a, dir) - along, e.altKey);
        doc.update((plan) => {
          const opening = findOpening(plan, id);
          if (opening) opening.offset = freeOffset(plan, opening, wanted);
        });
      }
    },

    release() {
      if (!drag) return;
      drag = null;
      doc.commit();
    },
  };
}
