import { describe, expect, it } from "vitest";
import { addCellar } from "../src/model/building";
import { makeHouse } from "../src/model/example";
import { defaultHeating } from "../src/model/heating";
import { parseBuilding, serializeBuilding } from "../src/model/file";
import { heatingEnergy } from "../src/model/heating";
import type { Building, Climate } from "../src/model/types";
import {
  addInsulation,
  addMeasure,
  applyVariant,
  measuresFor,
  measureVariant,
  MEASURES,
  sameAsPlan,
  variantOf,
  withVariant,
} from "../src/model/variants";
import vienna from "./fixtures/vienna-climate.json";

function house(): Building {
  const building = makeHouse();
  building.climate = vienna as Climate;
  return building;
}

const preset = (id: string) => MEASURES.find((m) => m.id === id)!;

describe("variants", () => {
  it("adds the insulation to the best insulation layer, or a new layer", () => {
    const layers = [
      { material: "brick", thickness: 0.2 },
      { material: "eps", thickness: 0.1 },
      { material: "pur", thickness: 0.05 },
    ];
    expect(addInsulation(layers, 0.1).map((l) => l.thickness)).toEqual([0.2, 0.1, 0.15]);
    // The function does not change its input.
    expect(layers[2].thickness).toBe(0.05);
    expect(addInsulation([{ material: "brick", thickness: 0.3 }], 0.1)).toEqual([
      { material: "brick", thickness: 0.3 },
      { material: "mineral-wool", thickness: 0.1 },
    ]);
  });

  it("compares a variant with the plan without a change of the plan", () => {
    const building = house();
    const plan = heatingEnergy(building)!;
    const roof = measureVariant(building, preset("roof"));
    expect(sameAsPlan(building, roof)).toBe(false);
    expect(sameAsPlan(building, variantOf(building, "Copy"))).toBe(true);
    const better = heatingEnergy(withVariant(building, roof))!;
    expect(better.demand).toBeLessThan(plan.demand);
    expect(heatingEnergy(building)!.demand).toBeCloseTo(plan.demand);

    const gas = measureVariant(
      {
        ...building,
        envelope: { ...building.envelope, heating: defaultHeating("gas") },
      },
      preset("heat-pump"),
    );
    expect(gas.envelope.heating.kind).toBe("heat-pump");
  });

  it("applies a variant to the plan, with the heated stories", () => {
    const building = house();
    const cellar = addCellar(building);
    expect(preset("unheated-cellar").available(building)).toBe(false);
    const heated = measureVariant(building, preset("heated-cellar"));
    expect(heated.unheated).not.toContain(cellar.id);
    applyVariant(building, heated);
    expect(cellar.heated).toBe(true);
    expect(sameAsPlan(building, heated)).toBe(true);
    // The variant keeps its own copy of the envelope.
    building.envelope.windowU = 2;
    expect(heated.envelope.windowU).not.toBe(2);
  });

  it("reads the variants from a file, and leaves out stories that do not exist", () => {
    const building = house();
    const cellar = addCellar(building);
    const variant = measureVariant(building, preset("walls"));
    variant.unheated.push("st-gone");
    building.variants.push(variant);
    const read = parseBuilding(serializeBuilding(building));
    expect(read.variants).toEqual([{ ...variant, unheated: [cellar.id] }]);
    expect(read.stories.find((s) => s.id === cellar.id)!.heated).toBe(false);
  });
});

describe("measures", () => {
  it("adds measures to a variant, one after the other, and offers only the new ones", () => {
    const building = house();
    const variant = measureVariant(building, preset("roof"));
    expect(measuresFor(building, variant).map((m) => m.id)).toContain("battery");
    addMeasure(building, variant, preset("battery"));
    addMeasure(building, variant, preset("walls"));
    expect(variant.name).toBe(preset("roof").name);
    expect(variant.household.battery).toBe(10);
    expect(measuresFor(building, variant).map((m) => m.id)).not.toContain("battery");
    // The plan does not change.
    expect(building.household.battery).toBe(0);
    expect(sameAsPlan(building, variant)).toBe(false);
  });

  it("puts PV on the best free face of the variant", () => {
    const building = house();
    building.pv = [];
    const variant = measureVariant(building, preset("pv"));
    expect(variant.pv).toHaveLength(1);
    expect(building.pv).toHaveLength(0);
  });
});
