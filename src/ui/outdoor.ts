// The topic Outdoor: the areas, the fences, and the trees of the active story, and the panel of
// their tools.

import { t } from "../i18n";
import { fmt } from "../model/format";
import {
  AREA_TYPES,
  areaSize,
  areaType,
  FENCE_TYPES,
  fenceLength,
  fenceType,
  outdoorLivingArea,
} from "../model/outdoor";
import { doc, editor, HINTS } from "./context";
import { button, heading, paragraph, selectField, stats } from "./panel";

const storiesNote = () =>
  t(
    "A balcony or a roof terrace goes on its story, for example on the floor above or on a flat roof. The plot, the lawn, and the neighbors go on the ground floor.",
  );

/** The panel of the topic without a selection: the outdoor parts of the active story. */
export function renderOutdoorPanel(): void {
  const plan = doc.plan;
  heading(t("Outdoor"), "tree");
  if (plan.areas.length + plan.fences.length + plan.trees.length === 0) {
    paragraph(
      t(
        "Draw the terraces, the paths, the lawn, and the plot with Area (A), the fences and the hedges with Fence (G), and put the trees with Tree (T).",
      ),
    );
  } else {
    const living = outdoorLivingArea(plan);
    stats([
      [String(plan.areas.length), t("outdoor areas")],
      [String(plan.fences.length), t("fences")],
      [String(plan.trees.length), t("trees")],
      ...(living > 0
        ? ([[`${fmt(living, 1)} m²`, t("living area (WoFlV, a quarter)")]] as [string, string][])
        : []),
    ]);
  }
  paragraph(storiesNote(), "note");
  if (plan.areas.length > 0) {
    heading(t("Outdoor areas"), "terrace");
    for (const area of plan.areas) {
      const type = areaType(area.kind);
      button(area.name || t(type.name), () => editor.select({ kind: "area", id: area.id }), {
        icon: "terrace",
        detail: (area.name ? `${t(type.name)} · ` : "") + `${fmt(areaSize(area), 1)} m²`,
        view: true,
      });
    }
  }
  if (plan.fences.length > 0) {
    heading(t("Fences and hedges"), "fence");
    for (const fence of plan.fences) {
      button(t(fenceType(fence.kind).name), () => editor.select({ kind: "fence", id: fence.id }), {
        icon: "fence",
        detail: `${fmt(fenceLength(fence), 1)} m`,
        view: true,
      });
    }
  }
  if (plan.trees.length > 0) {
    heading(t("Trees"), "tree");
    for (const tree of plan.trees) {
      button(t("Tree"), () => editor.select({ kind: "tree", id: tree.id }), {
        icon: "tree",
        detail: t("{crown} m crown, {height} m high", {
          crown: fmt(tree.crown, 1),
          height: fmt(tree.height, 1),
        }),
        view: true,
      });
    }
  }
}

/** The panel of the area tool, the fence tool, and the tree tool: the kind of the next object. */
export function renderOutdoorTool(): void {
  if (editor.tool === "tree") {
    heading(t("Tree"), "tree");
    paragraph(HINTS.tree, "note");
    return;
  }
  if (editor.tool === "fence") {
    heading(t("Fence"), "fence");
    selectField(
      t("Kind"),
      editor.fenceKind,
      FENCE_TYPES.map((type) => [type.kind, t(type.name)]),
      (kind) => (editor.fenceKind = kind),
    );
    paragraph(HINTS.fence, "note");
    return;
  }
  heading(t("Outdoor area"), "terrace");
  selectField(
    t("Kind"),
    editor.areaKind,
    AREA_TYPES.map((type) => [type.kind, t(type.name)]),
    (kind) => (editor.areaKind = kind),
  );
  paragraph(HINTS.area, "note");
  paragraph(storiesNote(), "note");
}
