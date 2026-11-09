import { currentLanguage, locale, t } from "../i18n";
import { icon, type IconName } from "../icons";
import { uValue } from "../model/energy";
import { fmt } from "../model/format";
import { layersThickness, MATERIALS } from "../model/insulation";
import type { Layer } from "../model/types";
import { panel } from "./context";
import {
  button as makeButton,
  checkbox,
  fieldRow,
  iconButton,
  numberInput,
  selectInput,
  textInput,
  withUnit,
} from "./controls";

export { iconButton };

/** A list with a value longer than this many characters goes under its label in the panel. */
const LONG_CHOICE = 12;

/** The section of the panel that the helpers below append to. */
export let section: HTMLElement = panel;

/** The element that takes the sections of the headings: the panel, or a column of it. */
export let column: HTMLElement = panel;

/** Sets the element that takes the sections of the headings. */
export function setColumn(element: HTMLElement): void {
  column = element;
}

/** Sets the section that the helpers append to. */
export function setSection(element: HTMLElement): void {
  section = element;
}

export function heading(text: string, iconName?: IconName): void {
  section = document.createElement("section");
  const element = document.createElement("h2");
  if (iconName) element.innerHTML = icon(iconName);
  element.append(text);
  section.append(element);
  column.append(section);
}

export function paragraph(text: string, className?: string): void {
  const element = document.createElement("p");
  element.textContent = text;
  if (className) element.className = className;
  section.append(element);
}

export function button(
  text: string,
  action: () => void,
  options: {
    kind?: "primary" | "danger";
    icon?: IconName;
    detail?: string;
    /** True if the button does not change the plan, so it stays in a plan to view. */
    view?: boolean;
  } = {},
): HTMLButtonElement {
  let row = section.lastElementChild;
  if (!row?.classList.contains("actions")) {
    row = document.createElement("div");
    row.className = "actions";
    section.append(row);
  }
  const element = makeButton(options.detail ? "" : text, action, {
    kind: options.kind,
    icon: options.icon,
  });
  if (options.detail) {
    // A list item: the text on the first line, and the detail small below it.
    element.classList.add("item");
    const label = document.createElement("span");
    const detail = document.createElement("small");
    label.textContent = text;
    detail.textContent = options.detail;
    const lines = document.createElement("span");
    lines.className = "lines";
    lines.append(label, detail);
    element.append(lines);
  }
  if (options.view) element.dataset.view = "";
  row.append(element);
  return element;
}

/**
 * A row of the panel: a label on the left and a control in a box on the right. All controls have
 * one width, so they start at one line. A list with a long value goes under its label, so that
 * the list does not cut its value.
 */
export function field(text: string, control: HTMLElement, unit?: string): void {
  const stacked =
    control instanceof HTMLSelectElement &&
    [...control.options].some((option) => option.text.length > LONG_CHOICE);
  section.append(fieldRow(text, withUnit(control, unit), { stacked }));
}

/**
 * A field for a color "#rrggbb". The plan changes when the user closes the color picker. With
 * `reset`, a button after the color gives back the default color.
 */
export function colorField(
  text: string,
  value: string,
  change: (value: string) => void,
  reset?: { title: string; action: () => void },
): void {
  const input = document.createElement("input");
  input.type = "color";
  input.value = value;
  input.addEventListener("change", () => change(input.value));
  field(text, input);
  if (reset) {
    const box = section.lastElementChild!.querySelector(".input")!;
    const clear = iconButton("close", reset.title, (event) => {
      event.preventDefault();
      reset.action();
    });
    clear.classList.add("reset");
    box.append(clear);
  }
}

export function numberField(
  text: string,
  value: number,
  change: (value: number) => void,
  options: { step?: number; min?: number; max?: number; unit?: string } = {},
): HTMLInputElement {
  const input = numberInput(Math.round(value * 1000) / 1000, {
    step: options.step ?? 0.01,
    min: options.min ?? 0,
    max: options.max,
  });
  input.addEventListener("change", () => {
    const parsed = input.valueAsNumber;
    if (
      Number.isFinite(parsed) &&
      parsed >= (options.min ?? 0) &&
      parsed <= (options.max ?? Infinity)
    )
      change(parsed);
    else input.value = String(Math.round(value * 1000) / 1000);
  });
  field(text, input, options.unit ?? "m");
  return input;
}

/** A slider from 0 to 1. It changes the plan only when the user releases it. */
export function rangeField(text: string, value: number, change: (value: number) => void): void {
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "1";
  input.step = "0.05";
  input.value = String(value);
  input.addEventListener("change", () => change(Number(input.value)));
  section.append(fieldRow(text, input));
}

