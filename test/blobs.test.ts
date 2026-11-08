import { describe, expect, it } from "vitest";
import { BLOB_MIN, blobHash, blobRefs, dehydrate, hydrate } from "../src/model/blobs";
import { emptyBuilding } from "../src/model/building";
import { parseBuilding, serializeBuilding } from "../src/model/file";

const image = (fill: string) => `data:image/png;base64,${fill.repeat(BLOB_MIN)}`;

describe("blobs", () => {
  it("keeps each large data URL once, and puts it back", () => {
    const building = emptyBuilding();
    building.stories[0].background = {
      image: image("A"),
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      scale: 0.01,
      opacity: 0.5,
    };
    const json = serializeBuilding(building);
    const { json: dry, blobs } = dehydrate(json);
    expect(dry).not.toContain("data:image");
    expect(dry.length).toBeLessThan(json.length - BLOB_MIN);
    expect(blobs.size).toBe(1);
    expect(blobRefs(dry)).toEqual([...blobs.keys()]);
    const wet = hydrate(dry, (hash) => blobs.get(hash));
    expect(parseBuilding(wet)).toEqual(parseBuilding(json));
  });

  it("gives the same hash for the same image, and another for another image", () => {
    expect(blobHash(image("A"))).toBe(blobHash(image("A")));
    expect(blobHash(image("A"))).not.toBe(blobHash(image("B")));
  });

  it("leaves small values and a JSON without references as they are", () => {
    const json = serializeBuilding(emptyBuilding());
    expect(dehydrate(json).blobs.size).toBe(0);
    expect(hydrate(json, () => undefined)).toBe(json);
  });

  it("refuses a reference whose value is missing", () => {
    const { json } = dehydrate(JSON.stringify({ a: image("A") }));
    expect(() => hydrate(json, () => undefined)).toThrow();
  });
});
