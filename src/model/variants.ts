// The variants of the building: copies of the envelope, the heating, the heated stories, the
// household with its battery, the PV fields, and, if the user changes it, the floor plan. The app
// calculates each variant on a copy of the building, so that the user can compare them with the
// plan, for example "more insulation on the roof" against "a heat pump", or "kitchen and living
// room in one" against the plan. A measure is a usual change, for example 10 cm more insulation.
// It can make a new variant from the plan, or go into a variant.
//
// One variant at a time can be open (`Building.variant`): the building then shows the variant,
// the user edits it in all topics, and `base` keeps the plan. `switchVariant` saves the open
// state into its variant and opens the next one, so no change gets lost.

import { defaultHeating } from "./heating";
import { copyTree, sameTree as sameData } from "./history";
import { material } from "./insulation";
import { newId } from "./plan";
import { newPvField } from "./pv";
import type { Building, Layer, Layout, Variant, VariantState } from "./types";

const copy = copyTree;

export { sameData };

/** The ids of the unheated stories of the building. */
const unheatedOf = (building: Building) =>
  building.stories.filter((s) => !s.heated).map((s) => s.id);

/** A copy of the floor plan. Backgrounds stay with stories absent from another layout. */
export function layoutOf(building: Building): Layout {
  return {
    stories: building.stories.map((s) => ({ ...copy(s), heated: true })),
    roofs: copy(building.roofs),
  };
}

/** Shares changes of a background with the stored layouts that contain the same story. */
export function syncBackgrounds(building: Building): void {
  const backgrounds = new Map(building.stories.map((s) => [s.id, s.background]));
  for (const layout of [building.base?.layout, ...building.variants.map((v) => v.layout)]) {
    for (const story of layout?.stories ?? []) {
      if (backgrounds.has(story.id)) story.background = copy(backgrounds.get(story.id)!);
    }
  }
}

/** The floor plan of the plan: the live stories, or the copy in `base` while a variant is open. */
function planLayout(building: Building): Layout {
  return building.base?.layout ?? { stories: building.stories, roofs: building.roofs };
}

/** A copy of the state that the building shows now, with its floor plan. */
function liveState(building: Building): VariantState & { layout: Layout } {
  return {
    envelope: copy(building.envelope),
    unheated: unheatedOf(building),
    household: copy(building.household),
    pv: copy(building.pv),
    layout: layoutOf(building),
  };
}

/** True if two floor plans are the same. */
const sameLayout = (a: Layout, b: Layout) =>
  sameData(
    a.stories.map((s) => ({ ...s, background: null, heated: true })),
    b.stories.map((s) => ({ ...s, background: null, heated: true })),
  ) && sameData(a.roofs, b.roofs);

/** The state of the plan. */
export function planState(building: Building): VariantState {
  return building.base ?? { ...liveState(building), layout: null };
}

/** A variant with the state of the plan and its floor plan, without a cost. */
export function variantOf(building: Building, name: string): Variant {
  const plan = planState(building);
  return {
    id: newId("var"),
    name,
    envelope: copy(plan.envelope),
    unheated: [...plan.unheated],
    household: copy(plan.household),
    pv: copy(plan.pv),
    layout: null,
    cost: null,
    itemCosts: {},
    subsidy: 0,
  };
}

/** A copy of the building with the state, for a calculation. The copy shares the other parts. */
function withState(building: Building, state: VariantState): Building {
  const unheated = new Set(state.unheated);
  const layout = state.layout ?? planLayout(building);
  return {
    ...building,
    envelope: state.envelope,
    household: state.household,
    pv: state.pv,
    roofs: layout.roofs,
    stories: layout.stories.map((s) => ({ ...s, heated: !unheated.has(s.id) })),
    variant: null,
    base: null,
  };
}

/**
 * A copy of the building with the state of the variant. The open variant is the building itself.
 * The copy shares the other parts.
 */
export function withVariant(building: Building, variant: Variant): Building {
  return variant.id === building.variant ? building : withState(building, variant);
}

