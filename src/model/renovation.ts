// The renovation: the cost of a variant and its economy against the plan. The cost is a rough
// estimate from usual prices in Austria, 2025, without the VAT of a company and without the
// scaffold. The user can type the price of a real offer instead.
//
// The estimate compares the variant with the plan:
//
// - insulation: the area of the part times a base price and a price for each cm of new
//   insulation. The base price is for the work and the surface, for example the plaster.
// - windows: the area of the windows times WINDOW_PRICE, if the U-value of the variant is lower.
// - heating: HEATING_COSTS of the new kind, if the kind changes.
// - hot water: HOT_WATER_COST, if the heater changes.
// - PV: PV_PRICE for each new kWp, and BATTERY_PRICE for each new kWh of battery.
//
// The economy uses the energy cost per year of the hourly balance (balance.ts), so PV and a
// battery count too. The payback time is the cost after the subsidy divided by the saving per
// year, without interest and without a change of the prices.

import { energyBalance, type EnergyBalance } from "./balance";
import { buildingHeatLoss } from "./energy";
import { HEATING_KINDS } from "./heating";
import { material } from "./insulation";
import { pvSummary } from "./pv";
import type { Building, HeatingKind, Layer, Variant } from "./types";
import { withVariant } from "./variants";

/** The prices of insulation in €/m²: a base price, and a price for each cm of insulation. */
export const INSULATION_PRICES = {
  wall: { base: 80, perCm: 4 },
  roof: { base: 60, perCm: 3 },
  ceiling: { base: 25, perCm: 2 },
  floor: { base: 60, perCm: 4 },
} as const;
/** The price of new windows in € per m² of window. */
export const WINDOW_PRICE = 650;
/** The price of a new heating with its installation, in €. */
export const HEATING_COSTS: Record<HeatingKind, number> = {
  "heat-pump": 25000,
  gas: 12000,
  oil: 15000,
  wood: 22000,
  district: 10000,
  electric: 4000,
};
/** The price of a new heater of the hot water with its storage, in €. */
export const HOT_WATER_COST = 2500;
/** The price of PV in € per kWp, and of a battery in € per kWh. */
export const PV_PRICE = 1400;
export const BATTERY_PRICE = 700;

export interface CostItem {
  name: string;
  cost: number;
}

/** The thickness of the insulation materials of the layers, in cm. */
const insulationCm = (layers: Layer[]) =>
  layers
    .filter((l) => material(l.material).insulation)
    .reduce((sum, l) => sum + l.thickness * 100, 0);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The areas of the parts of the envelope of the heated rooms, in m². */
function envelopeAreas(building: Building) {
  const loss = buildingHeatLoss(building);
  const lowest = building.stories[0]?.id;
  let wall = 0;
  let roof = 0;
  let ceiling = 0;
  let floor = 0;
  let window = 0;
  for (const room of loss.rooms) {
    wall += room.wallArea;
    roof += room.roofArea;
    window += room.glazing.reduce((sum, g) => sum + g.area, 0);
    if (room.ceiling > 0) ceiling += room.area;
    if (room.floor > 0) {
      if (room.storyId === lowest) floor += room.area;
      else ceiling += room.area;
    }
  }
  return { wall, roof, ceiling, floor, window };
}

/** The items of the estimate of the cost of the variant against the plan. */
export function estimateItems(building: Building, variant: Variant): CostItem[] {
  const target = withVariant(building, variant);
  const areas = envelopeAreas(target);
  const before = building.envelope;
  const after = variant.envelope;
  const items: CostItem[] = [];
  const insulation = (key: keyof typeof INSULATION_PRICES, name: string, area: number) => {
    if (same(before[key], after[key]) || area <= 0) return;
    const added = Math.max(0, insulationCm(after[key]) - insulationCm(before[key]));
    const price = INSULATION_PRICES[key];
    items.push({ name, cost: area * (price.base + price.perCm * added) });
  };
  insulation("wall", "Insulation of the walls", areas.wall);
  insulation("roof", "Insulation of the roof", areas.roof);
  insulation("ceiling", "Insulation of the slabs to unheated stories", areas.ceiling);
  insulation("floor", "Insulation of the floor", areas.floor);
  if (after.windowU < before.windowU - 1e-9 && areas.window > 0) {
    items.push({ name: "New windows", cost: areas.window * WINDOW_PRICE });
  }
  if (after.heating.kind !== before.heating.kind) {
    const name = HEATING_KINDS[after.heating.kind].name;
    items.push({ name: `New heating: ${name}`, cost: HEATING_COSTS[after.heating.kind] });
  }
  if (after.hotWater.heater !== before.hotWater.heater) {
    items.push({ name: "New hot water heater", cost: HOT_WATER_COST });
  }
  const peak = pvSummary(target).peak - pvSummary(building).peak;
  if (peak > 0.01) items.push({ name: `PV, ${peak.toFixed(1)} kWp`, cost: peak * PV_PRICE });
  const battery = variant.household.battery - building.household.battery;
  if (battery > 0.01) {
    items.push({ name: `Battery, ${battery.toFixed(1)} kWh`, cost: battery * BATTERY_PRICE });
  }
  return items;
}

/** The cost of the variant: its own cost, or the sum of the estimate. */
export function variantCost(building: Building, variant: Variant): number {
  return variant.cost ?? estimateItems(building, variant).reduce((sum, i) => sum + i.cost, 0);
}

export interface Economy {
  balance: EnergyBalance;
  /** The investment, the subsidy, and the investment after the subsidy, in €. */
  cost: number;
  subsidy: number;
  net: number;
  /** The saving of the energy cost per year against the plan, in €, and of the CO₂ in kg. */
  saving: number;
  co2Saving: number;
  /** The years until the saving pays the investment, or null if it saves nothing. */
  payback: number | null;
}

/** The economy of the variant against the plan, or null without a climate. */
export function variantEconomy(
  building: Building,
  variant: Variant,
  plan: EnergyBalance | null = energyBalance(building),
): Economy | null {
  const balance = energyBalance(withVariant(building, variant));
  if (!plan || !balance) return null;
  const cost = variantCost(building, variant);
  const net = Math.max(0, cost - variant.subsidy);
  const saving = plan.cost - balance.cost;
  return {
    balance,
    cost,
    subsidy: variant.subsidy,
    net,
    saving,
    co2Saving: plan.co2 - balance.co2,
    payback: saving > 0.5 ? net / saving : null,
  };
}
