// The backup of all projects in the browser: one ZIP file. It has one plan file for each project
// in the folder "plans" (the YAML of the file format, so the app can also open each file alone),
// and "projects.yaml" with the names and the times of the projects. Backups of older apps have
// JSON files ("projects.json" and "plans/<name>.json"), and readBackup reads them too.

import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import type { Project, ProjectInfo } from "./projects";
import { isObject } from "../model/history";
import { isYamlName, parseText, toYaml } from "../model/yaml";

const FORMAT = "grundriss-backup";
const MANIFEST = "projects.yaml";
const OLD_MANIFEST = "projects.json";
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
    let file = `plans/${safeName(info.name)}.yaml`;
    for (let n = 2; used.has(file); n++) file = `plans/${safeName(info.name)} (${n}).yaml`;
    used.add(file);
    files[file] = strToU8(yamlOf(data));
    manifest.projects.push({ ...info, file });
  }
  files[MANIFEST] = strToU8(toYaml(manifest));
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
  const raw = Object.hasOwn(files, MANIFEST) ? files[MANIFEST] : files[OLD_MANIFEST];
  if (!raw) throw new Error("The file is not a backup of Grundriss.");
  let manifest: unknown;
  try {
    manifest = parseText(strFromU8(raw));
  } catch {
    throw new Error("The file is not a backup of Grundriss.");
  }
  if (
    !isObject(manifest) ||
    manifest.format !== FORMAT ||
    manifest.version !== VERSION ||
    !Array.isArray(manifest.projects)
  ) {
    throw new Error("The file is not a backup of this version of Grundriss.");
  }
  const result: Project[] = [];
  const ids = new Set<string>();
  for (const entry of manifest.projects) {
    if (
      !isObject(entry) ||
      typeof entry.id !== "string" ||
      !entry.id ||
      ids.has(entry.id) ||
      typeof entry.name !== "string" ||
      typeof entry.preview !== "string" ||
      !isTime(entry.created) ||
      !isTime(entry.updated) ||
      typeof entry.file !== "string" ||
      !Object.hasOwn(files, entry.file)
    ) {
      throw new Error("The file is not a backup of Grundriss.");
    }
    ids.add(entry.id);
    result.push({
      id: entry.id,
      name: entry.name,
      created: entry.created,
      updated: entry.updated,
      preview: entry.preview,
      data: planData(entry.file, strFromU8(files[entry.file])),
    });
  }
  return result;
}

/** The YAML of the JSON of a plan. A damaged plan stays as it is, so the backup keeps it. */
function yamlOf(json: string): string {
  try {
    return toYaml(JSON.parse(json));
  } catch {
    return json;
  }
}

/**
 * The browser keeps the plan of a project as JSON, so a YAML file of the backup becomes JSON. A
 * damaged file stays as it is: the caller does not take a plan that it cannot read.
 */
function planData(file: string, text: string): string {
  if (!isYamlName(file)) return text;
  try {
    return JSON.stringify(parseText(text), null, 2);
  } catch {
    return text;
  }
}

const isTime = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
