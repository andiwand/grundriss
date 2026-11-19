import { describe, expect, it } from "vitest";
import { makeHouse } from "../src/model/example";
import { parseBuilding, serializeBuilding, serializeBuildingYaml } from "../src/model/file";
import { isJsonName, isYamlName, parseText, toYaml } from "../src/model/yaml";

describe("YAML files", () => {
  it("writes the plan as YAML and reads it back", () => {
    const house = makeHouse();
    const yaml = serializeBuildingYaml(house);
    expect(yaml).toMatch(/^format: grundriss$/m);
    expect(yaml).not.toContain('"format"');
    expect(parseBuilding(yaml)).toEqual(parseBuilding(serializeBuilding(house)));
  });

  it("still reads the JSON of older files", () => {
    const house = makeHouse();
    expect(parseBuilding(serializeBuilding(house))).toEqual(
      parseBuilding(serializeBuildingYaml(house)),
    );
  });

  it("puts a small collection of short values on one line", () => {
    const yaml = toYaml({ points: [{ id: "v-1", x: 0, y: 4.5 }], hours: [1, 2, 3, 4, 5, 6, 7, 8] });
    expect(yaml).toBe(
      "points:\n  - { id: v-1, x: 0, y: 4.5 }\nhours: [ 1, 2, 3, 4, 5, 6, 7, 8 ]\n",
    );
  });

  it("keeps texts that look like other values, and long texts on one line", () => {
    const value = {
      texts: ["true", "null", "1.5", "0x10", "", "a: b", "# note", "- x", "grundriss-blob:a-b-c"],
      image: `data:image/png;base64,${"A".repeat(500)}`,
      empty: { list: [], map: {} },
      nothing: null,
      numbers: [0, -1.25, 1e-9, 12345678901234],
    };
    const yaml = toYaml(value);
    expect(parseText(yaml)).toEqual(value);
    expect(yaml.split("\n").some((line) => line.endsWith("A".repeat(500)))).toBe(true);
  });

  it("gives an error for a text that is neither YAML nor JSON", () => {
    expect(() => parseBuilding("a: [")).toThrow("not valid YAML or JSON");
    expect(() => parseBuilding("{")).toThrow("not valid YAML or JSON");
    expect(() => parseBuilding("just a text")).toThrow("not a Grundriss plan");
  });

  it("knows the extensions", () => {
    expect(isYamlName("House.yaml")).toBe(true);
    expect(isYamlName("House.YML")).toBe(true);
    expect(isYamlName("House.json")).toBe(false);
    expect(isJsonName("House.json")).toBe(true);
    expect(isJsonName("House.grundriss")).toBe(false);
  });
});
