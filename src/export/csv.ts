// The quantities as CSV files in one ZIP file: the rooms, the openings, the envelope with its
// materials, and the building services. A spreadsheet opens each file. The separator and the
// decimal mark follow the language: a German spreadsheet expects ";" and ",".

import { strToU8, zipSync } from "fflate";
import type { Takeoff } from "../model/takeoff";

export interface CsvFormat {
  separator: "," | ";";
  decimal: "." | ",";
}

export const CSV_EN: CsvFormat = { separator: ",", decimal: "." };
export const CSV_DE: CsvFormat = { separator: ";", decimal: "," };

/**
 * One CSV file from rows of cells. A cell with the separator, a quote, or a new line gets quotes.
 * A text that starts like a formula (=, +, -, @) gets a "'" in front, so that a spreadsheet shows
 * it as text and does not run it.
 */
export function csv(rows: (string | number)[][], format: CsvFormat = CSV_EN): string {
  const cell = (value: string | number) => {
    const text =
      typeof value === "number"
        ? String(Math.round(value * 1000) / 1000).replace(".", format.decimal)
        : /^[=+\-@\t\r]/.test(value)
          ? `'${value}`
          : value;
    const special = text.includes(format.separator) || /["\n\r]/.test(text);
    return special ? `"${text.replace(/"/g, '""')}"` : text;
  };
  // A byte order mark tells a spreadsheet that the file is UTF-8, for the umlauts and "²".
  return `﻿${rows.map((row) => row.map(cell).join(format.separator)).join("\r\n")}\r\n`;
}

/** A translator of a text: the app gives `t` of src/i18n. */
type Translate = (text: string) => string;

/**
 * The ZIP file with the CSV files of the quantities. `t` translates the headers, the words, and
 * the names of the model (stories, materials, kinds of lines, devices). The names that the user
 * gives, for example of the rooms, stay as they are.
 */
export function takeoffZip(
  takeoff: Takeoff,
  format: CsvFormat = CSV_EN,
  t: Translate = (text) => text,
): Uint8Array {
  const file = (headers: string[], rows: (string | number)[][]) =>
    strToU8(csv([headers.map(t), ...rows], format));
  const e = takeoff.envelope;
  return zipSync({
    "rooms.csv": file(
      [
        "Story",
        "Room",
        "Net area m²",
        "Living area m²",
        "Area on center lines m²",
        "Height m",
        "Perimeter m",
        "Heated",
      ],
      takeoff.rooms.map((r) => [
        t(r.story),
        r.name,
        r.netArea,
        r.livingArea,
        r.area,
        r.height,
        r.perimeter,
        t(r.heated ? "yes" : "no"),
      ]),
    ),
    "openings.csv": file(
      ["Kind", "Width m", "Height m", "Sill m", "Count", "Area m²", "Stories"],
      takeoff.openings.map((o) => [
        t(o.kind === "door" ? "Door" : "Window"),
        o.width,
        o.height,
        o.sill,
        o.count,
        o.width * o.height * o.count,
        o.stories.map(t).join(", "),
      ]),
    ),
    "envelope.csv": file(
      ["Part", "Area m²"],
      [
        [t("Outer walls without openings"), e.walls],
        [t("Windows"), e.windows],
        [t("Roof"), e.roof],
        [t("Floor on the ground"), e.floor],
        [t("Slabs to unheated stories"), e.slabs],
        [t("Gross floor area"), e.grossFloor],
        [t("Net floor area"), e.netFloor],
        [t("Heated volume"), e.volume],
      ],
    ),
    "materials.csv": file(
      ["Part", "Material", "Thickness m", "Area m²", "Volume m³"],
      takeoff.materials.map((m) => [t(m.part), t(m.material), m.thickness, m.area, m.volume]),
    ),
    "services.csv": file(
      ["Kind", "Quantity", "Unit"],
      [
        ...takeoff.services.runs.map((r) => [t(r.name), r.length, "m"]),
        ...takeoff.services.fixtures.map((f) => [t(f.name), f.count, t("pc")]),
      ],
    ),
  });
}
