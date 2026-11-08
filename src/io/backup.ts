// The backup of all projects in the browser: one ZIP file. It has one plan file for each project
// in the folder "plans" (the JSON of the file format, so the app can also open each file alone),
// and "projects.json" with the names and the times of the projects.

import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import type { Project, ProjectInfo } from "./projects";

const FORMAT = "grundriss-backup";
const VERSION = 1;

interface Manifest {
  format: string;
  version: number;
  created: number;
  projects: (Omit<ProjectInfo, "deleted"> & { file: string })[];
}

/** A file name from the name of a project: without the characters that file systems forbid. */
const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "Plan";

/** The ZIP file of the backup of the projects. */
export function makeBackup(projects: Project[], now = Date.now()): Uint8Array {
  const files: Zippable = {};
  const used = new Set<string>();
  const manifest: Manifest = { format: FORMAT, version: VERSION, created: now, projects: [] };
  for (const { data, deleted: _deleted, ...info } of projects) {
    // Two projects can have the same name, so the second gets a number.
    let file = `plans/${safeName(info.name)}.json`;
    for (let n = 2; used.has(file); n++) file = `plans/${safeName(info.name)} (${n}).json`;
    used.add(file);
    files[file] = strToU8(data);
    manifest.projects.push({ ...info, file });
  }
  files["projects.json"] = strToU8(JSON.stringify(manifest, null, 2));
  return zipSync(files, { level: 6 });
}

/** The projects of a backup file. It throws an error if the file is not a backup. */
export function readBackup(bytes: Uint8Array): Project[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("The file is not a backup of Grundriss.");
  }
  const raw = files["projects.json"];
  if (!raw) throw new Error("The file is not a backup of Grundriss.");
  const manifest = JSON.parse(strFromU8(raw)) as Manifest;
  if (manifest.format !== FORMAT || manifest.version > VERSION) {
    throw new Error("The file is not a backup of this version of Grundriss.");
  }
  const result: Project[] = [];
  for (const { file, ...info } of manifest.projects) {
    const data = files[file];
    if (data) result.push({ ...info, data: strFromU8(data) });
  }
  return result;
}
