// The renovation: the cost of a variant and its economy against the plan. The cost is a rough
// estimate from usual prices in Austria or in Germany, 2025 (`Finance.region`), without the
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
// battery count too. The payback time is the first year where the sum of the savings pays the
// cost after the subsidy. The saving of each year grows with the change of the energy prices,
// and the interest discounts it (`Finance`).
//
// The subsidy estimate follows the federal program of Germany (BEG EM, 2025) in a simple form:
// a heat pump or another renewable heating gets 30 %, 20 % more if it replaces an oil, a gas, or
// a night storage heating, and 5 % more for a ground source, at most 70 % of at most 30 000 €.
// The insulation and the windows get 15 % of at most 30 000 €. The bonus for the income and the
// bonus of a renovation plan (iSFP) are not in the estimate. The rules change often, so the user
// must check them. For Austria, the federal and the state programs change too often for an
// estimate, so the app gives none.

import { energyBalance, type EnergyBalance } from "./balance";
import { fmt } from "./format";
import { HEATING_KINDS } from "./heating";
import { material } from "./insulation";
import { pvSummary } from "./pv";
import { envelopeAreas } from "./takeoff";
import type { Building, Finance, HeatingKind, Layer, Variant } from "./types";
import { sameData, withVariant } from "./variants";

/** The prices of a region: insulation in €/m² (a base and each cm), windows in €/m², the rest in €. */
export interface PriceSet {
  insulation: Record<"wall" | "roof" | "ceiling" | "floor", { base: number; perCm: number }>;
  window: number;
  heating: Record<HeatingKind, number>;
  hotWater: number;
  /** PV in € per kWp, and a battery in € per kWh. */
  pv: number;
  battery: number;
}

/** Usual prices in Austria and in Germany, 2025, rough values. */
export const PRICES: Record<Finance["region"], PriceSet> = {
  AT: {
    insulation: {
      wall: { base: 80, perCm: 4 },
      roof: { base: 60, perCm: 3 },
      ceiling: { base: 25, perCm: 2 },
      floor: { base: 60, perCm: 4 },
    },
    window: 650,
    heating: {
      "heat-pump": 25000,
      gas: 12000,
      oil: 15000,
      wood: 22000,
      district: 10000,
      electric: 4000,
    },
    hotWater: 2500,
    pv: 1400,
    battery: 700,
  },
  DE: {
    insulation: {
      wall: { base: 100, perCm: 4.5 },
      roof: { base: 70, perCm: 3.5 },
      ceiling: { base: 30, perCm: 2.5 },
      floor: { base: 70, perCm: 4.5 },
    },
    window: 750,
    heating: {
      "heat-pump": 30000,
      gas: 13000,
      oil: 16000,
      wood: 25000,
      district: 12000,
      electric: 5000,
    },
    hotWater: 3000,
    pv: 1500,
    battery: 800,
  },
};

/** The prices of the building's region. */
export const pricesOf = (building: Building): PriceSet => PRICES[building.finance.region];

/** The kinds of the items of a cost, for the subsidy. */
export type CostKind = "envelope" | "heating" | "hotWater" | "pv" | "battery";

export interface CostItem {
  /** The English text of the item, with placeholders for `values` (see `costItemText`). */
  name: string;
  /** The values of the placeholders: numbers, or names that a translator can translate. */
  values?: Record<string, number | { name: string }>;
  cost: number;
  kind: CostKind;
}

/**
 * The text of a cost item in a language. `t` translates a text and fills its placeholders; a
 * value with a name gets its own translation, and a number gets the format of the locale.
 */
export function costItemText(
  item: CostItem,
  t: (text: string, values?: Record<string, string | number>) => string = fill,
): string {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(item.values ?? {})) {
    values[key] = typeof value === "number" ? fmt(value, 1) : t(value.name);
  }
  return t(item.name, values);
}

/** Fills the placeholders of a text without a translation. */
function fill(text: string, values?: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (all, key: string) =>
    values && key in values ? String(values[key]) : all,
  );
}

/** The thickness of the insulation materials of the layers, in cm. */
const insulationCm = (layers: Layer[]) =>
  layers
    .filter((l) => material(l.material).insulation)
    .reduce((sum, l) => sum + l.thickness * 100, 0);

