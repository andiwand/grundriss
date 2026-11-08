// The check before the app replaces a plan file: the file on the disk must still have the
// revision that the open plan knows (`Building.revision`). Else another person or device saved
// the file in the meantime.

import { readBuildingFile } from "./package";

/** The part of a file handle that the check needs. */
export interface ReadableHandle {
  getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; lastModified: number }>;
}

export interface FileCheck {
  /** "same" if the file has the known revision, "changed" if not, "unknown" if unreadable. */
  state: "same" | "changed" | "unknown";
  /** The time of the last change of the file, in ms since 1970. */
  modified: number;
}

/**
 * Compares the revision of the file with `known`, the id of the revision that the plan knows,
 * or null for a plan without a revision. A file that the app cannot read gives "unknown", so that
 * the save goes on as before.
 */
export async function checkFileRevision(
  handle: ReadableHandle,
  known: string | null,
): Promise<FileCheck> {
  try {
    const file = await handle.getFile();
    const onDisk = readBuildingFile(new Uint8Array(await file.arrayBuffer())).revision?.id ?? null;
    return { state: onDisk === known ? "same" : "changed", modified: file.lastModified };
  } catch {
    return { state: "unknown", modified: 0 };
  }
}
