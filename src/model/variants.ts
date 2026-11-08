// The variants of the energy and the renovation: copies of the envelope, the heating, the heated
// stories, the household with its battery, and the PV fields. The app calculates each variant on
// a copy of the building, so that the user can compare them with the plan, for example "more
// insulation on the roof" against "a heat pump". A measure is a usual change, for example 10 cm
// more insulation. It can make a new variant from the plan, or go into a variant.

import { defaultHeating } from "./heating";
import { material } from "./insulation";
import { newId } from "./plan";
import { newPvField } from "./pv";
import type { Building, Layer, Variant } from "./types";

const copy = <T>(value: T): T => structuredClone(value);

/** The ids of the unheated stories of the building. */
const unheatedOf = (building: Building) =>
  building.stories.filter((s) => !s.heated).map((s) => s.id);

/** A variant with the state of the plan, without a cost. */
export function variantOf(building: Building, name: string): Variant {
  return {
    id: newId("var"),
    name,
    envelope: copy(building.envelope),
    unheated: unheatedOf(building),
    household: copy(building.household),
    pv: copy(building.pv),
    cost: null,
    subsidy: 0,
  };
}

/** A copy of the building with the state of the variant. The copy shares the other parts. */
export function withVariant(building: Building, variant: Variant): Building {
  const unheated = new Set(variant.unheated);
  return {
    ...building,
    envelope: variant.envelope,
    household: variant.household,
    pv: variant.pv,
    stories: building.stories.map((s) => ({ ...s, heated: !unheated.has(s.id) })),
  };
}

/** Gives the plan the state of the variant. */
export function applyVariant(building: Building, variant: Variant): void {
  const unheated = new Set(variant.unheated);
  building.envelope = copy(variant.envelope);
  building.household = copy(variant.household);
  building.pv = copy(variant.pv);
  for (const story of building.stories) story.heated = !unheated.has(story.id);
}

/** Saves the state of the plan into the variant. The name and the cost stay. */
export function updateVariant(variant: Variant, building: Building): void {
  const now = variantOf(building, variant.name);
  variant.envelope = now.envelope;
  variant.unheated = now.unheated;
  variant.household = now.household;
  variant.pv = now.pv;
}

/** True if the variant has the same state as the plan. */
export function sameAsPlan(building: Building, variant: Variant): boolean {
  const ids = (list: string[]) => [...list].sort().join("|");
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  return (
    same(variant.envelope, building.envelope) &&
    same(variant.household, building.household) &&
    same(variant.pv, building.pv) &&
    ids(variant.unheated) === ids(unheatedOf(building))
  );
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
  const b = variantBuilding(building, variant);
  return MEASURES.filter((m) => m.available(b));
}

/** Adds the measure to the variant. The name of the variant stays. */
export function addMeasure(building: Building, variant: Variant, measure: Measure): void {
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
