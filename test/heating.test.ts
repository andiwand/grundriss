import { describe, expect, it } from "vitest";
import { emptyBuilding } from "../src/model/building";
import { makeHouse } from "../src/model/example";
import { parseBuilding, serializeBuilding } from "../src/model/file";
import {
  defaultHeating,
  DISTRIBUTION_LOSS,
  efficiencyClass,
  HEATING_KINDS,
  heatingEnergy,
  utilization,
} from "../src/model/heating";
import type { Building, Climate } from "../src/model/types";
import vienna from "./fixtures/vienna-climate.json";

function house(edit: (b: Building) => void = () => {}): Building {
  const building = makeHouse();
  building.climate = vienna as Climate;
  edit(building);
  return building;
}

describe("utilization of the gains", () => {
  it("uses all small gains, and less of large gains", () => {
    expect(utilization(0, 20)).toBe(1);
    expect(utilization(0.2, 20)).toBeGreaterThan(0.95);
    // With gains twice the loss, at most half of the gains can be useful.
    expect(utilization(2, 20)).toBeLessThanOrEqual(0.5);
    // A heavy building (a long time constant) uses more of the gains.
    expect(utilization(1, 100)).toBeGreaterThan(utilization(1, 10));
    expect(utilization(1, 15)).toBeCloseTo(2 / 3);
  });
});

describe("heating energy per year", () => {
  it("needs a climate", () => {
    expect(heatingEnergy(makeHouse())).toBeNull();
    const empty = emptyBuilding();
    empty.climate = vienna as Climate;
    expect(heatingEnergy(empty)).toBeNull();
  });

  it("gives a plausible demand for a new house in Vienna, in winter only", () => {
    const energy = heatingEnergy(house())!;
    // A new house with 16 cm insulation and triple glazing: a low-energy house.
    expect(energy.perArea).toBeGreaterThan(10);
    expect(energy.perArea).toBeLessThan(60);
    expect(energy.efficiencyClass).toBe(efficiencyClass(energy.perArea));
    expect(energy.demand).toBeCloseTo(
      energy.months.reduce((sum, m) => sum + m.demand, 0),
      6,
    );
    // January needs heat, July does not.
    expect(energy.months[0].demand).toBeGreaterThan(energy.months[3].demand);
    expect(energy.months[6].demand).toBe(0);
    for (const month of energy.months) {
      expect(month.used).toBeLessThanOrEqual(month.solar + month.internal + 1e-9);
      expect(month.demand).toBeGreaterThanOrEqual(0);
    }
  });

  it("needs less heat with more insulation and more sun on the windows", () => {
    const base = heatingEnergy(house())!;
    const thick = heatingEnergy(
      house((b) => b.envelope.wall.forEach((l) => l.material === "eps" && (l.thickness = 0.3))),
    )!;
    expect(thick.demand).toBeLessThan(base.demand);
    // The large windows of the example house face south. Turned around, they face north.
    const turned = heatingEnergy(house((b) => (b.north = 180)))!;
    const solar = (e: typeof base) => e.months.reduce((sum, m) => sum + m.solar, 0);
    expect(solar(turned)).toBeLessThan(solar(base));
    expect(turned.demand).toBeGreaterThan(base.demand);
  });

  it("gives the final energy, the cost, and the CO2 of the heating", () => {
    const pump = heatingEnergy(house())!;
    const heating = defaultHeating("heat-pump");
    expect(pump.final).toBeCloseTo((pump.demand * (1 + DISTRIBUTION_LOSS)) / heating.efficiency);
    expect(pump.cost).toBeCloseTo(pump.final * heating.price);
    expect(pump.co2).toBeCloseTo(pump.final * HEATING_KINDS["heat-pump"].co2);
    // The PV of the example house covers a part of the electricity of the heat pump.
    expect(pump.pvCovered).toBeGreaterThan(0);
    expect(pump.pvCovered).toBeLessThanOrEqual(pump.final);

    const gas = heatingEnergy(house((b) => (b.envelope.heating = defaultHeating("gas"))))!;
    expect(gas.demand).toBeCloseTo(pump.demand);
    expect(gas.final).toBeGreaterThan(pump.final * 3);
    expect(gas.co2).toBeGreaterThan(pump.co2);
    expect(gas.pvCovered).toBe(0);
  });

  it("reads the heating from a file, and a default for an old file", () => {
    const building = emptyBuilding();
    building.envelope.heating = { kind: "wood", efficiency: 0.8, price: 0.06 };
    expect(parseBuilding(serializeBuilding(building)).envelope.heating).toEqual(
      building.envelope.heating,
    );
    const data = JSON.parse(serializeBuilding(emptyBuilding()));
    delete data.envelope.heating;
    expect(parseBuilding(JSON.stringify(data)).envelope.heating).toEqual(
      defaultHeating("heat-pump"),
    );
    data.envelope.heating = { kind: "coal", efficiency: 2 };
    expect(parseBuilding(JSON.stringify(data)).envelope.heating.kind).toBe("heat-pump");
  });
});
