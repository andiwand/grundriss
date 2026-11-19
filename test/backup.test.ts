import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
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
  const archive = (projects: unknown, version: unknown = 1) =>
    zipSync({
      "projects.json": strToU8(JSON.stringify({ format: "grundriss-backup", version, projects })),
      "plans/a.json": strToU8("{}"),
    });

  it("rejects invalid metadata before it can replace a stored project", () => {
    const entry = { ...project("a", "House"), file: "plans/a.json" };
    for (const bad of [
      { ...entry, updated: "tomorrow" },
      { ...entry, id: null },
      { ...entry, name: {} },
      { ...entry, created: -1 },
    ])
      expect(() => readBackup(archive([bad]))).toThrow("backup");
    expect(() => readBackup(archive([entry], null))).toThrow("backup");
    expect(() => readBackup(archive([entry, entry]))).toThrow("backup");
  });

  it("reports missing plan files instead of reporting an incomplete backup as restored", () => {
    expect(() => readBackup(archive([{ ...project("a", "House"), file: "missing.json" }]))).toThrow(
      "backup",
    );
    expect(() => readBackup(archive([{ ...project("a", "House"), file: "constructor" }]))).toThrow(
      "backup",
    );
  });

  it("reads what it writes, also two projects with the same name", () => {
    const data = JSON.stringify({ x: 1, name: "yes" }, null, 2);
    const projects = [project("a", "House"), project("b", "House", data), project("c", "A/B")];
    const read = readBackup(makeBackup(projects));
    expect(read).toEqual(projects);
  });

  it("has YAML files, and reads the JSON files of an older backup", () => {
    const files = unzipSync(makeBackup([project("a", "House", '{\n  "x": 1\n}')]));
    expect(Object.keys(files).sort()).toEqual(["plans/House.yaml", "projects.yaml"]);
    expect(strFromU8(files["plans/House.yaml"])).toBe("x: 1\n");
    // The archive of the other tests is a backup of an older app, with JSON files.
    const entry = { ...project("a", "House"), file: "plans/a.json" };
    expect(readBackup(archive([entry]))[0].data).toBe("{}");
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