/** The items of the estimate of the cost of the variant against the plan. */
export function estimateItems(building: Building, variant: Variant): CostItem[] {
  const target = withVariant(building, variant);
  const envelope = envelopeAreas(target);
  // Walls with their own layers do not change with the envelope of the variant.
  const areas = {
    wall: envelope.walls.filter((w) => !w.own).reduce((sum, w) => sum + w.area, 0),
    roof: envelope.roof,
    ceiling: envelope.slabs,
    floor: envelope.floor,
    window: envelope.windows,
  };
  const before = building.envelope;
  const after = variant.envelope;
  const items: CostItem[] = [];
  const prices = pricesOf(building);
  const insulation = (key: keyof PriceSet["insulation"], name: string, area: number) => {
    if (sameData(before[key], after[key]) || area <= 0) return;
    const added = Math.max(0, insulationCm(after[key]) - insulationCm(before[key]));
    const price = prices.insulation[key];
    items.push({ name, cost: area * (price.base + price.perCm * added), kind: "envelope" });
  };
  insulation("wall", "Insulation of the walls", areas.wall);
  insulation("roof", "Insulation of the roof", areas.roof);
  insulation("ceiling", "Insulation of the slabs to unheated stories", areas.ceiling);
  insulation("floor", "Insulation of the floor", areas.floor);
  if (after.windowU < before.windowU - 1e-9 && areas.window > 0) {
    items.push({ name: "New windows", cost: areas.window * prices.window, kind: "envelope" });
  }
  if (after.heating.kind !== before.heating.kind) {
    items.push({
      name: "New heating: {kind}",
      values: { kind: { name: HEATING_KINDS[after.heating.kind].name } },
      cost: prices.heating[after.heating.kind],
      kind: "heating",
    });
  }
  if (after.hotWater.heater !== before.hotWater.heater) {
    items.push({ name: "New hot water heater", cost: prices.hotWater, kind: "hotWater" });
  }
  const peak = pvSummary(target).peak - pvSummary(building).peak;
  if (peak > 0.01) {
    items.push({ name: "PV, {peak} kWp", values: { peak }, cost: peak * prices.pv, kind: "pv" });
  }
  const battery = variant.household.battery - building.household.battery;
  if (battery > 0.01) {
    items.push({
      name: "Battery, {capacity} kWh",
      values: { capacity: battery },
      cost: battery * prices.battery,
      kind: "battery",
    });
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
  /**
   * The years until the savings pay the investment, with the interest and the change of the
   * prices, or null if that takes more than PAYBACK_LIMIT years.
   */
  payback: number | null;
}

/** The longest payback time that the app calculates, in years. */
export const PAYBACK_LIMIT = 60;

/**
 * The years until the savings pay the cost: the saving of year k is saving × (1 + increase)^(k−1),
 * discounted by (1 + interest)^k. Between two years, the time is linear. Null if the sum does not
 * reach the cost in PAYBACK_LIMIT years.
 */
export function paybackYears(
  cost: number,
  saving: number,
  interest: number,
  increase: number,
): number | null {
  if (cost <= 0) return 0;
  if (saving <= 0) return null;
  let sum = 0;
  for (let year = 1; year <= PAYBACK_LIMIT; year++) {
    const value = (saving * (1 + increase) ** (year - 1)) / (1 + interest) ** year;
    if (sum + value >= cost) return year - 1 + (cost - sum) / value;
    sum += value;
  }
  return null;
}

/** The kinds of heating that a heat pump replaces with the bonus of the speed of the climate. */
const FOSSIL: HeatingKind[] = ["oil", "gas", "electric"];

export interface Subsidy {
  amount: number;
  items: { name: string; rate: number; amount: number }[];
}

/**
 * An estimate of the subsidy of the variant by the federal program of Germany (BEG EM, 2025), or
 * null for Austria. See the header of this file for the rules and their limits.
 */
export function subsidyEstimate(building: Building, variant: Variant): Subsidy | null {
  if (building.finance.region !== "DE") return null;
  const items = estimateItems(building, variant);
  const result: Subsidy = { amount: 0, items: [] };
  const heating = items.filter((i) => i.kind === "heating");
  if (heating.length > 0) {
    const kind = variant.envelope.heating.kind;
    let rate = kind === "heat-pump" || kind === "wood" || kind === "district" ? 0.3 : 0;
    if (rate > 0 && FOSSIL.includes(building.envelope.heating.kind)) rate += 0.2;
    if (kind === "heat-pump" && variant.envelope.heating.source === "ground") rate += 0.05;
    rate = Math.min(0.7, rate);
    const cost = Math.min(
      30000,
      heating.reduce((sum, i) => sum + i.cost, 0),
    );
    if (rate > 0) result.items.push({ name: "Heating (BEG EM)", rate, amount: cost * rate });
  }
  const envelope = items.filter((i) => i.kind === "envelope");
  if (envelope.length > 0) {
    const cost = Math.min(
      30000,
      envelope.reduce((sum, i) => sum + i.cost, 0),
    );
    result.items.push({ name: "Insulation and windows (BEG EM)", rate: 0.15, amount: cost * 0.15 });
  }
  result.amount = result.items.reduce((sum, i) => sum + i.amount, 0);
  return result;
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
    payback: paybackYears(net, saving, building.finance.interest, building.finance.priceIncrease),
  };
}