/** The building of the plan: the building itself, or the plan while a variant is open. */
export function planBuilding(building: Building): Building {
  return building.base ? withState(building, building.base) : building;
}

/**
 * Gives the building the state, as copies. The stories keep the background images of the
 * stories with the same id.
 */
function showState(building: Building, state: VariantState, layout: Layout): void {
  const backgrounds = new Map(building.stories.map((s) => [s.id, s.background]));
  const unheated = new Set(state.unheated);
  building.envelope = copy(state.envelope);
  building.household = copy(state.household);
  building.pv = copy(state.pv);
  building.roofs = copy(layout.roofs);
  building.stories = copy(layout.stories).map((s) => ({
    ...s,
    background: copy(backgrounds.has(s.id) ? backgrounds.get(s.id)! : s.background),
    heated: !unheated.has(s.id),
  }));
}

/**
 * Opens the variant with the id, or the plan for null. The state that the building shows goes
 * into the open variant first. A variant keeps no floor plan of its own if its floor plan is the
 * same as the plan.
 */
export function switchVariant(building: Building, id: string | null): void {
  if (building.variant === id) return;
  if (id !== null && !building.variants.some((v) => v.id === id)) return;
  syncBackgrounds(building);
  const live = liveState(building);
  if (building.variant === null) {
    building.base = live;
  } else {
    const open = building.variants.find((v) => v.id === building.variant);
    if (open) {
      Object.assign(open, live);
      if (sameLayout(live.layout, planLayout(building))) open.layout = null;
    }
  }
  const base = building.base!;
  const target = id === null ? base : building.variants.find((v) => v.id === id)!;
  showState(building, target, target.layout ?? base.layout!);
  building.variant = id;
  if (id === null) building.base = null;
}

/** Makes the variant the new plan. The variant stays in the list, now the same as the plan. */
export function applyVariant(building: Building, variant: Variant): void {
  switchVariant(building, null);
  const own = building.variants.find((v) => v.id === variant.id) ?? variant;
  showState(building, own, own.layout ?? layoutOf(building));
  // The floor plan of the variant is now the plan, and the others keep their own floor plan
  // only if it differs from the new plan.
  own.layout = null;
}

/** Saves the energy part of the building into the variant. The name, the cost, and the floor plan stay. */
export function updateVariant(variant: Variant, building: Building): void {
  variant.envelope = copy(building.envelope);
  variant.unheated = unheatedOf(building);
  variant.household = copy(building.household);
  variant.pv = copy(building.pv);
}

/** True if the variant has the same state as the plan. */
export function sameAsPlan(building: Building, variant: Variant): boolean {
  const ids = (list: string[]) => [...list].sort().join("|");
  const plan = planState(building);
  const state = variant.id === building.variant ? liveState(building) : variant;
  const layout = state.layout;
  return (
    sameData(state.envelope, plan.envelope) &&
    sameData(state.household, plan.household) &&
    sameData(state.pv, plan.pv) &&
    ids(state.unheated) === ids(plan.unheated) &&
    (layout === null || sameLayout(layout, planLayout(building)))
  );
}

/** True if the variant has its own floor plan. */
export function hasOwnLayout(building: Building, variant: Variant): boolean {
  if (variant.id !== building.variant) return variant.layout !== null;
  return !sameLayout(layoutOf(building), planLayout(building));
}

/**
 * The layers with more insulation: the insulation layer with the lowest λ gets `thickness` more.
 * Layers without insulation get a new layer of mineral wool on the outside.
 */
export function addInsulation(layers: Layer[], thickness: number): Layer[] {
  const result = copy(layers);
  let best = -1;
  result.forEach((layer, i) => {
    const m = material(layer.material);
    if (m.insulation && (best < 0 || m.lambda < material(result[best].material).lambda)) best = i;
  });
  // The thickness keeps whole millimeters, so that the panel shows a round number.
  if (best >= 0)
    result[best].thickness = Math.round((result[best].thickness + thickness) * 1000) / 1000;
  else result.push({ material: "mineral-wool", thickness });
  return result;
}

