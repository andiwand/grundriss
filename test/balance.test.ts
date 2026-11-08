import { describe, expect, it } from "vitest";
import { energyBalance } from "../src/model/balance";
import { makeHouse } from "../src/model/example";
import { defaultHeating, heatingEnergy } from "../src/model/heating";
import type { Building, Climate } from "../src/model/types";
import vienna from "./fixtures/vienna-climate.json";

function house(edit: (b: Building) => void = () => {}): Building {
  const building = makeHouse();
  building.climate = vienna as Climate;
  edit(building);
  return building;
}

describe("hourly balance of electricity", () => {
  it("needs a climate", () => {
    expect(energyBalance(makeHouse())).toBeNull();
  });

  it("adds the household, the heat pump, and the hot water, and keeps the energy", () => {
    const building = house();
    const balance = energyBalance(building)!;
    const heating = heatingEnergy(building)!;
    expect(balance.household).toBe(building.household.electricity);
    expect(balance.heating).toBeCloseTo(heating.final);
    expect(balance.hotWater).toBeCloseTo(heating.hotWaterFinal);
    expect(balance.load).toBeCloseTo(balance.household + balance.heating + balance.hotWater, 0);
    // The PV goes to the building or to the grid; the load comes from the PV or the grid.
    expect(balance.selfUsed + balance.exported).toBeCloseTo(balance.pv, 0);
    expect(balance.load - balance.imported).toBeCloseTo(balance.selfUsed, 0);
    expect(balance.selfConsumption).toBeGreaterThan(0);
    expect(balance.selfConsumption).toBeLessThan(1);
    expect(balance.cost).toBeCloseTo(
      balance.imported * building.household.price - balance.exported * building.household.feedIn,
    );
  });

  it("uses more of the PV with a battery", () => {
    const without = energyBalance(house())!;
    const battery = energyBalance(house((b) => (b.household.battery = 10)))!;
    expect(battery.selfUsed).toBeGreaterThan(without.selfUsed);
    expect(battery.imported).toBeLessThan(without.imported);
    expect(battery.fromBattery).toBeGreaterThan(0);
    // The battery loses energy: what it gives back is less than what the export lost.
    expect(battery.fromBattery).toBeLessThan(without.exported - battery.exported);
    expect(battery.cost).toBeLessThan(without.cost);
  });

  it("counts the fuel of a gas boiler apart from the electricity", () => {
    const gas = energyBalance(house((b) => (b.envelope.heating = defaultHeating("gas"))))!;
    expect(gas.heating).toBe(0);
    expect(gas.hotWater).toBe(0);
    expect(gas.fuelCost).toBeGreaterThan(0);
    expect(gas.load).toBeCloseTo(gas.household, 0);
  });

  it("gives the household more electricity in winter than in summer", () => {
    const balance = energyBalance(house((b) => (b.pv = [])))!;
    expect(balance.pv).toBe(0);
    const perDay = (m: number, days: number) => balance.months[m].load / days;
    expect(perDay(0, 31)).toBeGreaterThan(perDay(6, 31));
  });
});

describe("household in the file", () => {
  it("reads what it writes, and an old file takes the price of its electric heating", async () => {
    const { parseBuilding, serializeBuilding } = await import("../src/model/file");
    const building = house(
      (b) => (b.household = { electricity: 4200, battery: 8, price: 0.3, feedIn: 0.05 }),
    );
    expect(parseBuilding(serializeBuilding(building)).household).toEqual(building.household);
    const data = JSON.parse(serializeBuilding(building));
    delete data.household;
    data.envelope.heating.price = 0.31;
    expect(parseBuilding(JSON.stringify(data)).household.price).toBe(0.31);
  });
});
