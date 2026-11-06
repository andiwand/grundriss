import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import {
  decodeDataUrl,
  isPackage,
  readPackage,
  readPlanFile,
  writePackage,
} from "../src/io/package";
import { serializePlan } from "../src/model/file";
import { addVertex, addWall, emptyPlan } from "../src/model/plan";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function plan() {
  const result = emptyPlan();
  const a = addVertex(result, { x: 0, y: 0 });
  const b = addVertex(result, { x: 3, y: 0 });
  addWall(result, a.id, b.id);
  result.background = { image: PNG, width: 1, height: 1, x: 0, y: 0, scale: 0.01, opacity: 0.5 };
  return result;
}

describe("package format", () => {
  it("reads what it writes", () => {
    const original = plan();
    const bytes = writePackage(original, {
      "plan.svg": "<svg/>",
      "model.glb": new Uint8Array([1]),
    });
    expect(isPackage(bytes)).toBe(true);
    expect(readPackage(bytes)).toEqual(original);
    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual(
      ["background.png", "exports/model.glb", "exports/plan.svg", "plan.json"].sort(),
    );
    expect(files["background.png"]).toEqual(decodeDataUrl(PNG).bytes);
    expect(JSON.parse(new TextDecoder().decode(files["plan.json"])).background.image).toBe(
      "background.png",
    );
  });

  it("works without a background", () => {
    const original = emptyPlan();
    expect(readPackage(writePackage(original))).toEqual(original);
  });

  it("reads a package and a JSON file", () => {
    const original = plan();
    expect(readPlanFile(writePackage(original))).toEqual(original);
    expect(readPlanFile(strToU8(serializePlan(original)))).toEqual(original);
  });

  it("gives clear errors", () => {
    expect(() => readPackage(zipSync({ "other.txt": strToU8("x") }))).toThrow('no "plan.json"');
    const files = unzipSync(writePackage(plan()));
    delete files["background.png"];
    expect(() => readPackage(zipSync(files))).toThrow('"background.png" is missing');
    expect(() => readPackage(new Uint8Array([0x50, 0x4b, 3, 4, 0]))).toThrow("damaged");
  });
});