export function stats(items: [value: string, text: string, wide?: boolean][]): void {
  const grid = document.createElement("div");
  grid.className = "stats";
  for (const [value, text, wide] of items) {
    const tile = document.createElement("div");
    tile.className = wide ? "stat wide" : "stat";
    const strong = document.createElement("strong");
    strong.textContent = value;
    const span = document.createElement("span");
    span.textContent = text;
    tile.append(strong, span);
    grid.append(tile);
  }
  section.append(grid);
}

export function textField(
  text: string,
  value: string,
  change: (value: string) => void,
  options: { placeholder?: string; allowEmpty?: boolean } = {},
): void {
  const input = textInput(value, { placeholder: options.placeholder });
  input.addEventListener("change", () => {
    const trimmed = input.value.trim();
    if (trimmed || options.allowEmpty) change(trimmed);
  });
  field(text, input);
}

export function selectField<T extends string>(
  text: string,
  value: T,
  options: [T, string][],
  change: (value: T) => void,
): void {
  const select = selectInput(options, value);
  select.addEventListener("change", () => change(select.value as T));
  field(text, select);
}

/** The eight directions of the compass, in the language of the app. */
const COMPASS =
  currentLanguage() === "de"
    ? ["N", "NO", "O", "SO", "S", "SW", "W", "NW"]
    : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export const compassName = (azimuth: number) => COMPASS[Math.round(azimuth / 45) % 8];

/**
 * A check box with the box before its label, like in the dialogs and the menus. With `view`, it
 * does not change the plan, so it stays in a plan to view.
 */
export function checkField(
  text: string,
  value: boolean,
  change: (value: boolean) => void,
  view = false,
): void {
  const { element, input } = checkbox(text, value, change);
  if (view) input.dataset.view = "";
  section.append(element);
}

/** A group that the user can open and close. The helpers append to it while it is open. */
export function group(title: string, open: boolean, fill: () => void): void {
  const details = document.createElement("details");
  details.className = "group";
  details.open = open;
  const summary = document.createElement("summary");
  summary.textContent = title;
  details.append(summary);
  section.append(details);
  const outer = section;
  section = details;
  fill();
  section = outer;
}

/**
 * Edits a list of layers from the inside to the outside: the material and the thickness of each
 * layer. `change` gets a function that changes the layers in the new building.
 */
export function layerEditor(
  layers: Layer[],
  kind: "wall" | "roof" | "floor",
  change: (edit: (layers: Layer[]) => void) => void,
): void {
  layers.forEach((layer, i) => {
    const row = document.createElement("div");
    row.className = "layer-row";
    const select = selectInput(
      MATERIALS.map(
        (m) =>
          [
            m.id,
            `${t(m.name)} (λ ${m.lambda.toLocaleString(locale(), { maximumFractionDigits: 3 })})`,
          ] as const,
      ),
      layer.material,
      { small: true, label: t("Material") },
    );
    select.addEventListener("change", () => change((list) => (list[i].material = select.value)));
    const input = numberInput(Math.round(layer.thickness * 1000) / 10, {
      step: 1,
      min: 1,
      label: t("Thickness in cm"),
    });
    input.title = t("Thickness in cm");
    input.addEventListener("change", () => {
      const cm = Number(input.value);
      if (cm > 0) change((list) => (list[i].thickness = cm / 100));
    });
    const thickness = withUnit(input, "cm");
    thickness.classList.add("small");
    const remove = iconButton("close", t("Remove the layer"), () =>
      change((list) => list.splice(i, 1)),
    );
    row.append(select, thickness, remove);
    section.append(row);
  });
  paragraph(
    t("From the inside to the outside. U = {u} W/(m²K), {thickness} cm.", {
      u: fmt(uValue(layers, kind), 2),
      thickness: fmt(layersThickness(layers) * 100, 1),
    }),
    "note",
  );
  button(
    t("Add a layer"),
    () => change((list) => list.push({ material: "mineral-wool", thickness: 0.1 })),
    {
      icon: "plus",
    },
  );
}

/** The names of the months in the language of the app, from January. */
export const MONTH_NAMES = Array.from({ length: 12 }, (_, month) =>
  new Date(2001, month, 1).toLocaleDateString(locale(), { month: "long" }),
);

/** An integer with a space between the thousands, in each language: "12 340". */
const grouped = (value: number, space: string) =>
  Math.round(value)
    .toLocaleString(locale())
    .replace(/[^\d\-−]/g, space);

