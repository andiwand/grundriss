// The notes of the objects: a text and photos for a wall, a window, a device, a room, and the
// other objects. A large photo becomes a smaller JPEG image, so that the plan stays small.

import { locale, t } from "../i18n";
import { pickFile, readImage } from "../io/files";
import type { Note, ServiceSystem } from "../model/types";
import { doc, showStatus } from "./context";
import { field, group, section } from "./panel";

/** A photo of a note is at most this many pixels on its long side. */
export const PHOTO_LIMIT = 1600;

/** A change of a note: the function gets the old note and gives the new one, or nothing. */
export type NoteChange = (edit: (note: Note | undefined) => Note | undefined) => void;

/** A note without a text and without photos goes away. */
const tidy = (note: Note): Note | undefined =>
  note.text.trim() || note.photos.length > 0 ? note : undefined;

/** Shows a photo large, over the app. A click or Esc closes it. */
function showPhoto(src: string): void {
  const dialog = document.createElement("dialog");
  dialog.className = "photo-dialog";
  const image = document.createElement("img");
  image.src = src;
  image.alt = "";
  dialog.append(image);
  dialog.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

/** The group of the note of an object: a text field, the photos, and a button for a photo. */
export function renderNotes(note: Note | undefined, change: NoteChange): void {
  const count = note ? (note.text.trim() ? 1 : 0) + note.photos.length : 0;
  const title = count > 0 ? t("Notes and photos · {count}", { count }) : t("Notes and photos");
  group(title, count > 0, () => {
    const text = document.createElement("textarea");
    text.className = "note-text";
    text.rows = 3;
    text.placeholder = t("For example: damp in the corner, window from 1985");
    text.value = note?.text ?? "";
    text.setAttribute("aria-label", t("Note"));
    text.addEventListener("change", () =>
      change((old) => tidy({ text: text.value, photos: old?.photos ?? [] })),
    );
    section.append(text);

    const photos = document.createElement("div");
    photos.className = "note-photos";
    (note?.photos ?? []).forEach((src, index) => {
      const item = document.createElement("div");
      item.className = "note-photo";
      const image = document.createElement("img");
      image.src = src;
      image.alt = t("Photo {number}", { number: index + 1 });
      image.addEventListener("click", () => showPhoto(src));
      const remove = document.createElement("button");
      remove.className = "icon-button";
      remove.title = t("Remove the photo");
      remove.setAttribute("aria-label", t("Remove the photo"));
      remove.textContent = "×";
      remove.addEventListener("click", () =>
        change((old) =>
          old ? tidy({ ...old, photos: old.photos.filter((_, i) => i !== index) }) : old,
        ),
      );
      item.append(image, remove);
      photos.append(item);
    });
    const add = document.createElement("button");
    add.className = "note-add";
    add.textContent = t("+ Photo");
    add.addEventListener("click", async () => {
      const current = doc.captureTarget();
      const file = await pickFile("image/*");
      if (!file) return;
      try {
        const image = await readImage(file, PHOTO_LIMIT);
        if (!current()) return;
        change((old) => ({
          text: old?.text ?? "",
          photos: [...(old?.photos ?? []), image.dataUrl],
        }));
      } catch {
        showStatus(t("The browser cannot read this image."), true);
      }
    });
    photos.append(add);
    section.append(photos);
  });
}

/**
 * The circuit of an electric device or line: a text field with the circuits of the building as
 * suggestions. An empty field removes the circuit.
 */
export function renderCircuit(
  system: ServiceSystem,
  value: string | undefined,
  set: (value: string | undefined) => void,
): void {
  if (system !== "electric") return;
  const known = new Set<string>();
  for (const story of doc.building.stories) {
    for (const item of [...story.fixtures, ...story.runs])
      if (item.circuit) known.add(item.circuit);
  }
  const list = document.createElement("datalist");
  list.id = "circuits";
  for (const name of [...known].sort(new Intl.Collator(locale(), { numeric: true }).compare)) {
    list.append(new Option(name));
  }
  const input = document.createElement("input");
  input.type = "text";
  input.value = value ?? "";
  input.placeholder = t("For example F3");
  input.setAttribute("list", "circuits");
  input.addEventListener("change", () => set(input.value.trim() || undefined));
  field(t("Circuit"), input);
  section.append(list);
}
