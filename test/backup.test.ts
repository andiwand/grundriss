import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { makeBackup, readBackup } from "../src/io/backup";
import type { Project } from "../src/io/projects";

const project = (id: string, name: string, data = "{}"): Project => ({
  id,
  name,
  created: 1,
  updated: 2,
  preview: "",
  data,
});

describe("backup of the projects", () => {
  it("reads what it writes, also two projects with the same name", () => {
    const projects = [project("a", "House"), project("b", "House", '{"x":1}'), project("c", "A/B")];
    const read = readBackup(makeBackup(projects));
    expect(read).toEqual(projects);
  });

  it("leaves out the time of the trash", () => {
    const read = readBackup(makeBackup([{ ...project("a", "Old"), deleted: 5 }]));
    expect(read[0].deleted).toBeUndefined();
  });

  it("rejects a file that is not a backup", () => {
    expect(() => readBackup(new Uint8Array([1, 2, 3]))).toThrow("not a backup");
    expect(() => readBackup(zipSync({ "x.txt": strToU8("x") }))).toThrow("not a backup");
  });
});
