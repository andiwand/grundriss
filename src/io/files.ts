// Reads and writes files. Chromium has the File System Access API, so Save can write to the
// same file again. Firefox and Safari use a file input to open and a download to save.

interface FilePickerType {
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

const PLAN_TYPES: FilePickerType[] = [
  { description: "Grundriss plan", accept: { "application/json": [".json"] } },
];

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

export interface OpenedFile {
  name: string;
  text: string;
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

export async function openPlanFile(): Promise<OpenedFile | null> {
  const picker = window as FilePickerWindow;
  if (picker.showOpenFilePicker) {
    try {
      const [handle] = await picker.showOpenFilePicker({ types: PLAN_TYPES });
      const file = await handle.getFile();
      return { name: file.name, text: await file.text(), handle };
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
  }
  const file = await pickFile(".json,application/json");
  return file ? { name: file.name, text: await file.text(), handle: null } : null;
}

async function write(handle: FileSystemFileHandle, text: string): Promise<void> {
  const stream = await handle.createWritable();
  await stream.write(text);
  await stream.close();
}

/**
 * Saves the text. With a handle, it writes to that file. Without a handle, it asks for a file,
 * or it downloads the file if the browser cannot ask. It gives null if the user cancels.
 */
export async function savePlanFile(
  text: string,
  handle: FileSystemFileHandle | null,
  suggestedName: string,
): Promise<{ name: string; handle: FileSystemFileHandle | null } | null> {
  if (handle) {
    await write(handle, text);
    return { name: handle.name, handle };
  }
  const picker = window as FilePickerWindow;
  if (picker.showSaveFilePicker) {
    try {
      const chosen = await picker.showSaveFilePicker({ types: PLAN_TYPES, suggestedName });
      await write(chosen, text);
      return { name: chosen.name, handle: chosen };
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = suggestedName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { name: suggestedName, handle: null };
}

/** Reads an image file as a data URL and gives its size in pixels. */
export async function readImage(
  file: File,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  return { dataUrl, width: image.naturalWidth, height: image.naturalHeight };
}
