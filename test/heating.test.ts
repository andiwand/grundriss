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
  HOT_WATER_HEAT,
  HOT_WATER_LOSS,
  HOT_WATER_PUMP,
  curveFlow,
  pumpCop,
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
    const fixed = (b: Building) => (b.envelope.heating.fixedEfficiency = true);
    const pump = heatingEnergy(house(fixed))!;
    const heating = defaultHeating("heat-pump");
    expect(pump.final).toBeCloseTo((pump.demand * (1 + DISTRIBUTION_LOSS)) / heating.efficiency);
    // The heat pump makes the hot water too, so the cost and the CO₂ include it.
    const total = pump.final + pump.hotWaterFinal;
    expect(pump.cost).toBeCloseTo(total * heating.price);
    expect(pump.co2).toBeCloseTo(total * HEATING_KINDS["heat-pump"].co2);
    expect(pump.electric).toBeCloseTo(total);
    // The PV of the example house covers a part of the electricity of the heat pump.
    expect(pump.pvCovered).toBeGreaterThan(0);
    expect(pump.pvCovered).toBeLessThanOrEqual(pump.electric);

    const gas = heatingEnergy(house((b) => (b.envelope.heating = defaultHeating("gas"))))!;
    expect(gas.demand).toBeCloseTo(pump.demand);
    expect(gas.final).toBeGreaterThan(pump.final * 3);
    expect(gas.co2).toBeGreaterThan(pump.co2);
    expect(gas.pvCovered).toBe(0);
  });

  it("reads the heating from a file, and a default for an old file", () => {
    const building = emptyBuilding();
    building.envelope.heating = {
      ...defaultHeating("wood"),
      efficiency: 0.8,
      price: 0.06,
      fixedEfficiency: true,
    };
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

describe("hot water", () => {
  it("adds the hot water of the people to the final energy, but not to the heat demand", () => {
    const set = (people: number) => (b: Building) => {
      b.envelope.hotWater.people = people;
      b.envelope.heating.fixedEfficiency = true;
    };
    const none = heatingEnergy(house(set(0)))!;
    const four = heatingEnergy(house(set(4)))!;
    expect(none.hotWater).toBe(0);
    expect(four.demand).toBeCloseTo(none.demand);
    expect(four.efficiencyClass).toBe(none.efficiencyClass);
    const heat = 4 * 40 * HOT_WATER_HEAT * (1 + HOT_WATER_LOSS) * 365;
    expect(four.hotWater).toBeCloseTo(heat);
    const pump = defaultHeating("heat-pump");
    expect(four.hotWaterFinal).toBeCloseTo(heat / (pump.efficiency * HOT_WATER_PUMP));
    expect(four.cost).toBeGreaterThan(none.cost);
  });

  it("uses electricity for a direct electric heater, also with a gas boiler", () => {
    const gas = heatingEnergy(
      house((b) => {
        b.envelope.heating = defaultHeating("gas");
        b.envelope.hotWater.heater = "electric";
      }),
    )!;
    expect(gas.hotWaterElectric).toBe(true);
    expect(gas.hotWaterFinal).toBeCloseTo(gas.hotWater);
    expect(gas.electric).toBeCloseTo(gas.hotWaterFinal);
    // The PV covers a part of the electric hot water.
    expect(gas.pvCovered).toBeGreaterThan(0);
  });

  it("reads the hot water from a file, and a default for an old file", () => {
    const building = emptyBuilding();
    building.envelope.hotWater = { people: 5, liters: 30, heater: "electric" };
    expect(parseBuilding(serializeBuilding(building)).envelope.hotWater).toEqual(
      building.envelope.hotWater,
    );
    const data = JSON.parse(serializeBuilding(emptyBuilding()));
    delete data.envelope.hotWater;
    delete data.envelope.ceiling;
    const old = parseBuilding(JSON.stringify(data));
    expect(old.envelope.hotWater).toEqual(emptyBuilding().envelope.hotWater);
    expect(old.envelope.ceiling).toEqual(emptyBuilding().envelope.ceiling);
  });
});

describe("heat pump with a calculated performance", () => {
  it("has a higher performance with a low flow and a warm source", () => {
    expect(pumpCop("air", 35, 7)).toBeGreaterThan(pumpCop("air", 55, 7));
    expect(pumpCop("air", 35, 7)).toBeGreaterThan(pumpCop("air", 35, -10));
    expect(pumpCop("ground", 35, -10)).toBeGreaterThan(pumpCop("air", 35, -10));
    // Plausible values: an air heat pump at 35 °C and 7 °C outside gives about 3 to 4.5.
    expect(pumpCop("air", 35, 7)).toBeGreaterThan(3);
    expect(pumpCop("air", 35, 7)).toBeLessThan(4.5);
  });

  it("follows the heating curve from the design flow down to the room", () => {
    expect(curveFlow(55, -12, 20, -12)).toBeCloseTo(55);
    expect(curveFlow(55, 20, 20, -12)).toBe(25);
    const middle = curveFlow(55, 4, 20, -12);
    expect(middle).toBeGreaterThan(30);
    expect(middle).toBeLessThan(55);
  });

  it("needs more electricity with a high flow, and gives a plausible SPF", () => {
    const low = heatingEnergy(house((b) => (b.envelope.heating.flow = 35)))!;
    const high = heatingEnergy(house((b) => (b.envelope.heating.flow = 60)))!;
    expect(low.flowSource).toBe("set");
    expect(high.final).toBeGreaterThan(low.final);
    expect(low.spf!).toBeGreaterThan(2.5);
    expect(low.spf!).toBeLessThan(5.5);
    expect(high.spf!).toBeLessThan(low.spf!);
    // The hours add up to the months.
    const hours = low.hourlyHeating.reduce((s, v) => s + v, 0);
    expect(hours).toBeCloseTo(low.final, 3);
  });

  it("takes the flow from the radiators, or a default without them", () => {
    const energy = heatingEnergy(house())!;
    expect(["radiators", "default"]).toContain(energy.flowSource);
    expect(energy.flow).toBeGreaterThanOrEqual(28);
  });

  it("uses the gross floor area for the energy per m²", () => {
    const energy = heatingEnergy(house())!;
    expect(energy.perArea).toBeCloseTo(energy.demand / energy.area);
  });
});
