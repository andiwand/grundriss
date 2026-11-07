import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import {
  decodeDataUrl,
  isPackage,
  readBuildingFile,
  readPackage,
  writePackage,
} from "../src/io/package";
import { addStoryOnTop, emptyBuilding } from "../src/model/building";
import { serializeBuilding } from "../src/model/file";
import { addVertex, addWall, emptyPlan } from "../src/model/plan";
import type { Building, Climate } from "../src/model/types";
import vienna from "./fixtures/vienna-climate.json";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==";

/** A building with two stories. Each story has a wall and its own background. */
function building(): Building {
  const result = emptyBuilding();
  const upper = addStoryOnTop(result);
  for (const [story, image] of [
    [result.stories[0], PNG],
    [upper, JPEG],
  ] as const) {
    const a = addVertex(story, { x: 0, y: 0 });
    const b = addVertex(story, { x: 3, y: 0 });
    addWall(story, a.id, b.id);
    story.background = { image, width: 1, height: 1, x: 0, y: 0, scale: 0.01, opacity: 0.5 };
  }
  return result;
}

describe("package format", () => {
  it("reads what it writes, with a background on each story", () => {
    const original = building();
    const bytes = writePackage(original, {
      "plan.svg": "<svg/>",
      "model.glb": new Uint8Array([1]),
    });
    expect(isPackage(bytes)).toBe(true);
    expect(readPackage(bytes)).toEqual(original);
    const files = unzipSync(bytes);
    const [ground, upper] = original.stories;
    expect(Object.keys(files).sort()).toEqual(
      [
        `backgrounds/${ground.id}.png`,
        `backgrounds/${upper.id}.jpg`,
        "exports/model.glb",
        "exports/plan.svg",
        "plan.json",
      ].sort(),
    );
    expect(files[`backgrounds/${ground.id}.png`]).toEqual(decodeDataUrl(PNG).bytes);
    const json = JSON.parse(new TextDecoder().decode(files["plan.json"]));
    expect(json.version).toBe(2);
    expect(json.stories[1].background.image).toBe(`backgrounds/${upper.id}.jpg`);
  });

  it("works without a background", () => {
    const original = emptyBuilding();
    expect(readPackage(writePackage(original))).toEqual(original);
  });

  it("reads a package and a JSON file", () => {
    const original = building();
    expect(readBuildingFile(writePackage(original))).toEqual(original);
    expect(readBuildingFile(strToU8(serializeBuilding(original)))).toEqual(original);
  });

  it("reads an old package of version 1", () => {
    // The old writer put one plan at the top level and the image at "background.png".
    const plan = emptyPlan();
    const a = addVertex(plan, { x: 0, y: 0 });
    const b = addVertex(plan, { x: 2, y: 0 });
    addWall(plan, a.id, b.id);
    const { stairs: _stairs, chimneys: _chimneys, ...old } = plan;
    const json = {
      format: "grundriss",
      version: 1,
      ...old,
      background: {
        image: "background.png",
        width: 1,
        height: 1,
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
      },
    };
    const bytes = zipSync({
      "background.png": [decodeDataUrl(PNG).bytes, { level: 0 }],
      "plan.json": strToU8(JSON.stringify(json)),
    });
    const result = readBuildingFile(bytes);
    expect(result.stories).toHaveLength(1);
    expect(result.stories[0].walls).toHaveLength(1);
    expect(result.stories[0].background?.image).toBe(PNG);
  });

  it("gives clear errors", () => {
    expect(() => readPackage(zipSync({ "other.txt": strToU8("x") }))).toThrow('no "plan.json"');
    const original = building();
    const files = unzipSync(writePackage(original));
    const missing = `backgrounds/${original.stories[1].id}.jpg`;
    delete files[missing];
    expect(() => readPackage(zipSync(files))).toThrow(`"${missing}" is missing`);
    expect(() => readPackage(new Uint8Array([0x50, 0x4b, 3, 4, 0]))).toThrow("damaged");
    expect(() => readPackage(zipSync({ "plan.json": strToU8("{") }))).toThrow("not valid JSON");
  });
});

describe("models in the package", () => {
  const GLB = "data:model/gltf-binary;base64,Z2xURgIAAAAMAAAA";

  function furnished(): Building {
    const result = emptyBuilding();
    result.models = [
      {
        id: "m-chair",
        name: "Chair",
        origin: "import",
        ref: "chair.glb",
        data: GLB,
        size: { x: 0.5, y: 0.5, z: 0.9 },
        license: "CC0",
        credit: "Someone",
      },
      {
        id: "m-kenney",
        name: "Desk",
        origin: "kenney",
        ref: "desk.glb",
        data: null,
        size: { x: 1.4, y: 0.7, z: 0.75 },
        license: "CC0",
        credit: "Kenney",
      },
    ];
    return result;
  }

  it("stores a model as a GLB file and reads it back", () => {
    const original = furnished();
    const bytes = writePackage(original);
    const files = unzipSync(bytes);
    expect(files["models/m-chair.glb"]).toEqual(decodeDataUrl(GLB).bytes);
    // The bundled model has no file, because the app has it.
    expect(files["models/m-kenney.glb"]).toBeUndefined();
    const stored = JSON.parse(new TextDecoder().decode(files["plan.json"]));
    expect(stored.models[0].data).toBe("models/m-chair.glb");
    expect(readPackage(bytes)).toEqual(original);
  });

  it("writes the credits of the models", () => {
    const files = unzipSync(writePackage(furnished()));
    const text = new TextDecoder().decode(files["exports/CREDITS.txt"]);
    expect(text).toContain("Chair | import | CC0 | Someone");
    expect(text).toContain("Desk | kenney | CC0 | Kenney");
  });

  it("credits the weather data of a climate", () => {
    const building = emptyBuilding();
    building.climate = vienna as Climate;
    const text = new TextDecoder().decode(unzipSync(writePackage(building))["exports/CREDITS.txt"]);
    expect(text).toContain("Weather data by Open-Meteo.com");
    expect(text).toContain("CC BY 4.0");
    expect(text).not.toContain("Models in this plan");
  });

  it("writes no credits without models", () => {
    expect(unzipSync(writePackage(emptyBuilding()))["exports/CREDITS.txt"]).toBeUndefined();
  });

  it("names the missing file of a model", () => {
    const files = unzipSync(writePackage(furnished()));
    delete files["models/m-chair.glb"];
    expect(() => readPackage(zipSync(files))).toThrow('"models/m-chair.glb" of Chair is missing');
  });
});

describe("edge cases of the package", () => {
  it("keeps the type of an image that has no known extension", () => {
    const original = building();
    original.stories[0].background!.image = "data:image/tiff;base64,SUkqAA==";
    const bytes = writePackage(original);
    expect(Object.keys(unzipSync(bytes))).toContain(`backgrounds/${original.stories[0].id}.tiff`);
    expect(readPackage(bytes)).toEqual(original);
  });

  it("does not take a property of an object as a file", () => {
    const json = JSON.parse(serializeBuilding(building()));
    json.stories[0].background.image = "constructor";
    const bytes = zipSync({ "plan.json": strToU8(JSON.stringify(json)) });
    expect(() => readPackage(bytes)).toThrow('"constructor" is missing');
  });
});
