// The controls of the app: buttons, fields, lists, and check boxes. The panel, the dialogs, and
// the other parts of the user interface make their controls here, so that each kind of control
// looks and acts the same everywhere. The style is in `style.css`, under "Controls".
//
// A button has one of four kinds, each with one meaning:
// - primary: the one main action of a screen or a dialog,
// - secondary: the other actions (the default),
// - danger: an action that removes something,
// - quiet: a less frequent action, without a border.

import { icon, type IconName } from "../icons";

export type ButtonKind = "primary" | "secondary" | "danger" | "quiet";

export interface ButtonOptions {
  kind?: ButtonKind;
  icon?: IconName;
  /** The text of the tooltip, and of the label for a screen reader if `label` is not set. */
  title?: string;
  label?: string;
  disabled?: boolean;
}

/** A button with a text, and an icon before the text if `icon` is set. */
export function button(
  text: string,
  action: (event: MouseEvent) => void,
  options: ButtonOptions = {},
): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  if (options.kind && options.kind !== "secondary") element.className = options.kind;
  if (options.icon) element.innerHTML = icon(options.icon);
  element.append(text);
  if (options.title) element.title = options.title;
  if (options.label) element.setAttribute("aria-label", options.label);
  element.disabled = options.disabled ?? false;
  element.addEventListener("click", action);
  return element;
}

/**
 * A small button with an icon and no text. Its title is also its label for a screen reader,
 * unless `label` gives a longer one.
 */
export function iconButton(
  iconName: IconName,
  title: string,
  action: (event: MouseEvent) => void,
  options: { disabled?: boolean; danger?: boolean; label?: string } = {},
): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = options.danger ? "icon-button danger" : "icon-button";
  element.title = title;
  element.setAttribute("aria-label", options.label ?? title);
  element.innerHTML = icon(iconName);
  element.disabled = options.disabled ?? false;
  element.addEventListener("click", action);
  return element;
}

interface InputOptions {
  placeholder?: string;
  /** A smaller control, for a row with more controls, for example in a table. */
  small?: boolean;
  label?: string;
}

function control<T extends HTMLElement>(element: T, options: InputOptions): T {
  element.classList.add("control");
  if (options.small) element.classList.add("small");
  if (options.label) element.setAttribute("aria-label", options.label);
  return element;
}

/** A field for a text, an address, a date, or a search. */
export function textInput(
  value = "",
  options: InputOptions & { type?: "text" | "url" | "date" | "search" } = {},
): HTMLInputElement {
  const input = control(document.createElement("input"), options);
  input.type = options.type ?? "text";
  input.value = value;
  if (options.placeholder) input.placeholder = options.placeholder;
  return input;
}

/** A field for a number. An empty field (`value` null) shows no number. */
export function numberInput(
  value: number | null,
  options: InputOptions & { step?: number; min?: number; max?: number } = {},
): HTMLInputElement {
  const input = control(document.createElement("input"), options);
  input.type = "number";
  if (options.step !== undefined) input.step = String(options.step);
  if (options.min !== undefined) input.min = String(options.min);
  if (options.max !== undefined) input.max = String(options.max);
  input.value = value === null ? "" : String(value);
  if (options.placeholder) input.placeholder = options.placeholder;
  return input;
}

/** A list to choose one value from. */
export function selectInput<T extends string>(
  choices: readonly (readonly [value: T, text: string])[],
  value?: T,
  options: InputOptions = {},
): HTMLSelectElement {
  const select = control(document.createElement("select"), options);
  for (const [key, text] of choices) select.append(new Option(text, key, false, key === value));
  return select;
}

/** A field for a text with more lines. */
export function textArea(
  value = "",
  options: InputOptions & { rows?: number } = {},
): HTMLTextAreaElement {
  const area = control(document.createElement("textarea"), options);
  area.rows = options.rows ?? 3;
  area.value = value;
  if (options.placeholder) area.placeholder = options.placeholder;
  return area;
}

/**
 * A box around a control with a unit after it, for example "m" after a length. The box has the
 * look of the control, and the control inside has no border.
 */
export function withUnit(element: HTMLElement, unit?: string): HTMLElement {
  const box = document.createElement("span");
  box.className = "input";
  box.append(element);
  if (unit) {
    const text = document.createElement("span");
    text.className = "unit";
    text.textContent = unit;
    box.append(text);
  }
  return box;
}

/** A check box with its label after it. A click on the label changes the box too. */
export function checkbox(
  text: string,
  checked: boolean,
  change?: (checked: boolean) => void,
): { element: HTMLLabelElement; input: HTMLInputElement } {
  const element = document.createElement("label");
  element.className = "check";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  if (change) input.addEventListener("change", () => change(input.checked));
  element.append(input, text);
  return { element, input };
}

/** A choice of one option from a few, as radio buttons in a group. */
export function radioGroup<T extends string>(
  name: string,
  choices: readonly (readonly [value: T, text: string])[],
  value: T,
): { element: HTMLElement; value: () => T } {
  const element = document.createElement("div");
  element.className = "radio-group";
  element.setAttribute("role", "radiogroup");
  const inputs = choices.map(([key, text]) => {
    const label = document.createElement("label");
    label.className = "check";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = key;
    input.checked = key === value;
    label.append(input, text);
    element.append(label);
    return input;
  });
  return { element, value: () => (inputs.find((i) => i.checked)?.value ?? value) as T };
}

/**
 * A row with a label and a control. The container decides the width of the label column: the
 * panel puts the controls in one column on the right, a dialog has a fixed label column.
 * `stacked` puts the control under its label, for a list with long values in a narrow panel.
 */
export function fieldRow(
  text: string,
  element: HTMLElement,
  options: { stacked?: boolean } = {},
): HTMLLabelElement {
  const row = document.createElement("label");
  row.className = options.stacked ? "field stacked" : "field";
  const label = document.createElement("span");
  label.className = "field-label";
  label.textContent = text;
  row.append(label, element);
  return row;
}

/** A row of controls side by side, for example a list and a date, or a field and a button. */
export function pair(...elements: HTMLElement[]): HTMLElement {
  const box = document.createElement("span");
  box.className = "control-pair";
  box.append(...elements);
  return box;
}