/** A number of kWh with a thin space between the thousands, for example "12 340 kWh". */
export const kwh = (value: number) => `${grouped(value, "\u2009")} kWh`;

/** An amount of money, rounded to whole euros, with a thin space between the thousands. */
export const euro = (value: number) => `${grouped(value, " ")} €`;

/**
 * A small bar chart of the heat demand of each month. A column shows its value on hover, and
 * the largest month has its value as a label.
 */
export function monthChart(values: number[]): void {
  const ns = "http://www.w3.org/2000/svg";
  const width = 240;
  const height = 96;
  const top = 16;
  const bottom = 16;
  const slot = width / 12;
  const bar = slot - 4;
  const max = Math.max(...values, 1);
  const peak = values.indexOf(Math.max(...values));
  const chart = document.createElementNS(ns, "svg");
  chart.setAttribute("class", "month-chart");
  chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  chart.setAttribute("role", "img");
  chart.setAttribute(
    "aria-label",
    t("Heat demand per month: {months}", {
      months: values.map((v, m) => `${MONTH_NAMES[m]} ${Math.round(v)} kWh`).join(", "),
    }),
  );
  const add = (name: string, attributes: Record<string, string | number>, text?: string) => {
    const element = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    if (text !== undefined) element.textContent = text;
    chart.append(element);
    return element;
  };
  const base = height - bottom;
  add("line", { x1: 0, x2: width, y1: base, y2: base, class: "axis" });
  values.forEach((value, m) => {
    const x = m * slot + 2;
    const h = (value / max) * (base - top);
    // The column behind the bar is the target of the hover, larger than the bar.
    const hit = add("rect", { x: m * slot, y: 0, width: slot, height, class: "hit" });
    const title = document.createElementNS(ns, "title");
    title.textContent = `${MONTH_NAMES[m]}: ${Math.round(value)} kWh`;
    hit.append(title);
    // The bar has round corners at the top only: a path from the baseline.
    if (h > 0.5) {
      const r = Math.min(4, h, bar / 2);
      add("path", {
        class: "bar",
        d: `M${x} ${base}V${base - h + r}a${r} ${r} 0 0 1 ${r} ${-r}h${bar - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}V${base}Z`,
      });
    }
    add("text", { x: x + bar / 2, y: height - 3, class: "month" }, MONTH_NAMES[m][0]);
    if (m === peak && value > 0) {
      // The label stays inside the chart, also over the first and the last bar.
      const at = Math.min(width - 12, Math.max(12, x + bar / 2));
      add("text", { x: at, y: base - h - 4, class: "value" }, `${Math.round(value)}`);
    }
  });
  const caption = document.createElement("p");
  caption.className = "chart-title";
  caption.textContent = t("Heat demand per month, kWh");
  section.append(caption, chart);
}

/**
 * A table in the section. A cell is a text, or an element. `align` is "right" for the columns of
 * numbers.
 */
export function table(
  headers: string[],
  rows: (string | HTMLElement)[][],
  align: ("left" | "right")[] = [],
): HTMLTableElement {
  const element = document.createElement("table");
  element.className = "panel-table";
  const head = document.createElement("tr");
  headers.forEach((text, i) => {
    const th = document.createElement("th");
    th.textContent = text;
    if (align[i] === "right") th.className = "num";
    head.append(th);
  });
  const thead = document.createElement("thead");
  thead.append(head);
  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    row.forEach((cell, i) => {
      const td = document.createElement("td");
      if (align[i] === "right") td.className = "num";
      td.append(cell);
      tr.append(td);
    });
    tbody.append(tr);
  }
  element.append(thead, tbody);
  // A wide table scrolls in its box, not the panel.
  const box = document.createElement("div");
  box.className = "table-box";
  box.append(element);
  section.append(box);
  return element;
}

/** A small colored label for a verdict: good, fair, or bad. */
export function badge(text: string, tone: "good" | "fair" | "bad" | "none"): HTMLElement {
  const element = document.createElement("span");
  element.className = `badge ${tone}`;
  element.textContent = text;
  return element;
}

/**
 * Puts an open menu under its button, or over the button if there is no room below. The menu
 * stays inside the window.
 */
export function placeMenu(menu: HTMLElement, button: HTMLElement): void {
  const rect = button.getBoundingClientRect();
  const below = rect.bottom + 6 + menu.offsetHeight < window.innerHeight;
  menu.style.top = below
    ? `${rect.bottom + 6}px`
    : `${Math.max(8, rect.top - menu.offsetHeight - 6)}px`;
  menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
}
