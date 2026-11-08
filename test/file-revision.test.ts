import { describe, expect, it } from "vitest";
import { checkFileRevision, type ReadableHandle } from "../src/io/file-revision";
import { writePackage } from "../src/io/package";
import { emptyBuilding } from "../src/model/building";
import { newRevision, serializeBuilding } from "../src/model/file";

/** A handle of a file with the bytes, like the File System Access API gives it. */
const handle = (bytes: Uint8Array | string, modified = 1234): ReadableHandle => ({
  getFile: async () => ({
    lastModified: modified,
    arrayBuffer: async () => {
      const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    },
  }),
});

describe("the check of a file before a save", () => {
  const building = emptyBuilding();
  building.revision = newRevision(undefined, "macOS");

  it("finds the revision that the plan knows, in JSON and in a package", async () => {
    const id = building.revision!.id;
    expect(await checkFileRevision(handle(serializeBuilding(building)), id)).toEqual({
      state: "same",
      modified: 1234,
    });
    expect((await checkFileRevision(handle(writePackage(building)), id)).state).toBe("same");
  });

  it("finds a file that another device saved in the meantime", async () => {
    const other = { ...building, revision: newRevision(building.revision, "Linux") };
    const check = await checkFileRevision(
      handle(serializeBuilding(other), 99),
      building.revision!.id,
    );
    expect(check).toEqual({ state: "changed", modified: 99 });
  });

  it("treats a file without a revision like a plan without one", async () => {
    const plain = serializeBuilding(emptyBuilding());
    expect((await checkFileRevision(handle(plain), null)).state).toBe("same");
    expect((await checkFileRevision(handle(plain), "abc")).state).toBe("changed");
  });

  it("goes on with a file that it cannot read", async () => {
    expect((await checkFileRevision(handle("not a plan"), "abc")).state).toBe("unknown");
  });
});
