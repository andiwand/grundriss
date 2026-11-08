import { describe, expect, it } from "vitest";
import { makeHouse } from "../src/model/example";
import { defaultHeating } from "../src/model/heating";
import {
  costItems,
  estimateItems,
  lifetimeCost,
  paybackYears,
  summaryOf,
  PRICES,
  subsidyEstimate,
  variantCost,
  variantEconomy,
} from "../src/model/renovation";

const HEATING_COSTS = PRICES.AT.heating;
const BATTERY_PRICE = PRICES.AT.battery;
import type { Building, Climate, Variant } from "../src/model/types";
import {
  addMeasure,
  MEASURES,
  measureVariant,
  switchVariant,
  variantOf,
} from "../src/model/variants";
import { addOpening } from "../src/model/plan";
import { envelopeAreas } from "../src/model/takeoff";
import vienna from "./fixtures/vienna-climate.json";

function house(edit: (b: Building) => void = () => {}): Building {
  const building = makeHouse();
  building.climate = vienna as Climate;
  edit(building);
  return building;
}
const measure = (id: string) => MEASURES.find((m) => m.id === id)!;
const addBattery = (building: Building, variant: Variant) =>
  addMeasure(building, variant, measure("battery"));

describe("renovation", () => {
  it("charges new windows once when the variant also improves the glazing", () => {
    const building = house();
    const oldWindows = envelopeAreas(building).windows;
    const variant = variantOf(building, "More windows");
    building.variants.push(variant);
    switchVariant(building, variant.id);
    const story = building.stories[0];
    const wall = story.walls.find((w) =>
      story.openings.some((o) => o.wallId === w.id && o.kind === "window"),
    )!;
    addOpening(story, wall.id, "window", 2);
    building.envelope.windowU /= 2;
    const windows = estimateItems(building, variant).filter((i) =>
      i.name.startsWith("New windows"),
    );
    expect(windows.reduce((sum, i) => sum + i.cost, 0)).toBeCloseTo(
      (oldWindows + 1.2 * 1.2) * PRICES.AT.window,
    );
  });

  it("estimates nothing for a copy of the plan", () => {
    const building = house();
    expect(estimateItems(building, variantOf(building, "Copy"))).toEqual([]);
    expect(variantEconomy(building, variantOf(building, "Copy"))!.saving).toBeCloseTo(0);
  });

  it("estimates the insulation by the area and the new thickness", () => {
    const building = house();
    const items = estimateItems(building, measureVariant(building, measure("roof")));
    expect(items).toHaveLength(1);
    expect(items[0].name).toContain("roof");
    expect(items[0].cost).toBeGreaterThan(1000);
  });

  it("estimates a new heating and a battery, and uses an own cost instead", () => {
    const building = house((b) => (b.envelope.heating = defaultHeating("gas")));
    const variant = measureVariant(building, measure("heat-pump"));
    expect(variantCost(building, variant)).toBeCloseTo(HEATING_COSTS["heat-pump"]);
    variant.cost = 18000;
    expect(variantCost(building, variant)).toBe(18000);

    const battery = measureVariant(building, measure("battery"));
    expect(variantCost(building, battery)).toBeCloseTo(10 * BATTERY_PRICE);
  });

  it("uses an own price of an item, and the estimate again without it", () => {
    const building = house((b) => (b.envelope.heating = defaultHeating("gas")));
    const variant = measureVariant(building, measure("heat-pump"));
    addBattery(building, variant);
    const [heating] = costItems(building, variant);
    expect(heating.own).toBe(false);
    variant.itemCosts[heating.name] = 21000;
    const items = costItems(building, variant);
    expect(items[0]).toMatchObject({
      cost: 21000,
      estimate: HEATING_COSTS["heat-pump"],
      own: true,
    });
    expect(variantCost(building, variant)).toBeCloseTo(21000 + 10 * BATTERY_PRICE);
    delete variant.itemCosts[heating.name];
    expect(variantCost(building, variant)).toBeCloseTo(
      HEATING_COSTS["heat-pump"] + 10 * BATTERY_PRICE,
    );
  });

  it("sums the cost over the lifetime, and compares the plan with a variant", () => {
    const finance = { region: "AT" as const, interest: 0, priceIncrease: 0 };
    expect(lifetimeCost(1000, 100, finance)).toBeCloseTo(3000);
    const building = house((b) => (b.envelope.heating = defaultHeating("oil")));
    const variant = measureVariant(building, measure("heat-pump"));
    const plan = summaryOf(building, null);
    const pump = summaryOf(building, variant);
    expect(plan.cost).toBe(0);
    expect(plan.saving).toBeNull();
    expect(pump.heating).toBe("heat-pump");
    expect(pump.saving).toBeCloseTo(plan.energyCost! - pump.energyCost!);
    expect(pump.rooms).toBe(plan.rooms);
  });

  it("gives the saving per year and the payback time after the subsidy", () => {
    const building = house((b) => (b.envelope.heating = defaultHeating("oil")));
    const variant = measureVariant(building, measure("heat-pump"));
    variant.subsidy = 10000;
    const economy = variantEconomy(building, variant)!;
    expect(economy.saving).toBeGreaterThan(0);
    expect(economy.co2Saving).toBeGreaterThan(0);
    expect(economy.net).toBeCloseTo(HEATING_COSTS["heat-pump"] - 10000);
    // With interest and growing prices, the payback is near the simple one, but not the same.
    expect(economy.payback).toBeCloseTo(paybackYears(economy.net, economy.saving, 0.03, 0.02)!);
  });

  it("gives the simple payback without interest and price changes", () => {
    expect(paybackYears(1000, 100, 0, 0)).toBeCloseTo(10);
    // Interest makes it longer, and growing prices make it shorter.
    expect(paybackYears(1000, 100, 0.05, 0)!).toBeGreaterThan(10);
    expect(paybackYears(1000, 100, 0, 0.05)!).toBeLessThan(10);
    expect(paybackYears(1000, 0, 0, 0)).toBeNull();
    expect(paybackYears(0, 0, 0, 0)).toBe(0);
    expect(paybackYears(1e9, 1, 0.03, 0)).toBeNull();
  });

  it("uses the prices of the region", () => {
    const at = house((b) => (b.envelope.heating = defaultHeating("gas")));
    const de = house((b) => {
      b.envelope.heating = defaultHeating("gas");
      b.finance.region = "DE";
    });
    const v = measureVariant(at, measure("heat-pump"));
    expect(variantCost(at, v)).toBe(PRICES.AT.heating["heat-pump"]);
    expect(variantCost(de, v)).toBe(PRICES.DE.heating["heat-pump"]);
  });

  it("estimates the German subsidy of a heat pump and of insulation, and none for Austria", () => {
    const de = house((b) => {
      b.envelope.heating = defaultHeating("oil");
      b.finance.region = "DE";
    });
    const pump = measureVariant(de, measure("heat-pump"));
    // 30 % base and 20 % for the replaced oil boiler, of at most 30 000 €.
    expect(subsidyEstimate(de, pump)!.amount).toBeCloseTo(0.5 * 30000);
    const walls = measureVariant(de, measure("walls"));
    const cost = variantCost(de, walls);
    expect(subsidyEstimate(de, walls)!.amount).toBeCloseTo(0.15 * Math.min(30000, cost));
    expect(subsidyEstimate(house(), pump)).toBeNull();
  });

  it("needs a climate", () => {
    const building = makeHouse();
    expect(variantEconomy(building, variantOf(building, "Copy"))).toBeNull();
  });
});
