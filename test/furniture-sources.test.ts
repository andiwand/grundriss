import { describe, expect, it } from "vitest";
import { hasExternalFiles } from "../src/furniture/import";
import { kenneyModel } from "../src/furniture/kenney";
import {
  base64,
  glbDataUrl,
  guessCategory,
  guessUnitFactor,
  nameFromFile,
} from "../src/furniture/names";
import { itemsFromAssets } from "../src/furniture/polyhaven";

describe("names and categories", () => {
  it("makes readable names from file names", () => {
    expect(nameFromFile("bedDouble.glb")).toBe("Bed double");
    expect(nameFromFile("models/sofa_03.gltf")).toBe("Sofa 03");
    expect(nameFromFile("kitchenFridgeLarge.obj")).toBe("Kitchen fridge large");
    expect(nameFromFile(".glb")).toBe("Model");
  });

  it("guesses the category from the name and the tags", () => {
    expect(guessCategory("Arm Chair 01")).toBe("living");
    expect(guessCategory("Dining chair")).toBe("dining");
    expect(guessCategory("Office chair")).toBe("work");
    expect(guessCategory("Bed double")).toBe("sleeping");
    expect(guessCategory("Toilet")).toBe("bath");
    expect(guessCategory("Kitchen fridge")).toBe("kitchen");
    expect(guessCategory("Thing", ["sofa"])).toBe("living");
    expect(guessCategory("Rock")).toBe("other");
    expect(guessCategory("Modern Arm Chair 01", ["office", "modern"])).toBe("living");
    // A word matches only at the start of a word: "basket" has no "oven", "armchair" no "chair".
    expect(guessCategory("Woven basket")).toBe("storage");
    expect(guessCategory("Armchair")).toBe("living");
    expect(guessCategory("tableCoffee")).toBe("living");
    expect(guessCategory("Cabinet bed")).toBe("sleeping");
    expect(guessCategory("Bookcase open")).toBe("storage");
    expect(guessCategory("Lamp square floor")).toBe("lighting");
    expect(guessCategory("Potted plant")).toBe("decor");
  });

  it("guesses the unit of a model from its size", () => {
    expect(guessUnitFactor({ x: 2, y: 1.8, z: 0.5 })).toBe(1);
    expect(guessUnitFactor({ x: 200, y: 180, z: 50 })).toBe(0.01);
    expect(guessUnitFactor({ x: 2000, y: 1800, z: 500 })).toBe(0.001);
  });

  it("writes bytes as base64 in a data URL", () => {
    expect(base64(new Uint8Array([103, 108, 84, 70]))).toBe("Z2xURg==");
    expect(glbDataUrl(new Uint8Array([0]))).toBe("data:model/gltf-binary;base64,AA==");
    // A long array goes in chunks and must give the same result as one string.
    const long = new Uint8Array(100000).map((_, i) => i % 256);
    expect(atob(base64(long)).length).toBe(100000);
  });
});

describe("sources", () => {
  it("reads the list of Poly Haven, with the dimensions in millimeters", () => {
    const items = itemsFromAssets({
      ArmChair_01: {
        name: "Arm Chair 01",
        categories: ["furniture", "seating"],
        tags: ["chair", "couch"],
        authors: { "Kirill Sannikov": "All" },
        dimensions: [848.4, 765.8, 1065.1],
        thumbnail_url: "https://cdn.polyhaven.com/asset_img/thumbs/ArmChair_01.png",
        download_count: 10,
      },
      sofa_02: { name: "Sofa 02", dimensions: [2000, 900, 800], download_count: 50 },
    });
    expect(items.map((i) => i.id)).toEqual(["sofa_02", "ArmChair_01"]);
    expect(items[1].size).toEqual({ x: 0.848, y: 0.766, z: 1.065 });
    expect(items[1].authors).toEqual(["Kirill Sannikov"]);
    expect(items[1].category).toBe("living");
    expect(items[0].thumbnail).toContain("sofa_02");
  });

  it("finds external files in a glTF", () => {
    expect(
      hasExternalFiles({ buffers: [{ uri: "data:application/octet-stream;base64,AA==" }] }),
    ).toBe(false);
    expect(hasExternalFiles({ buffers: [{ uri: "scene.bin" }] })).toBe(true);
    expect(hasExternalFiles({ images: [{ uri: "textures/wood.jpg" }] })).toBe(true);
  });

  it("makes a model of a bundled Kenney file without data", () => {
    const model = kenneyModel({
      file: "bedDouble.glb",
      name: "Double bed",
      category: "sleeping",
      size: { x: 1.8, y: 2.1, z: 0.6 },
    });
    expect(model).toMatchObject({ origin: "kenney", ref: "bedDouble.glb", data: null });
    expect(model.license).toBe("CC0 1.0");
  });
});
