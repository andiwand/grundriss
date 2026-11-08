// The variants of the energy: copies of the envelope, the heating, and the heated stories. The
// app calculates each variant on a copy of the building, so that the user can compare them with
// the plan, for example "more insulation on the roof" against "a heat pump".

import { defaultHeating } from "./heating";
import { material } from "./insulation";
import { newId } from "./plan";
import type { Building, Envelope, Layer, Variant } from "./types";

const copy = <T>(value: T): T => structuredClone(value);

/** The ids of the unheated stories of the building. */
const unheatedOf = (building: Building) =>
  building.stories.filter((s) => !s.heated).map((s) => s.id);

/** A variant with the envelope and the heated stories of the plan. */
export function variantOf(building: Building, name: string): Variant {
  return {
    id: newId("var"),
    name,
    envelope: copy(building.envelope),
    unheated: unheatedOf(building),
  };
}

/** A copy of the building with the envelope and the heated stories of the variant. */
export function withVariant(building: Building, variant: Variant): Building {
  const unheated = new Set(variant.unheated);
  return {
    ...building,
    envelope: variant.envelope,
    stories: building.stories.map((s) => ({ ...s, heated: !unheated.has(s.id) })),
  };
}

/** Gives the plan the envelope and the heated stories of the variant. */
export function applyVariant(building: Building, variant: Variant): void {
  const unheated = new Set(variant.unheated);
  building.envelope = copy(variant.envelope);
  for (const story of building.stories) story.heated = !unheated.has(story.id);
}

/** True if the variant has the same envelope and heated stories as the plan. */
export function sameAsPlan(building: Building, variant: Variant): boolean {
  const ids = (list: string[]) => [...list].sort().join("|");
  return (
    JSON.stringify(variant.envelope) === JSON.stringify(building.envelope) &&
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

export interface VariantPreset {
  id: string;
  name: string;
  /** False if the preset changes nothing on this building. */
  available: (building: Building) => boolean;
  change: (envelope: Envelope, unheated: Set<string>, building: Building) => void;
}

/** The usual changes to compare. Each one starts from the plan. */
export const VARIANT_PRESETS: VariantPreset[] = [
  {
    id: "copy",
    name: "Copy of the plan",
    available: () => true,
    change: () => {},
  },
  {
    id: "walls",
    name: "10 cm more insulation on the walls",
    available: () => true,
    change: (e) => (e.wall = addInsulation(e.wall, 0.1)),
  },
  {
    id: "roof",
    name: "10 cm more insulation on the roof",
    available: () => true,
    change: (e) => (e.roof = addInsulation(e.roof, 0.1)),
  },
  {
    id: "ceiling",
    name: "10 cm more insulation on the slab to unheated stories",
    available: (b) => b.stories.some((s) => !s.heated),
    change: (e) => (e.ceiling = addInsulation(e.ceiling, 0.1)),
  },
  {
    id: "windows",
    name: "Triple glazing (U 0.7)",
    available: (b) => b.envelope.windowU > 0.7,
    change: (e) => (e.windowU = 0.7),
  },
  {
    id: "heat-pump",
    name: "Heat pump",
    available: (b) => b.envelope.heating.kind !== "heat-pump",
    change: (e) => (e.heating = defaultHeating("heat-pump")),
  },
  {
    id: "heated-cellar",
    name: "Heated cellar",
    available: (b) => cellars(b).some((s) => !s.heated),
    change: (_, unheated, b) => cellars(b).forEach((s) => unheated.delete(s.id)),
  },
  {
    id: "unheated-cellar",
    name: "Unheated cellar",
    available: (b) => cellars(b).some((s) => s.heated),
    change: (_, unheated, b) => cellars(b).forEach((s) => unheated.add(s.id)),
  },
];

/** A new variant from the plan with the change of the preset. */
export function presetVariant(building: Building, preset: VariantPreset): Variant {
  const variant = variantOf(building, preset.name);
  const unheated = new Set(variant.unheated);
  preset.change(variant.envelope, unheated, building);
  variant.unheated = [...unheated];
  return variant;
}
