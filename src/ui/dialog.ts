// The dialogs of the app: a title, a close button, and a body with fields, notes, and buttons.
// Esc or a click outside closes a dialog.

import { t } from "../i18n";
import { button, fieldRow, iconButton } from "./controls";

/** A dialog with a title and a close button. Esc or a click outside closes it. */
export function dialog(title: string): { element: HTMLDialogElement; body: HTMLElement } {
  const element = document.createElement("dialog");
  element.className = "app-dialog";
  const head = document.createElement("div");
  head.className = "app-dialog-head";
  const heading = document.createElement("h2");
  heading.textContent = title;
  head.append(
    heading,
    iconButton("close", t("Close"), () => element.close()),
  );
  const body = document.createElement("div");
  body.className = "app-dialog-body";
  element.append(head, body);
  element.addEventListener("click", (e) => e.target === element && element.close());
  element.addEventListener("close", () => element.remove());
  document.body.append(element);
  element.showModal();
  return { element, body };
}

/** A row of a dialog: a label in a fixed column, and the control after it. */
export function row(parent: HTMLElement, label: string, control: HTMLElement): void {
  parent.append(fieldRow(label, control));
}

export function note(parent: HTMLElement, text: string, className = "dialog-note"): HTMLElement {
  const element = document.createElement("p");
  element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

export function actionButton(text: string, action: () => void, primary = false): HTMLButtonElement {
  return button(text, action, { kind: primary ? "primary" : "secondary" });
}
