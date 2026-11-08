import { describe, expect, it } from "vitest";
import { makeHouse } from "../src/model/example";
import { defaultHeating } from "../src/model/heating";
import {
  BATTERY_PRICE,
  estimateItems,
  HEATING_COSTS,
  variantCost,
  variantEconomy,
} from "../src/model/renovation";
import type { Building, Climate } from "../src/model/types";
import { MEASURES, measureVariant, variantOf } from "../src/model/variants";
import vienna from "./fixtures/vienna-climate.json";

function house(edit: (b: Building) => void = () => {}): Building {
  const building = makeHouse();
  building.climate = vienna as Climate;
  edit(building);
  return building;
}
const measure = (id: string) => MEASURES.find((m) => m.id === id)!;

describe("renovation", () => {
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

  it("gives the saving per year and the payback time after the subsidy", () => {
    const building = house((b) => (b.envelope.heating = defaultHeating("oil")));
    const variant = measureVariant(building, measure("heat-pump"));
    variant.subsidy = 10000;
    const economy = variantEconomy(building, variant)!;
    expect(economy.saving).toBeGreaterThan(0);
    expect(economy.co2Saving).toBeGreaterThan(0);
    expect(economy.net).toBeCloseTo(HEATING_COSTS["heat-pump"] - 10000);
    expect(economy.payback).toBeCloseTo(economy.net / economy.saving);
  });

  it("needs a climate", () => {
    const building = makeHouse();
    expect(variantEconomy(building, variantOf(building, "Copy"))).toBeNull();
  });
});
