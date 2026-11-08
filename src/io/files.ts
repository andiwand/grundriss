// Reads and writes files. Chromium has the File System Access API, so Save can write to the
// same file again. Firefox and Safari use a file input to open and a download to save.

export interface FilePickerType {
  description: string;
  accept: Record<string, string[]>;
}

interface FilePickerWindow {
  showOpenFilePicker?(options?: { types?: FilePickerType[] }): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?(options?: {
    types?: FilePickerType[];
    suggestedName?: string;
  }): Promise<FileSystemFileHandle>;
}

export const PACKAGE_TYPE: FilePickerType = {
  description: "Grundriss package",
  accept: { "application/zip": [".grundriss"] },
};
export const JSON_TYPE: FilePickerType = {
  description: "Grundriss plan (JSON)",
  accept: { "application/json": [".json"] },
};
export const EXPORT_TYPES = {
  svg: { description: "SVG drawing", accept: { "image/svg+xml": [".svg"] } },
  pdf: { description: "PDF document", accept: { "application/pdf": [".pdf"] } },
  dxf: { description: "DXF drawing", accept: { "application/dxf": [".dxf"] } },
  glb: { description: "glTF binary model", accept: { "model/gltf-binary": [".glb"] } },
} satisfies Record<string, FilePickerType>;

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

export interface OpenedFile {
  name: string;
  bytes: Uint8Array;
  /** The handle to save to the same file again, or null if the browser has no handle. */
  handle: FileSystemFileHandle | null;
}

/** Asks the user for a file. It gives null if the user cancels. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

/** Asks for a package or a JSON plan and reads its bytes. It gives null if the user cancels. */
export async function openPlanFile(): Promise<OpenedFile | null> {
  const picker = window as FilePickerWindow;
  if (picker.showOpenFilePicker) {
    try {
      const [handle] = await picker.showOpenFilePicker({
        types: [
          {
            description: "Grundriss plan",
            accept: { "application/zip": [".grundriss"], "application/json": [".json"] },
          },
        ],
      });
      const file = await handle.getFile();
      return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), handle };
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
  }
  const file = await pickFile(".grundriss,.json,application/json,application/zip");
  return file
    ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), handle: null }
    : null;
}

async function write(handle: FileSystemFileHandle, blob: Blob): Promise<void> {
  const stream = await handle.createWritable();
  try {
    await stream.write(blob);
  } catch (error) {
    // The abort removes the temporary file and keeps the old content of the file.
    await stream.abort().catch(() => {});
    throw error;
  }
  await stream.close();
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type SaveResult = { name: string; handle: FileSystemFileHandle | null } | null;

/**
 * Saves a file. With a handle, it writes to that file. Without a handle, it asks for a file, or
 * it downloads the file if the browser cannot ask. It gives null if the user cancels. The blob
 * comes from `makeBlob` with the name of the file, because the name can decide the format.
 */
async function save(
  makeBlob: (name: string) => Blob | Promise<Blob>,
  suggestedName: string,
  types: FilePickerType[],
  handle: FileSystemFileHandle | null,
): Promise<SaveResult> {
  if (handle) {
    await write(handle, await makeBlob(handle.name));
    return { name: handle.name, handle };
  }
  const picker = window as FilePickerWindow;
  if (picker.showSaveFilePicker) {
    try {
      const chosen = await picker.showSaveFilePicker({ types, suggestedName });
      await write(chosen, await makeBlob(chosen.name));
      return { name: chosen.name, handle: chosen };
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
  }
  download(await makeBlob(suggestedName), suggestedName);
  return { name: suggestedName, handle: null };
}

/** Saves a blob. See `save`. */
export function saveBlob(
  blob: Blob,
  suggestedName: string,
  types: FilePickerType[],
  handle: FileSystemFileHandle | null = null,
): Promise<SaveResult> {
  return save(() => blob, suggestedName, types, handle);
}

/**
 * Saves a plan file. The name decides the order of the types in the picker: a name that ends
 * with ".json" shows the JSON type first, else the package type is first. The caller makes the
 * blob in the format that the name of the result asks for. So with a picker, the caller gives a
 * function that makes the blob for the chosen name.
 */
export function savePlanFile(
  makeBlob: (name: string) => Blob | Promise<Blob>,
  handle: FileSystemFileHandle | null,
  suggestedName: string,
): Promise<SaveResult> {
  const json = suggestedName.toLowerCase().endsWith(".json");
  const types = json ? [JSON_TYPE, PACKAGE_TYPE] : [PACKAGE_TYPE, JSON_TYPE];
  return save(makeBlob, suggestedName, types, handle);
}

/** An image larger than this on its long side becomes smaller when the app reads it, in pixels. */
export const IMAGE_LIMIT = 4000;
/** An image file larger than this gets a new encoding as JPEG, also if it is small enough, in bytes. */
export const IMAGE_BYTES = 3_000_000;
/** The quality of the JPEG of a reduced image. */
const JPEG_QUALITY = 0.88;

/**
 * Reads an image file as a data URL and gives its size in pixels. A large image becomes smaller:
 * its long side goes down to IMAGE_LIMIT, and it gets a JPEG encoding. The plan keeps the image
 * in the file, in the browser, and in each step of the undo history, so a photo of a phone with
 * 20 MB would make all of them slow. `reduced` is true if the image changed.
 */
export async function readImage(
  file: File,
  limit = IMAGE_LIMIT,
): Promise<{ dataUrl: string; width: number; height: number; reduced: boolean }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  // An SVG without a width and a height can have no size. Its scale would then be infinite.
  if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) {
    throw new Error("The image has no size in pixels. Use a PNG or a JPEG file.");
  }
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const factor = Math.min(1, limit / Math.max(width, height));
  if (factor >= 1 && file.size <= IMAGE_BYTES) return { dataUrl, width, height, reduced: false };
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * factor);
  canvas.height = Math.round(height * factor);
  const context = canvas.getContext("2d");
  if (!context) return { dataUrl, width, height, reduced: false };
  // A JPEG has no transparency, so a white ground goes under the image.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const reduced = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  // A small image with few colors can be smaller as it was.
  if (factor >= 1 && reduced.length >= dataUrl.length) {
    return { dataUrl, width, height, reduced: false };
  }
  return { dataUrl: reduced, width: canvas.width, height: canvas.height, reduced: true };
}