/** The cellars: the stories under the ground. */
const cellars = (building: Building) => building.stories.filter((s) => s.elevation < 0);

/** The capacity of the battery of the battery measure, in kWh. */
export const BATTERY_MEASURE = 10;

export interface Measure {
  id: string;
  name: string;
  /** False if the measure changes nothing on this building. */
  available: (building: Building) => boolean;
  /** Changes a copy of the building: its envelope, its stories, its household, or its PV. */
  apply: (building: Building) => void;
}

/** The usual measures of a renovation. */
export const MEASURES: Measure[] = [
  {
    id: "walls",
    name: "10 cm more insulation on the walls",
    available: () => true,
    apply: (b) => (b.envelope.wall = addInsulation(b.envelope.wall, 0.1)),
  },
  {
    id: "roof",
    name: "10 cm more insulation on the roof",
    available: () => true,
    apply: (b) => (b.envelope.roof = addInsulation(b.envelope.roof, 0.1)),
  },
  {
    id: "ceiling",
    name: "10 cm more insulation on the slab to unheated stories",
    available: (b) => b.stories.some((s) => !s.heated),
    apply: (b) => (b.envelope.ceiling = addInsulation(b.envelope.ceiling, 0.1)),
  },
  {
    id: "windows",
    name: "Triple glazing (U 0.7)",
    available: (b) => b.envelope.windowU > 0.7,
    apply: (b) => (b.envelope.windowU = 0.7),
  },
  {
    id: "heat-pump",
    name: "Heat pump",
    available: (b) => b.envelope.heating.kind !== "heat-pump",
    apply: (b) => (b.envelope.heating = defaultHeating("heat-pump")),
  },
  {
    id: "pv",
    name: "PV on the best free roof face",
    available: (b) => newPvField(b) !== null,
    apply: (b) => {
      const field = newPvField(b);
      if (field) b.pv = [...b.pv, field];
    },
  },
  {
    id: "battery",
    name: `A battery of ${BATTERY_MEASURE} kWh`,
    available: (b) => b.household.battery < BATTERY_MEASURE,
    apply: (b) => (b.household = { ...b.household, battery: BATTERY_MEASURE }),
  },
  {
    id: "heated-cellar",
    name: "Heated cellar",
    available: (b) => cellars(b).some((s) => !s.heated),
    apply: (b) => {
      const ids = new Set(cellars(b).map((s) => s.id));
      b.stories = b.stories.map((s) => (ids.has(s.id) ? { ...s, heated: true } : s));
    },
  },
  {
    id: "unheated-cellar",
    name: "Unheated cellar",
    available: (b) => cellars(b).some((s) => s.heated),
    apply: (b) => {
      const ids = new Set(cellars(b).map((s) => s.id));
      b.stories = b.stories.map((s) => (ids.has(s.id) ? { ...s, heated: false } : s));
    },
  },
];

/** The building of the variant, as a copy that a measure can change. */
const variantBuilding = (building: Building, variant: Variant) =>
  withVariant(building, copy(variant));

/** The measures that change something on the variant. */
export function measuresFor(building: Building, variant: Variant): Measure[] {
  const b = withVariant(building, variant);
  return MEASURES.filter((m) => m.available(b));
}

/** Adds the measure to the variant. The name of the variant stays. */
export function addMeasure(building: Building, variant: Variant, measure: Measure): void {
  // The open variant is the building: the measure changes it directly.
  if (variant.id === building.variant) {
    measure.apply(building);
    return;
  }
  const b = variantBuilding(building, variant);
  measure.apply(b);
  updateVariant(variant, b);
}

/** A new variant from the plan with the measure. */
export function measureVariant(building: Building, measure: Measure): Variant {
  const variant = variantOf(building, measure.name);
  addMeasure(building, variant, measure);
  return variant;
}
