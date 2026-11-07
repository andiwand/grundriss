// The materials of constructions and the default thermal envelope. The calculations of U-values
// and heat loss are in src/model/energy.ts.

import type { Envelope, Layer } from "./types";

export interface Material {
  id: string;
  name: string;
  /** The thermal conductivity λ in W/(m·K). */
  lambda: number;
  /** True for an insulation material. The views show it with a hatch. */
  insulation: boolean;
}

/** Usual design values of λ. A real project uses the values of the product. */
export const MATERIALS: Material[] = [
  { id: "brick", name: "Brick", lambda: 0.45, insulation: false },
  { id: "brick-hollow", name: "Insulating brick", lambda: 0.09, insulation: false },
  { id: "aerated-concrete", name: "Aerated concrete", lambda: 0.11, insulation: false },
  { id: "sand-lime", name: "Sand-lime brick", lambda: 0.99, insulation: false },
  { id: "concrete", name: "Reinforced concrete", lambda: 2.3, insulation: false },
  { id: "timber", name: "Timber", lambda: 0.13, insulation: false },
  { id: "plaster", name: "Plaster", lambda: 0.7, insulation: false },
  { id: "screed", name: "Screed", lambda: 1.4, insulation: false },
  { id: "plasterboard", name: "Plasterboard", lambda: 0.25, insulation: false },
  { id: "eps", name: "EPS", lambda: 0.035, insulation: true },
  { id: "xps", name: "XPS", lambda: 0.035, insulation: true },
  { id: "mineral-wool", name: "Mineral wool", lambda: 0.035, insulation: true },
  { id: "wood-fiber", name: "Wood fiber", lambda: 0.04, insulation: true },
  { id: "pur", name: "PUR/PIR", lambda: 0.024, insulation: true },
  { id: "cellulose", name: "Cellulose", lambda: 0.04, insulation: true },
];

export const material = (id: string): Material =>
  MATERIALS.find((m) => m.id === id) ?? MATERIALS[0];

/** The total thickness of the layers. */
export const layersThickness = (layers: Layer[]): number =>
  layers.reduce((sum, layer) => sum + layer.thickness, 0);

/**
 * A usual new building in Central Europe: a brick wall with 16 cm EPS, a roof with 22 cm
 * mineral wool between rafters, a slab on the ground with 12 cm XPS, and triple glazing.
 */
export function defaultEnvelope(): Envelope {
  return {
    wall: [
      { material: "plaster", thickness: 0.015 },
      { material: "brick", thickness: 0.175 },
      { material: "eps", thickness: 0.16 },
      { material: "plaster", thickness: 0.01 },
    ],
    roof: [
      { material: "plasterboard", thickness: 0.0125 },
      { material: "mineral-wool", thickness: 0.22 },
      { material: "wood-fiber", thickness: 0.06 },
    ],
    floor: [
      { material: "screed", thickness: 0.06 },
      { material: "eps", thickness: 0.04 },
      { material: "concrete", thickness: 0.2 },
      { material: "xps", thickness: 0.12 },
    ],
    windowU: 0.9,
    doorU: 1.3,
    outside: -12,
    inside: 20,
  };
}
